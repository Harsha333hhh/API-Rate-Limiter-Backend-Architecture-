// USERS API - Routes for registration, login, and looking up users
// Imports: express for routing, register controller, authenticate service,
// auth middleware, and our rate limiter middleware.
import express from 'express'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { register } from '../Controllers/userController.js'
import { authenticate } from '../services/authservices.js'
import { GoogleIdentityError, verifyGoogleIdentityToken } from '../services/googleIdentity.js'
import { UserModel } from '../Models/UserModel.js'
import { authMiddleware } from '../Middlewares/authMiddleware.js'
import { rateLimiter } from '../RateLimiter/rateLimiter.js'

// create and export user router
export const userRoute = express.Router()

function createSessionToken(user) {
  return jwt.sign(
    { userId: user.userId, role: user.role },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '7d' }
  )
}

function setSessionCookie(res, token) {
  res.cookie('token', token, { httpOnly: true, sameSite: 'none', secure: true })
}

function toSafeUser(user) {
  const safeUser = user.toObject ? user.toObject() : { ...user }
  delete safeUser.password
  delete safeUser.googleSub
  safeUser.googleLinked = Boolean(user.googleSub)
  safeUser.profilePictureId = user.profilePictureId?.toString() || null
  return safeUser
}

const MAX_PROFILE_PICTURE_BYTES = 2 * 1024 * 1024
const PROFILE_PICTURE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const profilePictureBodyParser = express.raw({
  type: () => true,
  limit: MAX_PROFILE_PICTURE_BYTES,
})

function getProfilePictureBucket() {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB is not connected')
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'profilePictures',
  })
}

function detectProfilePictureType(buffer) {
  if (
    buffer.length >= 33 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.readUInt32BE(8) === 13 &&
    buffer.toString('ascii', 12, 16) === 'IHDR' &&
    buffer.toString('ascii', buffer.length - 8, buffer.length - 4) === 'IEND'
  ) {
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return width > 0 && height > 0 && width <= 4096 && height <= 4096 ? 'image/png' : null
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  ) {
    let offset = 2
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) return null
      while (buffer[offset] === 0xff) offset += 1
      const marker = buffer[offset]
      offset += 1
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue
      }
      if (offset + 2 > buffer.length) return null
      const segmentLength = buffer.readUInt16BE(offset)
      if (segmentLength < 2 || offset + segmentLength > buffer.length) return null
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (segmentLength < 7) return null
        const height = buffer.readUInt16BE(offset + 3)
        const width = buffer.readUInt16BE(offset + 5)
        return width > 0 && height > 0 && width <= 4096 && height <= 4096 ? 'image/jpeg' : null
      }
      offset += segmentLength
    }
    return null
  }

  if (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP' &&
    buffer.readUInt32LE(4) + 8 === buffer.length
  ) {
    const chunkType = buffer.toString('ascii', 12, 16)
    let width
    let height
    if (chunkType === 'VP8X') {
      width = 1 + buffer.readUIntLE(24, 3)
      height = 1 + buffer.readUIntLE(27, 3)
    } else if (chunkType === 'VP8 ') {
      width = buffer.readUInt16LE(26) & 0x3fff
      height = buffer.readUInt16LE(28) & 0x3fff
    } else if (chunkType === 'VP8L' && buffer[20] === 0x2f) {
      width = 1 + (((buffer[22] & 0x3f) << 8) | buffer[21])
      height = 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | ((buffer[22] & 0xc0) >> 6))
    }
    return width > 0 && height > 0 && width <= 4096 && height <= 4096 ? 'image/webp' : null
  }

  return null
}

function parseProfilePictureBody(req, res, next) {
  profilePictureBodyParser(req, res, (error) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ message: 'Profile pictures must be 2 MB or smaller' })
    }
    if (error) {
      return res.status(400).json({ message: 'Could not read the profile picture upload' })
    }
    next()
  })
}

async function cleanProfilePicture(bucket, db, fileId) {
  const [file] = await bucket.find({ _id: fileId }).limit(1).toArray()
  if (file) {
    await bucket.delete(fileId)
    return
  }
  await Promise.all([
    db.collection('profilePictures.files').deleteOne({ _id: fileId }),
    db.collection('profilePictures.chunks').deleteMany({ files_id: fileId }),
  ])
}

