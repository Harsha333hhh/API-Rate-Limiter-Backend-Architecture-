import express from 'express'
import mongoose from 'mongoose'
import { MessageModel } from '../Models/MessageModel.js'
import { UserModel } from '../Models/UserModel.js'
import { authMiddleware } from '../Middlewares/authMiddleware.js'

export const conversationProtectionRoute = express.Router()

const KDF_ITERATIONS = 600000
const MAX_MIGRATION_BATCH_SIZE = 50
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

function getOwnSetting(user, otherUserId) {
  return user?.protectedConversations?.find((setting) => setting.otherUserId === otherUserId)
}

function conversationFilter(userId, otherUserId) {
  return {
    $or: [
      { senderId: userId, receiverId: otherUserId },
      { senderId: otherUserId, receiverId: userId },
    ],
  }
}

function isEncoded(value, { min = 1, max = 32768 } = {}) {
  return typeof value === 'string' && value.length >= min && value.length <= max && BASE64URL_PATTERN.test(value)
}

function isValidEnvelope(envelope) {
  return (
    envelope &&
    envelope.version === 1 &&
    envelope.kdf === 'PBKDF2-SHA-256' &&
    envelope.iterations === KDF_ITERATIONS &&
    isEncoded(envelope.salt, { min: 20, max: 32 }) &&
    isEncoded(envelope.iv, { min: 16, max: 16 }) &&
    isEncoded(envelope.ciphertext, { min: 20, max: 4096 })
  )
}

function isValidPublicKey(publicKey) {
  return typeof publicKey === 'string' && publicKey.length >= 250 && publicKey.length <= 2048 && BASE64URL_PATTERN.test(publicKey)
}

function isValidProtectedCopy(copy) {
  return (
    copy &&
    copy.version === 1 &&
    isEncoded(copy.iv, { min: 16, max: 16 }) &&
    isEncoded(copy.ciphertext, { min: 1, max: 32768 }) &&
    isEncoded(copy.wrappedKey, { min: 300, max: 2048 })
  )
}

function publicSetting(setting) {
  if (!setting) return null
  return { status: setting.status, publicKey: setting.publicKey }
}

function addOrReplaceProtectedCopyPipeline(userId, copy) {
  return [
    {
      $set: {
        protectedCopies: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ['$protectedCopies', []] },
                as: 'existing',
                cond: { $ne: ['$$existing.userId', userId] },
              },
            },
            [{ $literal: { userId, ...copy } }],
          ],
        },
      },
    },
  ]
}

conversationProtectionRoute.get('/:otherUserId/protection', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user
    const { otherUserId } = req.params
    if (!otherUserId || otherUserId === userId) {
      return res.status(400).json({ message: 'A different conversation participant is required' })
    }

    const [owner, peer] = await Promise.all([
      UserModel.findOne({ userId }).select('protectedConversations').lean(),
      UserModel.findOne({ userId: otherUserId }).select('protectedConversations').lean(),
    ])
    if (!peer) return res.status(404).json({ message: 'No user with that ID' })

    const ownSetting = getOwnSetting(owner, otherUserId)
    const peerSetting = getOwnSetting(peer, userId)
    res.status(200).json({
      own: ownSetting
        ? {
            status: ownSetting.status,
            enabled: ownSetting.protectionEnabled !== false,
            publicKey: ownSetting.publicKey,
            privateKeyEnvelope: ownSetting.privateKeyEnvelope,
          }
        : null,
      peer: publicSetting(peerSetting),
    })
  } catch (error) {
    res.status(500).json({ message: 'Could not load conversation protection settings' })
  }
})

