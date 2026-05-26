// RATE LIMITER MIDDLEWARE - the heart of the project
//
// This is a FACTORY: you call rateLimiter({...options}) and it RETURNS an
// express middleware function. That lets us configure each route differently
// (different limits, algorithms, and ways of identifying the client).
//
// HOW TO USE on a route:
//   route.post('/login', rateLimiter({ algorithm: 'fixed-window', limit: 5, windowMs: 60000, by: 'ip' }), handler)
//
// OPTIONS:
//   algorithm : 'fixed-window' | 'sliding-window' | 'token-bucket'
//   limit     : max requests allowed in the window (or bucket capacity for token-bucket)
//   windowMs  : the time window in milliseconds
//   by        : how to identify WHO we are counting:
//               'ip'   -> use req.ip                     (for login/signup - no user yet)
//               'user' -> use req.user.userId            (for sending - per logged-in user)
//               'pair' -> use senderId + receiverId      (anti-spam a SPECIFIC person)

import { fixedWindow } from './algorithms/fixedWindow.js'
import { slidingWindow } from './algorithms/slidingWindow.js'
import { tokenBucket } from './algorithms/tokenBucket.js'

// map the algorithm name to its function
const algorithms = {
  'fixed-window': fixedWindow,
  'sliding-window': slidingWindow,
  'token-bucket': tokenBucket,
}

// build the "key" that identifies who this request belongs to
function buildKey(by, req) {
  if (by === 'user') {
    // per logged-in user
    return `user:${req.user?.userId || 'unknown'}`
  }
  if (by === 'pair') {
    // per (sender -> receiver) - sender is the logged-in user, receiver is in the body
    const sender = req.user?.userId || 'unknown'
    const receiver = req.body?.receiverId || 'unknown'
    return `pair:${sender}->${receiver}`
  }
  // default: per IP address
  return `ip:${req.ip}`
}

// the factory
export function rateLimiter(options) {
  // defaults so the limiter is safe even if you forget an option
  const {
    algorithm = 'sliding-window',
    limit = 10,
    windowMs = 60000,
    by = 'ip',
  } = options || {}

  // pick the algorithm function once (falls back to sliding-window if name is wrong)
  const algoFn = algorithms[algorithm] || slidingWindow

  // return the actual express middleware
  return (req, res, next) => {
    try {
      // 1. work out who we are counting
      const key = buildKey(by, req)

      // 2. run the chosen algorithm
      const result = algoFn(key, limit, windowMs)

      // 3. set standard rate-limit headers so the client knows where it stands
      res.set('X-RateLimit-Limit', result.limit)
      res.set('X-RateLimit-Remaining', result.remaining)
      res.set('X-RateLimit-Reset', Math.ceil(result.resetMs / 1000)) // in seconds
      res.set('X-RateLimit-Algorithm', algorithm)

      // 4. if over the limit, block with 429 Too Many Requests
      if (!result.allowed) {
        res.set('Retry-After', Math.ceil(result.resetMs / 1000))
        return res.status(429).json({
          message: 'Too many requests, please slow down',
          retryAfterSeconds: Math.ceil(result.resetMs / 1000),
          algorithm,
        })
      }

      // 5. otherwise let the request through to the real handler
      next()
    } catch (err) {
      // if the limiter itself errors, don't block the app - just let it through
      console.error('Rate limiter error:', err.message)
      next()
    }
  }
}
