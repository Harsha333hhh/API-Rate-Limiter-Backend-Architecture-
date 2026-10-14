import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

const REFRESH_MS = 5000

function formatTimestamp(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

function Metric({ label, value, threshold }) {
  return (
    <section className="surface-card card p-5">
      <div className="label">{label}</div>
      <div className="mt-2 font-display text-3xl text-text">{value}</div>
      <p className="mt-2 text-xs leading-5 text-text-secondary">{threshold}</p>
    </section>
  )
}

export default function ServerHealth() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => {
    let active = true

    const loadHealth = async () => {
      try {
        const { data } = await api.get('/monitoring-api/server-health')
        if (!active) return
        if (!data?.measurements || !data?.thresholds) {
          setHealth(null)
          setError('Health measurements are not available from the server.')
          return
        }
        setHealth(data)
        setError('')
        setLastUpdated(new Date().toISOString())
      } catch (requestError) {
        if (!active) return
        setHealth(null)
        setError(
          requestError.response?.status === 403
            ? 'Administrator access is required to view server health.'
            : requestError.response?.status === 503
              ? requestError.response.data?.message || 'Admin monitoring is not configured securely.'
              : 'Server-health measurements are currently unavailable.'
        )
      }
    }

    loadHealth()
    const intervalId = window.setInterval(loadHealth, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  const measurements = health?.measurements
  const thresholds = health?.thresholds.degradedWhenAnyMeasuredValueReaches

  return (
    <main className="min-h-screen bg-bg text-text px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-muted">Whisper monitoring</div>
            <h1 className="mt-2 font-display text-3xl">Server Health</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Read-only process measurements; health does not change rate limits or messaging behavior.
            </p>
          </div>
          <Link to="/" className="btn-ghost px-4 py-2 rounded-full">
            Back to Whisper
          </Link>
        </header>

        {error && (
          <div className="surface-card card border border-line p-4 text-sm text-text-secondary" role="status">
            {error}
          </div>
        )}

        {health && (
          <>
            <section className="surface-card card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">Observed health state</div>
                  <div className="mt-2 font-display text-3xl capitalize">{health.status}</div>
                </div>
                <span className="pill">Process-local</span>
              </div>
              <p className="mt-4 text-sm text-text-secondary">
                {health.monitoring.persistence}. Measurements began{' '}
                {formatTimestamp(health.monitoring.startedAt)}.
              </p>
              {lastUpdated && (
                <p className="mt-1 text-xs text-muted">Dashboard updated {formatTimestamp(lastUpdated)}.</p>
              )}
            </section>

            {health.status === 'unknown' && (
              <div className="surface-card card p-4 text-sm text-text-secondary" role="status">
                No completed API latency samples are available yet. Health is unknown, not assumed healthy.
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Metric
                label="API latency p95"
                value={
                  measurements.apiLatencyP95Ms === null
                    ? 'Unavailable'
                    : `${measurements.apiLatencyP95Ms} ms`
                }
                threshold={`Degraded at ${thresholds.apiLatencyP95Ms} ms; based on ${measurements.apiLatencySampleCount} completed API requests.`}
              />
              <Metric
                label="Requests in flight"
                value={measurements.inFlightRequests}
                threshold={`Degraded at ${thresholds.inFlightRequests} concurrent API requests.`}
              />
              <Metric
                label="Event-loop delay p95"
                value={
                  measurements.eventLoopDelayP95Ms === null
                    ? 'Unavailable'
                    : `${measurements.eventLoopDelayP95Ms} ms`
                }
                threshold={`Degraded at ${thresholds.eventLoopDelayP95Ms} ms; unavailable means the process has no event-loop samples yet.`}
              />
            </section>

            <section className="surface-card card p-5">
              <h2 className="font-display text-xl">Health-state rules</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                {health.thresholds.statusRules.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
              <p className="mt-3 text-xs leading-5 text-muted">
                Latency uses the most recent {measurements.apiLatencySampleWindow.replace('Most recent ', '')}.
                These thresholds are monitoring indicators only; they do not throttle, block, or modify requests.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
