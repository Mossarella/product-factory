'use client'

import { FormEvent, useState } from 'react'
import { ProductSummary } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  products: ProductSummary[]
  activeProduct: string | null
  onSelect: (name: string) => void
  onCreate: (name: string) => Promise<void>
  onRename: (newName: string) => Promise<void>
  onDuplicate: (newName: string) => Promise<void>
  canCreate: boolean
  onUpgradeClick: () => void
  dirty: boolean
  saveFlash: boolean
  onSave: () => Promise<void>
  onDownloadZip: () => void
  onToggleZipPreview: () => void
  zipPreviewText: string | null
}

type NameAction = 'create' | 'rename' | 'duplicate' | null

export function ProductSelector({
  products,
  activeProduct,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  canCreate,
  onUpgradeClick,
  dirty,
  saveFlash,
  onSave,
  onDownloadZip,
  onToggleZipPreview,
  zipPreviewText,
}: Props) {
  const [nameAction, setNameAction] = useState<NameAction>(null)
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const openAction = (action: Exclude<NameAction, null>) => {
    setName(action === 'rename' ? activeProduct ?? '' : '')
    setNameAction(action)
  }

  const submitNameAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || !nameAction) return

    setIsSubmitting(true)
    try {
      if (nameAction === 'create') await onCreate(trimmedName)
      if (nameAction === 'rename') await onRename(trimmedName)
      if (nameAction === 'duplicate') await onDuplicate(trimmedName)
      setNameAction(null)
      setName('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="font-mono">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeProduct ?? undefined} onValueChange={(value) => { if (value) onSelect(value) }}>
          <SelectTrigger aria-label="Active product" className="min-w-52">
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
          {products.map((product) => (
            <SelectItem key={product.name} value={product.name}>
              {product.complete ? '✓' : '○'} {product.name} — {product.createdAt}
            </SelectItem>
          ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          disabled={!canCreate}
          title={canCreate ? undefined : 'Free plan: 3 products max'}
          onClick={() => openAction('create')}
        >
          + New
        </Button>
        {!canCreate && (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={onUpgradeClick}
          >
            Upgrade
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={!activeProduct}
          onClick={() => openAction('rename')}
        >
          Rename
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!activeProduct}
          onClick={() => openAction('duplicate')}
        >
          Duplicate
        </Button>
      </div>

      {nameAction && (
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={submitNameAction}>
          <Input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={nameAction === 'create' ? 'New product name' : 'Product name'}
            className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus-visible:ring-0"
          />
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            {isSubmitting ? 'Working…' : 'Confirm'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setNameAction(null)}>
            Cancel
          </Button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
        <Button
          type="button"
          variant="outline"
          className={dirty ? 'border-emerald-700 bg-emerald-950 text-emerald-400 hover:bg-emerald-900' : undefined}
          onClick={() => void onSave()}
        >
          Save product {dirty ? '•' : ''}
        </Button>
        {saveFlash && <span className="text-xs text-emerald-400">Saved!</span>}
        <Button
          type="button"
          variant="secondary"
          onClick={onDownloadZip}
        >
          ⬇ Download ZIP
        </Button>
        <Button type="button" variant="outline" onClick={onToggleZipPreview}>
          Preview ZIP
        </Button>
      </div>

      {zipPreviewText !== null && (
        <Card className="mt-3 border border-zinc-800 bg-zinc-900 py-0">
          <pre className="overflow-x-auto p-3 text-xs text-zinc-400">{zipPreviewText}</pre>
        </Card>
      )}
    </div>
  )
}
