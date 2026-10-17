import assert from 'node:assert/strict'
import { generateKeyPairSync, sign as signJwt } from 'node:crypto'
import { once } from 'node:events'
import cookieParser from 'cookie-parser'
import express from 'express'
import { afterEach, test } from 'node:test'
import { UserModel } from '../Models/UserModel.js'
import { userRoute } from '../APIs/UsersApi.js'

const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID
const originalJwtSecret = process.env.JWT_SECRET
const originalFetch = globalThis.fetch
const nonce = 'a'.repeat(64)

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function createIdentityToken(privateKey, claims) {
  const header = encodeSegment({ alg: 'RS256', kid: 'test-google-key', typ: 'JWT' })
  const payload = encodeSegment(claims)
  const content = `${header}.${payload}`
  const signature = signJwt('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')
  return `${content}.${signature}`
}

function matches(user, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition) => matches(user, condition))
    const actual = user[key]
    if (expected && typeof expected === 'object' && '$exists' in expected) {
      return expected.$exists ? actual !== undefined : actual === undefined
    }
    return actual === expected
  })
}

test('password and Google signup, sign-in, linking, and token validation', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'whisper-test-client'
  process.env.JWT_SECRET = 'whisper-google-auth-test-secret'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-google-key', use: 'sig', alg: 'RS256' }
  globalThis.fetch = async (url, options) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
      return {
        ok: true,
        headers: { get: () => 'public, max-age=300' },
        json: async () => ({ keys: [jwk] }),
      }
    }
    return originalFetch(url, options)
  }

  const originalFindOne = UserModel.findOne
  const originalFindOneAndUpdate = UserModel.findOneAndUpdate
  const originalSave = UserModel.prototype.save
  const users = []
  UserModel.findOne = async (filter) => users.find((user) => matches(user, filter)) || null
  UserModel.findOneAndUpdate = (filter, update) => {
    const user = users.find((candidate) => matches(candidate, filter))
    if (user) Object.assign(user, update.$set)
    return {
      select() {
        return Promise.resolve(user || null)
      },
    }
  }
  UserModel.prototype.save = async function save() {
    if (users.some((user) => user.email === this.email || (this.googleSub && user.googleSub === this.googleSub))) {
      const error = new Error('Duplicate key')
      error.code = 11000
      throw error
    }
    users.push(this)
    return this
  }
  t.after(() => {
    UserModel.findOne = originalFindOne
    UserModel.findOneAndUpdate = originalFindOneAndUpdate
    UserModel.prototype.save = originalSave
  })

  const app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(cookieParser())
  app.use('/user-api', userRoute)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.close()
    await once(server, 'close')
    globalThis.fetch = originalFetch
    if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
  })

  const baseUrl = `http://127.0.0.1:${server.address().port}/user-api`
  const requestGoogle = (claims, ip = '192.0.2.10') =>
    fetch(`${baseUrl}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ credential: createIdentityToken(privateKey, claims), nonce }),
    })
  const makeClaims = (sub, email, overrides = {}) => {
    const now = Math.floor(Date.now() / 1000)
    return {
      iss: 'https://accounts.google.com',
      aud: process.env.GOOGLE_CLIENT_ID,
      sub,
      email,
      email_verified: true,
      name: 'Whisper User',
      nonce,
      iat: now,
      exp: now + 300,
      ...overrides,
    }
  }

  const emailSignup = await fetch(`${baseUrl}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Password User', email: 'password@example.com', password: 'safe-password' }),
  })
  assert.equal(emailSignup.status, 201)
  assert.equal((await emailSignup.json()).user.profilePictureId, null)

  const emailLogin = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'password@example.com', password: 'safe-password' }),
  })
  assert.equal(emailLogin.status, 200)
  const emailLoginData = await emailLogin.json()

  const emailCollision = await requestGoogle(makeClaims('google-collision', 'password@example.com'))
  assert.equal(emailCollision.status, 409)
  assert.equal((await emailCollision.json()).code, 'ACCOUNT_LINK_REQUIRED')
  assert.equal(users[0].googleSub, undefined)

  const googleAccountSignup = await requestGoogle(makeClaims('google-new-user', 'google@example.com'))
  assert.equal(googleAccountSignup.status, 200)
  const googleSignupData = await googleAccountSignup.json()
  assert.equal(googleSignupData.user.email, 'google@example.com')
  assert.equal(googleSignupData.user.profilePictureId, null)
  assert.equal(users[1].password, undefined)
  assert.match(googleSignupData.token, /^.+\..+\..+$/)

  const googleSignIn = await requestGoogle(makeClaims('google-new-user', 'google@example.com'))
  assert.equal(googleSignIn.status, 200)
  assert.equal((await googleSignIn.json()).user.userId, googleSignupData.user.userId)

  const linkResponse = await fetch(`${baseUrl}/google/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${emailLoginData.token}`,
    },
    body: JSON.stringify({
      credential: createIdentityToken(privateKey, makeClaims('google-password-user', 'password@example.com')),
      nonce,
    }),
  })
  assert.equal(linkResponse.status, 200)
  assert.equal((await linkResponse.json()).user.googleLinked, true)
  assert.equal(users[0].googleSub, 'google-password-user')

  const passwordAccountGoogleLogin = await requestGoogle(
    makeClaims('google-password-user', 'password@example.com')
  )
  assert.equal(passwordAccountGoogleLogin.status, 200)
  assert.equal((await passwordAccountGoogleLogin.json()).user.userId, emailLoginData.user.userId)

  const crossAccountLink = await fetch(`${baseUrl}/google/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${emailLoginData.token}`,
    },
    body: JSON.stringify({
      credential: createIdentityToken(privateKey, makeClaims('google-new-user', 'password@example.com')),
      nonce,
    }),
  })
  assert.equal(crossAccountLink.status, 409)

  const invalidNonce = await fetch(`${baseUrl}/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credential: createIdentityToken(privateKey, makeClaims('invalid-nonce', 'invalid@example.com')),
      nonce: 'b'.repeat(64),
    }),
  })
  assert.equal(invalidNonce.status, 401)

  const validToken = createIdentityToken(
    privateKey,
    makeClaims('tampered-signature', 'tampered@example.com')
  )
  const [header, payload, signature] = validToken.split('.')
  const tamperedSignature =
    signature[0] === 'A' ? `B${signature.slice(1)}` : `A${signature.slice(1)}`
  const invalidSignature = await fetch(`${baseUrl}/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.11' },
    body: JSON.stringify({ credential: `${header}.${payload}.${tamperedSignature}`, nonce }),
  })
  assert.equal(invalidSignature.status, 401)

  const unverifiedEmail = await requestGoogle(
    makeClaims('unverified-email', 'unverified@example.com', { email_verified: false }),
    '192.0.2.12'
  )
  assert.equal(unverifiedEmail.status, 401)
  assert.equal(users.some((user) => user.email === 'unverified@example.com'), false)

  const invalidAudience = await requestGoogle(
    makeClaims('invalid-audience', 'invalid-audience@example.com', { aud: 'another-client' }),
    '192.0.2.13'
  )
  assert.equal(invalidAudience.status, 401)

  const invalidIssuer = await requestGoogle(
    makeClaims('invalid-issuer', 'invalid-issuer@example.com', { iss: 'https://accounts.example.com' }),
    '192.0.2.14'
  )
  assert.equal(invalidIssuer.status, 401)

  const expired = await requestGoogle(
    makeClaims('expired-token', 'expired@example.com', { exp: Math.floor(Date.now() / 1000) - 1 }),
    '192.0.2.15'
  )
  assert.equal(expired.status, 401)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
  else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})
