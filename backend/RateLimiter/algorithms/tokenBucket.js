// TOKEN BUCKET algorithm
//
// IDEA: imagine a bucket that holds tokens. Each request needs 1 token to proceed.
// The bucket refills at a steady rate over time, up to a maximum capacity.
// If the bucket has a token, the request is allowed and one token is removed.
// If it's empty, the request is blocked until enough time passes to refill a token.
//
// PRO: allows controlled BURSTS. A user who's been quiet builds up a full bucket
//      and can fire several requests at once, but their long-run average is still
//      capped by the refill rate. This is how many real APIs (e.g. payment APIs) work.
// CON: slightly less intuitive; "limit per window" becomes "refill rate + capacity".
import * as memoryStore from '../store/memoryStore.js'

// here we treat `limit` as the bucket capacity, and refill `limit` tokens per windowMs.
// so refill rate = limit / windowMs tokens per millisecond.
// returns { allowed, limit, remaining, resetMs }
export function tokenBucket(key, limit, windowMs) {
  const now = Date.now()
  const storeKey = `tb:${key}`
  const capacity = limit
  const refillPerMs = limit / windowMs // tokens added per millisecond

  // read the bucket (or start with a full one)
  let record = memoryStore.get(storeKey)
  if (!record) {
    record = { tokens: capacity, lastRefill: now, expiresAt: now + windowMs * 2 }
  }

  // STEP 1: refill tokens based on how much time has passed since last refill
  const elapsed = now - record.lastRefill
  const refilled = elapsed * refillPerMs
  record.tokens = Math.min(capacity, record.tokens + refilled)
  record.lastRefill = now

  // STEP 2: try to spend one token
  let allowed = false
  if (record.tokens >= 1) {
    record.tokens -= 1
    allowed = true
  }

  // keep the bucket alive, save it
  record.expiresAt = now + windowMs * 2
  memoryStore.set(storeKey, record)

  const remaining = Math.floor(record.tokens)
  // resetMs: time until at least 1 token is available again
  const resetMs = allowed ? 0 : Math.ceil((1 - record.tokens) / refillPerMs)

  return { allowed, limit: capacity, remaining, resetMs }
}
