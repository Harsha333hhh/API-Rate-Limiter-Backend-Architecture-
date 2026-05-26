// SLIDING WINDOW algorithm (log-based)
//
// IDEA: instead of fixed buckets, keep a list of the actual timestamps of recent
// requests. On each request, throw away timestamps older than windowMs, then count
// what's left. The "window" slides continuously with the current time.
//
// PRO: accurate - it fixes the fixed-window boundary problem. There is no moment
//      where you can sneak 2x the limit through, because we always look back exactly
//      windowMs from "right now".
// CON: uses more memory - we store one timestamp per request (up to `limit` of them).
import * as memoryStore from '../store/memoryStore.js'

// check a single request against the sliding-window limit
// returns { allowed, limit, remaining, resetMs }
export function slidingWindow(key, limit, windowMs) {
  const now = Date.now()
  const storeKey = `sw:${key}`

  // read the list of recent timestamps (or start a new one)
  let record = memoryStore.get(storeKey)
  if (!record) {
    record = { timestamps: [], expiresAt: now + windowMs }
  }

  // the start of the current sliding window
  const windowStart = now - windowMs

  // drop any timestamps that are older than the window
  record.timestamps = record.timestamps.filter((t) => t > windowStart)

  // how many requests are in the window right now?
  const countInWindow = record.timestamps.length

  // decide if this request is allowed
  const allowed = countInWindow < limit

  // only record the timestamp if allowed (so a blocked request doesn't extend the block forever)
  if (allowed) {
    record.timestamps.push(now)
  }

  // keep the record alive a bit longer than the window, then let cleanup remove it
  record.expiresAt = now + windowMs * 2
  memoryStore.set(storeKey, record)

  const remaining = Math.max(0, limit - record.timestamps.length)
  // resetMs: when the OLDEST timestamp in the window will fall out
  const oldest = record.timestamps[0]
  const resetMs = oldest ? oldest + windowMs - now : windowMs

  return { allowed, limit, remaining, resetMs }
}
