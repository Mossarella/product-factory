'use client'

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const ETSY_SLOTS = [
  { slot: 'etsy-hero', label: 'Hero image', hint: 'mascot + title + compatibility' },
  { slot: 'etsy-expressions', label: 'Expressions showcase', hint: 'all states on one image' },
  { slot: 'etsy-files', label: 'Included files preview', hint: 'folder/file list screenshot' },
  { slot: 'etsy-preview', label: 'Preview / GIF', hint: 'short loop or animation' },
  { slot: 'etsy-detail', label: 'Zoomed detail shot', hint: 'texture / close-up' },
  { slot: 'etsy-branding', label: 'Thank you / branding', hint: 'your branding card' },
]

interface SlotState {
  loaded: boolean
  mime: string
  version: number
}

interface Props {
  activeProduct: string
  onHeroLoaded?: (loaded: boolean) => void
}

export function EtsySlots({ activeProduct, onHeroLoaded }: Props) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [slots, setSlots] = useState<Record<string, SlotState>>({})
  const [dragging, setDragging] = useState<string | null>(null)

  const baseUrl = (slot: string) => `/api/products/${encodeURIComponent(activeProduct)}/slot/${slot}`

  async function loadSlots() {
    const states = await Promise.all(ETSY_SLOTS.map(async ({ slot }) => {
      try {
        const response = await fetch(baseUrl(slot), { cache: 'no-store' })
        return [slot, {
          loaded: response.ok,
          mime: response.headers.get('content-type') ?? '',
          version: Date.now(),
        }] as const
      } catch {
        return [slot, { loaded: false, mime: '', version: Date.now() }] as const
      }
    }))
    const next = Object.fromEntries(states)
    setSlots(next)
    onHeroLoaded?.(next['etsy-hero']?.loaded ?? false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSlots() }, 0)
    // The callback intentionally participates, so a new parent callback receives current state.
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct, onHeroLoaded])

  async function upload(slot: string, file: File) {
    const response = await fetch(baseUrl(slot), {
      method: 'POST',
      headers: { 'X-Filename': file.name, 'Content-Type': file.type },
      body: file,
    })
    if (response.ok) await loadSlots()
  }

  async function clear(slot: string) {
    const response = await fetch(baseUrl(slot), { method: 'DELETE' })
    if (response.ok) await loadSlots()
  }

  function chooseFile(slot: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void upload(slot, file)
  }

  function dropFile(slot: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(null)
    const file = event.dataTransfer.files[0]
    if (file) void upload(slot, file)
  }

  return (
    <div className="space-y-2 font-mono">
      {ETSY_SLOTS.map(({ slot, label, hint }, index) => {
        const state = slots[slot] ?? { loaded: false, mime: '', version: 0 }
        const url = `${baseUrl(slot)}?t=${state.version}`
        return (
          <Card
            key={slot}
            className={`flex flex-wrap items-center gap-3 border bg-zinc-900 p-2 ${dragging === slot ? 'border-violet-500' : 'border-zinc-800'}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(slot) }}
            onDragLeave={() => setDragging(null)}
            onDrop={(event) => dropFile(slot, event)}
          >
            <span className="w-5 text-right text-sm text-zinc-600">{index + 1}</span>
            <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden border border-zinc-700 bg-zinc-950 text-zinc-600">
              {state.loaded ? (
                state.mime.startsWith('video/') ? (
                  <video src={url} className="h-full w-full object-cover" autoPlay loop muted playsInline />
                ) : <Image src={url} alt={label} width={80} height={56} unoptimized className="h-full w-full object-cover" />
              ) : '?'}
            </div>
            <div className="min-w-48 flex-1 text-xs">
              <p className="text-sm text-zinc-200">{label}</p>
              <p className="mt-0.5 break-all text-zinc-600">products/{activeProduct}/assets/{slot}/</p>
              <p className={state.loaded ? 'mt-1 text-emerald-400' : 'mt-1 text-zinc-500'}>{state.loaded ? '✓ loaded' : `— empty (${hint})`}</p>
            </div>
            <input ref={(element) => { inputs.current[slot] = element }} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => chooseFile(slot, event)} />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="xs" type="button" onClick={() => inputs.current[slot]?.click()}>
                {state.loaded ? 'Replace' : 'Pick file'}
              </Button>
              {state.loaded && <Button variant="destructive" size="xs" type="button" onClick={() => void clear(slot)}>✕ Clear</Button>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
