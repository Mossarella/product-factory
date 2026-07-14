'use client'

import { KeyboardEvent, useEffect, useMemo, useState } from 'react'
import type { FileEntry } from './FileManager'
import { fillTemplate, type TemplateData } from '@/lib/templates'
import type { FixedAssetDef, ProductConfig } from '@/lib/types'

const SUGGESTED_TAGS = [
  'digital download', 'instant download', 'etsy digital', 'digital art', 'printable', 'png file',
  'commercial use', 'personal use', 'zip file', 'digital file', 'creative assets', 'clipart', 'artwork',
]

interface Props {
  activeProduct: string | null
  config: ProductConfig
  files: FileEntry[]
  fixedAssets: FixedAssetDef[]
  etsyTags: string[]
  onTagsChange: (tags: string[]) => void
  heroImageLoaded?: boolean
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export function EtsyListing({ activeProduct, config, files, fixedAssets, etsyTags, onTagsChange, heroImageLoaded = false }: Props) {
  const [newTag, setNewTag] = useState('')
  const [template, setTemplate] = useState('')
  const [description, setDescription] = useState('')
  const [copied, setCopied] = useState(false)

  const templateData = useMemo<TemplateData>(() => ({
    name: config.productName,
    etsyName: config.etsyTitle,
    shopName: '',
    contact: config.contact,
    description: config.description,
    notes: config.notes,
    licenseType: config.licenseType,
    price: config.price,
    commercialPrice: config.commercialPrice,
    currency: config.currency,
    folders: config.folders.map((label) => ({ label, count: files.filter((file) => file.folder === label).length })),
    etsyTags,
  }), [config, etsyTags, files])

  useEffect(() => {
    void fetch('/api/templates/etsy.txt')
      .then((response) => response.ok ? response.text() : '')
      .then(setTemplate)
      .catch(() => setTemplate(''))
  }, [])

  function addTag() {
    const tag = newTag.trim()
    if (!tag || etsyTags.length >= 13) return
    onTagsChange([...etsyTags, tag])
    setNewTag('')
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addTag()
    }
  }

  async function refreshDescription() {
    let source = template
    if (!source) {
      const response = await fetch('/api/templates/etsy.txt')
      if (!response.ok) return
      source = await response.text()
      setTemplate(source)
    }
    setDescription(fillTemplate(source, templateData))
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const tagColor = etsyTags.length >= 13 ? 'text-red-400' : etsyTags.length >= 11 ? 'text-yellow-400' : 'text-emerald-400'
  const hasAdditionalAssets = fixedAssets.some((asset) => asset.blob !== null)
  const readiness = [
    { label: `Title set (${config.etsyTitle.length} chars)`, ok: config.etsyTitle.length > 0, target: 'product-info' },
    { label: `Price set ($${config.price.toFixed(2)})`, ok: config.price > 0, target: 'product-info' },
    { label: 'Description', ok: config.description.length > 0, target: 'etsy-description' },
    { label: `Tags (${etsyTags.length}/13)`, ok: etsyTags.length >= 10, target: 'etsy-tags', warn: etsyTags.length < 10 },
    { label: 'Hero image', ok: heroImageLoaded, target: 'etsy-slots' },
    { label: 'Files present', ok: files.length > 0, target: 'product-files', title: hasAdditionalAssets ? 'Fixed assets loaded' : undefined },
  ]

  if (!activeProduct) return null

  return (
    <div className="space-y-4 font-mono text-sm">
      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-zinc-600">Listing readiness:</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {readiness.map((item) => (
            <button key={item.label} type="button" title={item.title} onClick={() => !item.ok && scrollTo(item.target)} className={`text-left ${item.ok ? 'cursor-default text-emerald-500' : item.warn ? 'text-yellow-400' : 'text-zinc-600'}`}>
              <span>{item.ok ? '✓' : item.warn ? '✗' : '○'} {item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="etsy-tags" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-zinc-300">Etsy tags</p>
          <span className={`border border-zinc-700 px-2 py-0.5 text-xs ${tagColor}`}>{etsyTags.length} / 13</span>
          <button type="button" onClick={() => onTagsChange([...etsyTags, ...SUGGESTED_TAGS.filter((tag) => !etsyTags.includes(tag)).slice(0, 13 - etsyTags.length)])} className="ml-auto border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-violet-500">Suggest</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {etsyTags.map((tag, index) => <span key={`${tag}-${index}`} className="inline-flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-mono text-zinc-300">{tag}<button type="button" onClick={() => onTagsChange(etsyTags.filter((_, tagIndex) => tagIndex !== index))} className="text-zinc-500 hover:text-red-400" aria-label={`Remove ${tag}`}>✕</button></span>)}
        </div>
        <div className="flex gap-2">
          <input value={newTag} disabled={etsyTags.length >= 13} onChange={(event) => setNewTag(event.target.value)} onKeyDown={keyDown} placeholder="Add tag" className="min-w-0 flex-1 border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50" />
          <button type="button" disabled={etsyTags.length >= 13} onClick={addTag} className="border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-300 hover:border-violet-500 disabled:opacity-50">Add</button>
        </div>
      </div>

      <div id="etsy-description" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refreshDescription()} className="border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-300 hover:border-violet-500">Refresh Description</button>
          <button type="button" disabled={!description} onClick={() => void copy(description)} className="border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-300 hover:border-violet-500 disabled:opacity-50">Copy Description</button>
        </div>
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">{description || 'Refresh to preview the Etsy description.'}</pre>
      </div>

      <button type="button" onClick={() => void copy(`TITLE:\n${config.etsyTitle}\n\nDESCRIPTION:\n${description}\n\nTAGS:\n${etsyTags.join(', ')}\n\nPRICE: $${config.price.toFixed(2)} (${config.licenseType})`)} className="w-full border border-violet-600 bg-violet-600 px-4 py-3 text-zinc-100 hover:bg-violet-500">
        Copy full listing
      </button>
      {copied && <p className="text-emerald-400">Copied!</p>}
    </div>
  )
}
