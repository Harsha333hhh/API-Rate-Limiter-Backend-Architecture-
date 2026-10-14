const DATABASE_NAME = 'whisper-conversation-keys'
const DATABASE_VERSION = 1
const STORE_NAME = 'privateKeys'

let databasePromise

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('This browser cannot securely cache conversation keys'))
  }
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open protected-key storage'))
    request.onblocked = () => reject(new Error('Protected-key storage is blocked by another browser tab'))
  }).catch((error) => {
    databasePromise = undefined
    throw error
  })

  return databasePromise
}

function keyId(userId, otherUserId) {
  return `${userId}:${otherUserId}`
}

async function runRequest(mode, operation) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    let requestResult
    let requestError
    const request = operation(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => {
      requestResult = request.result
    }
    request.onerror = () => {
      requestError = request.error || new Error('Protected-key storage request failed')
    }
    transaction.oncomplete = () => {
      if (requestError) reject(requestError)
      else resolve(requestResult)
    }
    transaction.onerror = () => reject(transaction.error || requestError || new Error('Protected-key storage transaction failed'))
    transaction.onabort = () => reject(transaction.error || requestError || new Error('Protected-key storage transaction was aborted'))
  })
}

export async function cacheConversationPrivateKey(userId, otherUserId, privateKey) {
  if (
    privateKey?.type !== 'private' ||
    privateKey.algorithm?.name !== 'RSA-OAEP' ||
    !privateKey.usages?.includes('decrypt')
  ) {
    throw new Error('A valid conversation private key is required for secure device caching')
  }
  if (privateKey.extractable === false) {
    await runRequest('readwrite', (store) => store.put(privateKey, keyId(userId, otherUserId)))
    return
  }
  const encodedKey = await globalThis.crypto.subtle.exportKey('pkcs8', privateKey)
  const keyBytes = new Uint8Array(encodedKey)
  try {
    const cachedKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      keyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    )
    await runRequest('readwrite', (store) => store.put(cachedKey, keyId(userId, otherUserId)))
  } finally {
    keyBytes.fill(0)
  }
}

export async function getCachedConversationPrivateKey(userId, otherUserId) {
  const cachedKey = await runRequest('readonly', (store) => store.get(keyId(userId, otherUserId)))
  if (!cachedKey) return null
  if (
    cachedKey.type !== 'private' ||
    cachedKey.extractable !== false ||
    cachedKey.algorithm?.name !== 'RSA-OAEP' ||
    !cachedKey.usages?.includes('decrypt')
  ) {
    await deleteCachedConversationPrivateKey(userId, otherUserId)
    throw new Error('Invalid cached conversation key was removed')
  }
  return cachedKey
}

export async function deleteCachedConversationPrivateKey(userId, otherUserId) {
  await runRequest('readwrite', (store) => store.delete(keyId(userId, otherUserId)))
}

export async function clearCachedConversationPrivateKeys(userId) {
  const prefix = `${userId}:`
  const keys = await runRequest('readonly', (store) => store.getAllKeys())
  await runRequest('readwrite', (store) => {
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith(prefix)) store.delete(key)
    }
    return store.getAllKeys()
  })
}
