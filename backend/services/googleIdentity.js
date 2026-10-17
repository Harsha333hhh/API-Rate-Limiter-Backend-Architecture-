import { createPublicKey, verify as verifySignature } from 'node:crypto'

const GOOGLE_CERTIFICATES_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const MAX_TOKEN_LENGTH = 16 * 1024
let certificateCache = null

export class GoogleIdentityError extends Error {
  constructor(message, status = 401) {
    super(message)
    this.name = 'GoogleIdentityError'
    this.status = status
  }
}

function decodeJsonSegment(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
  } catch {
    throw new GoogleIdentityError('Invalid Google identity token')
  }
}

async function loadGoogleCertificates(forceRefresh = false) {
  if (!forceRefresh && certificateCache?.expiresAt > Date.now()) {
    return certificateCache.keys
  }

  let response
  try {
    response = await fetch(GOOGLE_CERTIFICATES_URL, { signal: AbortSignal.timeout(5000) })
  } catch (error) {
    console.error('Could not retrieve Google signing certificates:', error.message)
    throw new GoogleIdentityError('Google sign-in is temporarily unavailable', 503)
  }

  if (!response.ok) {
    console.error('Google signing certificate request failed:', response.status)
    throw new GoogleIdentityError('Google sign-in is temporarily unavailable', 503)
  }

  let body
  try {
    body = await response.json()
  } catch {
    throw new GoogleIdentityError('Google sign-in is temporarily unavailable', 503)
  }
  if (!Array.isArray(body.keys)) {
    throw new GoogleIdentityError('Google sign-in is temporarily unavailable', 503)
  }

  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1] || 300)
  certificateCache = {
    keys: body.keys,
    expiresAt: Date.now() + Math.max(0, maxAge) * 1000,
  }
  return certificateCache.keys
}

function invalidToken() {
  return new GoogleIdentityError('Google identity could not be verified')
}

export async function verifyGoogleIdentityToken(idToken, expectedNonce) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new GoogleIdentityError('Google sign-in is not configured on the server', 503)
  }
  if (
    typeof idToken !== 'string' ||
    idToken.length > MAX_TOKEN_LENGTH ||
    typeof expectedNonce !== 'string' ||
    expectedNonce.length < 32 ||
    expectedNonce.length > 128
  ) {
    throw invalidToken()
  }

  const segments = idToken.split('.')
  if (segments.length !== 3) throw invalidToken()

  const header = decodeJsonSegment(segments[0])
  const claims = decodeJsonSegment(segments[1])
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw invalidToken()

  let keys = await loadGoogleCertificates()
  let signingKey = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig')
  if (!signingKey) {
    keys = await loadGoogleCertificates(true)
    signingKey = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig')
  }
  if (!signingKey) throw invalidToken()

  let signatureIsValid = false
  try {
    signatureIsValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${segments[0]}.${segments[1]}`),
      createPublicKey({ key: signingKey, format: 'jwk' }),
      Buffer.from(segments[2], 'base64url')
    )
  } catch {
    throw invalidToken()
  }
  if (!signatureIsValid) throw invalidToken()

  const now = Math.floor(Date.now() / 1000)
  const issuerIsValid = ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
  const audienceIsValid = claims.aud === clientId
  const authorizedPartyIsValid = claims.azp === undefined || claims.azp === clientId
  if (
    !issuerIsValid ||
    !audienceIsValid ||
    !authorizedPartyIsValid ||
    claims.nonce !== expectedNonce ||
    typeof claims.exp !== 'number' ||
    claims.exp <= now ||
    typeof claims.iat !== 'number' ||
    claims.iat > now + 60 ||
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0 ||
    typeof claims.email !== 'string' ||
    claims.email_verified !== true
  ) {
    throw invalidToken()
  }

  const email = claims.email.trim().toLowerCase()
  if (!email || email.length > 254) throw invalidToken()
  const providedName = typeof claims.name === 'string' ? claims.name.trim() : ''
  const name = (providedName || email.split('@')[0]).slice(0, 120)

  return { sub: claims.sub, email, name }
}
