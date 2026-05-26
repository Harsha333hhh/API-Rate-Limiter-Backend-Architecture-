// IN-MEMORY STORE - Holds rate-limit data in a plain JavaScript Map (in RAM).
//
// WHY IN-MEMORY: rate-limit counts are short-lived, throwaway data. We don't need
// to keep them forever, we just need them to be FAST (checked on every request).
// A Map lives in memory so reads/writes are near-instant.
//
// TRADE-OFF (important for viva): because it lives in this server's memory,
//   1. the counts reset if the server restarts, and
//   2. it would NOT be shared if we ran multiple server copies (each copy has its own Map).
// In production you'd swap this for Redis. The code is structured so that swap is easy:
// every algorithm only talks to this store's methods, never to the Map directly.

// the single shared map: key -> whatever value the algorithm needs to store
const store = new Map()

// get the stored value for a key (or undefined if missing)
export function get(key) {
  return store.get(key)
}

// set a value for a key
export function set(key, value) {
  store.set(key, value)
}

// delete a key
export function remove(key) {
  store.delete(key)
}

// CLEANUP: every so often, remove entries that have fully expired so the
// Map doesn't grow forever. Each stored value carries an "expiresAt" timestamp.
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of store.entries()) {
    if (value && value.expiresAt && now > value.expiresAt) {
      store.delete(key)
    }
  }
}, 60 * 1000) // run cleanup once a minute
