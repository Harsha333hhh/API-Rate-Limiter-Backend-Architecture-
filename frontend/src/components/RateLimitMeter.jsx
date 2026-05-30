export default function RateLimitMeter({ rl, blocked, retryAfter }) {
  const limit = Number(rl?.limit) || 0
  const remaining = Number(rl?.remaining) || 0
  const used = Math.max(0, limit - remaining)
  const pct = limit > 0 ? (remaining / limit) * 100 : 100
  const hasLiveData = Boolean(rl?.limit)

  return (
    <div className="surface-card card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="label">Rate limit · per pair</span>
        {rl?.algorithm ? <span className="pill-primary">{rl.algorithm}</span> : <span className="pill">waiting</span>}
      </div>

      {/* the draining bar */}
      <div className="h-2.5 rounded-full bg-raised overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: hasLiveData ? `${pct}%` : '100%',
            backgroundColor: blocked
              ? '#ef4444'
              : hasLiveData && pct < 30
                ? '#ef4444'
                : hasLiveData
                  ? 'var(--color-meter, #f59e0b)'
                  : 'var(--color-primary-soft-strong, #d9e6ff)',
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <span className={blocked ? 'text-danger' : 'text-muted'}>
          {hasLiveData ? (blocked ? 'BLOCKED' : `${remaining} of ${limit} left`) : 'Waiting for live quota data'}
        </span>
        {blocked && retryAfter ? (
          <span className="text-danger">retry in {retryAfter}s</span>
        ) : (
          <span className="text-muted">{hasLiveData ? `${used} used` : 'Ready'}</span>
        )}
      </div>
    </div>
  )
}
