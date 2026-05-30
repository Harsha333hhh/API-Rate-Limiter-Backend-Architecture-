export default function RateLimitMeter({ rl, blocked, retryAfter }) {
  const limit = Number(rl?.limit) || 0
  const remaining = Number(rl?.remaining) || 0
  const used = Math.max(0, limit - remaining)
  const pct = limit > 0 ? (remaining / limit) * 100 : 100

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="label">Rate limit · per pair</span>
        {rl?.algorithm && <span className="pill bg-accent/10 text-accent-dim font-mono text-xs">{rl.algorithm}</span>}
      </div>

      {/* the draining bar */}
      <div className="h-2.5 rounded-full bg-raised overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: blocked ? '#ef4444' : pct < 30 ? '#ef4444' : 'var(--color-accent, #ffb38a)',
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <span className={blocked ? 'text-danger' : 'text-muted'}>
          {blocked ? 'BLOCKED' : `${remaining} of ${limit} left`}
        </span>
        {blocked && retryAfter ? (
          <span className="text-danger">retry in {retryAfter}s</span>
        ) : (
          <span className="text-muted">{used} used</span>
        )}
      </div>
    </div>
  )
}
