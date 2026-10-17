import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { api, readRateLimitHeaders } from '../lib/api.js'
import RateLimitMeter from '../components/RateLimitMeter.jsx'
import Avatar from '../components/Avatar.jsx'
import ProfileModal from '../components/ProfileModal.jsx'
import CustomizationModal from '../components/CustomizationModal.jsx'
import BlockedUsersModal from '../components/BlockedUsersModal.jsx'
import {
  createConversationKeyMaterial,
  decryptMessageCopy,
  encryptMessageCopies,
  rewrapConversationPrivateKeyEnvelope,
  unlockConversationPrivateKey,
  validatePin,
} from '../lib/conversationCrypto.js'
import {
  cacheConversationPrivateKey,
  clearCachedConversationPrivateKeys,
  deleteCachedConversationPrivateKey,
  getCachedConversationPrivateKey,
} from '../lib/conversationKeyStore.js'

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" strokeLinecap="round" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M15.5 17H8.5a2.5 2.5 0 0 1-2.5-2.5v-3A6 6 0 0 1 12 5.5a6 6 0 0 1 6 6v3a2.5 2.5 0 0 1-2.5 2.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 17a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  )
}

function SunMoonIcon({ theme }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12.2A8.8 8.8 0 1 1 11.8 3 7 7 0 0 0 21 12.2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 18.5A6.5 6.5 0 1 1 18.5 12 6.5 6.5 0 0 1 12 18.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" strokeLinecap="round" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 9.5V8a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MenuIcon({ type }) {
  if (type === 'profile') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 19a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'custom') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 4.5v15" strokeLinecap="round" />
        <path d="M4.5 12h15" strokeLinecap="round" />
        <path d="M12 4.5c2.2 0 4 1.8 4 4s-1.8 4-4 4-4 1.8-4 4 1.8 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'blocked') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 7h8M8 12h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 5.5h11A1.5 1.5 0 0 1 19 7v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17V7A1.5 1.5 0 0 1 6.5 5.5Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 17l-1 4h9a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H9l1 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12h11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m7 8 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clampPreview(text, limit = 72) {
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