async function uploadProfilePicture(bucket, fileBuffer, userId, contentType) {
  const uploadStream = bucket.openUploadStream(`profile-${userId}`, {
    metadata: { ownerUserId: userId, contentType },
  })
  try {
    await pipeline(Readable.from([fileBuffer]), uploadStream)
    return uploadStream.id
  } catch (error) {
    try {
      const db = mongoose.connection.db
      await Promise.all([
        db.collection('profilePictures.files').deleteOne({ _id: uploadStream.id }),
        db.collection('profilePictures.chunks').deleteMany({ files_id: uploadStream.id }),
      ])
    } catch (cleanupError) {
      console.error('Could not clean up an incomplete profile picture upload:', cleanupError.message)
    }
    throw error
  }
}

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

// Google Identity Services sends an ID token; its signature and claims are verified server-side.
userRoute.post(
  '/google',
  rateLimiter({ algorithm: 'fixed-window', limit: 5, windowMs: 60 * 1000, by: 'ip' }),
  async (req, res) => {
    let identity
    try {
      identity = await verifyGoogleIdentityToken(req.body?.credential, req.body?.nonce)
      let user = await UserModel.findOne({ googleSub: identity.sub })

      if (!user) {
        const emailAccount = await UserModel.findOne({ email: identity.email })
        if (emailAccount) {
          return res.status(409).json({
            code: 'ACCOUNT_LINK_REQUIRED',
            message: 'An account already uses this email. Sign in to it and link Google from your profile.',
          })
        }

        user = await new UserModel({
          name: identity.name,
          email: identity.email,
          googleSub: identity.sub,
          role: 'user',
        }).save()
      }

      if (user.isDeleted) {
        return res.status(403).json({ message: 'This account is no longer available' })
      }

      const token = createSessionToken(user)
      setSessionCookie(res, token)
      return res.status(200).json({
        message: 'Google sign-in successful',
        token,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role,
          profilePictureId: user.profilePictureId?.toString() || null,
          googleLinked: true,
        },
      })
    } catch (error) {
      if (error instanceof GoogleIdentityError) {
        return res.status(error.status).json({ message: error.message })
      }
      if (error.code === 11000) {
        const linkedUser = identity && await UserModel.findOne({ googleSub: identity.sub })
        if (linkedUser && !linkedUser.isDeleted) {
          const token = createSessionToken(linkedUser)
          setSessionCookie(res, token)
          return res.status(200).json({
            message: 'Google sign-in successful',
            token,
            user: {
              userId: linkedUser.userId,
              name: linkedUser.name,
              email: linkedUser.email,
              role: linkedUser.role,
              profilePictureId: linkedUser.profilePictureId?.toString() || null,
              googleLinked: true,
            },
          })
        }
        return res.status(409).json({ message: 'This Google account is already linked to another account' })
      }
      console.error('Google sign-in failed:', error.message)
      return res.status(500).json({ message: 'Could not sign in with Google' })
    }
  }
)

userRoute.post(
  '/google/link',
  authMiddleware,
  rateLimiter({ algorithm: 'fixed-window', limit: 5, windowMs: 60 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const identity = await verifyGoogleIdentityToken(req.body?.credential, req.body?.nonce)
      const user = await UserModel.findOne({ userId: req.user.userId })
      if (!user || user.isDeleted) {
        return res.status(404).json({ message: 'User not found' })
      }
      if (user.email.toLowerCase() !== identity.email) {
        return res.status(403).json({ message: 'Sign in to Google with the same email as this Whisper account' })
      }

      const linkedAccount = await UserModel.findOne({ googleSub: identity.sub })
      if (linkedAccount && linkedAccount.userId !== user.userId) {
        return res.status(409).json({ message: 'This Google account is already linked to another Whisper account' })
      }

      const updatedUser = await UserModel.findOneAndUpdate(
        {
          userId: user.userId,
          email: user.email,
          $or: [{ googleSub: { $exists: false } }, { googleSub: null }, { googleSub: identity.sub }],
        },
        { $set: { googleSub: identity.sub } },
        { new: true }
      ).select('-password')
      if (!updatedUser) {
        return res.status(409).json({ message: 'Account changed while linking Google; please retry' })
      }

      return res.status(200).json({
        message: 'Google account linked',
        user: toSafeUser(updatedUser),
      })
    } catch (error) {
      if (error instanceof GoogleIdentityError) {
        return res.status(error.status).json({ message: error.message })
      }
      if (error.code === 11000) {
        return res.status(409).json({ message: 'This Google account is already linked to another Whisper account' })
      }
      console.error('Google account linking failed:', error.message)
      return res.status(500).json({ message: 'Could not link Google account' })
    }
  }
)

