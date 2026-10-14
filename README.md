# Whisper — Direct Messaging with a Custom API Rate Limiter

**API Rate Limiter (Backend Infrastructure)** — individual project.

A small direct-messaging app (sign up, log in, message anyone by their short user ID) used to demonstrate a **custom-built API rate limiter**. Whisper is deliberately minimal; the real substance is the rate-limiting infrastructure that protects the API endpoints from abuse.

---

## What this project actually is

The rate limiter is the project. The messaging app is just a realistic place to *show it working*. The limiter is built from scratch (no `express-rate-limit` library) so every line is yours to explain.

It demonstrates three things a real rate limiter needs:

1. **Multiple algorithms** — fixed window, sliding window, token bucket
2. **Multiple ways to identify who to count** — by IP, by user, by sender→receiver pair
3. **Correct HTTP behavior** — `429 Too Many Requests` with `X-RateLimit-*` headers

Storage is **in-memory** (a JavaScript `Map`), chosen because rate-limit counts are fast, short-lived, throwaway data. The code is structured so Redis could be dropped in later without touching the algorithms.

---

## The rate limiter, explained

All of it lives in `backend/RateLimiter/`.

### The middleware (`rateLimiter.js`)
A **factory**: you call `rateLimiter({...})` and it returns an Express middleware. That lets each route configure its own limit, algorithm, and identification strategy:

```js
rateLimiter({ algorithm: 'sliding-window', limit: 5, windowMs: 60000, by: 'pair' })
```

On every request it: builds a key for *who* this is → runs the chosen algorithm → sets the rate-limit headers → either calls `next()` or responds `429`.

### The three algorithms (`algorithms/`)

**Fixed window** — counts requests in fixed time buckets (e.g. each 60s). Simple and fast, but allows a burst of up to 2× the limit right at the boundary between two windows.

**Sliding window** — keeps the actual timestamps of recent requests and counts how many fall within the last `windowMs` from *now*. Fixes the boundary problem; costs a little more memory.

**Token bucket** — a bucket of tokens that refills at a steady rate; each request spends one. Allows controlled bursts (a quiet user builds up tokens) while capping the long-run average. This is how many real APIs work.

### The three identification strategies (`by`)

| `by` | Key used | Used on | Why |
|---|---|---|---|
| `ip` | client IP | login, signup | No user exists yet; stops brute-force / spam from one machine |
| `user` | logged-in `userId` | sending, reading | Stops one user flooding the whole system |
| `pair` | `sender→receiver` | sending | Stops one user spamming **one specific person** (anti-harassment) |

The `pair` strategy is the interesting one — it means you can be blocked from spamming *one* person while still messaging others normally.

### The store (`store/memoryStore.js`)
A plain `Map` with a periodic cleanup that drops expired entries so it doesn't grow forever. Every algorithm only talks to this store's `get`/`set`/`remove` — so swapping in Redis later means rewriting only this one file.

---

## Where the limits are applied

| Route | Limit | Algorithm | By |
|---|---|---|---|
| `POST /user-api/users` (signup) | 5 / 10 min | fixed window | ip |
| `POST /user-api/login` | 5 / min | fixed window | ip |
| `PATCH /user-api/me` (profile edit) | 10 / min | sliding window | user |
| `DELETE /user-api/me` (account delete) | 10 / min | sliding window | user |
| `POST /user-api/block/:userId` and `/unblock/:userId` | 5 / 15 sec | sliding window | user |
| `GET /user-api/blocked` | 10 / min | sliding window | user |
| `POST /message-api/messages` (send) | 10 / 2 sec | sliding window | user |
| `POST /message-api/messages` (send) | 150 / min | sliding window | user |
| `POST /message-api/messages` (send) | 60 / min | sliding window | pair |
| `DELETE /message-api/conversations/:otherUserId` | 10 / min | sliding window | user |
| `GET /message-api/messages/:otherUserId` (read) | 200 / min | sliding window | user |
| `PATCH /message-api/messages/read/:otherUserId` | 200 / min | sliding window | user |
| `GET /message-api/unread` | 200 / min | sliding window | user |
| `GET /message-api/conversations` | 200 / min | sliding window | user |

The send route stacks **three** limiters; all must pass. Token bucket is implemented but is not currently configured on a route.

### Rate-limit dashboard

Administrators can open `/rate-limit-dashboard` from the account menu. The dashboard API is `GET /monitoring-api/rate-limits`; the backend requires an authenticated JWT with the `admin` role and a configured `JWT_SECRET` (the development fallback is rejected for admin access). Public signup always assigns the `user` role, so an administrator account must be provisioned by a trusted operator and must log in again to receive an updated role claim.

Administrators can also open `/server-health` or use `GET /monitoring-api/server-health`. The endpoint reports process-local API latency p95 over the latest 300 completed API requests, current in-flight API requests, and Node.js event-loop delay p95 when samples are available. The view reports `unknown` before completed API latency samples exist unless another available measurement has already met a degraded threshold. It reports `degraded` when any measured threshold is met: 1000 ms API latency p95, 25 in-flight requests, or 100 ms event-loop delay p95. Health monitoring does not change rate limits or request handling.

Counts, recent events, incidents, health samples, and warning patterns are held in bounded process-local memory. They reset when the backend process restarts and are local to the instance serving the dashboard request. Request totals count limiter decisions once per request, even when send-message limiters are stacked. Saved-message totals increment only after MongoDB saves a message. Incident recovery requires a saved message for the same user or pair after the recorded restriction expiry; elapsed time alone leaves the incident awaiting confirmation. A warning-only pattern is shown after at least five retained rejection events for one rate-limit scope in 60 seconds; it is not evidence of intent and does not trigger enforcement. Monitoring data is not written to MongoDB and responses omit message content and client identifiers.

