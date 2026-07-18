'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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
  onBuilt?: () => void
}

export function BuildProduct({ activeProduct, onBuilt }: Props) {
  const [building, setBuilding] = useState(false)
  const [revealedSteps, setRevealedSteps] = useState(0)
  const [result, setResult] = useState<BuildResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  async function build() {
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
      onBuilt?.()
    } catch {
      setError('Build failed')
    } finally {
      clearInterval(timer)
      setBuilding(false)
    }
  }

  return (
    <div className="font-mono">
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
        disabled={building}
        onClick={() => void build()}
        className="w-full border border-violet-600 bg-violet-600 py-3 text-base font-bold text-zinc-100 hover:bg-violet-500 disabled:opacity-50"
      >
        {building ? 'Building…' : '📦 Build Product'}
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
