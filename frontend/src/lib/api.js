import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// shared axios instance - withCredentials so the auth cookie is sent
export const api = axios.create({
  baseURL,
  withCredentials: true,
})

// helper: pull the X-RateLimit-* headers off a response (or error response)
// so the UI can show remaining quota and reset time.
export function readRateLimitHeaders(resOrErr) {
  const headers = resOrErr?.headers || resOrErr?.response?.headers || {}
  return {
    limit: headers['x-ratelimit-limit'],
    remaining: headers['x-ratelimit-remaining'],
    reset: headers['x-ratelimit-reset'],
    algorithm: headers['x-ratelimit-algorithm'],
  }
}
