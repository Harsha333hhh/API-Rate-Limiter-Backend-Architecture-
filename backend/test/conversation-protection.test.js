import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import express from 'express'
import { afterEach, test } from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { conversationProtectionRoute } from '../APIs/ConversationProtectionApi.js'
import { messageRoute, messageForUser } from '../APIs/MessagesApi.js'
import { MessageModel } from '../Models/MessageModel.js'
import { UserModel } from '../Models/UserModel.js'
import {
  createConversationKeyMaterial,
  decryptMessageCopy,
  encryptMessageCopies,
  rewrapConversationPrivateKey,
  unlockConversationPrivateKey,
  validatePin,
} from '../../frontend/src/lib/conversationCrypto.js'

const originalJwtSecret = process.env.JWT_SECRET

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

test('personal protected copies decrypt independently and PIN changes rewrap the same key', async () => {
  const alice = await createConversationKeyMaterial('correct horse battery')
  const bob = await createConversationKeyMaterial('another secure pin')
  const plaintext = 'Personal copy encryption test'

  const copies = await encryptMessageCopies(plaintext, [
    { userId: 'alice', publicKey: alice.publicKey },
    { userId: 'bob', publicKey: bob.publicKey },
  ])
  assert.equal(copies.length, 2)
  assert.notEqual(copies[0].ciphertext, plaintext)
  assert.equal(await decryptMessageCopy(copies[0], alice.privateKey), plaintext)
  assert.equal(await decryptMessageCopy(copies[1], bob.privateKey), plaintext)

  const changedEnvelope = await rewrapConversationPrivateKey(alice.privateKey, 'new secure pin')
  const changedKey = await unlockConversationPrivateKey(changedEnvelope, 'new secure pin')
  assert.equal(await decryptMessageCopy(copies[0], changedKey), plaintext)
  await assert.rejects(
    unlockConversationPrivateKey(changedEnvelope, 'wrong secure pin'),
    /PIN is incorrect/
  )
  await assert.rejects(
    unlockConversationPrivateKey(alice.privateKeyEnvelope, 'incorrect pin'),
    /PIN is incorrect/
  )

  const alteredFirstCharacter = copies[0].ciphertext[0] === 'A' ? 'B' : 'A'
  const tamperedCopy = { ...copies[0], ciphertext: `${alteredFirstCharacter}${copies[0].ciphertext.slice(1)}` }
  await assert.rejects(decryptMessageCopy(tamperedCopy, alice.privateKey), /Could not decrypt/)
})

test('PIN validation rejects weak or overlong values', () => {
  assert.equal(validatePin('short'), false)
  assert.equal(validatePin('12345678'), true)
  assert.equal(validatePin('x'.repeat(129)), false)
  assert.equal(validatePin(null), false)
})

test('message serialization isolates protected copies and redacts protected plaintext', () => {
  const original = {
    _id: 'message-id',
    text: 'private plaintext',
    protectedCopies: [
      { userId: 'alice', version: 1, iv: 'alice-iv', ciphertext: 'alice-ciphertext', wrappedKey: 'alice-key' },
      { userId: 'bob', version: 1, iv: 'bob-iv', ciphertext: 'bob-ciphertext', wrappedKey: 'bob-key' },
    ],
    toObject() {
      return {
        _id: this._id,
        text: this.text,
        protectedCopies: this.protectedCopies,
      }
    },
  }

  const protectedCopy = messageForUser(original, 'alice', { status: 'protected' })
  assert.equal(Object.hasOwn(protectedCopy, 'text'), false)
  assert.equal(protectedCopy.protectedCopy.ciphertext, 'alice-ciphertext')
  assert.equal(Object.hasOwn(protectedCopy, 'protectedCopies'), false)
  assert.equal(JSON.stringify(protectedCopy).includes('private plaintext'), false)
  assert.equal(JSON.stringify(protectedCopy).includes('bob-key'), false)

  const ordinaryCopy = messageForUser(original, 'bob', null)
  assert.equal(ordinaryCopy.text, 'private plaintext')
  assert.equal(Object.hasOwn(ordinaryCopy, 'protectedCopies'), false)

  const migratingCopy = messageForUser(original, 'alice', { status: 'migrating' })
  assert.notEqual(migratingCopy.text, 'private plaintext')
  assert.equal(Object.hasOwn(migratingCopy, 'protectedCopies'), false)

  const unavailableCopy = messageForUser(original, 'carol', { status: 'protected' })
  assert.equal(unavailableCopy.text, '[Protected message copy unavailable]')
  assert.equal(Object.hasOwn(unavailableCopy, 'protectedCopies'), false)
  assert.equal(JSON.stringify(unavailableCopy).includes('private plaintext'), false)
})

