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
// TWO rate limiters stacked here, both must pass:
//   1) BY USER : 10 messages per minute total (sliding window) - anti-flooding
//   2) BY PAIR : 5 messages per minute to the SAME person (sliding window) - anti-spam
// Express runs middlewares left to right, so if either blocks, you get a 429.
messageRoute.post(
  '/messages',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  rateLimiter({ algorithm: 'sliding-window', limit: 5, windowMs: 60 * 1000, by: 'pair' }),
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

      // create and save the message
      const message = new MessageModel({ senderId, receiverId, text })
      const savedMessage = await message.save()

      res.status(201).json({ message: 'Message sent', payload: savedMessage })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// GET /messages/:otherUserId - Get the conversation with one other user (PROTECTED)
// Loose limit: reading is cheap, so allow plenty (60 per minute by user).
// Returns all messages between me and the other person, oldest first.
messageRoute.get(
  '/messages/:otherUserId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 60, windowMs: 60 * 1000, by: 'user' }),
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
      }).sort({ createdAt: 1 }) // oldest first

      res.status(200).json({ message: 'Conversation retrieved', payload: messages })
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
  rateLimiter({ algorithm: 'sliding-window', limit: 60, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId

      // get all messages involving me
      const messages = await MessageModel.find({
        $or: [{ senderId: me }, { receiverId: me }],
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
          const u = await UserModel.findOne({ userId: o.userId }).select('name')
          return { ...o, name: u ? u.name : 'Unknown' }
        })
      )

      res.status(200).json({ message: 'Conversations retrieved', payload: withNames })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)