conversationProtectionRoute.post('/:otherUserId/protection', authMiddleware, async (req, res) => {
  try {
    const topologyType = mongoose.connection.client?.topology?.description?.type
    if (!['ReplicaSetWithPrimary', 'Sharded'].includes(topologyType)) {
      return res.status(503).json({
        message: 'Conversation protection requires MongoDB transaction support; no protection state was changed',
      })
    }
    const { userId } = req.user
    const { otherUserId } = req.params
    const { publicKey, privateKeyEnvelope } = req.body || {}
    if (!otherUserId || otherUserId === userId) {
      return res.status(400).json({ message: 'A different conversation participant is required' })
    }
    if (!isValidPublicKey(publicKey) || !isValidEnvelope(privateKeyEnvelope)) {
      return res.status(400).json({ message: 'Invalid public key or encrypted private-key envelope' })
    }
    const peer = await UserModel.findOne({ userId: otherUserId }).select('userId').lean()
    if (!peer) return res.status(404).json({ message: 'No user with that ID' })

    const updated = await UserModel.findOneAndUpdate(
      { userId, 'protectedConversations.otherUserId': { $ne: otherUserId } },
      {
        $push: {
          protectedConversations: {
            otherUserId,
            status: 'migrating',
            protectionEnabled: false,
            publicKey,
            privateKeyEnvelope,
          },
        },
      },
      { new: true, runValidators: true }
    )
    if (!updated) {
      return res.status(409).json({ message: 'Protection is already enabled or migration is in progress' })
    }

    res.status(202).json({ message: 'Conversation history migration started', status: 'migrating' })
  } catch (error) {
    res.status(500).json({ message: 'Could not start conversation protection' })
  }
})

conversationProtectionRoute.patch('/:otherUserId/protection/enabled', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user
    const { otherUserId } = req.params
    const { enabled } = req.body || {}
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Protection enabled must be a boolean' })
    }

    const updated = await UserModel.updateOne(
      {
        userId,
        protectedConversations: {
          $elemMatch: { otherUserId, status: 'protected' },
        },
      },
      { $set: { 'protectedConversations.$.protectionEnabled': enabled } },
      { runValidators: true }
    )
    if (updated.matchedCount !== 1) {
      return res.status(409).json({ message: 'Complete PIN setup before changing chat protection' })
    }
    res.status(200).json({ message: 'Chat protection setting updated', enabled })
  } catch (error) {
    res.status(500).json({ message: 'Could not update chat protection setting' })
  }
})

conversationProtectionRoute.patch('/:otherUserId/protection/key-envelope', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user
    const { otherUserId } = req.params
    const { privateKeyEnvelope } = req.body || {}
    if (!isValidEnvelope(privateKeyEnvelope)) {
      return res.status(400).json({ message: 'Invalid encrypted private-key envelope' })
    }
    const updated = await UserModel.updateOne(
      { userId, 'protectedConversations.otherUserId': otherUserId },
      { $set: { 'protectedConversations.$.privateKeyEnvelope': privateKeyEnvelope } },
      { runValidators: true }
    )
    if (updated.matchedCount !== 1) {
      return res.status(404).json({ message: 'Protected conversation was not found' })
    }
    res.status(200).json({ message: 'Protected private key updated' })
  } catch (error) {
    res.status(500).json({ message: 'Could not update protected private key' })
  }
})

conversationProtectionRoute.get(
  '/:otherUserId/protection/migration-source',
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.user
      const { otherUserId } = req.params
      const owner = await UserModel.findOne({ userId }).select('protectedConversations').lean()
      const status = getOwnSetting(owner, otherUserId)?.status
      if (!['migrating', 'protected'].includes(status)) {
        return res.status(409).json({ message: 'Conversation is not awaiting protection synchronization' })
      }

      const messages = await MessageModel.find({
        ...conversationFilter(userId, otherUserId),
        $nor: [{ protectedCopies: { $elemMatch: { userId } } }],
      })
        .select('_id senderId receiverId text createdAt')
        .sort({ createdAt: 1, _id: 1 })
        .limit(MAX_MIGRATION_BATCH_SIZE)
        .lean()

      if (messages.some((message) => typeof message.text !== 'string')) {
        return res.status(409).json({
          message: 'History contains a message without recoverable plaintext; migration cannot safely continue',
        })
      }
      res.status(200).json({ payload: messages })
    } catch (error) {
      res.status(500).json({ message: 'Could not load conversation history for migration' })
    }
  }
)

