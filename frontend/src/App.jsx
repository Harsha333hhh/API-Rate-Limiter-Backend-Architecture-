import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Login from './pages/Login.jsx'
import Landing from './pages/Landing.jsx'
import Signup from './pages/Signup.jsx'
import Messenger from './pages/Messenger.jsx'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted font-mono text-sm tracking-widest">
        LOADING…
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function HomeRoute() {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted font-mono text-sm tracking-widest">
        LOADING…
      </div>
    )
  return user ? <Messenger /> : <Landing />
}

export default function App() {
  const { user } = useAuth()
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  )
}