export default function Messenger() {
  const { user, logout, refresh } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [conversations, setConversations] = useState([])
  const [unreadInfo, setUnreadInfo] = useState({ counts: {}, total: 0, recent: [] })
  const [activeId, setActiveId] = useState('')
  const [activeName, setActiveName] = useState('')
  const [activeProfilePictureId, setActiveProfilePictureId] = useState(null)
  const [messages, setMessages] = useState([])
  const [protection, setProtection] = useState({ own: null, peer: null })
  const [protectionBusy, setProtectionBusy] = useState(false)
  const [protectionError, setProtectionError] = useState('')
  const [conversationSettingsOpen, setConversationSettingsOpen] = useState(false)
  const [text, setText] = useState('')
  const [searchId, setSearchId] = useState('')
  const [rl, setRl] = useState(null)
  const [rateLimitExplanation, setRateLimitExplanation] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState([])
  const [retryAfter, setRetryAfter] = useState(0)
  const [toast, setToast] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showCustomizationModal, setShowCustomizationModal] = useState(false)
  const [showBlockedUsersModal, setShowBlockedUsersModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadOpen, setUnreadOpen] = useState(false)
  const [openMenuFor, setOpenMenuFor] = useState(null)
  const [mobileView, setMobileView] = useState('list')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const desktopMenuRef = useRef(null)
  const mobileMenuRef = useRef(null)
  const unreadMenuRef = useRef(null)
  const unreadButtonRef = useRef(null)
  const protectionRef = useRef({ own: null, peer: null })
  const privateKeyRef = useRef(null)
  const conversationViewVersionRef = useRef(0)
  const activeConversationIdRef = useRef('')

  const updateProtection = (value) => {
    protectionRef.current = value
    setProtection(value)
  }

  const loadConversations = async () => {
    try {
      const { data } = await api.get('/message-api/conversations')
      setConversations(data.payload || [])
    } catch (error) {
      console.error(error)
    }
  }

  const loadUnread = async () => {
    try {
      const { data } = await api.get('/message-api/unread')
      setUnreadInfo(data.payload || { counts: {}, total: 0, recent: [] })
    } catch (error) {
      console.error(error)
    }
  }

  const loadBlockedUsers = async () => {
    try {
      const { data } = await api.get('/user-api/blocked')
      setBlockedUsers(data.payload || [])
    } catch (error) {
      console.error(error)
    }
  }

  const loadConversation = async (otherId) => {
    const viewVersion = conversationViewVersionRef.current
    try {
      const { data } = await api.get(`/message-api/messages/${otherId}`)
      const ownProtection = protectionRef.current.own
      let privateKey = privateKeyRef.current
      if (
        ownProtection?.status === 'protected' &&
        ownProtection.enabled === false &&
        !privateKey
      ) {
        privateKey = await getCachedConversationPrivateKey(user.userId, otherId)
        if (
          privateKey &&
          viewVersion === conversationViewVersionRef.current &&
          activeConversationIdRef.current === otherId
        ) {
          privateKeyRef.current = privateKey
        }
      }
      const loadedMessages = await Promise.all(
        (data.payload || []).map(async (message) => {
          if (!message.protectedCopy) return message
          if (ownProtection?.status !== 'protected' || !privateKey) {
            return { ...message, text: message.protectedCopy.ciphertext }
          }
          try {
            return { ...message, text: await decryptMessageCopy(message.protectedCopy, privateKey) }
          } catch {
            return { ...message, text: '[Protected message could not be decrypted]' }
          }
        })
      )
      if (
        viewVersion !== conversationViewVersionRef.current ||
        activeConversationIdRef.current !== otherId
      ) return
      setMessages(loadedMessages)
    } catch (error) {
      if (error.response?.data?.code === 'PROTECTION_SYNC_REQUIRED' && privateKeyRef.current) {
        try {
          await synchronizeProtectedHistory(otherId)
        } catch (syncError) {
          if (
            viewVersion !== conversationViewVersionRef.current ||
            activeConversationIdRef.current !== otherId
          ) return
          console.error(syncError)
          setMessages([{ _id: 'protection-sync-error', text: '[Protected messages need synchronization]', createdAt: new Date() }])
        }
      } else if (error.response?.data?.code !== 'PROTECTION_MIGRATION_PENDING') {
        if (
          viewVersion !== conversationViewVersionRef.current ||
          activeConversationIdRef.current !== otherId
        ) return
        console.error(error)
        if (error.response?.data?.code === 'PROTECTION_SYNC_REQUIRED') {
          setMessages([{ _id: 'protection-sync', text: '[Unlock to synchronize protected messages]', createdAt: new Date() }])
        }
      } else {
        if (
          viewVersion !== conversationViewVersionRef.current ||
          activeConversationIdRef.current !== otherId
        ) return
        setMessages([{ _id: 'protection-migration', text: '[Unlock to continue conversation history migration]', createdAt: new Date() }])
      }
    }
  }

  const loadProtection = async (otherId) => {
    const { data } = await api.get(`/conversation-api/${otherId}/protection`)
    const value = { own: data.own || null, peer: data.peer || null }
    if (activeConversationIdRef.current === otherId) updateProtection(value)
    return value
  }

  const synchronizeProtectedHistory = async (otherId, ownSetting = protectionRef.current.own) => {
    if (!ownSetting || !['migrating', 'protected'].includes(ownSetting.status)) {
      throw new Error('Protected conversation settings are unavailable')
    }
    setProtectionBusy(true)
    setProtectionError('')
    const viewVersion = conversationViewVersionRef.current
    try {
      while (true) {
        const { data } = await api.get(`/conversation-api/${otherId}/protection/migration-source`)
        const batch = data.payload || []
        if (batch.length === 0) break
        const copies = []
        for (const message of batch) {
          if (typeof message.text !== 'string') {
            throw new Error('History contains a message without recoverable plaintext')
          }
          const [protectedCopy] = await encryptMessageCopies(message.text, [
            { userId: user.userId, publicKey: ownSetting.publicKey },
          ])
          copies.push({ messageId: message._id, protectedCopy })
        }
        for (let offset = 0; offset < copies.length; offset += 2) {
          await api.post(`/conversation-api/${otherId}/protection/migrate`, {
            copies: copies.slice(offset, offset + 2),
          })
        }
      }
      if (ownSetting.status === 'migrating') {
        await api.post(`/conversation-api/${otherId}/protection/complete`)
      }
      const updated = await loadProtection(otherId)
      if (
        viewVersion === conversationViewVersionRef.current &&
        activeConversationIdRef.current === otherId
      ) {
        await loadConversation(otherId)
      }
      return updated
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Could not synchronize protected conversation history'
      setProtectionError(message)
      throw error
    } finally {
      setProtectionBusy(false)
    }
  }

  const enableConversationProtection = async () => {
    if (!activeId || protectionBusy) return
    const targetId = activeId
    const viewVersion = conversationViewVersionRef.current
    const warning = 'If you lose this PIN, protected messages cannot be recovered. This is personal protection, not end-to-end encryption. Existing history will be encrypted in batches before PIN setup completes. Continue?'
    if (!window.confirm(warning)) return

    const pin = window.prompt('Create a PIN (8–128 characters). Do not reuse a password.')
    if (!validatePin(pin)) {
      showToast('PIN must be between 8 and 128 characters')
      return
    }
    const confirmation = window.prompt('Confirm your PIN')
    if (pin !== confirmation) {
      showToast('PIN confirmation did not match')
      return
    }

    setProtectionBusy(true)
    setProtectionError('')
    try {
      const keyMaterial = await createConversationKeyMaterial(pin)
      await api.post(`/conversation-api/${targetId}/protection`, {
        publicKey: keyMaterial.publicKey,
        privateKeyEnvelope: keyMaterial.privateKeyEnvelope,
      })
      if (
        viewVersion === conversationViewVersionRef.current &&
        activeConversationIdRef.current === targetId
      ) {
        privateKeyRef.current = keyMaterial.privateKey
      }
      const updated = await loadProtection(targetId)
      await synchronizeProtectedHistory(targetId, updated.own)
      await cacheConversationPrivateKey(user.userId, targetId, keyMaterial.privateKey)
      showToast('PIN set up. Chat Protection is OFF.')
    } catch (error) {
      setProtectionError(error.response?.data?.message || error.message || 'Could not set up conversation PIN')
      showToast(error.response?.data?.message || error.message || 'Could not set up conversation PIN')
    } finally {
      setProtectionBusy(false)
    }
  }

  const unlockConversation = async () => {
    if (!activeId || protectionBusy || !protection.own?.privateKeyEnvelope) return
    const targetId = activeId
    const pin = window.prompt('Enter your conversation PIN')
    if (pin === null) return
    setProtectionBusy(true)
    setProtectionError('')
    conversationViewVersionRef.current += 1
    const viewVersion = conversationViewVersionRef.current
    try {
      const unlockedKey = await unlockConversationPrivateKey(protection.own.privateKeyEnvelope, pin)
      if (
        viewVersion !== conversationViewVersionRef.current ||
        activeConversationIdRef.current !== targetId
      ) return
      privateKeyRef.current = unlockedKey
      if (protection.own.status === 'migrating') {
        await synchronizeProtectedHistory(targetId, protection.own)
      }
      if (protection.own.enabled === false) {
        await cacheConversationPrivateKey(user.userId, targetId, unlockedKey)
      }
      await loadConversation(targetId)
    } catch (error) {
      if (
        viewVersion !== conversationViewVersionRef.current ||
        activeConversationIdRef.current !== targetId
      ) return
      conversationViewVersionRef.current += 1
      privateKeyRef.current = null
      setProtectionError(error.response?.data?.message || error.message || 'Could not unlock conversation')
      showToast(error.response?.data?.message || error.message || 'Could not unlock conversation')
    } finally {
      setProtectionBusy(false)
    }
  }

  const changeConversationPin = async () => {
    if (!activeId || !protection.own?.privateKeyEnvelope || protectionBusy) return
    const currentPin = window.prompt('Enter your current conversation PIN')
    if (currentPin === null) return
    const newPin = window.prompt('Enter a new PIN (8–128 characters)')
    if (newPin === null) return
    if (!validatePin(newPin)) {
      showToast('PIN must be between 8 and 128 characters')
      return
    }
    const confirmation = window.prompt('Confirm your new PIN')
    if (newPin !== confirmation) {
      showToast('PIN confirmation did not match')
      return
    }
    setProtectionBusy(true)
    try {
      const privateKeyEnvelope = await rewrapConversationPrivateKeyEnvelope(
        protection.own.privateKeyEnvelope,
        currentPin,
        newPin
      )
      await api.patch(`/conversation-api/${activeId}/protection/key-envelope`, { privateKeyEnvelope })
      await loadProtection(activeId)
      showToast('Conversation PIN changed')
    } catch (error) {
      showToast(error.response?.data?.message || error.message || 'Could not change PIN')
    } finally {
      setProtectionBusy(false)
    }
  }

  const lockConversation = async () => {
    const targetId = activeId
    const keyToRestore = privateKeyRef.current
    conversationViewVersionRef.current += 1
    privateKeyRef.current = null
    setText('')
    setMessages((current) =>
      current.map((message) =>
        message.protectedCopy ? { ...message, text: message.protectedCopy.ciphertext } : message
      )
    )
    setConversationSettingsOpen(false)
    if (targetId && user?.userId) {
      try {
        await deleteCachedConversationPrivateKey(user.userId, targetId)
      } catch (error) {
        privateKeyRef.current = keyToRestore
        if (keyToRestore) await loadConversation(targetId)
        const message = error.message || 'Could not clear the cached conversation key; conversation remains unlocked'
        setProtectionError(message)
        showToast(message)
      }
    }
  }

  const setConversationProtectionEnabled = async (enabled) => {
    if (!activeId || protectionBusy || protection.own?.status !== 'protected') return
    const targetId = activeId
    let keyToRestore = privateKeyRef.current
    let keyForOff
    let settingSaved = false
    setProtectionBusy(true)
    setProtectionError('')
    try {
      if (enabled) {
        if (!keyToRestore) {
          keyToRestore = await getCachedConversationPrivateKey(user.userId, targetId)
        }
        await deleteCachedConversationPrivateKey(user.userId, targetId)
      } else {
        keyForOff = privateKeyRef.current
        if (!keyForOff) {
          keyForOff = await getCachedConversationPrivateKey(user.userId, targetId)
          if (!keyForOff) {
            const pin = window.prompt('Enter your conversation PIN to turn protection off')
            if (pin === null) return
            keyForOff = await unlockConversationPrivateKey(protection.own.privateKeyEnvelope, pin)
          }
        }
        await cacheConversationPrivateKey(user.userId, targetId, keyForOff)
      }

      if (enabled) {
        if (activeConversationIdRef.current === targetId) {
          conversationViewVersionRef.current += 1
          privateKeyRef.current = null
          setText('')
          setMessages((current) =>
            current.map((message) =>
              message.protectedCopy ? { ...message, text: message.protectedCopy.ciphertext } : message
            )
          )
        }
      }
      await api.patch(`/conversation-api/${targetId}/protection/enabled`, { enabled })
      settingSaved = true
      if (activeConversationIdRef.current === targetId) {
        const updated = {
          ...protectionRef.current,
          own: { ...protectionRef.current.own, enabled },
        }
        updateProtection(updated)
        if (!enabled) {
          privateKeyRef.current = keyForOff
          await loadConversation(targetId)
        }
      }
      showToast(`Chat Protection is ${enabled ? 'ON' : 'OFF'}`)
    } catch (error) {
      if (enabled && !settingSaved && keyToRestore) {
        try {
          await cacheConversationPrivateKey(user.userId, targetId, keyToRestore)
          privateKeyRef.current = keyToRestore
          await loadConversation(targetId)
        } catch (cacheError) {
          setProtectionError(cacheError.message || 'Could not restore the device key cache')
        }
      } else if (!enabled && !settingSaved) {
        try {
          await deleteCachedConversationPrivateKey(user.userId, targetId)
          privateKeyRef.current = null
        } catch (cacheError) {
          setProtectionError(cacheError.message || 'Could not remove the uncommitted device key cache')
        }
      }
      setProtectionError(error.response?.data?.message || error.message || 'Could not update chat protection')
      showToast(error.response?.data?.message || error.message || 'Could not update chat protection')
    } finally {
      setProtectionBusy(false)
    }
  }

  const markConversationRead = async (otherId) => {
    try {
      await api.patch(`/message-api/messages/read/${otherId}`)
    } catch (error) {
      console.error(error)
    }
  }

  const refreshDashboard = async () => {
    await Promise.all([loadConversations(), loadUnread(), loadBlockedUsers()])
  }

  const resetConversationView = () => {
    conversationViewVersionRef.current += 1
    activeConversationIdRef.current = ''
    privateKeyRef.current = null
    updateProtection({ own: null, peer: null })
    setActiveId('')
    setActiveName('')
    setActiveProfilePictureId(null)
    setMessages([])
    setText('')
    setRl(null)
    setRateLimitExplanation('')
    setBlocked(false)
    setRetryAfter(0)
    setMobileView('list')
  }

  const handleBlockUser = async (userId) => {
    try {
      await api.post(`/user-api/block/${userId}`)
      await refreshDashboard()
      setOpenMenuFor(null)
      showToast('User blocked')
    } catch (error) {
      console.error(error)
      setOpenMenuFor(null)
      showToast(error.response?.data?.message || 'Could not block user')
    }
  }

  const handleUnblockUser = async (userId) => {
    try {
      await api.post(`/user-api/unblock/${userId}`)
      await refreshDashboard()
      setOpenMenuFor(null)
      showToast('User unblocked')
    } catch (error) {
      console.error(error)
      setOpenMenuFor(null)
      showToast(error.response?.data?.message || 'Could not unblock user')
    }
  }

  const handleDeleteChat = async (userId) => {
    try {
      await api.delete(`/message-api/conversations/${userId}`)
      // Optimistically remove from UI immediately
      setConversations((prev) => prev.filter((c) => c.userId !== userId))
      await refreshDashboard()
      if (activeId === userId) {
        resetConversationView()
      }
      setOpenMenuFor(null)
    } catch (error) {
      console.error(error)
      setOpenMenuFor(null)
    }
  }

  useEffect(() => {
    conversationViewVersionRef.current += 1
    activeConversationIdRef.current = ''
    privateKeyRef.current = null
    updateProtection({ own: null, peer: null })
    setActiveId('')
    setActiveProfilePictureId(null)
    setMessages([])
  }, [user?.userId])

  useEffect(() => {
    refreshDashboard()
  }, [])

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshDashboard()
    }, 11000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      setMobileView('list')
      return undefined
    }

    if (window.innerWidth < 768) {
      setMobileView('chat')
    }

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)

    const syncConversation = async () => {
      try {
        await loadProtection(activeId)
      } catch (error) {
        console.error(error)
      }
      await markConversationRead(activeId)
      await Promise.all([loadConversation(activeId), loadConversations(), loadUnread()])
    }

    syncConversation()
    const intervalId = setInterval(syncConversation, 12000)
    return () => {
      clearTimeout(focusTimer)
      clearInterval(intervalId)
    }
  }, [activeId])

  useEffect(() => {
    if (!menuOpen) return undefined

    const handleClickOutside = (event) => {
      const desktopPanel = desktopMenuRef.current
      const mobilePanel = mobileMenuRef.current
      if (desktopPanel?.contains(event.target) || mobilePanel?.contains(event.target)) return
      setMenuOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  useEffect(() => {
    if (!openMenuFor) return undefined

    const handleClickOutsideMenu = (event) => {
      const menu = document.querySelector('[data-menu-open]')
      if (!menu || menu.contains(event.target)) return
      setOpenMenuFor(null)
    }

    document.addEventListener('mousedown', handleClickOutsideMenu)
    return () => document.removeEventListener('mousedown', handleClickOutsideMenu)
  }, [openMenuFor])

  const navigate = useNavigate()

  const handleAccountDelete = async () => {
    try {
      await clearCachedConversationPrivateKeys(user.userId)
      privateKeyRef.current = null
      setMessages([])
      setConversations([])
      setText('')
      await logout()
    } catch (e) {
      showToast(e.message || 'Could not clear protected keys before logout')
      return
    }
    setShowProfileModal(false)
    navigate('/')
  }

  useEffect(() => {
    const handleUnreadOutside = (event) => {
      if (!unreadOpen) return
      const menu = unreadMenuRef.current
      const button = unreadButtonRef.current
      if (menu?.contains(event.target) || button?.contains(event.target)) return
      setUnreadOpen(false)
    }

    document.addEventListener('mousedown', handleUnreadOutside)
    return () => document.removeEventListener('mousedown', handleUnreadOutside)
  }, [unreadOpen])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && activeId) {
        setMobileView('chat')
      }
      if (window.innerWidth >= 768 && !activeId) {
        setMobileView('list')
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (retryAfter <= 0) return undefined
    const intervalId = setInterval(() => {
      setRetryAfter((value) => {
        if (value <= 1) {
          setBlocked(false)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(intervalId)
  }, [retryAfter])

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2500)
  }

  const openConversation = (conversation) => {
    conversationViewVersionRef.current += 1
    activeConversationIdRef.current = conversation.userId
    privateKeyRef.current = null
    updateProtection({ own: null, peer: null })
    setMessages([])
    setActiveId(conversation.userId)
    setActiveName(conversation.name)
    setActiveProfilePictureId(conversation.profilePictureId || null)
    setSearchId('')
    setRl(null)
    setRateLimitExplanation('')
    setBlocked(false)
    setRetryAfter(0)
    setUnreadOpen(false)
    setMenuOpen(false)
    setConversationSettingsOpen(false)
    setMobileView('chat')
  }

  const openBlockedUsersModal = async () => {
    await loadBlockedUsers()
    setShowBlockedUsersModal(true)
  }

  const searchConversation = async (event) => {
    event.preventDefault()
    const id = searchId.trim().toLowerCase()
    if (!id) return
    if (id === user.userId) {
      showToast("That's your own ID")
      return
    }

    try {
      const { data } = await api.get(`/user-api/lookup/${id}`)
      openConversation(data.payload)
    } catch (error) {
      showToast(error.response?.data?.message || 'No user with that ID')
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    if (blocked || !text.trim() || !activeId) return

    try {
      const currentProtection = protectionRef.current
      const recipients = [
        ...(currentProtection.own
          ? [{ userId: user.userId, publicKey: currentProtection.own.publicKey }]
          : []),
        ...(currentProtection.peer
          ? [{ userId: activeId, publicKey: currentProtection.peer.publicKey }]
          : []),
      ]
      const protectedCopies = recipients.length
        ? await encryptMessageCopies(text.trim(), recipients)
        : []
      const response = await api.post('/message-api/messages', {
        receiverId: activeId,
        ...(protectedCopies.length === 2 ? {} : { text: text.trim() }),
        protectedCopies,
      })
      setRl(readRateLimitHeaders(response))
      setRateLimitExplanation('')
      setBlocked(false)
      setText('')
      await Promise.all([loadConversation(activeId), loadConversations(), loadUnread()])
      inputRef.current?.focus()
    } catch (error) {
      if (error.response?.status === 429) {
        const headers = readRateLimitHeaders(error)
        const retryFromBody = Number(error.response.data?.retryAfterSeconds)
        const retryFromHeader = Number(headers.reset)
        const retryValue = Number.isFinite(retryFromBody)
          ? retryFromBody
          : retryFromHeader
        const retry = Number.isFinite(retryValue) && retryValue > 0 ? Math.ceil(retryValue) : 0
        setRl(headers)
        setRateLimitExplanation(
          error.response.data?.message || 'The server rejected this request because its configured rate limit was reached.'
        )
        setBlocked(retry > 0)
        setRetryAfter(retry)
        showToast(error.response.data?.message || 'Rate limit reached. Please try again later.')
        inputRef.current?.focus()
      } else {
        showToast(error.response?.data?.message || 'Could not send')
      }
    }
  }

  const handleUpdateProfile = async (newName) => {
    setIsSaving(true)
    try {
      await api.patch('/user-api/me', { name: newName })
      await refresh()
      showToast('Profile updated')
    } finally {
      setIsSaving(false)
    }
  }

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(user.userId)
      setCopiedId(true)
      window.setTimeout(() => setCopiedId(false), 1500)
      showToast('User ID copied')
    } catch {
      showToast('Could not copy ID')
    }
  }

  const handleLogout = async () => {
    try {
      await clearCachedConversationPrivateKeys(user.userId)
      privateKeyRef.current = null
      setMessages([])
      setConversations([])
      setText('')
      await logout()
      setUnreadOpen(false)
      setMenuOpen(false)
    } catch (error) {
      showToast(error.message || 'Could not clear protected keys before logout')
    }
  }

  const unreadCounts = unreadInfo.counts || {}
  const unreadRecent = unreadInfo.recent || []
  const totalUnread = unreadInfo.total || 0
  const isConversationBlocked = blockedUsers.some((person) => person.userId === activeId)

  const renderMenuContent = () => (
    <div className="space-y-3">
      <button
        onClick={() => setMenuOpen((value) => !value)}
        className="w-full text-left rounded-3xl border border-line bg-raised hover:bg-primary-soft transition p-4"
      >
        <div className="flex items-center gap-3">
          <Avatar
            name={user.name}
            size="md"
            userId={user.userId}
            profilePictureId={user.profilePictureId}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-text truncate">{user.name}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-text-secondary">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-muted truncate">{user.userId}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    copyUserId()
                  }}
                  className="inline-flex items-center justify-center text-muted hover:text-primary transition"
                  aria-label="Copy user ID"
                >
                  <CopyIcon />
                </button>
              </div>
              <span className={`text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </div>
        {copiedId && <div className="mt-3 text-xs font-semibold text-primary">Copied</div>}
      </button>

      {menuOpen && (
        <div className="rounded-3xl border border-line bg-surface shadow-soft overflow-hidden bob-in">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-line hover:bg-primary-soft transition"
          >
            <span className="flex items-center gap-3 font-medium text-text">
              <SunMoonIcon theme={theme} />
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </span>
            <span className={`relative h-7 w-12 rounded-full border transition ${theme === 'dark' ? 'bg-primary border-primary' : 'bg-surface border-line'}`}>
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </span>
          </button>

          <button
            onClick={() => setShowProfileModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-line text-left hover:bg-primary-soft transition"
          >
            <MenuIcon type="profile" />
            <span className="font-medium text-text">Profile</span>
          </button>

          {user.role === 'admin' && (
            <>
              <Link
                to="/rate-limit-dashboard"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-line text-left hover:bg-primary-soft transition"
              >
                <span className="font-medium text-text">Rate-Limit Dashboard</span>
              </Link>
              <Link
                to="/server-health"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-line text-left hover:bg-primary-soft transition"
              >
                <span className="font-medium text-text">View Server Health</span>
              </Link>
            </>
          )}

          <button
            onClick={() => setShowCustomizationModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-line text-left hover:bg-primary-soft transition"
          >
            <MenuIcon type="custom" />
            <span className="font-medium text-text">Customization</span>
          </button>

          <button
            onClick={openBlockedUsersModal}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-line text-left hover:bg-primary-soft transition"
          >
            <MenuIcon type="blocked" />
            <span className="font-medium text-text">Blocked users</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-500/5 hover:text-red-600 transition"
          >
            <MenuIcon type="logout" />
            <span className="font-medium text-text">Logout</span>
          </button>
        </div>
      )}
    </div>
  )

  const renderConversationList = ({ mobile = false } = {}) => (
    <>
      <div className={`${mobile ? 'p-4' : 'p-5 border-b border-line'} space-y-5`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
              <path d="M7.5 16.5V8.25A2.25 2.25 0 0 1 9.75 6h4.5A2.25 2.25 0 0 1 16.5 8.25v4.5A2.25 2.25 0 0 1 14.25 15H11l-3.5 3.5v-2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className={`font-display tracking-tight ${mobile ? 'text-lg' : 'text-xl'}`}>Whisper</div>
            <div className="text-xs uppercase tracking-[0.24em] text-muted">Conversations</div>
          </div>
          {mobile && (
            <button
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-raised text-text"
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>
          )}
        </div>

        <form onSubmit={searchConversation} className="space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              <SearchIcon />
            </span>
            <input
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Search by user ID..."
              className="input pl-10 font-mono text-sm"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Open conversation
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-5 text-sm text-text-secondary leading-6">
            No conversations yet. Search by user ID to start one.
          </div>
        ) : (
          conversations.map((conversation) => {
            const unreadCount = Number(unreadCounts[conversation.userId]) || 0
            const isActive = activeId === conversation.userId
            return (
              <div
                key={conversation.userId}
                className={`w-full text-left px-4 md:px-5 py-4 border-b border-line/70 transition-all duration-200 hover:bg-raised flex items-start gap-3 relative ${
                  isActive ? 'bg-primary-soft border-l-2 border-primary' : ''
                }`}
              >
                <button
                  onClick={() => openConversation(conversation)}
                  className="flex items-start gap-3 flex-1 text-left"
                  style={{ background: 'transparent', border: 0 }}
                >
                  <Avatar
                    name={conversation.name}
                    size="sm"
                    userId={conversation.userId}
                    profilePictureId={conversation.profilePictureId}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-semibold text-sm text-text truncate">{conversation.name}</span>
                      {blockedUsers.some((p) => p.userId === conversation.userId) && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Blocked</span>
                      )}
                      <span className="font-mono text-[11px] text-muted truncate">{conversation.userId}</span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary truncate">{clampPreview(conversation.lastMessage)}</p>
                  </div>
                </button>

                <div className="flex items-center gap-2 pl-2">
                  {unreadCount > 0 && (
                    <div className="pt-1">
                      {unreadCount === 1 ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
                      ) : (
                        <span className="inline-flex items-center justify-center min-w-6 h-6 rounded-full px-2 text-[11px] font-semibold text-white bg-primary">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="relative" data-menu-for={conversation.userId}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuFor((v) => (v === conversation.userId ? null : conversation.userId))
                      }}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-text transition"
                      aria-label="More options"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 24a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {openMenuFor === conversation.userId && (
                      <div data-menu-open className="absolute right-0 mt-2 w-40 rounded-2xl border border-line bg-surface shadow-soft z-40">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            await handleDeleteChat(conversation.userId)
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-primary-soft transition"
                        >
                          Delete chat
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            const rowIsBlocked = blockedUsers.some((p) => p.userId === conversation.userId)
                            if (rowIsBlocked) {
                              await handleUnblockUser(conversation.userId)
                              return
                            }
                            await handleBlockUser(conversation.userId)
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-primary-soft transition text-text"
                        >
                          {blockedUsers.some((p) => p.userId === conversation.userId) ? 'Unblock user' : 'Block user'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )

  const renderChatArea = ({ mobile = false } = {}) => (
    <>
      <header className={`${mobile ? 'px-4' : 'px-5 md:px-6'} py-4 border-b border-line bg-surface/90 backdrop-blur-sm flex items-center justify-between gap-3 relative`}>
        <div className="min-w-0 flex items-center gap-3">
          {mobile && (
            <button
              onClick={() => setMobileView('list')}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-raised text-text"
              aria-label="Back to conversations"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {activeId && (
            <Avatar
              name={activeName}
              size="sm"
              userId={activeId}
              profilePictureId={activeProfilePictureId}
            />
          )}
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.24em] text-muted mb-1">Current chat</div>
            {activeId ? (
              <div className="min-w-0">
                <div className="font-semibold text-text truncate">{activeName}</div>
                <div className="text-xs text-muted font-mono truncate">{activeId}</div>
              </div>
            ) : (
              <div className="font-semibold text-text-secondary">Select a conversation</div>
            )}
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          {activeId && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setConversationSettingsOpen((open) => !open)}
                className="btn-ghost px-3 py-2 rounded-full text-sm"
                aria-expanded={conversationSettingsOpen}
              >
                Conversation Settings
              </button>
              {conversationSettingsOpen && (
                <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-line bg-surface p-2 shadow-soft">
                  {!protection.own && (
                    <button
                      type="button"
                      disabled={protectionBusy}
                      onClick={enableConversationProtection}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-soft disabled:opacity-50"
                    >
                      Set Up PIN
                    </button>
                  )}
                  {protection.own && (
                    <>
                      <div className="space-y-1 px-3 py-2 text-xs text-text-secondary">
                        <div>PIN: {protection.own.status === 'protected' ? 'Configured' : 'Setup incomplete'}</div>
                        {protection.own.status === 'protected' && (
                          <>
                            <div>Chat Protection: {protection.own.enabled === false ? 'OFF' : 'ON'}</div>
                            <div>Current session: {privateKeyRef.current ? 'Unlocked' : 'Locked'}</div>
                          </>
                        )}
                      </div>
                      {protection.own.status === 'migrating' && (
                        <button
                          type="button"
                          disabled={protectionBusy}
                          onClick={async () => {
                            try {
                              if (privateKeyRef.current) await synchronizeProtectedHistory(activeId)
                              else await unlockConversation()
                            } catch (error) {
                              showToast(error.response?.data?.message || error.message || 'Migration could not continue')
                            }
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-soft disabled:opacity-50"
                        >
                          {privateKeyRef.current ? 'Resume History Migration' : 'Unlock and Resume Migration'}
                        </button>
                      )}
                      {protection.own.status === 'protected' && (
                        <button
                          type="button"
                          disabled={protectionBusy}
                          onClick={() => setConversationProtectionEnabled(protection.own.enabled === false)}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-soft disabled:opacity-50"
                        >
                          Chat Protection: {protection.own.enabled === false ? 'OFF — Turn ON' : 'ON — Turn OFF'}
                        </button>
                      )}
                      {protection.own.status === 'protected' && (
                        <button
                          type="button"
                          disabled={protectionBusy}
                          onClick={changeConversationPin}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-soft disabled:opacity-50"
                        >
                          Change PIN
                        </button>
                      )}
                      {protection.own.status === 'protected' &&
                      protection.own.enabled !== false &&
                      privateKeyRef.current ? (
                        <button
                          type="button"
                          disabled={protectionBusy}
                          onClick={lockConversation}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-soft disabled:opacity-50"
                        >
                          Lock Conversation
                        </button>
                      ) : protection.own.status === 'protected' && !privateKeyRef.current ? (
                        <button
                          type="button"
                          disabled={protectionBusy}
                          onClick={unlockConversation}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-soft disabled:opacity-50"
                        >
                          {protection.own.enabled === false ? 'Unlock on this device' : 'Unlock Conversation'}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <Link to="/about" className="hidden md:inline-flex btn-ghost px-3.5 py-2 rounded-full bg-transparent text-sm text-text-secondary hover:text-primary transition">
            About
          </Link>
          <button
            ref={unreadButtonRef}
            onClick={() => setUnreadOpen((value) => !value)}
            className="relative inline-flex items-center justify-center w-11 h-11 rounded-2xl border border-line bg-raised text-text hover:bg-primary-soft transition"
            aria-label="Unread messages"
          >
            <BellIcon />
            {totalUnread > 0 && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-primary" />}
          </button>
          {totalUnread > 0 && !mobile && (
            <span className="inline-flex items-center justify-center min-w-8 h-8 rounded-full px-2.5 text-sm font-semibold text-white bg-primary">
              {totalUnread}
            </span>
          )}
          {mobile && (
            <button
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-raised text-text"
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>
          )}

          {unreadOpen && (
            <div
              ref={unreadMenuRef}
              className={`absolute right-0 ${mobile ? 'top-14 left-0 w-auto' : 'top-14 w-[min(24rem,calc(100vw-1.5rem))]'} rounded-3xl border border-line bg-surface shadow-soft overflow-hidden z-40 bob-in`}
            >
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <div>
                  <div className="font-semibold text-text">Unread messages</div>
                  <div className="text-xs text-muted">Latest received messages across all chats</div>
                </div>
                <span className="pill-primary">{totalUnread} total</span>
              </div>

              <div className="max-h-[28rem] overflow-y-auto">
                {unreadRecent.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-text-secondary">You're all caught up.</div>
                ) : (
                  unreadRecent.map((item) => (
                    <button
                      key={item._id}
                      onClick={() => {
                        openConversation({ userId: item.senderId, name: item.senderName })
                        setUnreadOpen(false)
                        if (mobile) setMobileView('chat')
                      }}
                      className="w-full text-left px-4 py-4 border-b border-line/70 last:border-b-0 hover:bg-raised transition"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar
                          name={item.senderName}
                          size="sm"
                          userId={item.senderId}
                          profilePictureId={item.senderProfilePictureId}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-text truncate">{item.senderName}</div>
                              <div className="font-mono text-[11px] text-muted truncate">{item.senderId}</div>
                            </div>
                            <div className="text-[11px] text-muted font-mono shrink-0">{formatTime(item.createdAt)}</div>
                          </div>
                          <p className="mt-2 text-sm text-text-secondary truncate">{clampPreview(item.text, 84)}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <section className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-6 space-y-3">
        {activeId && isConversationBlocked && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">Blocked conversation</span>
              <button
                type="button"
                onClick={() => handleUnblockUser(activeId)}
                className="inline-flex items-center rounded-full border border-amber-300 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-amber-900 hover:bg-white transition"
              >
                Unblock
              </button>
            </div>
            <div>You blocked this user. They can't send you messages.</div>
          </div>
        )}

        {!activeId ? (
          <div className="h-full min-h-[45vh] flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center mx-auto mb-5 text-primary">
                <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10" stroke="currentColor" strokeWidth="1.6">
                  <path d="M8 12h.01M12 12h.01M16 12h.01" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="font-display text-4xl text-text mb-3">Pick a conversation</div>
              <p className="text-text-secondary leading-7">Search by user ID on the left, or choose an existing thread to start chatting.</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full min-h-[45vh] flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center mx-auto mb-4 text-primary">
                <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" stroke="currentColor" strokeWidth="1.6">
                  <path d="M7 8h10M7 12h4m1 8-4-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3l-4 4Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-text-secondary text-sm">Say hello to get this thread moving.</p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.senderId === user.userId
            return (
              <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'} fade-up`}>
                <div
                  className={`max-w-[min(30rem,82%)] md:max-w-[min(38rem,88%)] px-4 py-3 rounded-3xl text-sm leading-6 shadow-sm ${
                    mine ? 'bg-sent text-white rounded-br-md' : 'bg-received text-text rounded-bl-md'
                  }`}
                >
                  <span className={message.protectedCopy && !privateKeyRef.current ? 'break-all' : ''}>
                    {message.text}
                  </span>
                  <div className={`mt-1 text-[11px] font-mono ${mine ? 'text-white/70' : 'text-text-secondary'}`}>
                    {formatTime(message.createdAt)}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </section>

      <footer className="border-t border-line bg-surface/95 backdrop-blur-sm px-4 md:px-6 py-4 space-y-3 shrink-0">
        {protectionError && (
          <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {protectionError}
          </div>
        )}
        {protection.own?.status === 'protected' &&
          protection.own.enabled !== false &&
          !privateKeyRef.current && (
            <div className="text-xs text-text-secondary">Chat Protection is ON. Messages are locked on this device; unlock them from Conversation Settings.</div>
          )}
        {protection.own?.status === 'protected' &&
          protection.own.enabled === false &&
          !privateKeyRef.current && (
            <div className="text-xs text-text-secondary">Chat Protection is OFF, but this device needs the PIN once to read its encrypted messages.</div>
          )}
        <form onSubmit={sendMessage} className="flex gap-3 items-center">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            ref={inputRef}
            placeholder={blocked ? `Blocked — wait ${retryAfter}s` : 'Type a message…'}
            className={`input flex-1 ${blocked ? 'flash-red border-primary/40 bg-primary-soft/40' : ''}`}
          />
          <button type="submit" disabled={blocked || !text.trim() || !activeId} className="btn-primary px-5 md:px-6 text-sm">
            Send
          </button>
        </form>

        <RateLimitMeter
          rl={rl}
          blocked={blocked}
          retryAfter={retryAfter}
          explanation={rateLimitExplanation}
        />
      </footer>
    </>
  )

  return (
    <>
      <div className="desktop-shell h-screen flex-row overflow-hidden bg-bg text-text">
        <aside className="w-[300px] shrink-0 border-r border-line bg-surface/95 backdrop-blur-sm flex flex-col overflow-hidden">
          {renderConversationList()}
        </aside>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {renderChatArea()}
        </main>

        <aside className="w-[300px] shrink-0 border-l border-line bg-surface/95 backdrop-blur-sm flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5" ref={desktopMenuRef}>
            {renderMenuContent()}
            <div className="mt-4 rounded-3xl border border-dashed border-line bg-raised/50 p-4 text-xs leading-6 text-text-secondary">
              Your profile menu stays collapsed until you click the card above.
            </div>
          </div>
        </aside>
      </div>

      <div className="mobile-shell h-screen flex-col overflow-hidden bg-bg text-text">
        {mobileView === 'list' ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {renderConversationList({ mobile: true })}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {renderChatArea({ mobile: true })}
          </div>
        )}

        {menuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
            <div
              className="absolute right-0 top-0 h-full w-[min(100vw,22rem)] bg-surface border-l border-line shadow-soft overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
              ref={mobileMenuRef}
            >
              <div className="p-4 border-b border-line flex items-center justify-between">
                <div>
                  <div className="font-display text-xl tracking-tight">Menu</div>
                  <div className="text-xs uppercase tracking-[0.22em] text-muted">Whisper</div>
                </div>
                <button onClick={() => setMenuOpen(false)} className="btn-ghost px-3 py-2 rounded-full">
                  Close
                </button>
              </div>
              <div className="p-4">
                {renderMenuContent()}
              </div>
            </div>
          </div>
        )}
      </div>

      <ProfileModal
        isOpen={showProfileModal}
        user={user}
        onClose={() => setShowProfileModal(false)}
        onSave={handleUpdateProfile}
        isSaving={isSaving}
        onDeleteAccount={handleAccountDelete}
        onPictureChanged={refresh}
      />

      <BlockedUsersModal
        isOpen={showBlockedUsersModal}
        onClose={() => setShowBlockedUsersModal(false)}
        onChanged={refreshDashboard}
        blockedUsers={blockedUsers}
      />

      <CustomizationModal isOpen={showCustomizationModal} onClose={() => setShowCustomizationModal(false)} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-line rounded-2xl px-4 py-2.5 text-sm shadow-soft fade-up z-50">
          {toast}
        </div>
      )}
    </>
  )
}