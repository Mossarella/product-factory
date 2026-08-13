'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/app'

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
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      })
      if (signInError) {
        setError(signInError.message)
        return
      }
      setSent(true)
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
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-3 text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Use a different email
              </Button>
            </Card>

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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