conversationProtectionRoute.post(
  '/:otherUserId/protection/migrate',
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.user
      const { otherUserId } = req.params
      const { copies } = req.body || {}
      const owner = await UserModel.findOne({ userId }).select('protectedConversations').lean()
      const status = getOwnSetting(owner, otherUserId)?.status
      if (!['migrating', 'protected'].includes(status)) {
        return res.status(409).json({ message: 'Conversation is not awaiting protection synchronization' })
      }
      if (
        !Array.isArray(copies) ||
        copies.length < 1 ||
        copies.length > MAX_MIGRATION_BATCH_SIZE ||
        copies.some(
          (entry) =>
            !entry ||
            !mongoose.Types.ObjectId.isValid(entry.messageId) ||
            !isValidProtectedCopy(entry.protectedCopy)
        )
      ) {
        return res.status(400).json({ message: 'Invalid or oversized migration batch' })
      }

      const ids = [...new Set(copies.map((entry) => String(entry.messageId)))]
      if (ids.length !== copies.length) {
        return res.status(400).json({ message: 'Migration batch contains duplicate messages' })
      }

      const matchingMessages = await MessageModel.find({
        _id: { $in: ids },
        ...conversationFilter(userId, otherUserId),
      })
        .select('_id')
        .lean()
      if (matchingMessages.length !== copies.length) {
        return res.status(403).json({ message: 'Migration batch contains a message outside this conversation' })
      }

      await MessageModel.bulkWrite(
        copies.map(({ messageId, protectedCopy }) => ({
          updateOne: {
            filter: { _id: messageId, ...conversationFilter(userId, otherUserId) },
            update: addOrReplaceProtectedCopyPipeline(userId, protectedCopy),
          },
        }))
      )
      res.status(200).json({ message: 'Migration batch stored', migrated: copies.length })
    } catch (error) {
      res.status(500).json({ message: 'Could not store conversation migration batch' })
    }
  }
)

conversationProtectionRoute.post(
  '/:otherUserId/protection/complete',
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.user
      const { otherUserId } = req.params
      const owner = await UserModel.findOne({ userId }).select('protectedConversations').lean()
      if (getOwnSetting(owner, otherUserId)?.status !== 'migrating') {
        return res.status(409).json({ message: 'Conversation history is not awaiting migration' })
      }

      const missing = await MessageModel.countDocuments({
        ...conversationFilter(userId, otherUserId),
        $nor: [{ protectedCopies: { $elemMatch: { userId } } }],
      })
      if (missing > 0) {
        return res.status(409).json({
          message: 'Conversation protection is not active because some history is not yet encrypted',
          remainingMessages: missing,
        })
      }

      const updated = await UserModel.updateOne(
        { userId, 'protectedConversations.otherUserId': otherUserId, 'protectedConversations.status': 'migrating' },
        { $set: { 'protectedConversations.$.status': 'protected' } }
      )
      if (updated.modifiedCount !== 1) {
        return res.status(409).json({ message: 'Conversation migration state changed; reload protection settings' })
      }

      const peer = await UserModel.findOne({ userId: otherUserId }).select('protectedConversations').lean()
      if (getOwnSetting(peer, userId)?.status === 'protected') {
        await MessageModel.updateMany(
          {
            ...conversationFilter(userId, otherUserId),
            $and: [
              { protectedCopies: { $elemMatch: { userId } } },
              { protectedCopies: { $elemMatch: { userId: otherUserId } } },
            ],
          },
          { $unset: { text: 1 } }
        )
      }

      res.status(200).json({ message: 'Conversation protection enabled', status: 'protected' })
    } catch (error) {
      res.status(500).json({ message: 'Could not complete conversation protection' })
    }
  }
)

conversationProtectionRoute.delete(
  '/:otherUserId/protection/migration',
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.user
      const { otherUserId } = req.params
      const owner = await UserModel.findOne({ userId }).select('protectedConversations').lean()
      if (getOwnSetting(owner, otherUserId)?.status !== 'migrating') {
        return res.status(409).json({ message: 'Only an incomplete migration can be rolled back' })
      }

      const unreadableAfterRollback = await MessageModel.countDocuments({
        ...conversationFilter(userId, otherUserId),
        $or: [{ text: { $exists: false } }, { text: '' }],
        protectedCopies: { $elemMatch: { userId } },
      })
      if (unreadableAfterRollback > 0) {
        return res.status(409).json({
          message: 'Rollback is unsafe because some messages have no retained plaintext copy',
        })
      }

      await MessageModel.updateMany(
        conversationFilter(userId, otherUserId),
        { $pull: { protectedCopies: { userId } } }
      )
      await UserModel.updateOne(
        { userId },
        { $pull: { protectedConversations: { otherUserId, status: 'migrating' } } }
      )
      res.status(200).json({ message: 'Incomplete conversation migration rolled back' })
    } catch (error) {
      res.status(500).json({ message: 'Could not roll back conversation migration' })
    }
  }
)
