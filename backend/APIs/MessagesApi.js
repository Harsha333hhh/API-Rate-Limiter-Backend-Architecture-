// MESSAGES API - Routes for sending and reading direct messages
// This is where the two "messaging" rate limits live:
//   - per USER  : one user can't flood the whole system
//   - per PAIR  : one user can't spam a SPECIFIC person (anti-harassment)
import express from 'express'
import mongoose from 'mongoose'
import { MessageModel } from '../Models/MessageModel.js'
import { UserModel } from '../Models/UserModel.js'
import { authMiddleware } from '../Middlewares/authMiddleware.js'
import { rateLimiter } from '../RateLimiter/rateLimiter.js'
import { recordSavedMessage } from '../services/rateLimitMonitoring.js'
import {
  buildUnreadMessagesPipeline,
  summarizeUnreadMessages,
} from '../services/unreadMessageSummary.js'

// create and export message router
export const messageRoute = express.Router()

function getConversationProtection(user, otherUserId) {
  return user?.protectedConversations?.find((setting) => setting.otherUserId === otherUserId)
}

function validProtectedCopy(copy) {
  return (
    copy &&
    copy.version === 1 &&
    typeof copy.iv === 'string' &&
    /^[A-Za-z0-9_-]{16}$/.test(copy.iv) &&
    typeof copy.ciphertext === 'string' &&
    /^[A-Za-z0-9_-]{1,32768}$/.test(copy.ciphertext) &&
    typeof copy.wrappedKey === 'string' &&
    /^[A-Za-z0-9_-]{300,2048}$/.test(copy.wrappedKey)
  )
}

export function messageForUser(message, userId, protectedSetting) {
  const result = message.toObject ? message.toObject() : { ...message }
  if (protectedSetting?.status === 'migrating') {
    delete result.protectedCopies
    return { ...result, text: '[Conversation protection migration pending]' }
  }
  if (protectedSetting?.status === 'protected') {
    const copy = result.protectedCopies?.find((entry) => entry.userId === userId)
    if (!copy) {
      delete result.text
      delete result.protectedCopies
      return { ...result, text: '[Protected message copy unavailable]' }
    }
    delete result.text
    result.protectedCopy = {
      version: copy.version,
      iv: copy.iv,
      ciphertext: copy.ciphertext,
      wrappedKey: copy.wrappedKey,
    }
  }
  delete result.protectedCopies
  return result
}

