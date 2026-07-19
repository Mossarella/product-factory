'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/app'

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [devLoginUrl, setDevLoginUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    setDevLoginUrl(null)
    try {
      const result = await signIn('resend', { email: trimmed, redirect: false, callbackUrl })
      if (result?.error) {
        setError('Could not send magic link. Check your email address and try again.')
        return
      }
      setSent(true)
      // Fetch dev login URL — returns null in production, full URL in dev
      const res = await fetch(`/api/auth/dev-url?email=${encodeURIComponent(trimmed)}`)
      if (res.ok) {
        const data = await res.json() as { devLoginUrl: string | null }
        if (data.devLoginUrl) setDevLoginUrl(data.devLoginUrl)
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
          <h1 className="text-2xl font-bold text-zinc-100">Product Factory</h1>
          <p className="text-zinc-500 text-sm mt-1">Sign in to manage your digital products</p>
        </div>

        {sent ? (
          <div className="space-y-3">
            <Card className="border border-emerald-800 bg-emerald-950/40 p-5">
              <p className="text-emerald-400 font-bold mb-1">Check your email</p>
              <p className="text-zinc-400 text-sm">
                We sent a magic link to{' '}
                <span className="text-zinc-200">{email}</span>.
                Click the link to sign in — no password needed.
              </p>
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => { setSent(false); setEmail(''); setDevLoginUrl(null) }}
                className="mt-3 text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Use a different email
              </Button>
            </Card>

            {devLoginUrl && (
              <Card className="border border-amber-700 bg-amber-950/40 p-4">
                <p className="text-xs uppercase tracking-widest text-amber-500 mb-2">
                  Dev mode — skip email
                </p>
                <a
                  href={devLoginUrl}
                  className="block w-full text-center border border-amber-600 bg-amber-600 px-4 py-2 text-sm text-zinc-950 font-bold hover:bg-amber-500 transition-colors"
                >
                  Login as {email} →
                </a>
                <p className="mt-2 text-xs text-amber-800">
                  Only shown when NODE_ENV ≠ production.
                </p>
              </Card>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="block text-xs uppercase tracking-widest text-zinc-600 mb-2">
                Email address
              </Label>
              <Input
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
            <Button
              type="submit"
              variant="default"
              disabled={loading || !email.trim()}
              className="w-full"
            >
              {loading ? 'Sending…' : 'Send magic link →'}
            </Button>
            <p className="text-xs text-zinc-600 text-center">
              No password. No account setup. Just enter your email.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
