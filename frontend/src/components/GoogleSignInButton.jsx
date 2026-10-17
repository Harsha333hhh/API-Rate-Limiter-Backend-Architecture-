import { useEffect, useRef, useState } from 'react'

let googleScriptPromise

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google?.accounts?.id) resolve()
      else {
        googleScriptPromise = undefined
        reject(new Error('Google sign-in could not be loaded'))
      }
    }
    script.onerror = () => {
      googleScriptPromise = undefined
      reject(new Error('Google sign-in could not be loaded'))
    }
    document.head.appendChild(script)
  })
  return googleScriptPromise
}

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export default function GoogleSignInButton({ onCredential, onError, disabled = false }) {
  const buttonRef = useRef(null)
  const callbackRef = useRef(onCredential)
  const errorRef = useRef(onError)
  const nonceRef = useRef('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  callbackRef.current = onCredential
  errorRef.current = onError

  useEffect(() => {
    let active = true
    if (!clientId) {
      setLoading(false)
      setMessage('Google sign-in is not configured.')
      return () => {
        active = false
      }
    }

    loadGoogleIdentityServices()
      .then(() => {
        if (!active || !buttonRef.current) return
        nonceRef.current = createNonce()
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: nonceRef.current,
          callback: async ({ credential }) => {
            if (!credential) {
              errorRef.current?.('Google did not return an identity token')
              return
            }
            setBusy(true)
            try {
              await callbackRef.current(credential, nonceRef.current)
            } catch (error) {
              errorRef.current?.(
                error.response?.data?.message || error.message || 'Google sign-in failed'
              )
            } finally {
              setBusy(false)
            }
          },
          auto_select: false,
        })
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: Math.min(buttonRef.current.clientWidth || 360, 400),
        })
        setLoading(false)
      })
      .catch((error) => {
        if (!active) return
        setLoading(false)
        setMessage(error.message)
      })

    return () => {
      active = false
      buttonRef.current?.replaceChildren()
    }
  }, [clientId])

  if (!clientId) {
    return (
      <div className="space-y-2">
        <button type="button" disabled className="btn-ghost w-full">
          Continue with Google
        </button>
        <p className="text-xs text-muted text-center">{message}</p>
      </div>
    )
  }

  return (
    <div className={disabled || busy ? 'pointer-events-none opacity-60' : ''}>
      <div ref={buttonRef} className="flex min-h-10 justify-center" aria-label="Continue with Google" />
      {(loading || busy || message) && (
        <p className="mt-2 text-center text-xs text-muted" role="status">
          {busy ? 'Waiting for Google…' : loading ? 'Loading Google sign-in…' : message}
        </p>
      )}
    </div>
  )
}
