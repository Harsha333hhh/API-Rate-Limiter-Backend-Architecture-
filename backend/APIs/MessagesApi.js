// MESSAGES API - Routes for sending and reading direct messages
// This is where the two "messaging" rate limits live:
//   - per USER  : one user can't flood the whole system
//   - per PAIR  : one user can't spam a SPECIFIC person (anti-harassment)
import express from 'express'
import { MessageModel } from '../Models/MessageModel.js'
import { UserModel } from '../Models/UserModel.js'
import { authMiddleware } from '../Middlewares/authMiddleware.js'
import { rateLimiter } from '../RateLimiter/rateLimiter.js'

// create and export message router
export const messageRoute = express.Router()

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
      const { receiverId, text } = req.body

      // validation
      if (!receiverId || !text || !text.trim()) {
        return res.status(400).json({ message: 'receiverId and text are required' })
      }

      // can't message yourself
      if (receiverId === senderId) {
        return res.status(400).json({ message: 'You cannot message yourself' })
      }

      // make sure the receiver actually exists
      const receiver = await UserModel.findOne({ userId: receiverId })
      if (!receiver) {
        return res.status(404).json({ message: 'No user with that ID' })
      }

      // If the receiver has blocked the sender, pretend the send succeeded but do not persist the message.
      if (Array.isArray(receiver.blocked) && receiver.blocked.includes(senderId)) {
        const fakeMessage = {
          _id: null,
          senderId,
          receiverId,
          text,
          read: false,
          createdAt: new Date(),
        }
        return res.status(201).json({ message: 'Message sent', payload: fakeMessage })
      }

      // create and save the message
      const message = new MessageModel({ senderId, receiverId, text })
      const savedMessage = await message.save()

      res.status(201).json({ message: 'Message sent', payload: savedMessage })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
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

      // find messages in either direction between the two users
      const messages = await MessageModel.find({
        $or: [
          { senderId: me, receiverId: other },
          { senderId: other, receiverId: me },
        ],
        hiddenFor: { $ne: me },
      }).sort({ createdAt: 1 }) // oldest first

      res.status(200).json({ message: 'Conversation retrieved', payload: messages })
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

      const unreadMessages = await MessageModel.find({ receiverId: me, read: false, hiddenFor: { $ne: me } })
        .sort({ createdAt: -1 })
        .limit(10)

      const counts = {}
      const senderIds = new Set()
      for (const message of unreadMessages) {
        counts[message.senderId] = (counts[message.senderId] || 0) + 1
        senderIds.add(message.senderId)
      }

      const allUnread = await MessageModel.find({ receiverId: me, read: false, hiddenFor: { $ne: me } }).select('senderId')
      const total = allUnread.length
      const groupedCounts = {}
      for (const message of allUnread) {
        groupedCounts[message.senderId] = (groupedCounts[message.senderId] || 0) + 1
      }

      const senders = await UserModel.find({ userId: { $in: [...senderIds] } }).select('userId name isDeleted')
      const senderMap = new Map(senders.map((sender) => [sender.userId, sender.isDeleted ? 'Deleted user' : sender.name]))

      const recent = unreadMessages.map((message) => ({
        _id: message._id,
        senderId: message.senderId,
        senderName: senderMap.get(message.senderId) || 'Unknown',
        receiverId: message.receiverId,
        text: message.text,
        createdAt: message.createdAt,
      }))

      res.status(200).json({
        message: 'Unread counts retrieved',
        payload: { counts: groupedCounts, total, recent },
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

      // collect the unique "other" userIds, newest first
      const seen = new Set()
      const others = []
      for (const m of messages) {
        const other = m.senderId === me ? m.receiverId : m.senderId
        if (!seen.has(other)) {
          seen.add(other)
          others.push({ userId: other, lastMessage: m.text, lastAt: m.createdAt })
        }
      }

      // attach each person's name for display
      const withNames = await Promise.all(
        others.map(async (o) => {
          const u = await UserModel.findOne({ userId: o.userId }).select('name isDeleted')
          return { ...o, name: u ? (u.isDeleted ? 'Deleted user' : u.name) : 'Unknown' }
        })
      )

      res.status(200).json({ message: 'Conversations retrieved', payload: withNames })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)
