import { createHash, randomUUID } from 'node:crypto'

const MAX_ACTIVE_INCIDENTS = 500
const MAX_RECENT_INCIDENTS = 100
const MAX_RECENT_EVENTS = 50
const SUSPICIOUS_REJECTION_THRESHOLD = 5
const SUSPICIOUS_WINDOW_MS = 60 * 1000

let requestStates = new WeakMap()
let state = createState()

function createState() {
  return {
    startedAt: new Date().toISOString(),
    allowedRequests: 0,
    rejectedRequests: 0,
    savedMessages: 0,
    limiterErrors: 0,
    untrackedRejectedRequests: 0,
    activeIncidents: new Map(),
    recentIncidents: [],
    recentEvents: [],
  }
}

function categoryForRequest(req) {
  const route = `${req.baseUrl || ''}${req.route?.path || ''}`
  if (route === '/message-api/messages') return 'message-send'
  if (route === '/user-api/login') return 'login'
  if (route === '/user-api/users') return 'signup'
  if (route.startsWith('/message-api/')) return 'messaging'
  if (route.startsWith('/user-api/')) return 'account'
  return 'other'
}

function hashScope(by, key) {
  return createHash('sha256').update(`${by}:${key}`).digest('hex')
}

function incidentKey({ scopeHash, by, category, algorithm, limit, windowMs }) {
  return `${scopeHash}:${by}:${category}:${algorithm}:${limit}:${windowMs}`
}

function pushBounded(list, value, maxSize) {
  list.push(value)
  if (list.length > maxSize) list.splice(0, list.length - maxSize)
}

function addEvent(event) {
  pushBounded(state.recentEvents, event, MAX_RECENT_EVENTS)
}

function getSuspiciousPatterns(now) {
  const rejectedByScope = new Map()
  const cutoff = now - SUSPICIOUS_WINDOW_MS

  for (const event of state.recentEvents) {
    if (
      event.decision !== 'rejected' ||
      !event.scopeHash ||
      Date.parse(event.timestamp) < cutoff
    ) {
      continue
    }

    const group = rejectedByScope.get(event.scopeHash) || {
      category: event.category,
      algorithm: event.algorithm,
      count: 0,
      firstAt: event.timestamp,
      lastAt: event.timestamp,
    }
    group.count += 1
    if (event.timestamp < group.firstAt) group.firstAt = event.timestamp
    if (event.timestamp > group.lastAt) group.lastAt = event.timestamp
    rejectedByScope.set(event.scopeHash, group)
  }

  return [...rejectedByScope.values()]
    .filter((group) => group.count >= SUSPICIOUS_REJECTION_THRESHOLD)
    .map((group) => ({
      category: group.category,
      algorithm: group.algorithm,
      rejectionCount: group.count,
      windowMs: SUSPICIOUS_WINDOW_MS,
      firstObservedAt: group.firstAt,
      lastObservedAt: group.lastAt,
      warning: 'Suspicious pattern observed: repeated rate-limit rejections in a short period; this does not establish intent.',
    }))
}

function getRequestState(req) {
  let requestState = requestStates.get(req)
  if (!requestState) {
    requestState = {
      rejected: false,
      indeterminate: false,
      finishHooked: false,
      lastDecision: null,
    }
    requestStates.set(req, requestState)
  }
  return requestState
}

function recordAcceptedRequest(req, res, details) {
  const requestState = getRequestState(req)
  requestState.lastDecision = details

  if (requestState.finishHooked) return
  requestState.finishHooked = true

  res.once('finish', () => {
    if (requestState.rejected || requestState.indeterminate) return
    state.allowedRequests += 1
    addEvent({
      timestamp: new Date().toISOString(),
      decision: 'allowed',
      category: requestState.lastDecision.category,
      algorithm: requestState.lastDecision.algorithm,
      limit: requestState.lastDecision.limit,
      windowMs: requestState.lastDecision.windowMs,
    })
  })
}

export function recordRateLimitAllowed(req, res, { algorithm, limit, windowMs }) {
  try {
    recordAcceptedRequest(req, res, {
      category: categoryForRequest(req),
      algorithm,
      limit,
      windowMs,
    })
  } catch (error) {
    console.error('Rate monitoring error:', error.message)
  }
}

