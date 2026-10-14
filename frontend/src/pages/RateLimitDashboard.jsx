import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

const REFRESH_MS = 5000

function formatTimestamp(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

function MetricCard({ label, value, detail }) {
  return (
    <section className="surface-card card p-5">
      <div className="label">{label}</div>
      <div className="mt-2 font-display text-3xl text-text">{value}</div>
      {detail && <p className="mt-2 text-xs leading-5 text-text-secondary">{detail}</p>}
    </section>
  )
}

export default function RateLimitDashboard() {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => {
    let active = true

    const loadMetrics = async () => {
      try {
        const { data } = await api.get('/monitoring-api/rate-limits')
        if (!active) return
        if (!data?.metrics || !data?.monitoring) {
          setSnapshot(null)
          setError('Monitoring metrics are not available from the server.')
          return
        }
        setSnapshot(data)
        setError('')
        setLastUpdated(new Date().toISOString())
      } catch (requestError) {
        if (!active) return
        setSnapshot(null)
        setError(
          requestError.response?.status === 403
            ? 'Administrator access is required to view these metrics.'
            : requestError.response?.status === 503
              ? requestError.response.data?.message || 'Admin monitoring is not configured securely.'
              : 'Monitoring metrics are currently unavailable.'
        )
      }
    }

    loadMetrics()
    const intervalId = window.setInterval(loadMetrics, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  const metrics = snapshot?.metrics
  const incidents = snapshot?.incidents || []
  const events = snapshot?.recentEvents || []

  return (
    <main className="min-h-screen bg-bg text-text px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-muted">Whisper monitoring</div>
            <h1 className="mt-2 font-display text-3xl">Rate-Limit Dashboard</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Request counts and incidents observed by this backend process.
            </p>
          </div>
          <Link to="/" className="btn-ghost px-4 py-2 rounded-full">
            Back to Whisper
          </Link>
          <Link to="/server-health" className="btn-ghost px-4 py-2 rounded-full">
            View Server Health
          </Link>
        </header>

        {error && (
          <div className="surface-card card border border-line p-4 text-sm text-text-secondary" role="status">
            {error}
          </div>
        )}

        {snapshot && (
          <>
            <section className="surface-card card p-4 text-sm text-text-secondary">
              <p>{snapshot.monitoring.persistence}</p>
              <p className="mt-1">
                Scope: {snapshot.monitoring.scope}. Process monitoring started{' '}
                {formatTimestamp(snapshot.monitoring.startedAt)}.
              </p>
              {lastUpdated && <p className="mt-1">Dashboard updated {formatTimestamp(lastUpdated)}.</p>}
            </section>

            {metrics?.hasObservations === false && (
              <div className="surface-card card border border-line p-4 text-sm text-text-secondary" role="status">
                No limiter decisions, limiter errors, or saved messages have been observed since this process started.
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Requests allowed by limiter"
                value={metrics?.allowedRequests ?? '—'}
                detail="One count per rate-limited request after all its configured limiter checks pass."
              />
              <MetricCard
                label="Requests rejected by limiter"
                value={metrics?.rejectedRequests ?? '—'}
                detail="One count per rejected request, including requests passing through stacked limiters."
              />
              <MetricCard
                label="Messages saved"
                value={metrics?.savedMessages ?? '—'}
                detail="Counted only after MongoDB successfully saves a message."
              />
              <MetricCard
                label="Unresolved incidents"
                value={metrics?.activeIncidents ?? '—'}
                detail="An incident is recovered only after an eligible saved message after its restriction expires."
              />
              <MetricCard
                label="Limiter errors (fail-open)"
                value={metrics?.limiterErrors ?? '—'}
                detail="Measured limiter failures continue using the existing fail-open behavior."
              />
            </section>

            {metrics?.untrackedRejectedRequests > 0 && (
              <div className="surface-card card p-4 text-sm text-text-secondary">
                {metrics.untrackedRejectedRequests} rejection(s) could not be added to incidents because the bounded
                incident store was full.
              </div>
            )}

            <section className="surface-card card overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="font-display text-xl">Warning-only suspicious patterns</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  A warning appears after at least five observed rejections for one rate-limit scope within 60
                  seconds. This indicates repeated activity, not intent or maliciousness.
                </p>
              </div>
              {snapshot.suspiciousPatterns?.length ? (
                <div className="divide-y divide-line">
                  {snapshot.suspiciousPatterns.map((pattern, index) => (
                    <article key={`${pattern.category}-${pattern.firstObservedAt}-${index}`} className="px-5 py-4">
                      <div className="font-semibold text-amber-700">Suspicious pattern observed</div>
                      <p className="mt-1 text-sm text-text-secondary">{pattern.warning}</p>
                      <p className="mt-1 text-xs text-muted">
                        {pattern.rejectionCount} rejections · {pattern.category} · {pattern.algorithm} ·{' '}
                        {pattern.windowMs / 1000}s observed window
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-6 text-sm text-text-secondary">
                  No defined repeated-rejection pattern has been observed in the retained event sample.
                </p>
              )}
            </section>

            <section className="surface-card card overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="font-display text-xl">Recent incidents</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Related rejections are grouped. Expired restrictions remain awaiting confirmation until a saved
                  message verifies recovery.
                </p>
              </div>
              {incidents.length === 0 ? (
                <p className="px-5 py-6 text-sm text-text-secondary">No incidents have been observed.</p>
              ) : (
                <div className="divide-y divide-line">
                  {incidents.map((incident) => (
                    <article key={incident.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-text">{incident.category}</div>
                        <span className="pill">{incident.status.replaceAll('_', ' ')}</span>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-text-secondary">
                        {incident.rejectionCount} rejection(s) · {incident.algorithm} · configured limit{' '}
                        {incident.limit} · window {incident.windowMs} ms
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Started {formatTimestamp(incident.startedAt)} · restriction expiry{' '}
                        {formatTimestamp(incident.restrictionEndsAt)}
                        {incident.recoveredAt && ` · recovered ${formatTimestamp(incident.recoveredAt)}`}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="surface-card card overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="font-display text-xl">Recent rate-limit events</h2>
              </div>
              {events.length === 0 ? (
                <p className="px-5 py-6 text-sm text-text-secondary">No rate-limit decisions have been observed.</p>
              ) : (
                <div className="divide-y divide-line">
                  {events.map((event, index) => (
                    <div key={`${event.timestamp}-${index}`} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
                      <span className="text-text">
                        {event.decision} · {event.category} · {event.algorithm}
                        {event.decision === 'rejected' && ` · limit ${event.limit}`}
                      </span>
                      <span className="text-xs text-muted">
                        {formatTimestamp(event.timestamp)}
                        {event.retryAfterSeconds !== undefined && ` · retry in ${event.retryAfterSeconds}s`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
