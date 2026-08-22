'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/cn'

interface Overview {
  connected: boolean
  shopName: string | null
  connectionStatus: string
  syncStatus: string
  lastSyncAt: string | null
  lastSyncError: string | null
  itemsSeen: number
  itemsUpserted: number
  cachedItems: number
  matchedItems: number
}

function syncLabel(status: string, connected: boolean) {
  if (!connected) return 'Not connected'
  if (status === 'completed') return 'Online / synced'
  if (status === 'running') return 'Sync in progress'
  if (status === 'failed') return 'Sync failed'
  return 'Awaiting first sync'
}

function syncTone(status: string, connected: boolean) {
  if (!connected) return 'text-zinc-500'
  if (status === 'completed') return 'text-emerald-300'
  if (status === 'running') return 'text-cyan-300'
  if (status === 'failed') return 'text-red-300'
  return 'text-amber-300'
}

function formatDate(value: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function EtsyOverviewWidget() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOverview = useCallback(async (background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await fetch('/api/integrations/etsy/overview', { cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as Overview & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load Etsy status')
      setOverview(body)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Etsy status')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Poll the owner-scoped overview so dashboard status stays current after a sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOverview()
    const timer = window.setInterval(() => { void loadOverview(true) }, 30_000)
    return () => window.clearInterval(timer)
  }, [loadOverview])

  if (loading) {
    return <Card data-testid="etsy-overview-widget" className="rounded-none border-cyan-400/20 bg-zinc-900/55 px-4 !py-4 font-mono text-xs text-zinc-600">Scanning Etsy relay…</Card>
  }

  return (
    <Card data-testid="etsy-overview-widget" className="rounded-none border-cyan-400/20 bg-zinc-900/55 px-4 !py-4 ring-1 ring-inset ring-cyan-400/5 sm:px-5 sm:!py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300/70">Marketplace relay</p>
          <p className="mt-2 text-xs font-mono uppercase tracking-widest text-zinc-500">Etsy sync status</p>
        </div>
        <button type="button" aria-label="Refresh Etsy status" onClick={() => void loadOverview(true)} disabled={refreshing} className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-cyan-300 disabled:opacity-40">
          {refreshing ? 'Scanning…' : 'Refresh'}
        </button>
      </div>
      {error ? <p role="alert" className="mt-4 text-xs font-mono text-red-300">✗ {error}</p> : overview && (
        <>
          <div className="mt-4 flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full shadow-[0_0_9px_currentColor]', syncTone(overview.syncStatus, overview.connected))} />
            <span className={cn('text-sm font-mono font-bold', syncTone(overview.syncStatus, overview.connected))}>{syncLabel(overview.syncStatus, overview.connected)}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-y border-white/5 py-3">
            <div><p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Matched items</p><p className="mt-1 text-3xl font-mono font-bold text-violet-200">{overview.matchedItems}</p></div>
            <div><p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Cached listings</p><p className="mt-1 text-3xl font-mono font-bold text-cyan-200">{overview.cachedItems}</p></div>
          </div>
          <p className="mt-3 text-[11px] font-mono text-zinc-600">{overview.shopName ? `${overview.shopName} · ` : ''}Last sync {formatDate(overview.lastSyncAt)}</p>
          {overview.lastSyncError && <p className="mt-2 truncate text-[11px] font-mono text-red-300" title={overview.lastSyncError}>{overview.lastSyncError}</p>}
          <Link href="/app/collection" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4 h-auto w-full rounded-none border-cyan-400/30 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-cyan-200 hover:bg-cyan-950/30')}>Open inventory radar →</Link>
        </>
      )}
    </Card>
  )
}
