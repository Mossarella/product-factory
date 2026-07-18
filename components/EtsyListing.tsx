'use client'

import { KeyboardEvent, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { FileEntry } from './FileManager'
import type { TemplateData } from '@/lib/templates'
import type { FixedAssetDef, ProductConfig } from '@/lib/types'

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
  const [description, setDescription] = useState('')
  const [loadingDescription, setLoadingDescription] = useState(false)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [loadingTags, setLoadingTags] = useState(false)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [reviewResult, setReviewResult] = useState<{ score: number; issues: Array<{ summary: string; suggestion: string }> } | null>(null)
  const [loadingReview, setLoadingReview] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
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
    setLoadingDescription(true)
    setDescriptionError(null)
    try {
      const response = await fetch(`/api/products/${activeProduct}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'description', context: templateData }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setDescriptionError(body.error || 'Failed to generate description')
        return
      }
      const data = await response.json()
      setDescription(data.description)
    } catch {
      setDescriptionError('Failed to generate description')
    } finally {
      setLoadingDescription(false)
    }
  }

  async function suggestTagsAi() {
    setLoadingTags(true)
    setTagsError(null)
    try {
      const response = await fetch(`/api/products/${activeProduct}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tags', context: templateData }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setTagsError(body.error || 'Failed to suggest tags')
        return
      }
      const data = await response.json()
      const newTags = (data.tags as string[]).filter((tag) => !etsyTags.includes(tag)).slice(0, 13 - etsyTags.length)
      onTagsChange([...etsyTags, ...newTags])
    } catch {
      setTagsError('Failed to suggest tags')
    } finally {
      setLoadingTags(false)
    }
  }

  async function reviewListing() {
    setLoadingReview(true)
    setReviewError(null)
    setReviewResult(null)
    try {
      const response = await fetch(`/api/products/${activeProduct}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review', context: { ...templateData, description: description || config.description } }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setReviewError(body.error || 'Failed to review listing')
        return
      }
      setReviewResult(await response.json())
    } catch {
      setReviewError('Failed to review listing')
    } finally {
      setLoadingReview(false)
    }
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

      <div className="space-y-2">
        <Button type="button" variant="outline" disabled={loadingReview} onClick={() => void reviewListing()}>
          {loadingReview ? 'Reviewing…' : 'Review Listing'}
        </Button>
        {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
        {reviewResult && (
          <Card className="rounded-none border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-zinc-300">Clarity score: {reviewResult.score}/10</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {reviewResult.issues.map((issue, index) => (
                <li key={index} className="text-xs text-zinc-400">
                  <span className="text-zinc-300">{issue.summary}</span> — {issue.suggestion}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div id="etsy-tags" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-zinc-300">Etsy tags</p>
          <Badge variant="outline" className={`h-auto rounded-none border-zinc-700 px-2 py-0.5 font-normal ${tagColor}`}>{etsyTags.length} / 13</Badge>
          <Button type="button" variant="outline" size="xs" disabled={loadingTags || etsyTags.length >= 13} onClick={() => void suggestTagsAi()} className="ml-auto">{loadingTags ? 'Suggesting…' : 'Suggest'}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {etsyTags.map((tag, index) => <Badge key={`${tag}-${index}`} variant="outline" className="h-auto rounded-none border-zinc-700 bg-zinc-900 px-2 py-0.5 font-normal font-mono text-zinc-300">{tag}<button type="button" onClick={() => onTagsChange(etsyTags.filter((_, tagIndex) => tagIndex !== index))} className="text-zinc-500 hover:text-red-400" aria-label={`Remove ${tag}`}>✕</button></Badge>)}
        </div>
        <div className="flex gap-2">
          <Input value={newTag} disabled={etsyTags.length >= 13} onChange={(event) => setNewTag(event.target.value)} onKeyDown={keyDown} placeholder="Add tag" className="min-w-0 flex-1 rounded-none border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50" />
          <Button type="button" variant="outline" size="xs" disabled={etsyTags.length >= 13} onClick={addTag}>Add</Button>
        </div>
        {tagsError && <p className="text-xs text-red-400">{tagsError}</p>}
      </div>

      <div id="etsy-description" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={loadingDescription} onClick={() => void refreshDescription()}>{loadingDescription ? 'Generating…' : 'Generate Description'}</Button>
          <Button type="button" variant="outline" disabled={!description} onClick={() => void copy(description)}>Copy Description</Button>
        </div>
        <Card className="max-h-64 rounded-none border border-zinc-800 bg-zinc-900 py-0 ring-0">
          <pre className="overflow-y-auto whitespace-pre-wrap p-3 text-xs text-zinc-400">{description || 'Generate to preview the Etsy description.'}</pre>
        </Card>
        {descriptionError && <p className="text-xs text-red-400">{descriptionError}</p>}
      </div>

      <Button type="button" variant="default" onClick={() => void copy(`TITLE:\n${config.etsyTitle}\n\nDESCRIPTION:\n${description}\n\nTAGS:\n${etsyTags.join(', ')}\n\nPRICE: $${config.price.toFixed(2)} (${config.licenseType})`)} className="w-full">
        Copy full listing
      </Button>
      {copied && <p className="text-emerald-400">Copied!</p>}
    </div>
  )
}
