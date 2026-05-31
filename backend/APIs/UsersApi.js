// USERS API - Routes for registration, login, and looking up users
// Imports: express for routing, register controller, authenticate service,
// auth middleware, and our rate limiter middleware.
import express from 'express'
import { register } from '../Controllers/userController.js'
import { authenticate } from '../services/authservices.js'
import { UserModel } from '../Models/UserModel.js'
import { authMiddleware } from '../Middlewares/authMiddleware.js'
import { rateLimiter } from '../RateLimiter/rateLimiter.js'

// create and export user router
export const userRoute = express.Router()

function namespaceRateLimitUser(namespace) {
  return (req, res, next) => {
    req._originalRateLimitUserId = req.user?.userId
    if (req.user?.userId) {
      req.user.userId = `${req.user.userId}:${namespace}`
    }
    next()
  }
}

function restoreRateLimitUser(req, res, next) {
  if (req._originalRateLimitUserId) {
    req.user.userId = req._originalRateLimitUserId
    delete req._originalRateLimitUserId
  }
  next()
}

// POST /users - Register new user (PUBLIC)
// RATE LIMITED BY IP: stops a bot from creating lots of spam accounts from one machine.
// 5 signups per 10 minutes per IP.
userRoute.post(
  '/users',
  rateLimiter({ algorithm: 'fixed-window', limit: 5, windowMs: 10 * 60 * 1000, by: 'ip' }),
  async (req, res, next) => {
    try {
      const userData = await register({ ...req.body, role: 'user' })
      res.status(201).json({ message: 'User registered successfully', user: userData })
    } catch (err) {
      next(err)
    }
  }
)

// POST /login - Authenticate user (PUBLIC)
// RATE LIMITED BY IP: stops brute-force password guessing from one machine.
// 5 login attempts per 1 minute per IP.
userRoute.post(
  '/login',
  rateLimiter({ algorithm: 'fixed-window', limit: 5, windowMs: 60 * 1000, by: 'ip' }),
  async (req, res, next) => {
    try {
      // get user credentials object
      let userCred = req.body
      // authenticate user and get token and user details
      let { token, user } = await authenticate(userCred)
      res.cookie('token', token, { httpOnly: true, sameSite: 'none', secure: true })
      res.status(200).json({ message: 'Login successful', token, user })
    } catch (err) {
      next(err)
    }
  }
)

// GET /me - Get the currently logged-in user (PROTECTED)
// Used by the frontend to restore the session on page load.
userRoute.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await UserModel.findOne({ userId: req.user.userId }).select('-password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.status(200).json({ message: 'User found', user })
  } catch (err) {
    res.status(500).json({ message: 'error', reason: err.message })
  }
})

// PATCH /me - Update the currently logged-in user's name (PROTECTED)
userRoute.patch(
  '/me',
  authMiddleware,
  namespaceRateLimitUser('profile-edit'),
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  restoreRateLimitUser,
  async (req, res) => {
    try {
      const { name } = req.body
      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Name is required' })
      }
      const user = await UserModel.findOneAndUpdate(
        { userId: req.user.userId },
        { name: name.trim() },
        { new: true }
      ).select('-password')
      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }
      res.status(200).json({ message: 'User updated', user })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// GET /lookup/:userId - Check if a userId exists before messaging them (PROTECTED)
// Returns the name so the UI can show who you're about to message.
userRoute.get('/lookup/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await UserModel.findOne({ userId: req.params.userId }).select('userId name')
    if (!user) {
      return res.status(404).json({ message: 'No user with that ID' })
    }
    res.status(200).json({ message: 'User found', payload: user })
  } catch (err) {
    res.status(500).json({ message: 'error', reason: err.message })
  }
})

// POST /logout - Clear the auth cookie (PROTECTED)
userRoute.post('/logout', authMiddleware, async (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'none', secure: true })
  res.status(200).json({ message: 'Logout successful' })
})

// DELETE /me - Soft-delete the current user (PROTECTED)
// Rate-limited to prevent abuse of the endpoint
userRoute.delete(
  '/me',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const userId = req.user.userId
      const user = await UserModel.findOneAndUpdate(
        { userId },
        { isDeleted: true, name: 'Deleted user', email: '' },
        { new: true }
      )
      res.clearCookie('token', { httpOnly: true, sameSite: 'none', secure: true })
      return res.status(200).json({ message: 'Account deleted', user: { userId: user.userId, name: user.name } })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// POST /block/:userId - Block a user (add to current user's blocked list)
userRoute.post(
  '/block/:userId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId
      const target = req.params.userId
      if (me === target) return res.status(400).json({ message: 'Cannot block yourself' })
      await UserModel.findOneAndUpdate({ userId: me }, { $addToSet: { blocked: target } })
      res.status(200).json({ message: 'User blocked', blocked: target })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// POST /unblock/:userId - Unblock a user (remove from blocked list)
userRoute.post(
  '/unblock/:userId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId
      const target = req.params.userId
      await UserModel.findOneAndUpdate({ userId: me }, { $pull: { blocked: target } })
      res.status(200).json({ message: 'User unblocked', unblocked: target })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// GET /blocked - Get the list of blocked users with names (PROTECTED)
userRoute.get(
  '/blocked',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = await UserModel.findOne({ userId: req.user.userId }).select('blocked')
      const blockedIds = me?.blocked || []
      if (blockedIds.length === 0) return res.status(200).json({ message: 'Blocked retrieved', payload: [] })
      const users = await UserModel.find({ userId: { $in: blockedIds } }).select('userId name isDeleted')
      const payload = blockedIds.map((id) => {
        const u = users.find((x) => x.userId === id)
        return { userId: id, name: u ? (u.isDeleted ? 'Deleted user' : u.name) : 'Unknown' }
      })
      res.status(200).json({ message: 'Blocked retrieved', payload })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)
