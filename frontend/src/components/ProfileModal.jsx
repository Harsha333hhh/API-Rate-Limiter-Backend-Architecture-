import { useEffect, useState } from 'react'
import Avatar from './Avatar.jsx'

export default function ProfileModal({ isOpen, user, onClose, onSave, isSaving }) {
  const [name, setName] = useState(user?.name || '')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(user?.name || '')
      setError('')
    }
  }, [isOpen, user])

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
        </div>
      </div>
    </div>
  )
}
