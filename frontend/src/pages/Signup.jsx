import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { readRateLimitHeaders } from '../lib/api.js'

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await signup(name, email, password)
      navigate('/')
    } catch (e) {
      if (e.response?.status === 429) {
        const rl = readRateLimitHeaders(e)
        setErr(`Too many signups from here. Try again in ${rl.reset || 'a few'} seconds.`)
      } else {
        setErr(e.response?.data?.message || e.response?.data?.reason || 'Signup failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-md fade-up">
        <div className="text-center mb-8">
          <div className="font-display text-5xl text-text tracking-tight">Relay</div>
          <div className="label mt-2">direct messaging</div>
        </div>

        <div className="card p-8">
          <h1 className="font-display text-3xl text-text mb-1">Create account</h1>
          <p className="text-text-secondary text-sm mb-7">
            You'll get a short ID others can use to message you.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label block mb-1.5">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input"
                placeholder="Ada Lovelace"
              />
            </div>
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
                minLength={6}
                className="input"
                placeholder="At least 6 characters"
              />
            </div>

            {err && (
              <div className="text-danger text-sm border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
                {err}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-line text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