### Personal PIN-protected conversations

Conversation Settings separate three states: whether a PIN/key is configured, whether Chat Protection is ON, and whether this browser currently has an unlocked key. The browser encrypts message content with AES-256-GCM, wraps per-message keys with the recipient's RSA-OAEP public key, and encrypts the user's private key with an AES-GCM key derived from the PIN using PBKDF2-HMAC-SHA-256 (600,000 iterations and a fresh salt). Changing the PIN verifies the current PIN and rewraps the same private key; it does not re-encrypt message history.

When Chat Protection is ON, protected copies are shown as ciphertext until unlocked. Turning it OFF does not remove ciphertext, the PIN configuration, or the private-key envelope; the browser decrypts that user's copies locally. A non-extractable private `CryptoKey` may be cached in IndexedDB on that browser to keep the conversation readable through refreshes and conversation switches. Turning protection ON, locking, and logging out clear that cache; logging back in or opening the conversation on another browser requires the PIN again. PINs, raw private-key bytes, and decrypted messages are not stored in IndexedDB. The device cache is a convenience, not a security boundary against malicious JavaScript, XSS, or an attacker controlling the browser. A lost PIN has no recovery bypass.

Existing history is migrated in bounded batches. During migration, the ordinary conversation API does not return plaintext; migration can resume after entering the PIN. Protected message ciphertext is currently limited to 32,768 base64url characters, so an older message beyond that supported encrypted size cannot be migrated and protection will remain incomplete rather than silently completing. A detected missing protected copy is reported and can be synchronized from retained plaintext.

This is **personal protection, not end-to-end encryption**. Plaintext is retained for an unprotected participant's copy and may be handled by the backend during history migration. The backend removes retained plaintext for a message only after both participants have protected copies. Enabling protection requires a MongoDB replica set or sharded deployment with transaction support so message writes serialize safely against protection-state changes. On a standalone MongoDB server, normal messaging continues, but protection cannot be enabled and protected-message sends are unavailable.

---

## Running it

### Prerequisites
- Node.js 18+
- MongoDB running locally (or a MongoDB Atlas connection string)

### Backend
```bash
cd backend
cp .env.example .env      # then edit JWT_SECRET
npm install
npm run dev               # http://localhost:4000
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev               # http://localhost:5173
```

For deployment, set the frontend `VITE_API_URL` to the backend URL. On Render, set `FRONTEND_URL` to the exact Vercel origin used by the browser (scheme and hostname only, no trailing slash); separate multiple trusted origins with commas. Vercel preview deployments may require their own origin to be explicitly added and may be restricted by Vercel Deployment Protection. The frontend's `vercel.json` rewrite serves the SPA entry point for routes such as `/login` and `/signup`.

---

## How to demo it (for your viva)

1. Open two browsers (or one normal + one incognito). Sign up as two users — note each one's short ID shown in the sidebar.
2. In user A, type user B's ID into "Search by user ID..." and send a message. It appears for B within a few seconds.
3. **Show the limiter:** rapidly send messages to B. Watch the rate-limit meter under the chat drain as `X-RateLimit-Remaining` drops. After 5 messages in a minute to that person, the input turns red and the send is blocked with a 429 and a retry countdown.
4. **Show the pair vs user distinction:** while blocked from messaging B, start a chat with a *third* user — you can still message them, because the `pair` limit is per-conversation.
5. **Show IP limiting:** sign out and fail the login 6 times quickly — the 6th is blocked by the IP-based limiter.

---

## Project structure

```
messaging-ratelimiter/
├── backend/
│   ├── APIs/
│   │   ├── UsersApi.js          # signup, login, lookup, me, logout
│   │   └── MessagesApi.js       # send, conversation, conversations list
│   ├── Controllers/userController.js   # register logic
│   ├── services/authservices.js        # login + JWT
│   ├── Middlewares/authMiddleware.js   # verifies JWT, sets req.user.userId
│   ├── Models/
│   │   ├── UserModel.js          # has the friendly short userId
│   │   └── MessageModel.js
│   ├── RateLimiter/              # ★ the project
│   │   ├── rateLimiter.js        # the configurable middleware factory
│   │   ├── algorithms/           # fixedWindow, slidingWindow, tokenBucket
│   │   └── store/memoryStore.js  # in-memory Map + cleanup
│   └── server.js
└── frontend/
    └── src/
        ├── pages/        # Login, Signup, Messenger
        ├── components/   # RateLimitMeter (the live quota bar)
        ├── context/      # AuthContext
        └── lib/api.js    # axios + header reader
```

---

## Likely viva questions (and the short answers)

- **Why in-memory and not a database?** Counts are checked on *every* request and are disposable — speed matters, permanence doesn't. A disk database would be slower than the thing it protects.
- **What's the downside of in-memory?** Resets on server restart, and wouldn't be shared across multiple server instances. Redis solves both; the code is structured so only `memoryStore.js` changes.
- **Difference between the algorithms?** Fixed window is simplest but has the boundary-burst flaw; sliding window fixes it with more memory; token bucket allows controlled bursts.
- **Why three identification strategies?** Because "who" you limit depends on context — anonymous routes must use IP, authenticated routes can use the user, and harassment protection needs the sender-receiver pair.
- **What is 429 and why the headers?** `429 Too Many Requests` is the standard "slow down" status; the `X-RateLimit-*` headers tell a well-behaved client its limit, what's left, and when to retry.

---

Built by **leoxzayn** · 2026