// Profile picture writes have an independent quota and do not consume existing user API limits.
userRoute.post(
  '/me/profile-picture',
  authMiddleware,
  namespaceRateLimitUser('profile-picture'),
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  restoreRateLimitUser,
  parseProfilePictureBody,
  async (req, res) => {
    const contentType = req.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'A profile picture file is required' })
    }
    const detectedType = detectProfilePictureType(req.body)
    if (!PROFILE_PICTURE_TYPES.has(contentType) || detectedType !== contentType) {
      return res.status(415).json({ message: 'Upload a valid JPEG, PNG, or WebP image' })
    }

    let uploadedFileId
    try {
      const userId = req.user.userId
      const owner = await UserModel.findOne({ userId }).select('profilePictureId isDeleted').lean()
      if (!owner || owner.isDeleted) {
        return res.status(404).json({ message: 'User not found' })
      }
      const bucket = getProfilePictureBucket()
      const db = mongoose.connection.db
      uploadedFileId = await uploadProfilePicture(bucket, req.body, userId, detectedType)

      const updatedUser = await UserModel.findOneAndUpdate(
        {
          userId,
          isDeleted: { $ne: true },
          profilePictureId: owner.profilePictureId || null,
        },
        { $set: { profilePictureId: uploadedFileId } },
        { new: true }
      ).select('userId name email role profilePictureId')
      if (!updatedUser) {
        await cleanProfilePicture(bucket, db, uploadedFileId)
        return res.status(409).json({ message: 'Profile changed during upload; please retry' })
      }

      if (owner.profilePictureId) {
        try {
          await cleanProfilePicture(bucket, db, owner.profilePictureId)
        } catch (error) {
          console.error('Could not remove replaced profile picture:', error.message)
        }
      }
      res.status(200).json({ message: 'Profile picture updated', user: updatedUser })
    } catch (error) {
      if (uploadedFileId) {
        try {
          await cleanProfilePicture(getProfilePictureBucket(), mongoose.connection.db, uploadedFileId)
        } catch (cleanupError) {
          console.error('Could not clean up a failed profile picture update:', cleanupError.message)
        }
      }
      console.error('Profile picture upload failed:', error.message)
      res.status(500).json({ message: 'Could not update profile picture' })
    }
  }
)

userRoute.delete(
  '/me/profile-picture',
  authMiddleware,
  namespaceRateLimitUser('profile-picture'),
  rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 60 * 1000, by: 'user' }),
  restoreRateLimitUser,
  async (req, res) => {
    try {
      const userId = req.user.userId
      const owner = await UserModel.findOne({ userId }).select('profilePictureId isDeleted').lean()
      if (!owner || owner.isDeleted) {
        return res.status(404).json({ message: 'User not found' })
      }
      if (!owner.profilePictureId) {
        return res.status(200).json({ message: 'Profile picture removed', profilePictureId: null })
      }

      await cleanProfilePicture(getProfilePictureBucket(), mongoose.connection.db, owner.profilePictureId)
      const updated = await UserModel.updateOne(
        { userId, profilePictureId: owner.profilePictureId },
        { $set: { profilePictureId: null } }
      )
      if (updated.matchedCount !== 1) {
        return res.status(409).json({ message: 'Profile changed during removal; please retry' })
      }
      res.status(200).json({ message: 'Profile picture removed', profilePictureId: null })
    } catch (error) {
      console.error('Profile picture removal failed:', error.message)
      res.status(500).json({ message: 'Could not remove profile picture' })
    }
  }
)

