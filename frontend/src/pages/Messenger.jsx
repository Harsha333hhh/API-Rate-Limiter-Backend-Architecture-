import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api, readRateLimitHeaders } from '../lib/api.js'
import RateLimitMeter from '../components/RateLimitMeter.jsx'
import Avatar from '../components/Avatar.jsx'
import ProfileModal from '../components/ProfileModal.jsx'
import CustomizationModal from '../components/CustomizationModal.jsx'

export default function Messenger() {
  const { user, logout, refresh } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState('')
  const [activeName, setActiveName] = useState('')
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [newId, setNewId] = useState('')
  const [rl, setRl] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [toast, setToast] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showCustomizationModal, setShowCustomizationModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const bottomRef = useRef(null)
  const menuRef = useRef(null)

  const loadConversations = async () => {
    try {
      const { data } = await api.get('/message-api/conversations')
      setConversations(data.payload)
    } catch (e) {
      console.error(e)
    }
  }

  const loadConversation = async (otherId) => {
    try {
      const { data } = await api.get(`/message-api/messages/${otherId}`)
      setMessages(data.payload)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    if (!activeId) return
    loadConversation(activeId)
    const t = setInterval(() => loadConversation(activeId), 12000)
    return () => clearInterval(t)
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (retryAfter <= 0) return
    const t = setInterval(() => {
      setRetryAfter((r) => {
        if (r <= 1) {
          setBlocked(false)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [retryAfter])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const startChat = async (e) => {
    e.preventDefault()
    const id = newId.trim().toLowerCase()
    if (!id) return
    if (id === user.userId) {
      showToast("That's your own ID")
      return
    }
    try {
      const { data } = await api.get(`/user-api/lookup/${id}`)
      setActiveId(data.payload.userId)
      setActiveName(data.payload.name)
      setNewId('')
      setRl(null)
      setBlocked(false)
      setRetryAfter(0)
    } catch (e) {
      showToast(e.response?.data?.message || 'No user with that ID')
    }
  }

  const openConversation = (c) => {
    setActiveId(c.userId)
    setActiveName(c.name)
    setRl(null)
    setBlocked(false)
    setRetryAfter(0)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!text.trim() || !activeId) return
    try {
      const res = await api.post('/message-api/messages', {
        receiverId: activeId,
        text: text.trim(),
      })
      setRl(readRateLimitHeaders(res))
      setBlocked(false)
      setText('')
      loadConversation(activeId)
      loadConversations()
    } catch (e) {
      if (e.response?.status === 429) {
        const headers = readRateLimitHeaders(e)
        const retry = Number(e.response.data?.retryAfterSeconds) || Number(headers.reset) || 5
        setRl(headers)
        setBlocked(true)
        setRetryAfter(retry)
        showToast('Rate limit hit — slow down')
      } else {
        showToast(e.response?.data?.message || 'Could not send')
      }
    }
  }

  const handleUpdateProfile = async (newName) => {
    setIsSaving(true)
    try {
      await api.patch('/user-api/me', { name: newName })
      await refresh()
      showToast('Profile updated')
    } catch (e) {
      throw e
    } finally {
      setIsSaving(false)
    }
  }

  const copyUserId = () => {
    navigator.clipboard.writeText(user.userId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 1500)
  }

  const handleLogout = async () => {
    await logout()
    setShowMenu(false)
  }

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Sidebar */}
      <aside className="w-80 border-r border-line bg-surface flex flex-col">
        {/* User block with menu */}
        <div className="p-5 border-b border-line" ref={menuRef}>
          <div className="font-display text-3xl text-text mb-4">Relay</div>

          {/* User clickable block */}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-full text-left p-3 rounded-lg hover:bg-raised transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="md" bgColor="bg-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-text truncate">{user.name}</div>
                <div className="text-xs text-muted font-mono truncate">{user.userId}</div>
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-muted transition transform ${showMenu ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div className="mt-2 space-y-1 slide-down">
              <button
                onClick={() => {
                  setShowProfileModal(true)
                  setShowMenu(false)
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-raised transition text-sm text-text"
              >
                👤 Profile
              </button>
              <button
                onClick={() => {
                  setShowCustomizationModal(true)
                  setShowMenu(false)
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-raised transition text-sm text-text"
              >
                🎨 Appearance
              </button>
              <button
                onClick={copyUserId}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-raised transition text-sm text-text flex items-center justify-between"
              >
                <span>📋 Copy ID</span>
                {copiedId && <span className="text-primary text-xs font-semibold checkmark-flash">✓</span>}
              </button>
              <div className="pt-1 border-t border-line" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-danger/5 hover:text-danger transition text-sm text-text"
              >
                👋 Logout
              </button>
            </div>
          )}
        </div>

        {/* Start new chat */}
        <form onSubmit={startChat} className="p-4 border-b border-line">
          <label className="label block mb-1.5">Message someone by ID</label>
          <div className="flex gap-2">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="e.g. a7k2p9"
              className="input font-mono text-sm"
            />
            <button
              type="submit"
              className="btn-primary px-3 text-sm"
            >
              Go
            </button>
          </div>
        </form>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-5 text-sm text-muted">
              No conversations yet. Enter someone's ID above to start.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.userId}
                onClick={() => openConversation(c)}
                className={`w-full text-left px-5 py-3.5 border-b border-line/50 hover:bg-raised transition ${
                  activeId === c.userId ? 'bg-primary/5 border-l-2 border-primary' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} size="sm" bgColor="bg-primary" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-sm text-text">{c.name}</span>
                    <div className="text-xs text-muted truncate">{c.lastMessage}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <svg className="w-16 h-16 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="font-display text-4xl text-text mb-2">Start a conversation</div>
              <p className="text-text-secondary">Enter a user's ID in the sidebar to begin.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface">
              <div className="flex items-center gap-4">
                <Avatar name={activeName} size="md" bgColor="bg-primary" />
                <div>
                  <div className="font-semibold text-text">{activeName}</div>
                  <div className="text-xs text-muted font-mono">{activeId}</div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3 bg-bg">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                      </svg>
                    </div>
                    <p className="text-text-secondary text-sm">Say hello to get started!</p>
                  </div>
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderId === user.userId
                  return (
                    <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'} fade-up`}>
                      <div
                        className={`max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                          mine
                            ? 'bg-sent text-white rounded-br-sm'
                            : 'bg-received text-text rounded-bl-sm'
                        }`}
                      >
                        {m.text}
                        <div className={`text-xs mt-1 font-mono ${mine ? 'text-white/60' : 'text-text-secondary'}`}>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Rate-limit meter */}
            <div className="px-6 pb-3 bg-surface border-t border-line">
              {rl && <RateLimitMeter rl={rl} blocked={blocked} retryAfter={retryAfter} />}
            </div>

            {/* Composer */}
            <form onSubmit={sendMessage} className="px-6 pb-6 bg-surface flex gap-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={blocked ? `Blocked — wait ${retryAfter}s` : 'Type a message…'}
                disabled={blocked}
                className={`input flex-1 ${blocked ? 'flash-red' : ''}`}
              />
              <button
                type="submit"
                disabled={blocked || !text.trim()}
                className="btn-primary px-6 text-sm transition-all"
              >
                Send
              </button>
            </form>
          </>
        )}
      </main>

      {/* Modals */}
      <ProfileModal
        isOpen={showProfileModal}
        user={user}
        onClose={() => setShowProfileModal(false)}
        onSave={handleUpdateProfile}
        isSaving={isSaving}
      />

      <CustomizationModal
        isOpen={showCustomizationModal}
        onClose={() => setShowCustomizationModal(false)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-line rounded-lg px-4 py-2.5 text-sm fade-up z-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
