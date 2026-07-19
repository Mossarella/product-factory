# Spec: Version History — dropdown instead of a list of cards

## Overview
The shipped Version History (`components/VersionHistory.tsx`, mounted on
both Factory and Collection) renders one full-width Card per build
version. With more than a couple of builds this clutters both pages. The
user wants it collapsed to a single compact control: a dropdown listing
the versions ("v3 — Current — 19 July", "v2 — 18 July", ...), a changelog
line for whichever version is selected, and a single action button
(Download / Revert) that acts on the selected version — not one row per
version.

## Follows the pattern of
- `app/app/factory/page.tsx`'s existing Product Template `<Select>` block
  (lines ~368-382) — same `Select`/`SelectTrigger`/`SelectValue`/
  `SelectContent`/`SelectItem` composition from `@/components/ui/select`,
  same `items` + `value` + `onValueChange` API shape.

## Behavior change
- Replace the current per-version `<Card>` list in
  `components/VersionHistory.tsx` with: a `<Select>` populated from the
  fetched `BuildHistoryEntry[]` (label per item: `v{N} — Current` for the
  latest, `v{N}` otherwise, plus the formatted date), a changelog line
  for the currently-selected entry, and one action element (Download
  link or Revert button, per the existing `mode` prop) that operates on
  the *selected* version, not every version.
- Selection always defaults to the current (latest) version on every
  fetch — including after a revert or a product switch. This avoids
  needing to reconcile a stale selected-version-number across products
  (version numbers can collide across different products) or across a
  revert (which creates a new "current" version worth surfacing
  immediately as feedback that the action worked). The user can always
  manually pick an older version again after that.
- `mode="revert"` (Factory): Revert button disabled when the selected
  version is the current one (no-op to revert to yourself).
- `mode="download"` (Collection): Download link always enabled, points
  at whichever version is selected.
- No change to any API route — `GET .../build` (list), `GET
  .../build/[version]` (download), `POST .../build/[version]/revert`
  all stay exactly as they are. This is a pure UI simplification.

## Implementation

### `components/VersionHistory.tsx` (rewrite)
```tsx
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

  useEffect(() => { void refresh() }, [refresh, refreshSignal])

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
```

No changes needed to `components/BuildProduct.tsx`, `app/app/factory/page.tsx`,
or `app/app/collection/page.tsx` — they already mount `<VersionHistory>`
with the same props (`activeProduct`, `mode`, `refreshSignal`); only the
component's internal rendering changes.

### `tests/e2e/build-product.spec.ts` (update the second test)
The second test currently asserts card-per-version rendering (`v1`/`v2`
text nodes, per-row Revert/Download buttons). Rewrite those assertions
against the new dropdown: open the `Version` combobox, assert the option
list contains entries for each version, select an older version via its
option, assert the changelog line updates, click the single Revert
button, then re-open the combobox and confirm a new version option now
exists and is selected/shown as Current by default. Same idea for the
Collection-page portion but with the single Download link instead
(assert its `href` changes as different options are selected).

## Out of Scope
- No pagination/virtualization of the dropdown — same scoping precedent
  as before, this is about decluttering, not scaling to hundreds of
  versions.

## Verification
1. `npx tsc --noEmit`.
2. Factory: build 2-3 times, confirm the Version History section is now
   a single row (dropdown + Revert button + one changelog line) instead
   of a stack of cards; picking an older version in the dropdown updates
   the changelog line and enables Revert; picking the current version
   disables Revert.
3. Collection: same product shows the same compact dropdown + Download
   link, switching the dropdown changes the download's target version.
4. `bun x playwright test tests/e2e/build-product.spec.ts` green.
