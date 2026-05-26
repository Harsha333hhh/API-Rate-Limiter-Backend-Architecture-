# Relay — Direct Messaging with a Custom API Rate Limiter

**API Rate Limiter (Backend Infrastructure)** — individual project.

A small direct-messaging app (sign up, log in, message anyone by their short user ID) used to demonstrate a **custom-built API rate limiter**. The app is deliberately minimal; the real substance is the rate-limiting infrastructure that protects the API endpoints from abuse.

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
| `POST /message-api/messages` (send) | 10 / min | sliding window | user |
| `POST /message-api/messages` (send) | 5 / min | sliding window | pair |
| `GET /message-api/messages/:id` (read) | 60 / min | sliding window | user |

Note that the send route stacks **two** limiters — both must pass.

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

---

## How to demo it (for your viva)

1. Open two browsers (or one normal + one incognito). Sign up as two users — note each one's short ID shown in the sidebar.
2. In user A, type user B's ID into "Message someone by ID" and send a message. It appears for B within a few seconds.
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
