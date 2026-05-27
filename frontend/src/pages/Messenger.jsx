import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api, readRateLimitHeaders } from '../lib/api.js'
import RateLimitMeter from '../components/RateLimitMeter.jsx'

export default function Messenger() {
  const { user, logout } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState('') // userId of the person we're chatting with
  const [activeName, setActiveName] = useState('')
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [newId, setNewId] = useState('') // for starting a new chat by ID
  const [rl, setRl] = useState(null) // last rate-limit header state
  const [blocked, setBlocked] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [toast, setToast] = useState('')
  const bottomRef = useRef(null)

  // load the list of conversations for the sidebar
  const loadConversations = async () => {
    try {
      const { data } = await api.get('/message-api/conversations')
      setConversations(data.payload)
    } catch (e) {
      console.error(e)
    }
  }

  // load one conversation's messages
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

  // poll the active conversation every 12s so incoming messages appear
  useEffect(() => {
    if (!activeId) return
    loadConversation(activeId)
    const t = setInterval(() => loadConversation(activeId), 12000)
    return () => clearInterval(t)
  }, [activeId])

  // scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // countdown for the retry timer when blocked
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

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // open a chat with a userId typed into the "new chat" box
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

  // open a chat from the sidebar
  const openConversation = (c) => {
    setActiveId(c.userId)
    setActiveName(c.name)
    setRl(null)
    setBlocked(false)
    setRetryAfter(0)
  }

  // send a message - this is where rate limiting is felt
  const sendMessage = async (e) => {
    e.preventDefault()
    if (!text.trim() || !activeId) return
    try {
      const res = await api.post('/message-api/messages', {
        receiverId: activeId,
        text: text.trim(),
      })
      // success - update the live rate-limit meter from the response headers
      setRl(readRateLimitHeaders(res))
      setBlocked(false)
      setText('')
      loadConversation(activeId)
      loadConversations()
    } catch (e) {
      if (e.response?.status === 429) {
        // BLOCKED by the rate limiter
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

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-80 border-r border-line bg-surface/60 flex flex-col">
        <div className="p-5 border-b border-line">
          <div className="font-display text-3xl">Relay</div>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <div className="text-sm">{user.name}</div>
              <div className="text-xs text-muted font-mono">
                your ID:{' '}
                <span
                  className="text-gold cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(user.userId)
                    showToast('ID copied')
                  }}
                  title="click to copy"
                >
                  {user.userId}
                </span>
              </div>
            </div>
            <button onClick={logout} className="text-xs text-muted hover:text-cream">
              Sign out
            </button>
          </div>
        </div>

        {/* start a new chat by ID */}
        <form onSubmit={startChat} className="p-4 border-b border-line">
          <label className="label block mb-1.5">Message someone by ID</label>
          <div className="flex gap-2">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="e.g. a7k2p9"
              className="input font-mono text-sm"
            />
            <button type="submit" className="btn-gold px-3">
              Go
            </button>
          </div>
        </form>

        {/* conversation list */}
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
                  activeId === c.userId ? 'bg-raised' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="text-xs text-muted font-mono">{c.userId}</span>
                </div>
                <div className="text-xs text-muted truncate mt-0.5">{c.lastMessage}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-muted">
            <div className="text-center">
              <div className="font-display text-4xl mb-2">Start a conversation</div>
              <p className="text-sm">Enter a user's ID in the sidebar to begin.</p>
            </div>
          </div>
        ) : (
          <>
            {/* header */}
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <div>
                <div className="font-display text-2xl">{activeName}</div>
                <div className="text-xs text-muted font-mono">{activeId}</div>
              </div>
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-muted text-sm mt-10">
                  No messages yet. Say hello.
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderId === user.userId
                  return (
                    <div
                      key={m._id}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'} fade-up`}
                    >
                      <div
                        className={`max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                          mine
                            ? 'bg-gold text-bg rounded-br-sm'
                            : 'bg-raised text-cream rounded-bl-sm'
                        }`}
                      >
                        {m.text}
                        <div
                          className={`text-[10px] mt-1 font-mono ${
                            mine ? 'text-bg/60' : 'text-muted'
                          }`}
                        >
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

            {/* live rate-limit meter */}
            <div className="px-6 pb-3">
              {rl && <RateLimitMeter rl={rl} blocked={blocked} retryAfter={retryAfter} />}
            </div>

            {/* composer */}
            <form onSubmit={sendMessage} className="px-6 pb-6 flex gap-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={blocked ? `Blocked — wait ${retryAfter}s` : 'Type a message…'}
                disabled={blocked}
                className={`input flex-1 ${blocked ? 'flash-red border-danger/50' : ''}`}
              />
              <button type="submit" disabled={blocked || !text.trim()} className="btn-gold px-6">
                Send
              </button>
            </form>
          </>
        )}
      </main>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-raised border border-line rounded-lg px-4 py-2.5 text-sm fade-up z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
