'use client'

import { FormEvent, useState } from 'react'
import { ProductSummary } from '@/lib/types'

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

const buttonClass =
  'px-3 py-1.5 text-sm font-mono border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'

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
        <select
          aria-label="Active product"
          className="min-w-52 border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
          value={activeProduct ?? ''}
          onChange={(event) => { if (event.target.value) onSelect(event.target.value) }}
        >
          <option value="" disabled>
            Select a product
          </option>
          {products.map((product) => (
            <option key={product.name} value={product.name}>
              {product.complete ? '✓' : '○'} {product.name} — {product.createdAt}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={buttonClass}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Free plan: 3 products max'}
          onClick={() => openAction('create')}
        >
          + New
        </button>
        {!canCreate && (
          <button
            type="button"
            className="text-xs text-violet-400 hover:text-violet-300"
            onClick={onUpgradeClick}
          >
            Upgrade
          </button>
        )}

        <button
          type="button"
          className={buttonClass}
          disabled={!activeProduct}
          onClick={() => openAction('rename')}
        >
          Rename
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!activeProduct}
          onClick={() => openAction('duplicate')}
        >
          Duplicate
        </button>
      </div>

      {nameAction && (
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={submitNameAction}>
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={nameAction === 'create' ? 'New product name' : 'Product name'}
            className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" className={buttonClass} disabled={isSubmitting}>
            {isSubmitting ? 'Working…' : 'Confirm'}
          </button>
          <button type="button" className={buttonClass} onClick={() => setNameAction(null)}>
            Cancel
          </button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
        <button
          type="button"
          className={dirty ? 'border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-900' : buttonClass}
          onClick={() => void onSave()}
        >
          Save product {dirty ? '•' : ''}
        </button>
        {saveFlash && <span className="text-xs text-emerald-400">Saved!</span>}
        <button
          type="button"
          className="border border-violet-700 bg-violet-900 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-800"
          onClick={onDownloadZip}
        >
          ⬇ Download ZIP
        </button>
        <button type="button" className={buttonClass} onClick={onToggleZipPreview}>
          Preview ZIP
        </button>
      </div>

      {zipPreviewText !== null && (
        <pre className="mt-3 overflow-x-auto border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
          {zipPreviewText}
        </pre>
      )}
    </div>
  )
}
