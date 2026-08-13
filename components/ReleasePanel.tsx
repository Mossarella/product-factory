'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ReleaseHistoryEntry } from '@/lib/types'

interface Props {
  activeProduct: string
  buildVersion?: number | null
  refreshSignal?: number
  compact?: boolean
}

interface ReleaseResponse {
  release: ReleaseHistoryEntry
  created: boolean
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ReleasePanel({ activeProduct, buildVersion, refreshSignal = 0, compact = false }: Props) {
  const [releases, setReleases] = useState<ReleaseHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadReleases = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/release`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load release history')
      setReleases(await response.json() as ReleaseHistoryEntry[])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load release history')
    } finally {
      setLoading(false)
    }
  }, [activeProduct])

  useEffect(() => {
    // Refresh release history after finalization or a new build is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReleases()
  }, [loadReleases, refreshSignal])

  const latestRelease = releases[0]
  const isCurrentReleased = Boolean(latestRelease && latestRelease.version === buildVersion)
  const buttonLabel = finalizing ? 'Finalizing…' : isCurrentReleased ? `Released v${buildVersion}` : `Finalize v${buildVersion ?? '—'}`
  const downloadUrl = (version: number) => `/api/products/${encodeURIComponent(activeProduct)}/release/${version}`
  const releaseCountLabel = useMemo(() => `${releases.length} release${releases.length === 1 ? '' : 's'}`, [releases.length])

  async function finalizeRelease() {
    if (!buildVersion || isCurrentReleased) return
    setFinalizing(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: buildVersion }),
      })
      const body = await response.json().catch(() => ({})) as Partial<ReleaseResponse> & { error?: string; code?: string }
      if (!response.ok) {
        setError(body.code === 'RELEASE_ARTIFACTS_MISSING' ? 'Build this product again to embed release artifacts.' : body.error || 'Could not finalize release')
        return
      }
      if (body.release) {
        setReleases((current) => [body.release!, ...current.filter((release) => release.id !== body.release!.id)].sort((a, b) => b.version - a.version))
        setMessage(body.created ? `Release v${body.release.version} sealed in private Storage.` : `Release v${body.release.version} already exists.`)
      }
    } catch {
      setError('Could not finalize release')
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="font-mono">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200">Release bay</p>
          <p className="mt-1 text-[11px] text-zinc-500">Seal a validated package into immutable stock.</p>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-600">{releaseCountLabel}</span>
      </div>

      <Card className={`mb-3 border p-3 ring-0 ${isCurrentReleased ? 'border-emerald-500/30 bg-emerald-950/10' : buildVersion ? 'border-violet-500/30 bg-violet-950/10' : 'border-zinc-800 bg-zinc-950/40'}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-xs font-bold tracking-widest ${isCurrentReleased ? 'text-emerald-300' : buildVersion ? 'text-violet-200' : 'text-zinc-500'}`}>
              {isCurrentReleased ? '✓ CURRENT VERSION RELEASED' : buildVersion ? `PACKAGE v${buildVersion} READY` : 'NO PACKAGE READY'}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {isCurrentReleased ? 'This version is sealed and downloadable from private Storage.' : buildVersion ? 'Finalize this build to create the Etsy-ready release bundle.' : 'Build the product before finalizing a release.'}
            </p>
          </div>
          {isCurrentReleased && <span className="text-2xl text-emerald-300">◆</span>}
        </div>
        <Button
          type="button"
          disabled={!buildVersion || isCurrentReleased || finalizing}
          onClick={() => void finalizeRelease()}
          className="mt-3 w-full rounded-none border border-violet-600 bg-violet-600 py-2 text-xs font-bold uppercase tracking-wider text-zinc-100 hover:bg-violet-500 disabled:opacity-50"
        >
          {buttonLabel}
        </Button>
      </Card>

      {message && <p role="status" className="mb-3 text-xs text-emerald-400">✓ {message}</p>}
      {error && <p role="alert" className="mb-3 text-xs text-red-400">✗ {error}</p>}

      {!compact && (
        <div className="border-t border-white/5 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-zinc-600">Release history</p>
            <button type="button" onClick={() => void loadReleases()} className="text-[10px] uppercase tracking-widest text-zinc-600 hover:text-violet-300">Refresh</button>
          </div>
          {loading ? <p className="text-xs text-zinc-600">Scanning sealed releases…</p> : releases.length === 0 ? <p className="text-xs text-zinc-600">No releases sealed yet.</p> : (
            <div className="space-y-1.5">
              {releases.map((release) => (
                <div key={release.id} className="flex min-w-0 items-center justify-between gap-3 border border-white/5 bg-black/20 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-300">v{release.version} <span className="font-normal text-zinc-600">· {formatDate(release.created_at)}</span></p>
                    <p className="truncate text-[10px] text-zinc-600">{formatBytes(release.bundle_size)} · {release.bundle_sha256.slice(0, 12)}…</p>
                  </div>
                  <a href={downloadUrl(release.version)} className="shrink-0 border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-300 hover:border-violet-400 hover:text-violet-200">Download</a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
