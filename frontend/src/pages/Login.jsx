import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { readRateLimitHeaders } from '../lib/api.js'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (e) {
      if (e.response?.status === 429) {
        const rl = readRateLimitHeaders(e)
        setErr(`Too many login attempts. Try again in ${rl.reset || 'a few'} seconds.`)
      } else {
        setErr(e.response?.data?.message || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-md fade-up">
        <div className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
                <path d="M7.5 16.5V8.25A2.25 2.25 0 0 1 9.75 6h4.5A2.25 2.25 0 0 1 16.5 8.25v4.5A2.25 2.25 0 0 1 14.25 15H11l-3.5 3.5v-2Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="font-display text-4xl text-text tracking-tight">Whisper</div>
          </div>
          <div className="label">direct messaging</div>
        </div>

        <div className="card surface-card p-8">
          <h1 className="font-display text-3xl text-text mb-1">Welcome back</h1>
          <p className="text-text-secondary text-sm mb-7">Sign in to your account.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
                placeholder="••••••••"
              />
            </div>

            {err && (
              <div className="text-danger text-sm border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
                {err}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-line text-center text-sm text-text-secondary">
            New here?{' '}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
