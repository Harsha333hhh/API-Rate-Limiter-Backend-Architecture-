import assert from 'node:assert/strict'
import { Readable, Writable } from 'node:stream'
import { once } from 'node:events'
import express from 'express'
import { afterEach, test } from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { userRoute } from '../APIs/UsersApi.js'
import { UserModel } from '../Models/UserModel.js'

const originalJwtSecret = process.env.JWT_SECRET

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

function pngImage() {
  const image = Buffer.alloc(45)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image)
  image.writeUInt32BE(13, 8)
  image.write('IHDR', 12, 'ascii')
  image.writeUInt32BE(1, 16)
  image.writeUInt32BE(1, 20)
  image[24] = 8
  image[25] = 2
  image.writeUInt32BE(0, 33)
  image.write('IEND', 37, 'ascii')
  return image
}

function jpegImage() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
  ])
}

function webpImage() {
  const image = Buffer.alloc(30)
  image.write('RIFF', 0, 'ascii')
  image.writeUInt32LE(image.length - 8, 4)
  image.write('WEBP', 8, 'ascii')
  image.write('VP8X', 12, 'ascii')
  image.writeUIntLE(0, 24, 3)
  image.writeUIntLE(0, 27, 3)
  return image
}

test('profile pictures upload, replace, stream, validate, and remove per authenticated account', async (t) => {
  process.env.JWT_SECRET = 'profile-picture-test-secret'
  const originalFindOne = UserModel.findOne
  const originalFindOneAndUpdate = UserModel.findOneAndUpdate
  const originalUpdateOne = UserModel.updateOne
  const originalDb = mongoose.connection.db
  const gridFsDescriptor = Object.getOwnPropertyDescriptor(mongoose.mongo, 'GridFSBucket')
  const users = new Map([
    ['alice', { userId: 'alice', name: 'Alice', email: 'alice@example.com', role: 'user', profilePictureId: null }],
    ['bob', { userId: 'bob', name: 'Bob', email: 'bob@example.com', role: 'user', profilePictureId: null }],
  ])
  const files = new Map()
  let nextId = 0
  let rejectUpload = false

  class FakeGridFSBucket {
    openUploadStream(filename, { metadata }) {
      const id = new mongoose.Types.ObjectId()
      const chunks = []
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          if (rejectUpload) {
            callback(new Error('simulated GridFS upload failure'))
            return
          }
          chunks.push(Buffer.from(chunk))
          callback()
        },
        final(callback) {
          const buffer = Buffer.concat(chunks)
          files.set(id.toString(), {
            _id: id,
            filename,
            length: buffer.length,
            metadata,
            buffer,
            sequence: ++nextId,
          })
          callback()
        },
      })
      stream.id = id
      return stream
    }

    find(filter) {
      return {
        limit() {
          return this
        },
        async toArray() {
          const file = files.get(filter._id.toString())
          return file ? [{ ...file }] : []
        },
      }
    }

    async delete(id) {
      if (!files.delete(id.toString())) throw new Error('file not found')
    }

    openDownloadStream(id) {
      const file = files.get(id.toString())
      if (!file) throw new Error('file not found')
      return Readable.from([file.buffer])
    }
  }

  const fakeDb = {
    collection(name) {
      return {
        async deleteOne({ _id }) {
          if (name === 'profilePictures.files') files.delete(_id.toString())
          return { deletedCount: 1 }
        },
        async deleteMany({ files_id: fileId }) {
          if (name === 'profilePictures.chunks') files.delete(fileId.toString())
          return { deletedCount: 1 }
        },
      }
    },
  }
  mongoose.connection.db = fakeDb
  Object.defineProperty(mongoose.mongo, 'GridFSBucket', {
    configurable: true,
    enumerable: gridFsDescriptor.enumerable,
    writable: true,
    value: FakeGridFSBucket,
  })
  UserModel.findOne = (filter) => ({
    select() {
      return this
    },
    lean() {
      const user = users.get(filter.userId)
      return Promise.resolve(user ? { ...user } : null)
    },
  })
  UserModel.findOneAndUpdate = (filter, update) => {
    const user = users.get(filter.userId)
    if (
      !user ||
      user.isDeleted ||
      (filter.profilePictureId === null && user.profilePictureId !== null) ||
      (filter.profilePictureId && user.profilePictureId?.toString() !== filter.profilePictureId.toString())
    ) {
      return null
    }
    user.profilePictureId = update.$set.profilePictureId
    return {
      select() {
        return Promise.resolve({ ...user, profilePictureId: user.profilePictureId.toString() })
      },
    }
  }
  UserModel.updateOne = async (filter, update) => {
    const user = users.get(filter.userId)
    if (!user || user.profilePictureId?.toString() !== filter.profilePictureId?.toString()) {
      return { matchedCount: 0 }
    }
    user.profilePictureId = update.$set.profilePictureId
    return { matchedCount: 1 }
  }
  t.after(() => {
    UserModel.findOne = originalFindOne
    UserModel.findOneAndUpdate = originalFindOneAndUpdate
    UserModel.updateOne = originalUpdateOne
    mongoose.connection.db = originalDb
    Object.defineProperty(mongoose.mongo, 'GridFSBucket', gridFsDescriptor)
  })

  const app = express()
  app.use(express.json())
  app.use('/user-api', userRoute)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}/user-api`
  const tokenFor = (userId) => jwt.sign({ userId, role: 'user' }, process.env.JWT_SECRET)
  const auth = (userId) => ({ Authorization: `Bearer ${tokenFor(userId)}` })

  try {
    const unauthenticated = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: pngImage(),
    })
    assert.equal(unauthenticated.status, 401)

    const aliceUpload = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { ...auth('alice'), 'Content-Type': 'image/png' },
      body: pngImage(),
    })
    assert.equal(aliceUpload.status, 200)
    const aliceUser = (await aliceUpload.json()).user
    const alicePictureId = aliceUser.profilePictureId
    assert.equal(users.get('alice').profilePictureId.toString(), alicePictureId)
    assert.equal(files.size, 1)

    const pictureResponse = await fetch(`${baseUrl}/profile-picture/alice`, {
      headers: auth('bob'),
    })
    assert.equal(pictureResponse.status, 200)
    assert.equal(pictureResponse.headers.get('content-type'), 'image/png')
    assert.equal(pictureResponse.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await pictureResponse.arrayBuffer()), pngImage())

    const mismatchedType = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { ...auth('alice'), 'Content-Type': 'image/jpeg' },
      body: pngImage(),
    })
    assert.equal(mismatchedType.status, 415)
    assert.equal(users.get('alice').profilePictureId.toString(), alicePictureId)

    const invalidImage = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { ...auth('alice'), 'Content-Type': 'image/png' },
      body: Buffer.from('<script>alert(1)</script>'),
    })
    assert.equal(invalidImage.status, 415)

    const oversized = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { ...auth('alice'), 'Content-Type': 'image/png' },
      body: Buffer.alloc(2 * 1024 * 1024 + 1),
    })
    assert.equal(oversized.status, 413)

    rejectUpload = true
    const failedUpload = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { ...auth('alice'), 'Content-Type': 'image/png' },
      body: pngImage(),
    })
    rejectUpload = false
    assert.equal(failedUpload.status, 500)
    assert.equal(users.get('alice').profilePictureId.toString(), alicePictureId)
    assert.equal(files.has(alicePictureId), true)

    const bobUpload = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { ...auth('bob'), 'Content-Type': 'image/webp' },
      body: webpImage(),
    })
    assert.equal(bobUpload.status, 200)
    assert.notEqual(users.get('bob').profilePictureId.toString(), alicePictureId)
    assert.equal(users.get('alice').profilePictureId.toString(), alicePictureId)

    const aliceReplacement = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'POST',
      headers: { ...auth('alice'), 'Content-Type': 'image/jpeg' },
      body: jpegImage(),
    })
    assert.equal(aliceReplacement.status, 200)
    const replacementId = users.get('alice').profilePictureId.toString()
    assert.notEqual(replacementId, alicePictureId)
    assert.equal(files.has(alicePictureId), false)

    const removed = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'DELETE',
      headers: auth('alice'),
    })
    assert.equal(removed.status, 200)
    assert.equal(users.get('alice').profilePictureId, null)
    assert.equal(files.has(replacementId), false)

    const missing = await fetch(`${baseUrl}/profile-picture/alice`, { headers: auth('bob') })
    assert.equal(missing.status, 404)
    const repeatedRemoval = await fetch(`${baseUrl}/me/profile-picture`, {
      method: 'DELETE',
      headers: auth('alice'),
    })
    assert.equal(repeatedRemoval.status, 200)
  } finally {
    server.close()
    await once(server, 'close')
  }
})
