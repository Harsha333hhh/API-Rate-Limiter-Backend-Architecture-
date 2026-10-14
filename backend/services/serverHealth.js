import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

const LATENCY_SAMPLE_LIMIT = 300
const LATENCY_P95_DEGRADED_MS = 1000
const IN_FLIGHT_DEGRADED = 25
const EVENT_LOOP_P95_DEGRADED_MS = 100
const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 })
const latencySamples = []
let inFlightRequests = 0
let startedAt = new Date().toISOString()

eventLoopHistogram.enable()

function recordLatency(durationMs) {
  latencySamples.push(durationMs)
  if (latencySamples.length > LATENCY_SAMPLE_LIMIT) {
    latencySamples.splice(0, latencySamples.length - LATENCY_SAMPLE_LIMIT)
  }
}

function percentile95(values) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

export function serverHealthMiddleware(req, res, next) {
  const path = req.path || req.url?.split('?')[0] || ''
  if (!/^\/(?:user-api|message-api|monitoring-api)(?:\/|$)/.test(path)) {
    return next()
  }

  const startedAtMs = performance.now()
  inFlightRequests += 1
  let completed = false

  const finish = () => {
    if (completed) return
    completed = true
    inFlightRequests = Math.max(0, inFlightRequests - 1)
    recordLatency(Math.max(0, performance.now() - startedAtMs))
  }

  res.once('finish', finish)
  res.once('close', finish)
  next()
}

export function getServerHealthSnapshot() {
  const apiLatencyP95 = percentile95(latencySamples)
  const eventLoopDelayAvailable = eventLoopHistogram.count > 0
  const eventLoopDelayP95 = eventLoopDelayAvailable
    ? eventLoopHistogram.percentile(95) / 1e6
    : null
  const measuredValues = [
    apiLatencyP95 !== null && apiLatencyP95 >= LATENCY_P95_DEGRADED_MS,
    inFlightRequests >= IN_FLIGHT_DEGRADED,
    eventLoopDelayP95 !== null && eventLoopDelayP95 >= EVENT_LOOP_P95_DEGRADED_MS,
  ]
  const status = measuredValues.some(Boolean)
    ? 'degraded'
    : latencySamples.length === 0
      ? 'unknown'
      : 'healthy'

  return {
    monitoring: {
      scope: 'This backend process only',
      persistence: 'In-memory; measurements reset when this process restarts',
      startedAt,
      observedAt: new Date().toISOString(),
    },
    status,
    measurements: {
      apiLatencyP95Ms:
        apiLatencyP95 === null ? null : Number(apiLatencyP95.toFixed(2)),
      apiLatencySampleCount: latencySamples.length,
      apiLatencySampleWindow: `Most recent ${LATENCY_SAMPLE_LIMIT} completed API requests`,
      inFlightRequests,
      eventLoopDelayP95Ms:
        eventLoopDelayP95 === null ? null : Number(eventLoopDelayP95.toFixed(2)),
      eventLoopDelayAvailable,
    },
    thresholds: {
      degradedWhenAnyMeasuredValueReaches: {
        apiLatencyP95Ms: LATENCY_P95_DEGRADED_MS,
        inFlightRequests: IN_FLIGHT_DEGRADED,
        eventLoopDelayP95Ms: EVENT_LOOP_P95_DEGRADED_MS,
      },
      statusRules: [
        'unknown when no completed API latency samples exist and no available measurement has met a degraded threshold',
        'degraded when any available measurement meets or exceeds its threshold',
        'healthy otherwise; unavailable measurements are not treated as zero',
      ],
    },
  }
}

export function resetServerHealthForTests() {
  latencySamples.length = 0
  inFlightRequests = 0
  startedAt = new Date().toISOString()
  eventLoopHistogram.reset()
}
