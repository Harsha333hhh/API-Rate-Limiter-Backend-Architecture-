import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { afterEach, test } from 'node:test'
import { adminMiddleware } from '../Middlewares/adminMiddleware.js'
import { rateLimiter } from '../RateLimiter/rateLimiter.js'
import {
  getRateLimitMonitoringSnapshot,
  recordRateLimitError,
  recordRateLimitRejected,
  recordSavedMessage,
  resetRateLimitMonitoringForTests,
} from '../services/rateLimitMonitoring.js'

const originalDateNow = Date.now
const originalJwtSecret = process.env.JWT_SECRET

afterEach(() => {
  Date.now = originalDateNow
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
  resetRateLimitMonitoringForTests()
})

function makeRequest({ userId = `user-${Math.random()}`, receiverId = 'receiver-1' } = {}) {
  return {
    baseUrl: '/message-api',
    route: { path: '/messages' },
    ip: '127.0.0.1',
    body: { receiverId },
    user: { userId },
  }
}

function makeResponse() {
  const response = new EventEmitter()
  response.headers = {}
  response.statusCode = 200
  response.set = (name, value) => {
    response.headers[name] = value
    return response
  }
  response.status = (statusCode) => {
    response.statusCode = statusCode
    return response
  }
  response.json = (body) => {
    response.body = body
    return response
  }
  return response
}

function runLimiter(middleware, req) {
  const res = makeResponse()
  let continued = false
  middleware(req, res, () => {
    continued = true
  })
  res.emit('finish')
  return { req, res, continued }
}

test('counts an allowed request once after stacked limiter checks pass', () => {
  resetRateLimitMonitoringForTests()
  const req = makeRequest()
  const res = makeResponse()
  const limiters = [
    rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 2000, by: 'user' }),
    rateLimiter({ algorithm: 'sliding-window', limit: 150, windowMs: 60000, by: 'user' }),
    rateLimiter({ algorithm: 'sliding-window', limit: 60, windowMs: 60000, by: 'pair' }),
  ]
  let continued = 0

  for (const middleware of limiters) {
    middleware(req, res, () => {
      continued += 1
    })
  }
  res.emit('finish')

  const snapshot = getRateLimitMonitoringSnapshot()
  assert.equal(continued, 3)
  assert.equal(snapshot.metrics.allowedRequests, 1)
  assert.equal(snapshot.metrics.rejectedRequests, 0)
  assert.equal(snapshot.recentEvents.length, 1)
  assert.equal(snapshot.recentEvents[0].decision, 'allowed')
})

test('does not count a fail-open limiter error as an allowed decision', () => {
  resetRateLimitMonitoringForTests()
  const req = makeRequest()
  const res = makeResponse()
  const middleware = rateLimiter({ algorithm: 'sliding-window', limit: 10, windowMs: 1000, by: 'user' })
  middleware(req, res, () => {})
  recordRateLimitError(req)
  res.emit('finish')

  const snapshot = getRateLimitMonitoringSnapshot()
  assert.equal(snapshot.metrics.allowedRequests, 0)
  assert.equal(snapshot.metrics.limiterErrors, 1)
  assert.equal(snapshot.recentEvents[0].decision, 'limiter-error-fail-open')
})

test('counts a rejected request and includes only actual limiter details', () => {
  resetRateLimitMonitoringForTests()
  const userId = `reject-${Math.random()}`
  const middleware = rateLimiter({ algorithm: 'fixed-window', limit: 1, windowMs: 60000, by: 'user' })
  assert.equal(runLimiter(middleware, makeRequest({ userId })).continued, true)

  const { res, continued } = runLimiter(middleware, makeRequest({ userId }))
  const snapshot = getRateLimitMonitoringSnapshot()

  assert.equal(continued, false)
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.limit, 1)
  assert.equal(res.body.algorithm, 'fixed-window')
  assert.equal(typeof res.body.retryAfterSeconds, 'number')
  assert.match(res.body.message, /fixed-window rate limit/)
  assert.equal(snapshot.metrics.allowedRequests, 1)
  assert.equal(snapshot.metrics.rejectedRequests, 1)
  assert.equal(snapshot.incidents.length, 1)
  assert.equal(snapshot.incidents[0].rejectionCount, 1)
})

test('groups repeated rejections into one incident', () => {
  resetRateLimitMonitoringForTests()
  const userId = `group-${Math.random()}`
  const middleware = rateLimiter({ algorithm: 'fixed-window', limit: 1, windowMs: 60000, by: 'user' })
  runLimiter(middleware, makeRequest({ userId }))
  runLimiter(middleware, makeRequest({ userId }))
  runLimiter(middleware, makeRequest({ userId }))

  const snapshot = getRateLimitMonitoringSnapshot()
  assert.equal(snapshot.metrics.rejectedRequests, 2)
  assert.equal(snapshot.metrics.activeIncidents, 1)
  assert.equal(snapshot.incidents.length, 1)
  assert.equal(snapshot.incidents[0].rejectionCount, 2)
})

