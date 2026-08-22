'use client'

import { ChangeEvent, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FixedAssetDef } from '@/lib/types'

export interface AssetLoadoutOption {
  id: string
  name: string
  assetKeys: string[]
}

interface Props {
  assets: FixedAssetDef[]
  onChange: (assets: FixedAssetDef[]) => void
  onAddCustom: () => void
  loadouts?: AssetLoadoutOption[]
  onSaveLoadout?: (name: string) => Promise<void>
  onApplyLoadout?: (assetKeys: string[]) => void
  onDeleteLoadout?: (id: string) => Promise<void>
}

interface AssetSlotProps {
  asset: FixedAssetDef
  onUpdate: (updates: Partial<FixedAssetDef>) => void
  onRemove: () => void
}

function AssetSlot({ asset, onUpdate, onRemove }: AssetSlotProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(() => (asset.blob ? URL.createObjectURL(asset.blob) : null), [asset.blob])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onUpdate({ blob: file, manuallyPicked: true })
    event.target.value = ''
  }

  const status = asset.blob ? '✓ loaded' : asset.optional ? '— not loaded (optional)' : '— not loaded'

  return (
    <Card className="flex-row items-start gap-3 rounded-none border border-zinc-800 bg-zinc-900/50 p-3 font-mono ring-0">
      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden border border-zinc-700 bg-zinc-950 text-xl text-zinc-600">
        {previewUrl ? <Image src={previewUrl} alt="" width={72} height={72} unoptimized className="h-full w-full object-cover" /> : '?'}
      </div>
      <div className="min-w-0 flex-1">
        {asset.builtin ? <p className="text-sm text-zinc-200">{asset.label}</p> : <Input aria-label="Asset label" className="h-auto rounded-none border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none focus-visible:ring-0" value={asset.label} onChange={(event) => onUpdate({ label: event.target.value })} />}
        <p className={`mt-1 text-xs ${asset.blob ? 'text-emerald-400' : 'text-zinc-500'}`}>{status}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept={asset.accept} className="hidden" onChange={handleFileChange} />
          <Button type="button" variant="outline" className="h-auto rounded-none border-zinc-700 bg-zinc-800 px-3 py-1.5 font-normal text-sm text-zinc-300 hover:bg-zinc-700" onClick={() => fileInput.current?.click()}>Pick file</Button>
          {!asset.builtin && <Button type="button" variant="destructive" aria-label={`Remove ${asset.label || 'asset'}`} className="h-auto rounded-none border-red-800 bg-red-950 px-3 py-1.5 font-normal text-sm text-red-400 hover:bg-red-900" onClick={onRemove}>✕ Remove</Button>}
        </div>
      </div>
    </Card>
  )
}

export function FixedAssets({ assets, onChange, onAddCustom, loadouts = [], onSaveLoadout, onApplyLoadout, onDeleteLoadout }: Props) {
  const updateAsset = (id: string, updates: Partial<FixedAssetDef>) => onChange(assets.map((asset) => (asset.id === id ? { ...asset, ...updates } : asset)))
  const currentKeys = assets.filter((asset) => asset.blob).map((asset) => asset.id)

  return (
    <div className="font-mono">
      {(onSaveLoadout || onApplyLoadout) && (
        <div className="mb-3 border border-violet-400/20 bg-violet-950/10 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-widest text-violet-300">Asset loadouts</p>
            <span className="text-[10px] text-zinc-600">{currentKeys.length} loaded</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {loadouts.map((loadout) => (
              <div key={loadout.id} className="flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-2 py-1">
                <Button type="button" variant="ghost" className="h-auto rounded-none px-1 py-0.5 text-xs text-zinc-300 hover:text-white" onClick={() => onApplyLoadout?.(loadout.assetKeys)}>{loadout.name}</Button>
                <Button type="button" variant="ghost" aria-label={`Delete ${loadout.name}`} className="h-auto rounded-none px-1 py-0.5 text-xs text-red-400 hover:text-red-300" onClick={() => void onDeleteLoadout?.(loadout.id)}>×</Button>
              </div>
            ))}
            <Button type="button" variant="outline" className="h-auto rounded-none border-violet-500/40 bg-transparent px-2 py-1 text-xs text-violet-300" onClick={() => {
              const name = window.prompt('Loadout name')?.trim()
              if (name) void onSaveLoadout?.(name)
            }}>Save current loadout</Button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {assets.map((asset) => <AssetSlot key={asset.id} asset={asset} onUpdate={(updates) => updateAsset(asset.id, updates)} onRemove={() => onChange(assets.filter((item) => item.id !== asset.id))} />)}
      </div>
      <Button type="button" variant="outline" className="mt-3 h-auto rounded-none border-zinc-700 bg-zinc-800 px-3 py-1.5 font-normal text-sm text-zinc-300 hover:bg-zinc-700" onClick={onAddCustom}>+ Add custom asset</Button>
    </div>
  )
}
