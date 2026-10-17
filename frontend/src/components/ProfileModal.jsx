import { useEffect, useState } from 'react'
import Avatar from './Avatar.jsx'
import { api } from '../lib/api.js'

export default function ProfileModal({
  isOpen,
  user,
  onClose,
  onSave,
  isSaving,
  onDeleteAccount,
  onPictureChanged,
}) {
  const [name, setName] = useState(user?.name || '')
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pictureFile, setPictureFile] = useState(null)
  const [picturePreview, setPicturePreview] = useState('')
  const [pictureBusy, setPictureBusy] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(user?.name || '')
      setError('')
    }
  }, [isOpen, user])

  useEffect(() => {
    if (!pictureFile) {
      setPicturePreview('')
      return undefined
    }
    const previewUrl = URL.createObjectURL(pictureFile)
    setPicturePreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [pictureFile])

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

  const handlePictureSelection = (event) => {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPictureFile(null)
      setError('Choose a JPEG, PNG, or WebP image')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPictureFile(null)
      setError('Profile pictures must be 2 MB or smaller')
      return
    }
    setError('')
    setPictureFile(file)
  }

  const handlePictureUpload = async () => {
    if (!pictureFile || pictureBusy) return
    setPictureBusy(true)
    setError('')
    try {
      await api.post('/user-api/me/profile-picture', pictureFile, {
        headers: { 'Content-Type': pictureFile.type },
      })
      setPictureFile(null)
      await onPictureChanged()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to upload profile picture')
    } finally {
      setPictureBusy(false)
    }
  }

  const handlePictureRemoval = async () => {
    if (pictureBusy) return
    setPictureBusy(true)
    setError('')
    try {
      await api.delete('/user-api/me/profile-picture')
      setPictureFile(null)
      await onPictureChanged()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to remove profile picture')
    } finally {
      setPictureBusy(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card surface-card w-full max-w-md p-6 slide-down">
        <h2 className="font-display text-2xl text-text mb-4">Edit profile</h2>

        <div className="space-y-4">
          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-line">
            <div className="relative h-16 w-16 shrink-0">
              {picturePreview ? (
                <img
                  src={picturePreview}
                  alt="Selected profile picture preview"
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <Avatar
                  name={name || 'U'}
                  size="lg"
                  userId={user?.userId}
                  profilePictureId={user?.profilePictureId}
                />
              )}
            </div>
            <div>
              <div className="text-sm text-muted">Display name</div>
              <div className="text-lg font-semibold text-text">{name || 'Unnamed'}</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="label block">Profile picture</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePictureSelection}
              disabled={pictureBusy}
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:font-medium file:text-primary"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePictureUpload}
                disabled={!pictureFile || pictureBusy}
                className="btn-primary flex-1"
              >
                {pictureBusy ? 'Saving picture…' : 'Upload picture'}
              </button>
              {user?.profilePictureId && (
                <button
                  type="button"
                  onClick={handlePictureRemoval}
                  disabled={pictureBusy}
                  className="btn-ghost flex-1"
                >
                  Remove picture
                </button>
              )}
            </div>
            <p className="text-xs text-muted">JPEG, PNG, or WebP; maximum 2 MB.</p>
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
            <div className="pt-4 border-t border-line">
              <div className="text-sm font-semibold text-red-600 mb-2">Danger zone</div>
              <div className="text-sm text-text-secondary mb-3">This action will delete your account. Past messages will remain but show as from 'Deleted user'.</div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="w-full rounded-2xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition px-4 py-2"
                >
                  Delete account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {confirmOpen && (
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
                className="flex-1 rounded-2xl bg-red-600 text-white hover:bg-red-700 transition px-4 py-2"
              >
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
