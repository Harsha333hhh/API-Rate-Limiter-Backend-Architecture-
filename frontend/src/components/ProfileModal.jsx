import { useEffect, useState } from 'react'
import Avatar from './Avatar.jsx'
import { api } from '../lib/api.js'

export default function ProfileModal({ isOpen, user, onClose, onSave, isSaving, onDeleteAccount }) {
  const [name, setName] = useState(user?.name || '')
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState([])
  const [loadingBlocked, setLoadingBlocked] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(user?.name || '')
      setError('')
      fetchBlocked()
    }
  }, [isOpen, user])

  const fetchBlocked = async () => {
    setLoadingBlocked(true)
    try {
      const { data } = await api.get('/user-api/blocked')
      setBlocked(data.payload || [])
    } catch (e) {
      setBlocked([])
    } finally {
      setLoadingBlocked(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty')
      return
    }
    try {
      await onSave(name)
      setError('')
      onClose()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update profile')
    }
  }

  const handleUnblock = async (userId) => {
    try {
      await api.post(`/user-api/unblock/${userId}`)
      await fetchBlocked()
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      await api.delete('/user-api/me')
      // Notify parent to clear auth state and redirect
      if (typeof onDeleteAccount === 'function') {
        try {
          await onDeleteAccount()
        } catch {}
      } else {
        window.location.href = '/'
      }
    } catch (e) {
      console.error(e)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card surface-card w-full max-w-md p-6 slide-down">
        <h2 className="font-display text-2xl text-text mb-4">Edit profile</h2>

        <div className="space-y-4">
          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-line">
            <Avatar name={name || 'U'} size="lg" />
            <div>
              <div className="text-sm text-muted">Display name</div>
              <div className="text-lg font-semibold text-text">{name || 'Unnamed'}</div>
            </div>
          </div>

          <div>
            <label className="label block mb-2">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your display name"
              className="input"
              maxLength={50}
            />
            <div className="text-xs text-muted mt-1">{name.length}/50 characters</div>
          </div>

          {error && (
            <div className="text-danger text-sm border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="btn-ghost flex-1"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn-primary flex-1"
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="mt-6 border-t border-line pt-4 space-y-3">
            <div>
              <div className="text-sm text-muted mb-2">Blocked users</div>
              {loadingBlocked ? (
                <div className="text-sm text-text-secondary">Loading…</div>
              ) : blocked.length === 0 ? (
                <div className="text-sm text-text-secondary">No blocked users</div>
              ) : (
                <div className="space-y-2">
                  {blocked.map((b) => (
                    <div key={b.userId} className="flex items-center justify-between gap-3 rounded-md p-2 border border-line bg-raised">
                      <div>
                        <div className="font-medium text-text">{b.name}</div>
                        <div className="font-mono text-xs text-muted">{b.userId}</div>
                      </div>
                      <div>
                        <button onClick={() => handleUnblock(b.userId)} className="btn-ghost text-sm">Unblock</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-line">
              <div className="text-sm font-semibold text-red-600 mb-2">Danger zone</div>
              <div className="text-sm text-text-secondary mb-3">This action will delete your account. Past messages will remain but show as from 'Deleted user'.</div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmOpen(true)} className="btn-danger w-full">Delete account</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // confirmation modal
  if (confirmOpen) {
    return (
      <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center z-60 px-4">
        <div className="card surface-card w-full max-w-md p-6 slide-down">
          <h2 className="font-display text-2xl text-text mb-4">Delete your account?</h2>
          <p className="text-text-secondary mb-6">This will permanently delete your account. Your past messages will remain in others' conversations, but shown as from 'Deleted user'. This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button
              onClick={async () => {
                await handleDeleteAccount()
              }}
              className="btn-danger flex-1"
            >
              Delete account
            </button>
          </div>
        </div>
      </div>
    )
  }
}
