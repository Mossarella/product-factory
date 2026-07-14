'use client'

import { ProductConfig } from '@/lib/types'

interface Props {
  config: ProductConfig
  onChange: (updates: Partial<ProductConfig>) => void
}

const inputClass =
  'w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none'
const labelClass = 'mb-1 block text-xs uppercase tracking-wide text-zinc-500'

export function ProductInfo({ config, onChange }: Props) {
  const titleLength = config.etsyTitle.length
  const counterClass =
    titleLength >= 140 ? 'text-red-500' : titleLength >= 120 ? 'text-yellow-500' : 'text-zinc-500'

  return (
    <div className="font-mono">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className={labelClass}>SKU</span>
          <input className={inputClass} value={config.sku} onChange={(event) => onChange({ sku: event.target.value })} />
        </label>
        <label className="flex-1">
          <span className={labelClass}>Contact</span>
          <input className={inputClass} value={config.contact} onChange={(event) => onChange({ contact: event.target.value })} />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className={labelClass}>Product Name</span>
          <input className={inputClass} value={config.productName} onChange={(event) => onChange({ productName: event.target.value })} />
        </label>
        <label className="flex-1">
          <span className={labelClass}>Etsy Title</span>
          <input className={inputClass} value={config.etsyTitle} onChange={(event) => onChange({ etsyTitle: event.target.value })} />
          <span className={`mt-1 block text-xs ${counterClass}`}>{titleLength} / 140</span>
        </label>
      </div>

      <label className="mt-3 block">
        <span className={labelClass}>Description</span>
        <textarea className={`${inputClass} min-h-[72px]`} value={config.description} onChange={(event) => onChange({ description: event.target.value })} />
      </label>

      <label className="mt-3 block">
        <span className={labelClass}>Extra README notes</span>
        <textarea className={`${inputClass} min-h-[72px]`} value={config.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sm:w-32">
          <span className={labelClass}>Price $</span>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={config.price}
            onChange={(event) => onChange({ price: Number(event.target.value) })}
          />
        </label>
        <label className="sm:w-28">
          <span className={labelClass}>Currency</span>
          <select className={inputClass} value={config.currency} onChange={(event) => onChange({ currency: event.target.value })}>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="sm:w-40">
          <span className={labelClass}>License</span>
          <select
            className={inputClass}
            value={config.licenseType}
            onChange={(event) => onChange({ licenseType: event.target.value as ProductConfig['licenseType'] })}
          >
            <option value="personal">Personal</option>
            <option value="commercial">Commercial</option>
            <option value="both">Both</option>
          </select>
        </label>
        {config.licenseType === 'both' && (
          <label className="sm:w-40">
            <span className={labelClass}>Commercial Price $</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={config.commercialPrice ?? ''}
              onChange={(event) => onChange({ commercialPrice: Number(event.target.value) })}
            />
          </label>
        )}
      </div>
    </div>
  )
}
