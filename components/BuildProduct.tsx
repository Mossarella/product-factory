'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { BuildReadiness } from '@/lib/build-readiness'

const STEPS = [
  'Validate files',
  'Check required assets',
  'Generate README',
  'Insert shared assets',
  'Build folder structure',
  'Generate manifest',
  'Create ZIP',
  'Save version',
]

interface BuildResult {
  version: number
  warnings: string[]
  hasRequiredFailures: boolean
  changelog: string
}

interface Props {
  activeProduct: string
  readiness?: BuildReadiness | null
  onBuilt?: (result: BuildResult) => void
}

export function BuildProduct({ activeProduct, readiness, onBuilt }: Props) {
  const [building, setBuilding] = useState(false)
  const [revealedSteps, setRevealedSteps] = useState(0)
  const [result, setResult] = useState<BuildResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  async function build() {
    if (readiness && !readiness.canBuild) {
      setError('Resolve the blocking requirements before generating a package.')
      return
    }
    setBuilding(true)
    setError(null)
    setResult(null)
    setRevealedSteps(0)

    const timer = setInterval(() => {
      setRevealedSteps((n) => (n < STEPS.length - 1 ? n + 1 : n))
    }, 220)

    try {
      const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Build failed')
        return
      }
      const data: BuildResult = await response.json()
      setRevealedSteps(STEPS.length)
      setResult(data)
      setNotes('')
      onBuilt?.(data)
    } catch {
      setError('Build failed')
    } finally {
      clearInterval(timer)
      setBuilding(false)
    }
  }

  return (
    <div className="font-mono">
      {readiness && (
        <Card className={`mb-3 border p-3 ring-0 ${readiness.canBuild ? readiness.warnings.length ? 'border-yellow-500/30 bg-yellow-950/10' : 'border-emerald-500/30 bg-emerald-950/10' : 'border-red-500/30 bg-red-950/10'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-bold tracking-widest ${readiness.canBuild ? readiness.warnings.length ? 'text-yellow-300' : 'text-emerald-300' : 'text-red-300'}`}>
                {readiness.canBuild ? readiness.warnings.length ? '⚠ READY WITH WARNINGS' : '✓ READY TO PACKAGE' : `✗ ${readiness.blocking.length} BLOCKING CHECK${readiness.blocking.length === 1 ? '' : 'S'}`}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{readiness.canBuild ? readiness.warnings.length ? 'Review these warnings before generating the ZIP.' : 'All required checks passed.' : 'Resolve the items below before generating the ZIP.'}</p>
            </div>
            <span className="text-xs text-zinc-500">{readiness.items.filter((item) => item.ok).length}/{readiness.items.length}</span>
          </div>
          {readiness.items.some((item) => !item.ok) && (
            <ul className="mt-3 space-y-1 border-t border-white/5 pt-2 text-xs">
              {readiness.items.filter((item) => !item.ok).map((item) => (
                <li key={item.id} className={item.severity === 'blocking' ? 'text-red-300' : 'text-yellow-300'}>
                  {item.severity === 'blocking' ? '✗' : '⚠'} {item.label}: <span className="text-zinc-400">{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Input
        placeholder="What changed? (optional)"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={building}
        className="mb-2 h-auto rounded-none border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 placeholder:text-zinc-600"
      />
      <Button
        type="button"
        variant="default"
        disabled={building || Boolean(readiness && !readiness.canBuild)}
        onClick={() => void build()}
        className="w-full border border-violet-600 bg-violet-600 py-3 text-base font-bold text-zinc-100 hover:bg-violet-500 disabled:opacity-50"
      >
        {building ? 'Building…' : readiness && !readiness.canBuild ? 'Resolve Requirements' : '📦 Build Product'}
      </Button>

      {building && (
        <Card className="mt-3 border border-zinc-800 bg-zinc-900 p-4 ring-0">
          <ul className="space-y-1.5 text-sm">
            {STEPS.map((step, index) => (
              <li key={step} className={index <= revealedSteps ? 'text-emerald-400' : 'text-zinc-700'}>
                {index <= revealedSteps ? '✓' : '○'} {step}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {result && !building && (
        <Card className="mt-3 border border-zinc-800 bg-zinc-900 p-4 ring-0">
          <p className={result.hasRequiredFailures ? 'text-yellow-400' : 'text-emerald-400'}>
            {result.hasRequiredFailures ? '🟡' : '🟢'} Product v{result.version} Ready
            {result.hasRequiredFailures && ' — required checks failed'}
          </p>
          {result.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-zinc-500">
              {result.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}
          {result.changelog && (
            <p className="mt-2 text-xs text-zinc-500">{result.changelog}</p>
          )}
          <a
            href={`/api/products/${encodeURIComponent(activeProduct)}/build/latest`}
            className="mt-3 inline-block border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            ⬇ Download ZIP
          </a>
        </Card>
      )}
    </div>
  )
}
