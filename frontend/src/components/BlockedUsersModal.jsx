import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

export default function BlockedUsersModal({ isOpen, onClose, onChanged }) {
  const [blockedUsers, setBlockedUsers] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchBlockedUsers = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/user-api/blocked')
      setBlockedUsers(data.payload || [])
    } catch (error) {
      console.error(error)
      setBlockedUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined
    fetchBlockedUsers()
  }, [isOpen])

  const handleUnblock = async (userId) => {
    try {
      await api.post(`/user-api/unblock/${userId}`)
      await fetchBlockedUsers()
      await onChanged?.()
    } catch (error) {
      console.error(error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card surface-card w-full max-w-md p-6 slide-down">
        <h2 className="font-display text-2xl text-text mb-2">Blocked users</h2>
        <p className="text-sm text-text-secondary mb-6">People you have blocked. They can no longer send you new messages until you unblock them.</p>

        {loading ? (
          <div className="text-sm text-text-secondary">Loading…</div>
        ) : blockedUsers.length === 0 ? (
          <div className="text-sm text-text-secondary">No blocked users</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {blockedUsers.map((blockedUser) => (
              <div key={blockedUser.userId} className="flex items-center justify-between gap-3 rounded-2xl p-3 border border-line bg-raised">
                <div className="min-w-0">
                  <div className="font-medium text-text truncate">{blockedUser.name}</div>
                  <div className="font-mono text-xs text-muted truncate">{blockedUser.userId}</div>
                </div>
                <button onClick={() => handleUnblock(blockedUser.userId)} className="btn-ghost text-sm shrink-0">
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-6">
          <button onClick={onClose} className="btn-primary w-full">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
