'use client'

import { FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Props {
  plan: 'free' | 'pro'
  activatedAt?: string
  subscriptionStatus?: string
  productCount?: number
  productLimit?: number
  storageUsedBytes?: number
  storageLimitBytes?: number
  onActivate: (key: string) => Promise<void>
  onBuyClick: () => void
  onManageClick: () => void
}

export function LicenseBanner({ plan, activatedAt, subscriptionStatus, productCount = 0, productLimit = 3, storageUsedBytes = 0, storageLimitBytes = 104857600, onActivate, onBuyClick, onManageClick }: Props) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const storageLabel = storageLimitBytes >= 1073741824
    ? `${(storageUsedBytes / 1073741824).toFixed(1)} / ${(storageLimitBytes / 1073741824).toFixed(0)} GB`
    : `${(storageUsedBytes / 1048576).toFixed(1)} / ${(storageLimitBytes / 1048576).toFixed(0)} MB`

  if (plan === 'pro') {
    return (
      <Card className="border border-emerald-800 bg-emerald-950/40 px-3 py-2 font-mono text-xs text-emerald-400">
        <div className="flex flex-wrap items-center gap-2">
          <span>✓ Pro</span>
          <span className="text-emerald-300/80">{productCount} / {productLimit} products</span>
          <span className="text-emerald-300/80">{storageLabel}</span>
          {activatedAt && <span className="text-zinc-600">activated {activatedAt}</span>}
          {subscriptionStatus && (
            <Button
              variant="outline"
              type="button"
              size="sm"
              className="ml-auto"
              onClick={onManageClick}
            >
              Manage subscription
            </Button>
          )}
        </div>
      </Card>
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
      setError(err instanceof Error ? err.message : 'Invalid promo code')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-mono text-emerald-400">
        ✓ Promo code activated — Pro plan unlocked
      </Card>
    )
  }

  return (
    <Card className="border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-zinc-400">Free plan — <span className="text-zinc-300">{productCount} / {productLimit} products · {storageLabel}</span></span>
        <form onSubmit={submit} className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Have a promo code?"
            className="min-w-48 flex-1 border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus-visible:ring-0"
          />
          <Button
            variant="outline"
            type="submit"
            disabled={loading || !key.trim()}
          >
            {loading ? 'Activating…' : 'Activate'}
          </Button>
        </form>
        <Button
          variant="secondary"
          type="button"
          onClick={onBuyClick}
        >
          Upgrade to Pro
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Card>
  )
}
