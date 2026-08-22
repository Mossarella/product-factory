'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ProductSummary } from '@/lib/types'

interface InventoryItem {
  id: string
  etsy_listing_id: number
  title: string
  state: string
  sku: string | null
  price: number | null
  quantity: number | null
  currency: string | null
  last_synced_at: string
}

interface Props {
  products: ProductSummary[]
  activeProduct?: string | null
}

interface EtsyOverview {
  connected: boolean
  shopName: string | null
  connectionStatus: string
  syncStatus: string
  lastSyncError: string | null
  cachedItems: number
  matchedItems: number
}

function formatSynced(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatPrice(item: InventoryItem) {
  if (item.price == null) return '—'
  return `${item.currency ?? 'USD'} ${item.price.toFixed(2)}`
}

export function EtsyInventoryPanel({ products, activeProduct = null }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [overview, setOverview] = useState<EtsyOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [matchingId, setMatchingId] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const response = await fetch('/api/integrations/etsy/overview', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load Etsy connection status')
      setOverview(await response.json() as EtsyOverview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Etsy connection status')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/integrations/etsy/inventory', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load Etsy inventory')
      setItems(await response.json() as InventoryItem[])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Etsy inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load connection state and the owner-scoped cache when the panel mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([loadOverview(), loadInventory()])
  }, [loadOverview, loadInventory])

  const latestSync = useMemo(() => items[0]?.last_synced_at ?? null, [items])

  async function syncInventory() {
    setSyncing(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/integrations/etsy/inventory/sync', { method: 'POST' })
      const body = await response.json().catch(() => ({})) as { itemsUpserted?: number; error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not fetch Etsy inventory')
      await Promise.all([loadOverview(), loadInventory()])
      setMessage(`${body.itemsUpserted ?? 0} Etsy listing${body.itemsUpserted === 1 ? '' : 's'} cached.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch Etsy inventory')
    } finally {
      setSyncing(false)
    }
  }

  async function matchItem(item: InventoryItem) {
    const productId = selectedProduct[item.id]
    if (!productId) return
    setMatchingId(item.id)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`/api/integrations/etsy/inventory/${encodeURIComponent(item.id)}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: productId }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not match listing')
      setMessage(`Matched “${item.title}” to Product Factory stock.`)
      setSelectedProduct((current) => ({ ...current, [item.id]: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not match listing')
    } finally {
      setMatchingId(null)
    }
  }

  async function unmatchItem(item: InventoryItem) {
    setMatchingId(item.id)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`/api/integrations/etsy/inventory/${encodeURIComponent(item.id)}/match`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove product match')
      setMessage(`Removed the local match for “${item.title}”.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove product match')
    } finally {
      setMatchingId(null)
    }
  }

  return (
    <section aria-labelledby="etsy-inventory-heading" className="border border-cyan-400/20 bg-zinc-950/60 p-3 ring-1 ring-inset ring-cyan-400/5" data-testid="etsy-inventory-panel">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-cyan-300">External stock radar</p>
          <h3 id="etsy-inventory-heading" className="mt-1 text-xs font-mono font-bold uppercase tracking-widest text-zinc-200">Etsy inventory link</h3>
          <p className="mt-1 text-[11px] font-mono text-zinc-600">Fetch listings, then manually assign them to local stock.</p>
        </div>
        {overview?.connected ? (
          <Button
            type="button"
            onClick={() => void syncInventory()}
            disabled={syncing || overviewLoading}
            className="h-auto shrink-0 rounded-none border border-cyan-400/40 bg-cyan-950/30 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-900/40"
          >
            {syncing ? 'Fetching…' : 'Fetch inventory'}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => { window.location.href = '/api/integrations/etsy/connect' }}
            disabled={overviewLoading}
            className="h-auto shrink-0 rounded-none border border-violet-400/40 bg-violet-950/30 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-violet-200 hover:bg-violet-900/40"
          >
            {overviewLoading ? 'Checking…' : 'Connect Etsy'}
          </Button>
        )}
      </div>

      {!overviewLoading && !overview?.connected && (
        <div className="mb-3 border border-violet-400/20 bg-violet-950/10 px-3 py-2 text-[11px] font-mono text-violet-200/80">
          Connect your Etsy shop first. You will be sent to Etsy to sign in and authorize Product Factory to read your listings, then returned here to fetch inventory.
        </div>
      )}
      {overview?.connected && (
        <div className="mb-3 border border-emerald-400/20 bg-emerald-950/10 px-3 py-2 text-[11px] font-mono text-emerald-300/80">
          Connected to {overview.shopName || 'your Etsy shop'} · {overview.cachedItems} cached · {overview.matchedItems} matched
        </div>
      )}

      <div className="mb-3 flex items-center justify-between border-y border-white/5 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
        <span>{items.length} cached listing{items.length === 1 ? '' : 's'}</span>
        <span>{latestSync ? `Synced ${formatSynced(latestSync)}` : 'Not synced'}</span>
      </div>

      {message && <p role="status" className="mb-3 text-xs font-mono text-emerald-400">✓ {message}</p>}
      {error && <p role="alert" className="mb-3 text-xs font-mono text-red-400">✗ {error}</p>}

      {loading ? <p className="text-xs font-mono text-zinc-600">Scanning Etsy stock…</p> : !overview?.connected ? (
        <div className="border border-dashed border-white/10 bg-black/20 px-3 py-5 text-center text-xs font-mono text-zinc-600">
          No Etsy connection yet. Connect your shop above to load listings.
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-white/10 bg-black/20 px-3 py-5 text-center text-xs font-mono text-zinc-600">
          No cached listings. Fetch inventory to populate the radar.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isActive = Boolean(activeProduct && products.some((product) => product.name === activeProduct))
            return (
              <div key={item.id} className="border border-white/10 bg-black/25 p-2.5" data-testid={`etsy-inventory-item-${item.id}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-mono font-bold text-zinc-200">{item.title}</p>
                    <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                      #{item.etsy_listing_id} · {item.sku || 'No SKU'} · {item.state}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[10px] font-mono text-cyan-200">
                    <p>{formatPrice(item)}</p>
                    <p className="mt-1 text-zinc-600">{item.quantity == null ? '—' : `${item.quantity} qty`}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label={`Match ${item.title} to Product Factory product`}
                    value={selectedProduct[item.id] ?? (isActive ? activeProduct ?? '' : '')}
                    onChange={(event) => setSelectedProduct((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="min-w-0 flex-1 rounded-none border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs font-mono text-zinc-300 focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="">Choose local product…</option>
                    {products.map((product) => <option key={product.name} value={product.name}>{product.name}</option>)}
                  </select>
                  <Button
                    type="button"
                    disabled={!selectedProduct[item.id] && !isActive || matchingId === item.id}
                    onClick={() => void matchItem(item)}
                    className="h-auto rounded-none border border-violet-500/40 bg-violet-950/30 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-violet-200 hover:bg-violet-900/40 disabled:opacity-40"
                  >
                    {matchingId === item.id ? 'Working…' : 'Match to product'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={matchingId === item.id}
                    onClick={() => void unmatchItem(item)}
                    className="h-auto rounded-none border-zinc-800 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
                  >
                    Unmatch
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
