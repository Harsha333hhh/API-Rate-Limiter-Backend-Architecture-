const encoder = new TextEncoder()
const decoder = new TextDecoder()
const KDF_ITERATIONS = 600000
const MAX_CIPHERTEXT_LENGTH = 32768
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

function requireCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('This browser does not support secure conversation protection')
  }
  return globalThis.crypto
}

function toBase64Url(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function fromBase64Url(value, maxLength = MAX_CIPHERTEXT_LENGTH) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new Error('Invalid encrypted conversation data')
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesOf(buffer) {
  return new Uint8Array(buffer)
}

async function derivePinWrappingKey(pin, salt) {
  const crypto = requireCrypto()
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: KDF_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function wrapPrivateKey(pin, privateKeyBytes) {
  const crypto = requireCrypto()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await derivePinWrappingKey(pin, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, privateKeyBytes)

  return {
    version: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: KDF_ITERATIONS,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(bytesOf(ciphertext)),
  }
}

async function unwrapPrivateKeyBytes(envelope, pin) {
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.kdf !== 'PBKDF2-SHA-256' ||
    envelope.iterations !== KDF_ITERATIONS
  ) {
    throw new Error('Unsupported protected conversation key format')
  }
  const crypto = requireCrypto()
  const salt = fromBase64Url(envelope.salt, 64)
  const iv = fromBase64Url(envelope.iv, 64)
  const ciphertext = fromBase64Url(envelope.ciphertext, 4096)
  if (salt.byteLength !== 16 || iv.byteLength !== 12) {
    throw new Error('Invalid protected conversation key envelope')
  }
  const wrappingKey = await derivePinWrappingKey(pin, salt)
  return bytesOf(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, ciphertext))
}

export async function createConversationKeyMaterial(pin) {
  const crypto = requireCrypto()
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  )
  const publicKey = toBase64Url(bytesOf(await crypto.subtle.exportKey('spki', pair.publicKey)))
  const privateKeyBytes = bytesOf(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  try {
    const privateKeyEnvelope = await wrapPrivateKey(pin, privateKeyBytes)
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
    )
    return { publicKey, privateKeyEnvelope, privateKey }
  } finally {
    privateKeyBytes.fill(0)
  }
}

export async function unlockConversationPrivateKey(envelope, pin) {
  try {
    const privateKeyBytes = await unwrapPrivateKeyBytes(envelope, pin)
    try {
      return await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['decrypt']
      )
    } finally {
      privateKeyBytes.fill(0)
    }
  } catch {
    throw new Error('PIN is incorrect or the protected key data is invalid')
  }
}

export async function unlockNonExtractableConversationPrivateKey(envelope, pin) {
  try {
    const privateKeyBytes = await unwrapPrivateKeyBytes(envelope, pin)
    try {
      return await requireCrypto().subtle.importKey(
        'pkcs8',
        privateKeyBytes,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
      )
    } finally {
      privateKeyBytes.fill(0)
    }
  } catch {
    throw new Error('PIN is incorrect or the protected key data is invalid')
  }
}

export async function rewrapConversationPrivateKey(privateKey, pin) {
  const crypto = requireCrypto()
  const privateKeyBytes = bytesOf(await crypto.subtle.exportKey('pkcs8', privateKey))
  try {
    return await wrapPrivateKey(pin, privateKeyBytes)
  } finally {
    privateKeyBytes.fill(0)
  }
}

export async function rewrapConversationPrivateKeyEnvelope(envelope, currentPin, newPin) {
  let privateKeyBytes
  try {
    privateKeyBytes = await unwrapPrivateKeyBytes(envelope, currentPin)
    return await wrapPrivateKey(newPin, privateKeyBytes)
  } catch {
    throw new Error('PIN is incorrect or the protected key data is invalid')
  } finally {
    privateKeyBytes?.fill(0)
  }
}

export async function encryptMessageCopies(text, recipients) {
  const crypto = requireCrypto()
  if (typeof text !== 'string' || text.length === 0 || recipients.length === 0 || recipients.length > 2) {
    throw new Error('Invalid message or protected conversation recipients')
  }

  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const rawDataKey = bytesOf(await crypto.subtle.exportKey('raw', dataKey))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, encoder.encode(text))
    if (toBase64Url(bytesOf(ciphertext)).length > MAX_CIPHERTEXT_LENGTH) {
      throw new Error('Protected messages cannot exceed the supported encrypted size')
    }
    const protectedCopies = await Promise.all(
      recipients.map(async ({ userId, publicKey }) => {
        const key = await crypto.subtle.importKey(
          'spki',
          fromBase64Url(publicKey, 2048),
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,
          ['encrypt']
        )
        const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, rawDataKey)
        return {
          userId,
          version: 1,
          iv: toBase64Url(iv),
          ciphertext: toBase64Url(bytesOf(ciphertext)),
          wrappedKey: toBase64Url(bytesOf(wrappedKey)),
        }
      })
    )
    return protectedCopies
  } finally {
    rawDataKey.fill(0)
  }
}

export async function decryptMessageCopy(copy, privateKey) {
  try {
    if (
      !copy ||
      copy.version !== 1 ||
      typeof copy.iv !== 'string' ||
      typeof copy.ciphertext !== 'string' ||
      typeof copy.wrappedKey !== 'string'
    ) {
      throw new Error('Invalid protected message')
    }
    const crypto = requireCrypto()
    const iv = fromBase64Url(copy.iv, 64)
    const ciphertext = fromBase64Url(copy.ciphertext)
    const wrappedKey = fromBase64Url(copy.wrappedKey, 2048)
    if (iv.byteLength !== 12 || wrappedKey.byteLength !== 256) {
      throw new Error('Invalid protected message')
    }
    const rawDataKey = bytesOf(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey))
    try {
      if (rawDataKey.byteLength !== 32) throw new Error('Invalid protected message')
      const dataKey = await crypto.subtle.importKey('raw', rawDataKey, { name: 'AES-GCM' }, false, ['decrypt'])
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dataKey, ciphertext)
      return decoder.decode(plaintext)
    } finally {
      rawDataKey.fill(0)
    }
  } catch {
    throw new Error('Could not decrypt this protected message')
  }
}

export function validatePin(pin) {
  return typeof pin === 'string' && pin.length >= 8 && pin.length <= 128
}