test('incident awaits evidence and recovers after an eligible saved message', () => {
  resetRateLimitMonitoringForTests()
  Date.now = () => 100
  const userId = `recovery-${Math.random()}`
  const receiverId = 'recovery-recipient'
  const middleware = rateLimiter({ algorithm: 'fixed-window', limit: 1, windowMs: 1000, by: 'user' })
  runLimiter(middleware, makeRequest({ userId, receiverId }))
  runLimiter(middleware, makeRequest({ userId, receiverId }))

  Date.now = () => 500
  assert.equal(getRateLimitMonitoringSnapshot().incidents[0].status, 'restricted')

  Date.now = () => 1001
  assert.equal(
    getRateLimitMonitoringSnapshot().incidents[0].status,
    'awaiting_confirmation'
  )
  const successfulMessage = runLimiter(middleware, makeRequest({ userId, receiverId }))
  assert.equal(successfulMessage.continued, true)
  recordSavedMessage(userId, receiverId)

  const snapshot = getRateLimitMonitoringSnapshot()
  assert.equal(snapshot.metrics.savedMessages, 1)
  assert.equal(snapshot.metrics.activeIncidents, 0)
  assert.equal(snapshot.incidents[0].status, 'recovered')
  assert.ok(snapshot.incidents[0].recoveredAt)
})

test('reports empty in-memory metrics as unobserved, with process scope and reset context', () => {
  resetRateLimitMonitoringForTests()
  const snapshot = getRateLimitMonitoringSnapshot()

  assert.equal(snapshot.metrics.hasObservations, false)
  assert.equal(snapshot.metrics.allowedRequests, 0)
  assert.equal(snapshot.metrics.rejectedRequests, 0)
  assert.equal(snapshot.monitoring.scope, 'This backend process only')
  assert.match(snapshot.monitoring.persistence, /reset when this process restarts/)
})

test('bounds incident and event history without exposing limiter identities', () => {
  resetRateLimitMonitoringForTests()
  const privateIdentity = 'private-user-identifier'

  for (let index = 0; index < 501; index += 1) {
    recordRateLimitRejected(makeRequest({ userId: `${privateIdentity}-${index}` }), {
      by: 'user',
      key: `user:${privateIdentity}-${index}`,
      algorithm: 'sliding-window',
      limit: 1,
      windowMs: 1000,
      resetMs: 1000,
    })
  }

  const snapshot = getRateLimitMonitoringSnapshot()
  const serialized = JSON.stringify(snapshot)
  assert.equal(snapshot.metrics.activeIncidents, 500)
  assert.equal(snapshot.metrics.untrackedRejectedRequests, 1)
  assert.equal(snapshot.incidents.length, 500)
  assert.equal(snapshot.recentEvents.length, 50)
  assert.equal(serialized.includes(privateIdentity), false)
})

test('warns on repeated short-window rejections but not ordinary activity', () => {
  resetRateLimitMonitoringForTests()
  const userId = `warning-${Math.random()}`
  const rejection = {
    by: 'user',
    key: `user:${userId}`,
    algorithm: 'sliding-window',
    limit: 10,
    windowMs: 60000,
    resetMs: 1000,
  }

  for (let index = 0; index < 4; index += 1) {
    recordRateLimitRejected(makeRequest({ userId }), rejection)
  }
  assert.equal(getRateLimitMonitoringSnapshot().suspiciousPatterns.length, 0)

  recordRateLimitRejected(makeRequest({ userId }), rejection)
  const warnings = getRateLimitMonitoringSnapshot().suspiciousPatterns
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].rejectionCount, 5)
  assert.equal(warnings[0].windowMs, 60000)
  assert.match(warnings[0].warning, /does not establish intent/)
})

test('admin authorization rejects unauthenticated, non-admin, and insecure configurations', () => {
  const invoke = (req) => {
    const res = makeResponse()
    let continued = false
    adminMiddleware(req, res, () => {
      continued = true
    })
    return { res, continued }
  }

  process.env.JWT_SECRET = 'a-configured-test-secret'
  assert.equal(invoke({}).res.statusCode, 401)
  assert.equal(invoke({ user: { role: 'user' } }).res.statusCode, 403)

  delete process.env.JWT_SECRET
  const insecure = invoke({ user: { role: 'admin' } })
  assert.equal(insecure.res.statusCode, 503)
  assert.equal(insecure.continued, false)

  process.env.JWT_SECRET = 'a-configured-test-secret'
  const authorized = invoke({ user: { role: 'admin' } })
  assert.equal(authorized.continued, true)
})
