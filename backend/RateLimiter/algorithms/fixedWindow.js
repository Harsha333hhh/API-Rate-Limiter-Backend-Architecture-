// FIXED WINDOW algorithm
//
// IDEA: chop time into fixed buckets of size windowMs (e.g. every 60 seconds).
// Count requests in the current bucket. If the count goes over the limit, block.
// When the bucket's time passes, the count resets to 0.
//
// PRO: dead simple and fast - just a counter.
// CON: the "boundary problem" - a user can send `limit` requests at the very end
//      of one window and `limit` more at the very start of the next, getting 2x
//      the limit in a short burst across the boundary.
import * as memoryStore from '../store/memoryStore.js'

// check a single request against the fixed-window limit
// key = who we are counting (e.g. "msg:user:a7k2p9")
// returns { allowed, limit, remaining, resetMs }
export function fixedWindow(key, limit, windowMs) {
  const now = Date.now()

  // which time bucket are we in right now?
  const bucket = Math.floor(now / windowMs)
  const storeKey = `fw:${key}:${bucket}`

  // read the current record for this bucket
  let record = memoryStore.get(storeKey)

  // first request in this bucket -> start a fresh count
  if (!record) {
    record = { count: 0, expiresAt: (bucket + 1) * windowMs }
  }

  // count this request
  record.count++
  memoryStore.set(storeKey, record)

  // work out the result
  const allowed = record.count <= limit
  const remaining = Math.max(0, limit - record.count)
  const resetMs = record.expiresAt - now // time until this bucket ends

  return { allowed, limit, remaining, resetMs }
}
