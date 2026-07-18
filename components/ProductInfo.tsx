'use client'

import { ProductConfig } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  config: ProductConfig
  onChange: (updates: Partial<ProductConfig>) => void
}

export function ProductInfo({ config, onChange }: Props) {
  const titleLength = config.etsyTitle.length
  const counterClass =
    titleLength >= 140 ? 'text-red-500' : titleLength >= 120 ? 'text-yellow-500' : 'text-zinc-500'

  return (
    <div className="font-mono">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">SKU</span>
          <Input value={config.sku} onChange={(event) => onChange({ sku: event.target.value })} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Contact</span>
          <Input value={config.contact} onChange={(event) => onChange({ contact: event.target.value })} />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Product Name</span>
          <Input value={config.productName} onChange={(event) => onChange({ productName: event.target.value })} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Etsy Title</span>
          <Input value={config.etsyTitle} onChange={(event) => onChange({ etsyTitle: event.target.value })} />
          <span className={`mt-1 block text-xs ${counterClass}`}>{titleLength} / 140</span>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Description</span>
        <Textarea className="min-h-[72px]" value={config.description} onChange={(event) => onChange({ description: event.target.value })} />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Extra README notes</span>
        <Textarea className="min-h-[72px]" value={config.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sm:w-32">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Price $</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={config.price}
            onChange={(event) => onChange({ price: Number(event.target.value) })}
          />
        </label>
        <label className="sm:w-28">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Currency</span>
          <Select value={config.currency ?? undefined} items={[{ value: 'USD', label: 'USD' }]} onValueChange={(value) => onChange({ currency: value as ProductConfig['currency'] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="sm:w-40">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">License</span>
          <Select
            value={config.licenseType}
            items={[
              { value: 'personal', label: 'Personal' },
              { value: 'commercial', label: 'Commercial' },
              { value: 'both', label: 'Both' },
            ]}
            onValueChange={(value) => onChange({ licenseType: value as ProductConfig['licenseType'] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {config.licenseType === 'both' && (
          <label className="sm:w-40">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Commercial Price $</span>
            <Input
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
