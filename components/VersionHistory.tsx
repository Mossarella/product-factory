'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/cn'
import type { BuildHistoryEntry } from '@/lib/types'

interface Props {
  activeProduct: string
  mode: 'revert' | 'download'
  refreshSignal?: number
}

export function VersionHistory({ activeProduct, mode, refreshSignal }: Props) {
  const [history, setHistory] = useState<BuildHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [reverting, setReverting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`)
    if (response.ok) {
      const data = await response.json() as BuildHistoryEntry[]
      setHistory(data)
      setSelectedVersion(data[0]?.version ?? null)
    }
    setLoading(false)
  }, [activeProduct])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`)
      .then((response) => (response.ok ? response.json() as Promise<BuildHistoryEntry[]> : null))
      .then((data) => {
        if (data) setHistory(data)
        setLoading(false)
      })
  }, [activeProduct, refreshSignal])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  }

  async function revert() {
    if (selectedVersion === null) return
    setReverting(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(activeProduct)}/build/${selectedVersion}/revert`,
        { method: 'POST' },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Could not revert')
        return
      }
      await refresh()
    } finally {
      setReverting(false)
    }
  }

  if (loading) return <p className="text-xs text-zinc-600 font-mono animate-pulse">Loading version history…</p>
  if (history.length === 0) return <p className="text-xs text-zinc-600 font-mono italic">No builds yet.</p>

  const currentVersion = history[0]?.version
  const selectedEntry = history.find((b) => b.version === selectedVersion) ?? history[0]
  const selectItems = history.map((entry) => ({
    value: String(entry.version),
    label: `v${entry.version}${entry.version === currentVersion ? ' — Current' : ''} — ${formatDate(entry.createdAt)}`,
  }))

  return (
    <div className="font-mono">
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <Select
          value={String(selectedEntry.version)}
          items={selectItems}
          onValueChange={(value) => setSelectedVersion(Number(value))}
        >
          <SelectTrigger
            aria-label="Version"
            className="w-auto flex-1 rounded-none border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:border-violet-500"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === 'download' ? (
          <a
            href={`/api/products/${encodeURIComponent(activeProduct)}/build/${selectedEntry.version}`}
            className={cn(buttonVariants({ variant: 'outline' }), 'h-auto shrink-0 rounded-none px-3 py-1.5 text-xs')}
          >
            ⬇ Download
          </a>
        ) : (
          <Button
            variant="outline"
            disabled={selectedEntry.version === currentVersion || reverting}
            onClick={() => void revert()}
            className="h-auto shrink-0 rounded-none px-3 py-1.5 text-xs"
          >
            {reverting ? 'Reverting…' : '↩ Revert'}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">{selectedEntry.changelog || '—'}</p>
    </div>
  )
}