// POST /messages - Send a direct message to a user by their friendly userId (PROTECTED)
//
// THREE rate limiters stacked here, all must pass (burst first to catch abuse fastest):
//   1) BURST LAYER (BY USER): 10 messages per 2 seconds (sliding window) - anti-bot
//      Catches scripts firing many requests/second. Fast human burst-typing tops ~5-7 in 2 sec.
//   2) PER-USER SUSTAINED (BY USER): 150 messages per minute total (sliding window) - anti-flooding
//      Defends against sustained system flooding. Active multi-chat users plausibly hit 60-100/min.
//   3) PER-PAIR SUSTAINED (BY PAIR): 60 messages per minute to the SAME person (sliding window) - anti-harassment
//      Real rapid two-person chat rarely exceeds this; sustained hammering is abusive.
// Express runs middlewares left to right, so if any blocks, you get a 429.
messageRoute.post(
  '/messages',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 2 * 1000, by: 'user' }),
  rateLimiter({ algorithm: 'sliding-window', limit: 150, windowMs: 60 * 1000, by: 'user' }),
  rateLimiter({ algorithm: 'sliding-window', limit: 60, windowMs: 60 * 1000, by: 'pair' }),
  async (req, res) => {
    try {
      // sender is the logged-in user; receiver comes from the request body
      const senderId = req.user.userId
      const { receiverId, text, protectedCopies = [] } = req.body

      if (!receiverId || receiverId === senderId) {
        return res.status(400).json({ message: 'A different receiverId is required' })
      }

      if (
        !Array.isArray(protectedCopies) ||
        protectedCopies.length > 2 ||
        protectedCopies.some(
          (entry) =>
            !entry ||
            typeof entry.userId !== 'string' ||
            !validProtectedCopy(entry)
        ) ||
        new Set(protectedCopies.map((entry) => entry.userId)).size !== protectedCopies.length
      ) {
        return res.status(400).json({ message: 'Invalid protected message copy' })
      }

      const supportsTransactions = ['ReplicaSetWithPrimary', 'Sharded'].includes(
        mongoose.connection.client?.topology?.description?.type
      )
      const executeSend = async (session) => {
        if (session) {
          for (const participantId of [senderId, receiverId].sort()) {
            const result = await UserModel.updateOne(
              { userId: participantId },
              { $inc: { protectionRevision: 1 } },
              { session }
            )
            if (result.matchedCount !== 1) {
              const missingUser = new Error(participantId === receiverId ? 'No user with that ID' : 'Sender account was not found')
              missingUser.status = participantId === receiverId ? 404 : 401
              throw missingUser
            }
          }
        }

        const [sender, receiver] = await Promise.all([
          UserModel.findOne({ userId: senderId })
            .select('protectedConversations')
            .session(session)
            .lean(),
          UserModel.findOne({ userId: receiverId })
            .select('blocked protectedConversations')
            .session(session)
            .lean(),
        ])
        if (!receiver) {
          const missingUser = new Error('No user with that ID')
          missingUser.status = 404
          throw missingUser
        }

        const senderProtection = getConversationProtection(sender, receiverId)
        const receiverProtection = getConversationProtection(receiver, senderId)
        const expectedProtectedUsers = [
          ...(senderProtection ? [senderId] : []),
          ...(receiverProtection ? [receiverId] : []),
        ]
        const providedProtectedUsers = protectedCopies.map((entry) => entry.userId)
        if (
          expectedProtectedUsers.some((protectedUserId) => !providedProtectedUsers.includes(protectedUserId)) ||
          providedProtectedUsers.some((protectedUserId) => !expectedProtectedUsers.includes(protectedUserId))
        ) {
          const staleProtection = new Error('Conversation protection settings changed; refresh the conversation and retry')
          staleProtection.status = 409
          throw staleProtection
        }
        if (expectedProtectedUsers.length < 2 && (typeof text !== 'string' || !text.trim())) {
          const missingText = new Error('Message text is required for an unprotected conversation copy')
          missingText.status = 400
          throw missingText
        }
        if (expectedProtectedUsers.length === 2 && text !== undefined) {
          const plaintextRejected = new Error('Plaintext is not accepted when both conversation copies are protected')
          plaintextRejected.status = 400
          throw plaintextRejected
        }

        if (Array.isArray(receiver.blocked) && receiver.blocked.includes(senderId)) {
          return {
            senderProtection,
            fakeMessage: {
              _id: null,
              senderId,
              receiverId,
              text,
              read: false,
              createdAt: new Date(),
              protectedCopies: protectedCopies.map(({ userId, ...copy }) => ({ userId, ...copy })),
            },
          }
        }

        const message = new MessageModel({
          senderId,
          receiverId,
          ...(expectedProtectedUsers.length === 2 ? {} : { text }),
          protectedCopies: protectedCopies.map(({ userId, ...copy }) => ({ userId, ...copy })),
        })
        const savedMessage = await message.save(session ? { session } : undefined)
        return { senderProtection, savedMessage }
      }

      let sendResult
      if (supportsTransactions) {
        const session = await mongoose.startSession()
        try {
          await session.withTransaction(async () => {
            sendResult = await executeSend(session)
          })
        } finally {
          await session.endSession()
        }
      } else {
        const [sender, receiver] = await Promise.all([
          UserModel.findOne({ userId: senderId }).select('protectedConversations').lean(),
          UserModel.findOne({ userId: receiverId }).select('blocked protectedConversations').lean(),
        ])
        if (
          getConversationProtection(sender, receiverId) ||
          getConversationProtection(receiver, senderId)
        ) {
          return res.status(503).json({
            message: 'Protected conversation messaging requires MongoDB transaction support',
          })
        }
        sendResult = await executeSend(null)
      }

      if (sendResult.fakeMessage) {
        return res.status(201).json({
          message: 'Message sent',
          payload: messageForUser(sendResult.fakeMessage, senderId, sendResult.senderProtection),
        })
      }

      recordSavedMessage(senderId, receiverId)
      res.status(201).json({
        message: 'Message sent',
        payload: messageForUser(sendResult.savedMessage, senderId, sendResult.senderProtection),
      })
    } catch (err) {
      res.status(err.status || 500).json({ message: err.status ? err.message : 'error' })
    }
  }
)