test('conversation protection API rejects unauthenticated requests', async () => {
  process.env.JWT_SECRET = 'conversation-protection-test-secret'
  const app = express()
  app.use('/conversation-api', conversationProtectionRoute)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/conversation-api/peer-id/protection`
    )
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { message: 'Not authenticated, no token' })
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('history migration remains incomplete until every message has an encrypted copy', async (t) => {
  process.env.JWT_SECRET = 'conversation-migration-test-secret'
  const originalFindOne = UserModel.findOne
  const originalUpdateOne = UserModel.updateOne
  const originalFind = MessageModel.find
  const originalBulkWrite = MessageModel.bulkWrite
  const originalCountDocuments = MessageModel.countDocuments
  const messageId = new mongoose.Types.ObjectId()
  const owner = {
    userId: 'migration-owner',
    protectedConversations: [{ otherUserId: 'migration-peer', status: 'migrating' }],
  }
  let missingCopies = 1
  let savedBatch = null

  UserModel.findOne = (filter) => ({
    select() {
      return this
    },
    lean() {
      return Promise.resolve(filter.userId === owner.userId ? owner : null)
    },
  })
  UserModel.updateOne = async (_filter, update) => {
    if (update.$set?.['protectedConversations.$.status'] === 'protected') {
      owner.protectedConversations[0].status = 'protected'
    }
    return { modifiedCount: 1, matchedCount: 1 }
  }
  MessageModel.find = (filter) => ({
    select() {
      return this
    },
    sort() {
      return this
    },
    limit() {
      return this
    },
    lean() {
      return Promise.resolve(
        filter.$nor
          ? [{ _id: messageId, senderId: 'migration-owner', receiverId: 'migration-peer', text: 'old history' }]
          : [{ _id: messageId }]
      )
    },
  })
  MessageModel.bulkWrite = async (operations) => {
    savedBatch = operations
    return { modifiedCount: operations.length }
  }
  MessageModel.countDocuments = async () => missingCopies
  t.after(() => {
    UserModel.findOne = originalFindOne
    UserModel.updateOne = originalUpdateOne
    MessageModel.find = originalFind
    MessageModel.bulkWrite = originalBulkWrite
    MessageModel.countDocuments = originalCountDocuments
  })

  const app = express()
  app.use(express.json())
  app.use('/conversation-api', conversationProtectionRoute)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}/conversation-api/migration-peer/protection`
  const authorization = `Bearer ${jwt.sign({ userId: owner.userId }, process.env.JWT_SECRET)}`
  const validCopy = {
    version: 1,
    iv: 'A'.repeat(16),
    ciphertext: 'b2xkLWhpc3Rvcnk',
    wrappedKey: 'B'.repeat(342),
  }

  try {
    const sourceResponse = await fetch(`${baseUrl}/migration-source`, {
      headers: { Authorization: authorization },
    })
    assert.equal(sourceResponse.status, 200)
    assert.equal((await sourceResponse.json()).payload[0].text, 'old history')

    const migrationResponse = await fetch(`${baseUrl}/migrate`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ copies: [{ messageId: String(messageId), protectedCopy: validCopy }] }),
    })
    assert.equal(migrationResponse.status, 200)
    assert.equal(savedBatch.length, 1)

    const incompleteResponse = await fetch(`${baseUrl}/complete`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(incompleteResponse.status, 409)
    assert.equal(owner.protectedConversations[0].status, 'migrating')

    missingCopies = 0
    const completedResponse = await fetch(`${baseUrl}/complete`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(completedResponse.status, 200)
    assert.equal(owner.protectedConversations[0].status, 'protected')
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('message API keeps each participant on their own protected or plaintext copy', async (t) => {
  process.env.JWT_SECRET = 'conversation-message-test-secret'
  const originalClient = mongoose.connection.client
  const originalStartSession = mongoose.startSession
  const originalFindOne = UserModel.findOne
  const originalUpdateOne = UserModel.updateOne
  const originalFind = MessageModel.find
  const originalCountDocuments = MessageModel.countDocuments
  const originalSave = MessageModel.prototype.save
  const messages = []
  const users = new Map([
    [
      'alice',
      {
        userId: 'alice',
        protectedConversations: [
          { otherUserId: 'bob', status: 'protected', publicKey: 'alice-public-key' },
        ],
      },
    ],
    ['bob', { userId: 'bob', blocked: [], protectedConversations: [] }],
  ])

  mongoose.connection.client = { topology: { description: { type: 'ReplicaSetWithPrimary' } } }
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  })
  UserModel.updateOne = async () => ({ matchedCount: 1 })
  UserModel.findOne = (filter) => ({
    select() {
      return this
    },
    session() {
      return this
    },
    lean() {
      return Promise.resolve(users.get(filter.userId) || null)
    },
  })
  MessageModel.countDocuments = async (filter) => {
    const ownerId = filter.$nor?.[0]?.protectedCopies?.$elemMatch?.userId
    return messages.filter(
      (message) =>
        !message.protectedCopies.some((copy) => copy.userId === ownerId)
    ).length
  }
  MessageModel.find = () => ({
    sort() {
      return this
    },
    then(resolve, reject) {
      return Promise.resolve([...messages]).then(resolve, reject)
    },
  })
  MessageModel.prototype.save = async function saveMessage() {
    this.createdAt = new Date()
    messages.push(this)
    return this
  }
  t.after(() => {
    mongoose.connection.client = originalClient
    mongoose.startSession = originalStartSession
    UserModel.findOne = originalFindOne
    UserModel.updateOne = originalUpdateOne
    MessageModel.find = originalFind
    MessageModel.countDocuments = originalCountDocuments
    MessageModel.prototype.save = originalSave
  })

  const app = express()
  app.use(express.json())
  app.use('/message-api', messageRoute)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const tokenFor = (userId) => jwt.sign({ userId, role: 'user' }, process.env.JWT_SECRET)
  const iv = 'A'.repeat(16)
  const ciphertext = 'c2VjcmV0LWNpcGhlcnRleHQ'
  const wrappedKey = 'B'.repeat(342)

  try {
    const aliceSent = await fetch(`${baseUrl}/message-api/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenFor('alice')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receiverId: 'bob',
        text: 'alice plaintext visible only to bob',
        protectedCopies: [
          { userId: 'alice', version: 1, iv, ciphertext, wrappedKey },
        ],
      }),
    })
    assert.equal(aliceSent.status, 201)
    const aliceSentBody = await aliceSent.json()
    assert.equal(Object.hasOwn(aliceSentBody.payload, 'text'), false)
    assert.equal(aliceSentBody.payload.protectedCopy.ciphertext, ciphertext)

    const bobReceived = await fetch(`${baseUrl}/message-api/messages/alice`, {
      headers: { Authorization: `Bearer ${tokenFor('bob')}` },
    })
    assert.equal(bobReceived.status, 200)
    assert.equal((await bobReceived.json()).payload[0].text, 'alice plaintext visible only to bob')

    const bobSent = await fetch(`${baseUrl}/message-api/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenFor('bob')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receiverId: 'alice',
        text: 'bob plaintext visible only to bob',
        protectedCopies: [
          { userId: 'alice', version: 1, iv, ciphertext, wrappedKey },
        ],
      }),
    })
    assert.equal(bobSent.status, 201)
    assert.equal((await bobSent.json()).payload.text, 'bob plaintext visible only to bob')

    const aliceReceived = await fetch(`${baseUrl}/message-api/messages/bob`, {
      headers: { Authorization: `Bearer ${tokenFor('alice')}` },
    })
    assert.equal(aliceReceived.status, 200)
    const aliceMessages = (await aliceReceived.json()).payload
    assert.equal(aliceMessages.length, 2)
    assert.equal(aliceMessages[0].text, undefined)
    assert.equal(aliceMessages[0].protectedCopy.ciphertext, ciphertext)
    assert.equal(aliceMessages[1].text, undefined)
    assert.equal(aliceMessages[1].protectedCopy.ciphertext, ciphertext)
  } finally {
    server.close()
    await once(server, 'close')
  }
})
