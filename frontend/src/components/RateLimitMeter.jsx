// RATE LIMIT METER - shows the live state of the rate limiter to the user.
// This is the "money shot" for the demo: it reads the X-RateLimit-* headers
// from the last send and shows remaining quota as a bar that drains, plus a
// red blocked state when a 429 comes back.
export default function RateLimitMeter({ rl, blocked, retryAfter }) {
  // rl = { limit, remaining, reset, algorithm }
  const limit = Number(rl?.limit) || 0
  const remaining = Number(rl?.remaining) || 0
  const used = Math.max(0, limit - remaining)
  const pct = limit > 0 ? (remaining / limit) * 100 : 100

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="label">Rate limit · per pair</span>
        {rl?.algorithm && <span className="pill bg-raised text-muted">{rl.algorithm}</span>}
      </div>

      {/* the draining bar */}
      <div className="h-2.5 rounded-full bg-raised overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: blocked ? '#d86b5a' : pct < 30 ? '#d86b5a' : '#c9a25e',
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