userRoute.get('/profile-picture/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params
    const owner = await UserModel.findOne({ userId }).select('profilePictureId isDeleted').lean()
    if (!owner || owner.isDeleted || !owner.profilePictureId) {
      return res.status(404).json({ message: 'Profile picture not found' })
    }

    const bucket = getProfilePictureBucket()
    const [file] = await bucket.find({ _id: owner.profilePictureId }).limit(1).toArray()
    if (!file || file.metadata?.ownerUserId !== userId) {
      if (!file) {
        await UserModel.updateOne(
          { userId, profilePictureId: owner.profilePictureId },
          { $set: { profilePictureId: null } }
        )
        await Promise.all([
          mongoose.connection.db.collection('profilePictures.files').deleteOne({ _id: owner.profilePictureId }),
          mongoose.connection.db.collection('profilePictures.chunks').deleteMany({ files_id: owner.profilePictureId }),
        ])
      }
      return res.status(404).json({ message: 'Profile picture not found' })
    }
    if (!PROFILE_PICTURE_TYPES.has(file.metadata.contentType)) {
      return res.status(415).json({ message: 'Stored profile picture has an unsupported format' })
    }

    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': file.metadata.contentType,
      'Content-Length': String(file.length),
      'X-Content-Type-Options': 'nosniff',
    })
    const download = bucket.openDownloadStream(owner.profilePictureId)
    download.on('error', (error) => {
      console.error('Profile picture stream failed:', error.message)
      if (!res.headersSent) res.status(404).json({ message: 'Profile picture not found' })
      else res.destroy()
    })
    download.pipe(res)
  } catch (error) {
    console.error('Profile picture retrieval failed:', error.message)
    res.status(500).json({ message: 'Could not load profile picture' })
  }
})

// GET /me - Get the currently logged-in user (PROTECTED)
// Used by the frontend to restore the session on page load.
userRoute.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await UserModel.findOne({ userId: req.user.userId }).select('-password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.status(200).json({ message: 'User found', user: toSafeUser(user) })
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
      res.status(200).json({ message: 'User updated', user: toSafeUser(user) })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// GET /lookup/:userId - Check if a userId exists before messaging them (PROTECTED)
// Returns the name so the UI can show who you're about to message.
userRoute.get('/lookup/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await UserModel.findOne({ userId: req.params.userId }).select('userId name profilePictureId')
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
      if (user?.profilePictureId) {
        try {
          await cleanProfilePicture(getProfilePictureBucket(), mongoose.connection.db, user.profilePictureId)
          await UserModel.updateOne(
            { userId, profilePictureId: user.profilePictureId },
            { $set: { profilePictureId: null } }
          )
        } catch (error) {
          console.error('Could not remove deleted account profile picture:', error.message)
        }
      }
      res.clearCookie('token', { httpOnly: true, sameSite: 'none', secure: true })
      return res.status(200).json({ message: 'Account deleted', user: { userId: user.userId, name: user.name } })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// POST /block/:userId - Block a user (add to current user's blocked list)
// Tight rate limit to prevent scripted block/unblock abuse
userRoute.post(
  '/block/:userId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 5, windowMs: 15 * 1000, by: 'user' }),
  async (req, res) => {
    try {
      const me = req.user.userId
      const target = req.params.userId
      if (!target) return res.status(400).json({ message: 'userId is required' })
      if (me === target) return res.status(400).json({ message: 'Cannot block yourself' })

      const targetUser = await UserModel.findOne({ userId: target }).select('userId')
      if (!targetUser) return res.status(404).json({ message: 'No user with that ID' })

      await UserModel.updateOne({ userId: me }, { $addToSet: { blocked: targetUser.userId } })
      res.status(200).json({ message: 'User blocked', blocked: targetUser.userId })
    } catch (err) {
      res.status(500).json({ message: 'error', reason: err.message })
    }
  }
)

// POST /unblock/:userId - Unblock a user (remove from blocked list)
// Tight rate limit to prevent scripted block/unblock abuse
userRoute.post(
  '/unblock/:userId',
  authMiddleware,
  rateLimiter({ algorithm: 'sliding-window', limit: 5, windowMs: 15 * 1000, by: 'user' }),
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
      const me = await UserModel.findOne({ userId: req.user.userId }).select('blocked').lean()
      const blockedIds = Array.isArray(me?.blocked) ? me.blocked : []
      if (blockedIds.length === 0) return res.status(200).json({ message: 'Blocked retrieved', payload: [] })
      const users = await UserModel.find({ userId: { $in: blockedIds } }).select('userId name isDeleted').lean()
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
