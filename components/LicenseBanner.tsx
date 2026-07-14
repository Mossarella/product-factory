'use client'

import { FormEvent, useState } from 'react'

interface Props {
  plan: 'free' | 'pro'
  activatedAt?: string
  onActivate: (key: string) => Promise<void>
  onBuyClick: () => void
}

export function LicenseBanner({ plan, activatedAt, onActivate, onBuyClick }: Props) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (plan === 'pro') {
    return (
      <div className="flex items-center gap-2 border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-mono text-emerald-400">
        <span>✓ Pro</span>
        {activatedAt && <span className="text-zinc-600">activated {activatedAt}</span>}
      </div>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      await onActivate(trimmed)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid license key')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-mono text-emerald-400">
        ✓ License activated — Pro plan unlocked
      </div>
    )
  }

  return (
    <div className="border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-zinc-400">Free plan — <span className="text-zinc-300">3 products max</span></span>
        <form onSubmit={submit} className="flex flex-1 flex-wrap items-center gap-2">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter license key"
            className="min-w-48 flex-1 border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Activating…' : 'Activate'}
          </button>
        </form>
        <button
          type="button"
          onClick={onBuyClick}
          className="border border-violet-700 bg-violet-900 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-800"
        >
          Upgrade → $29 one-time
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}
