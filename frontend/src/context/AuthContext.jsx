import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // on load, try to restore the session from the cookie
  const refresh = async () => {
    try {
      const { data } = await api.get('/user-api/me')
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/user-api/login', { email, password })
    setUser(data.user)
    return data
  }

  const signup = async (name, email, password) => {
    // register, then immediately log in so we get the cookie
    await api.post('/user-api/users', { name, email, password })
    return login(email, password)
  }

  const logout = async () => {
    await api.post('/user-api/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
