'use client'

import { ChangeEvent, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { FixedAssetDef } from '@/lib/types'

interface Props {
  assets: FixedAssetDef[]
  onChange: (assets: FixedAssetDef[]) => void
  onAddCustom: () => void
}

interface AssetSlotProps {
  asset: FixedAssetDef
  onUpdate: (updates: Partial<FixedAssetDef>) => void
  onRemove: () => void
}

function AssetSlot({ asset, onUpdate, onRemove }: AssetSlotProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(
    () => (asset.blob ? URL.createObjectURL(asset.blob) : null),
    [asset.blob],
  )

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onUpdate({ blob: file })
    event.target.value = ''
  }

  const status = asset.blob ? '✓ loaded' : asset.optional ? '— not loaded (optional)' : '— not loaded'

  return (
    <div className="flex items-start gap-3 border border-zinc-800 bg-zinc-900/50 p-3 font-mono">
      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden border border-zinc-700 bg-zinc-950 text-xl text-zinc-600">
        {previewUrl ? <Image src={previewUrl} alt="" width={72} height={72} unoptimized className="h-full w-full object-cover" /> : '?'}
      </div>
      <div className="min-w-0 flex-1">
        {asset.builtin ? (
          <p className="text-sm text-zinc-200">{asset.label}</p>
        ) : (
          <input
            aria-label="Asset label"
            className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
            value={asset.label}
            onChange={(event) => onUpdate({ label: event.target.value })}
          />
        )}
        <p className={`mt-1 text-xs ${asset.blob ? 'text-emerald-400' : 'text-zinc-500'}`}>{status}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept={asset.accept} className="hidden" onChange={handleFileChange} />
          <button type="button" className="border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700" onClick={() => fileInput.current?.click()}>
            Pick file
          </button>
          {!asset.builtin && <button type="button" aria-label={`Remove ${asset.label || 'asset'}`} className="border border-red-800 bg-red-950 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900" onClick={onRemove}>✕ Remove</button>}
        </div>
      </div>
    </div>
  )
}

export function FixedAssets({ assets, onChange, onAddCustom }: Props) {
  const updateAsset = (id: string, updates: Partial<FixedAssetDef>) => {
    onChange(assets.map((asset) => (asset.id === id ? { ...asset, ...updates } : asset)))
  }

  return (
    <div className="font-mono">
      <div className="flex flex-col gap-2">
        {assets.map((asset) => (
          <AssetSlot
            key={asset.id}
            asset={asset}
            onUpdate={(updates) => updateAsset(asset.id, updates)}
            onRemove={() => onChange(assets.filter((item) => item.id !== asset.id))}
          />
        ))}
      </div>
      <button type="button" className="mt-3 border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700" onClick={onAddCustom}>
        + Add custom asset
      </button>
    </div>
  )
}