export function recordRateLimitRejected(req, {
  by,
  key,
  algorithm,
  limit,
  windowMs,
  resetMs,
}) {
  try {
    const requestState = getRequestState(req)
    requestState.rejected = true

    if (requestState.rejectionRecorded) return
    requestState.rejectionRecorded = true

    state.rejectedRequests += 1
    const category = categoryForRequest(req)
    const scopeHash = hashScope(by, key)
    const keyForIncident = incidentKey({ scopeHash, by, category, algorithm, limit, windowMs })
    const rejectedAt = Date.now()
    let incident = state.activeIncidents.get(keyForIncident)

    if (!incident && state.activeIncidents.size < MAX_ACTIVE_INCIDENTS) {
      incident = {
        id: randomUUID(),
        scopeHash,
        by,
        category,
        algorithm,
        limit,
        windowMs,
        startedAt: new Date(rejectedAt).toISOString(),
        lastRejectedAt: new Date(rejectedAt).toISOString(),
        rejectionCount: 0,
        restrictionEndsAt: rejectedAt,
        status: 'restricted',
      }
      state.activeIncidents.set(keyForIncident, incident)
      pushBounded(state.recentIncidents, incident, MAX_RECENT_INCIDENTS)
    }

    if (incident) {
      incident.rejectionCount += 1
      incident.lastRejectedAt = new Date(rejectedAt).toISOString()
      incident.restrictionEndsAt = Math.max(
        incident.restrictionEndsAt,
        rejectedAt + Math.max(0, resetMs)
      )
      incident.status = 'restricted'
    } else {
      state.untrackedRejectedRequests += 1
    }

    addEvent({
      timestamp: new Date(rejectedAt).toISOString(),
      decision: 'rejected',
      category,
      algorithm,
      limit,
      windowMs,
      scopeHash,
      retryAfterSeconds: Math.ceil(Math.max(0, resetMs) / 1000),
      incidentId: incident?.id || null,
    })
  } catch (error) {
    console.error('Rate monitoring error:', error.message)
  }
}

export function recordRateLimitError(req) {
  try {
    const requestState = getRequestState(req)
    requestState.indeterminate = true
    if (requestState.errorRecorded) return
    requestState.errorRecorded = true

    state.limiterErrors += 1
    addEvent({
      timestamp: new Date().toISOString(),
      decision: 'limiter-error-fail-open',
      category: categoryForRequest(req),
    })
  } catch (error) {
    console.error('Rate monitoring error:', error.message)
  }
}

function tryRecoverIncident(incident, now) {
  if (incident.status === 'recovered' || now < incident.restrictionEndsAt) return
  incident.status = 'recovered'
  incident.recoveredAt = new Date(now).toISOString()

  for (const [key, activeIncident] of state.activeIncidents) {
    if (activeIncident === incident) {
      state.activeIncidents.delete(key)
      break
    }
  }
}

export function recordSavedMessage(senderId, receiverId) {
  try {
    state.savedMessages += 1
    const now = Date.now()
    const scopes = new Set([
      hashScope('user', `user:${senderId}`),
      hashScope('pair', `pair:${senderId}->${receiverId}`),
    ])

    for (const incident of state.activeIncidents.values()) {
      if (
        incident.category === 'message-send' &&
        scopes.has(incident.scopeHash) &&
        now >= incident.restrictionEndsAt
      ) {
        tryRecoverIncident(incident, now)
      }
    }
  } catch (error) {
    console.error('Rate monitoring error:', error.message)
  }
}

function serializeIncident(incident, now) {
  const status =
    incident.status === 'recovered'
      ? 'recovered'
      : now < incident.restrictionEndsAt
        ? 'restricted'
        : 'awaiting_confirmation'

  return {
    id: incident.id,
    category: incident.category,
    algorithm: incident.algorithm,
    limit: incident.limit,
    windowMs: incident.windowMs,
    startedAt: incident.startedAt,
    lastRejectedAt: incident.lastRejectedAt,
    rejectionCount: incident.rejectionCount,
    restrictionEndsAt: new Date(incident.restrictionEndsAt).toISOString(),
    status,
    ...(incident.recoveredAt ? { recoveredAt: incident.recoveredAt } : {}),
  }
}

export function getRateLimitMonitoringSnapshot() {
  const now = Date.now()
  const visibleIncidents = new Map()
  for (const incident of state.recentIncidents) visibleIncidents.set(incident.id, incident)
  for (const incident of state.activeIncidents.values()) visibleIncidents.set(incident.id, incident)
  const incidents = [...visibleIncidents.values()]
    .map((incident) => serializeIncident(incident, now))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))

  return {
    monitoring: {
      scope: 'This backend process only',
      persistence: 'In-memory; counters and incidents reset when this process restarts',
      startedAt: state.startedAt,
      observedAt: new Date(now).toISOString(),
    },
    metrics: {
      allowedRequests: state.allowedRequests,
      rejectedRequests: state.rejectedRequests,
      savedMessages: state.savedMessages,
      limiterErrors: state.limiterErrors,
      activeIncidents: state.activeIncidents.size,
      untrackedRejectedRequests: state.untrackedRejectedRequests,
      hasObservations:
        state.allowedRequests +
          state.rejectedRequests +
          state.savedMessages +
          state.limiterErrors >
        0,
    },
    incidents,
    suspiciousPatterns: getSuspiciousPatterns(now),
    recentEvents: state.recentEvents
      .slice()
      .reverse()
      .map(({ scopeHash, ...event }) => event),
  }
}

export function resetRateLimitMonitoringForTests() {
  state = createState()
  requestStates = new WeakMap()
}
