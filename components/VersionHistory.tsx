'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  const [revertingVersion, setRevertingVersion] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`)
    if (response.ok) setHistory(await response.json() as BuildHistoryEntry[])
    setLoading(false)
  }, [activeProduct])

  useEffect(() => { void refresh() }, [refresh, refreshSignal])

  async function revert(version: number) {
    setRevertingVersion(version)
    setError(null)
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(activeProduct)}/build/${version}/revert`,
        { method: 'POST' },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Could not revert')
        return
      }
      await refresh()
    } finally {
      setRevertingVersion(null)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  }

  if (loading) return <p className="text-xs text-zinc-600 font-mono animate-pulse">Loading version history…</p>
  if (history.length === 0) return <p className="text-xs text-zinc-600 font-mono italic">No builds yet.</p>

  const currentVersion = history[0]?.version

  return (
    <div className="space-y-2 font-mono">
      {error && <p className="text-xs text-red-400">{error}</p>}
      {history.map((entry) => (
        <Card key={entry.version} className="gap-0 border border-zinc-800 bg-zinc-900 px-4 py-3 ring-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-200">
                v{entry.version}
                {entry.version === currentVersion && <span className="ml-2 text-xs text-emerald-400">Current</span>}
              </p>
              <p className="text-xs text-zinc-600">{formatDate(entry.createdAt)}</p>
            </div>
            {mode === 'download' ? (
              <a
                href={`/api/products/${encodeURIComponent(activeProduct)}/build/${entry.version}`}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-auto rounded-none px-3 py-1 text-xs')}
              >
                ⬇ Download
              </a>
            ) : (
              <Button
                variant="outline"
                disabled={entry.version === currentVersion || revertingVersion !== null}
                onClick={() => void revert(entry.version)}
                className="h-auto rounded-none px-3 py-1 text-xs"
              >
                {revertingVersion === entry.version ? 'Reverting…' : '↩ Revert'}
              </Button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">{entry.changelog || '—'}</p>
        </Card>
      ))}
    </div>
  )
}
