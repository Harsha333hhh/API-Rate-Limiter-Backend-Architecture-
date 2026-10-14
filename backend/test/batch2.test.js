import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import express from 'express'
import jwt from 'jsonwebtoken'
import { afterEach, test } from 'node:test'
import { messageRoute } from '../APIs/MessagesApi.js'
import { monitoringRoute } from '../APIs/MonitoringApi.js'
import {
  getServerHealthSnapshot,
  resetServerHealthForTests,
  serverHealthMiddleware,
} from '../services/serverHealth.js'
import {
  buildUnreadMessagesPipeline,
  summarizeUnreadMessages,
} from '../services/unreadMessageSummary.js'

const originalJwtSecret = process.env.JWT_SECRET

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
  resetServerHealthForTests()
})

test('server health reports unknown and unavailable event-loop samples honestly', () => {
  resetServerHealthForTests()
  const snapshot = getServerHealthSnapshot()

  assert.equal(snapshot.status, 'unknown')
  assert.equal(snapshot.measurements.apiLatencyP95Ms, null)
  assert.equal(snapshot.measurements.apiLatencySampleCount, 0)
  assert.equal(snapshot.measurements.eventLoopDelayAvailable, false)
  assert.equal(snapshot.measurements.eventLoopDelayP95Ms, null)
  assert.deepEqual(snapshot.thresholds.degradedWhenAnyMeasuredValueReaches, {
    apiLatencyP95Ms: 1000,
    inFlightRequests: 25,
    eventLoopDelayP95Ms: 100,
  })
})

test('server health middleware records completed API latency and in-flight work', () => {
  resetServerHealthForTests()
  const req = { path: '/message-api/messages' }
  const res = new EventEmitter()
  let continued = false

  serverHealthMiddleware(req, res, () => {
    continued = true
  })
  assert.equal(continued, true)
  assert.equal(getServerHealthSnapshot().measurements.inFlightRequests, 1)

  res.emit('finish')
  res.emit('close')
  const snapshot = getServerHealthSnapshot()
  assert.equal(snapshot.measurements.inFlightRequests, 0)
  assert.equal(snapshot.measurements.apiLatencySampleCount, 1)
  assert.equal(typeof snapshot.measurements.apiLatencyP95Ms, 'number')
  assert.notEqual(snapshot.status, 'unknown')
})

test('server health marks the measured in-flight threshold as degraded', () => {
  resetServerHealthForTests()
  const responses = Array.from({ length: 25 }, () => new EventEmitter())

  for (let index = 0; index < responses.length; index += 1) {
    serverHealthMiddleware(
      { path: '/message-api/messages' },
      responses[index],
      () => {}
    )
  }

  const snapshot = getServerHealthSnapshot()
  assert.equal(snapshot.measurements.inFlightRequests, 25)
  assert.equal(snapshot.status, 'degraded')

  for (const response of responses) response.emit('finish')
})

test('health API enforces auth/admin authorization and returns unavailable metrics', async () => {
  const secret = 'batch-two-test-secret'
  process.env.JWT_SECRET = secret
  const app = express()
  app.use('/monitoring-api', monitoringRoute)
  app.use('/message-api', messageRoute)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const unauthorized = await fetch(`${baseUrl}/monitoring-api/server-health`)
    assert.equal(unauthorized.status, 401)

    const userToken = jwt.sign({ userId: 'regular-user', role: 'user' }, secret)
    const forbidden = await fetch(`${baseUrl}/monitoring-api/server-health`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    assert.equal(forbidden.status, 403)

    const adminToken = jwt.sign({ userId: 'operator', role: 'admin' }, secret)
    const healthResponse = await fetch(`${baseUrl}/monitoring-api/server-health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert.equal(healthResponse.status, 200)
    const health = await healthResponse.json()
    assert.equal(health.status, 'unknown')
    assert.equal(health.measurements.apiLatencyP95Ms, null)

    const unreadWithoutAuth = await fetch(`${baseUrl}/message-api/unread`)
    assert.equal(unreadWithoutAuth.status, 401)

    const conversationWithoutAuth = await fetch(
      `${baseUrl}/message-api/messages/some-other-user`
    )
    assert.equal(conversationWithoutAuth.status, 401)
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('unread aggregation preserves user scope, hidden-message filter, counts, and newest-first previews', () => {
  const userId = 'owner-user'
  const pipeline = buildUnreadMessagesPipeline(userId)
  assert.deepEqual(pipeline[0], {
    $match: {
      receiverId: userId,
      read: false,
      hiddenFor: { $ne: userId },
    },
  })
  assert.deepEqual(pipeline[1].$facet.recent.slice(0, 2), [
    { $sort: { createdAt: -1 } },
    { $limit: 10 },
  ])
  assert.deepEqual(pipeline[1].$facet.counts, [
    { $group: { _id: '$senderId', count: { $sum: 1 } } },
  ])

  const summary = summarizeUnreadMessages({
    counts: [
      { _id: 'sender-a', count: 3 },
      { _id: 'sender-b', count: 2 },
    ],
    recent: [{ _id: 'newest', senderId: 'sender-a', createdAt: new Date(2) }],
  })
  assert.deepEqual(summary.counts, { 'sender-a': 3, 'sender-b': 2 })
  assert.equal(summary.total, 5)
  assert.equal(summary.recent[0]._id, 'newest')
})
