'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      const params = await searchParams
      const callbackUrl = params['callbackUrl'] ?? '/app'
      const result = await signIn('resend', { email: trimmed, redirect: false, callbackUrl })
      if (result?.error) {
        setError('Could not send magic link. Check your email address and try again.')
      } else {
        setSent(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-zinc-600 mb-2">MossarellaStudio</p>
          <h1 className="text-2xl font-bold text-zinc-100">Product Factory</h1>
          <p className="text-zinc-500 text-sm mt-1">Sign in to manage your digital products</p>
        </div>

        {sent ? (
          <div className="border border-emerald-800 bg-emerald-950/40 p-6">
            <p className="text-emerald-400 font-bold mb-2">Check your email</p>
            <p className="text-zinc-400 text-sm">
              We sent a magic link to{' '}
              <span className="text-zinc-200">{email}</span>.
              Click the link to sign in — no password needed.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail('') }}
              className="mt-4 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs uppercase tracking-widest text-zinc-600 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full border border-violet-600 bg-violet-600 px-4 py-2.5 text-sm text-zinc-100 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending…' : 'Send magic link →'}
            </button>
            <p className="text-xs text-zinc-600 text-center">
              No password. No account setup. Just enter your email.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