// DELETE /conversations/:otherUserId - Soft-hide a conversation for the current user
messageRoute.delete(
  '/conversations/:otherUserId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId
      const other = req.params.otherUserId

      const result = await MessageModel.updateMany(
        {
          $or: [
            { senderId: me, receiverId: other },
            { senderId: other, receiverId: me },
          ],
        },
        { $addToSet: { hiddenFor: me } }
      )

      res.status(200).json({ message: 'Conversation hidden', payload: { matched: result.matchedCount, modified: result.modifiedCount } })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// GET /messages/:otherUserId - Get the conversation with one other user (PROTECTED)
// Loose limit: reading is cheap, so allow plenty (200 per minute by user).
// Returns all messages between me and the other person, oldest first.
messageRoute.get(
  '/messages/:otherUserId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 200, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId
      const other = req.params.otherUserId
      const owner = await UserModel.findOne({ userId: me }).select('protectedConversations').lean()
      const ownProtection = getConversationProtection(owner, other)
      if (ownProtection?.status === 'migrating') {
        return res.status(409).json({
          code: 'PROTECTION_MIGRATION_PENDING',
          message: 'Unlock protection and finish migrating this conversation history',
        })
      }
      if (ownProtection?.status === 'protected') {
        const missingCopies = await MessageModel.countDocuments({
          $or: [
            { senderId: me, receiverId: other },
            { senderId: other, receiverId: me },
          ],
          hiddenFor: { $ne: me },
          $nor: [{ protectedCopies: { $elemMatch: { userId: me } } }],
        })
        if (missingCopies > 0) {
          return res.status(409).json({
            code: 'PROTECTION_SYNC_REQUIRED',
            message: 'Some messages need protected copies before this conversation can be shown',
            missingMessages: missingCopies,
          })
        }
      }

      // find messages in either direction between the two users
      const messages = await MessageModel.find({
        $or: [
          { senderId: me, receiverId: other },
          { senderId: other, receiverId: me },
        ],
        hiddenFor: { $ne: me },
      }).sort({ createdAt: 1 }) // oldest first

      res.status(200).json({
        message: 'Conversation retrieved',
        payload: messages.map((message) => messageForUser(message, me, ownProtection)),
      })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// PATCH /messages/read/:otherUserId - Mark a conversation as read (PROTECTED)
// Reuses the same loose read limit as the other read routes.
messageRoute.patch(
  '/messages/read/:otherUserId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 200, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId
      const other = req.params.otherUserId

      const result = await MessageModel.updateMany(
        { senderId: other, receiverId: me, read: false, hiddenFor: { $ne: me } },
        { $set: { read: true } }
      )

      res.status(200).json({
        message: 'Conversation marked as read',
        payload: { matched: result.matchedCount, modified: result.modifiedCount },
      })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// GET /unread - Get unread counts grouped by sender (PROTECTED)
// Returns the counts needed for unread dots, the badge total, and recent unread previews.
messageRoute.get(
  '/unread',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 200, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId

      const [unreadAggregate] = await MessageModel.aggregate(buildUnreadMessagesPipeline(me))
      const { counts, total, recent: unreadMessages } = summarizeUnreadMessages(unreadAggregate)
      const senderIds = new Set(unreadMessages.map((message) => message.senderId))
      const owner = await UserModel.findOne({ userId: me }).select('protectedConversations').lean()

      const senders = await UserModel.find({ userId: { $in: [...senderIds] } }).select('userId name isDeleted profilePictureId')
      const senderMap = new Map(
        senders.map((sender) => [
          sender.userId,
          {
            name: sender.isDeleted ? 'Deleted user' : sender.name,
            profilePictureId: sender.isDeleted ? null : sender.profilePictureId?.toString() || null,
          },
        ])
      )

      const recent = unreadMessages.map((message) => {
        const protection = getConversationProtection(owner, message.senderId)
        const safeMessage = messageForUser(message, me, protection)
        return {
          _id: safeMessage._id,
          senderId: safeMessage.senderId,
          senderName: senderMap.get(safeMessage.senderId)?.name || 'Unknown',
          senderProfilePictureId: senderMap.get(safeMessage.senderId)?.profilePictureId || null,
          receiverId: safeMessage.receiverId,
          text: safeMessage.text || '[Protected message]',
          createdAt: safeMessage.createdAt,
        }
      })

      res.status(200).json({
        message: 'Unread counts retrieved',
        payload: { counts, total, recent },
      })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// GET /conversations - List everyone I've talked to (PROTECTED)
// Used by the frontend sidebar to show recent chats.
messageRoute.get(
  '/conversations',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 200, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId

      // get all messages involving me
      const messages = await MessageModel.find({
        $or: [{ senderId: me }, { receiverId: me }],
        hiddenFor: { $ne: me },
      }).sort({ createdAt: -1 })
      const owner = await UserModel.findOne({ userId: me }).select('protectedConversations').lean()

      // collect the unique "other" userIds, newest first
      const seen = new Set()
      const others = []
      for (const m of messages) {
        const other = m.senderId === me ? m.receiverId : m.senderId
        if (!seen.has(other)) {
          seen.add(other)
          const protection = getConversationProtection(owner, other)
          const safeMessage = messageForUser(m, me, protection)
          others.push({
            userId: other,
            lastMessage: safeMessage.text || '[Protected message]',
            lastAt: m.createdAt,
          })
        }
      }

      // attach each person's name for display
      const withNames = await Promise.all(
        others.map(async (o) => {
          const u = await UserModel.findOne({ userId: o.userId }).select('name isDeleted profilePictureId')
          return {
            ...o,
            name: u ? (u.isDeleted ? 'Deleted user' : u.name) : 'Unknown',
            profilePictureId: u && !u.isDeleted ? u.profilePictureId?.toString() || null : null,
          }
        })
      )

      res.status(200).json({ message: 'Conversations retrieved', payload: withNames })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)
