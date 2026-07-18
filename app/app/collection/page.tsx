'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { TemplateValidation } from '@/components/TemplateValidation'
import { cn } from '@/lib/cn'
import type { TemplateRule } from '@/lib/template-rules'
import { avatarColor } from '@/lib/utils'
import type { ProductConfig, ProductSummary } from '@/lib/types'

type ProductTemplateSummary = { id: string; name: string; rules: TemplateRule[] }

function productStatus(p: ProductSummary): 'ready' | 'in-progress' | 'empty' {
  if (p.complete) return 'ready'
  return 'empty'
}

function detailStatus(c: ProductConfig): 'ready' | 'in-progress' | 'empty' {
  if (c.complete) return 'ready'
  if (c.mascotFiles.length > 0 || c.etsyTitle.trim() !== '') return 'in-progress'
  return 'empty'
}

export default function CollectionPage() {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [detailCache, setDetailCache] = useState<Record<string, ProductConfig>>({})
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [templates, setTemplates] = useState<ProductTemplateSummary[]>([])
  const [search, setSearch] = useState('')
  const [showFullDesc, setShowFullDesc] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateName, setDuplicateName] = useState('')
  const [isSubmittingDuplicate, setIsSubmittingDuplicate] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const refreshProducts = useCallback(async () => {
    const response = await fetch('/api/products')
    if (response.ok) setProducts(await response.json() as ProductSummary[])
  }, [])

  useEffect(() => {
    void refreshProducts()
    fetch('/api/product-templates').then(r => r.json()).then(setTemplates)
  }, [refreshProducts])

  async function selectProduct(name: string) {
    setSelectedName(name)
    setShowFullDesc(false)
    if (detailCache[name]) return
    setLoadingDetail(true)
    const res = await fetch(`/api/products/${encodeURIComponent(name)}/config`)
    const data: ProductConfig = await res.json()
    setDetailCache(prev => ({ ...prev, [name]: data }))
    setLoadingDetail(false)
  }

  async function duplicateProduct() {
    if (!selectedName) return
    const trimmed = duplicateName.trim()
    if (!trimmed) return
    setIsSubmittingDuplicate(true)
    setDuplicateError(null)
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(selectedName)}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmed }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setDuplicateError(body.error || 'Could not duplicate product')
        return
      }
      const duplicated: ProductConfig = await response.json()
      await refreshProducts()
      setDetailCache((previous) => ({ ...previous, [duplicated.name]: duplicated }))
      setSelectedName(duplicated.name)
      setDuplicating(false)
      setDuplicateName('')
    } catch {
      setDuplicateError('Could not duplicate product')
    } finally {
      setIsSubmittingDuplicate(false)
    }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const detail = selectedName ? detailCache[selectedName] : null

  const filesByFolder: Record<string, number> = {}
  if (detail) {
    for (const f of detail.mascotFiles) {
      filesByFolder[f.folder] = (filesByFolder[f.folder] ?? 0) + 1
    }
  }

  const templateName = detail?.templateId
    ? (templates.find(t => t.id === detail.templateId)?.name ?? 'Unknown')
    : null
  const assignedTemplate = detail?.templateId ? templates.find(t => t.id === detail.templateId) : null

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Page header */}
      <div className="px-8 pt-8 pb-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 font-mono">Collection</h1>
            <p className="text-zinc-500 text-sm mt-1 font-mono">{products.length} products</p>
          </div>
          <Input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-auto w-44 rounded-none border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus-visible:border-violet-500 focus-visible:ring-0 md:text-xs dark:bg-zinc-900"
          />
        </div>
      </div>

      {/* Main two-panel area */}
      <div className="flex flex-1 overflow-hidden px-8 pb-8 gap-6">
        {/* Left — grid */}
        <div className="w-72 shrink-0 overflow-y-auto pr-2">
          {filtered.length === 0 && (
            <p className="text-zinc-600 font-mono text-sm mt-4">No products found.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(p => {
              const status = productStatus(p)
              const isSelected = p.name === selectedName
              return (
                <button
                  key={p.name}
                  onClick={() => selectProduct(p.name)}
                  className={`text-left border p-3 transition-colors ${
                    isSelected
                      ? 'border-violet-500 bg-zinc-800/80'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
                  }`}
                >
                  <div className={`w-10 h-10 ${avatarColor(p.name)} flex items-center justify-center mb-3`}>
                    <span className="text-white font-bold font-mono text-lg uppercase">
                      {p.name[0]}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-200 truncate leading-tight mb-1">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <StatusBadge status={status} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-zinc-800 shrink-0" />

        {/* Right — detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedName && (
            <div className="h-full flex items-center justify-center">
              <p className="text-zinc-600 font-mono text-sm">Select a product to view details.</p>
            </div>
          )}
          {selectedName && loadingDetail && (
            <div className="h-full flex items-center justify-center">
              <p className="text-zinc-600 font-mono text-sm animate-pulse">Loading…</p>
            </div>
          )}
          {selectedName && !loadingDetail && detail && (() => {
            const status = detailStatus(detail)
            return (
              <div className="pb-12">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100 font-mono">{detail.productName || detail.name}</h2>
                    <p className="text-xs text-zinc-600 font-mono mt-0.5">
                      {detail.sku && <span className="mr-3">{detail.sku}</span>}
                      Created {formatDate(detail.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    {detail.latestBuild ? (
                      <a
                        href={`/api/products/${encodeURIComponent(detail.name)}/build/latest`}
                        className={cn(buttonVariants({ variant: 'outline' }), 'h-auto rounded-none px-4 py-1.5 text-xs font-mono transition-colors')}
                      >
                        ⬇ Download (v{detail.latestBuild.version})
                      </a>
                    ) : (
                      <Button
                        variant="outline"
                        disabled
                        title="Build this product in the Factory page first"
                        className="h-auto rounded-none px-4 py-1.5 text-xs font-mono transition-colors"
                      >
                        ⬇ Download
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="h-auto rounded-none px-4 py-1.5 text-xs font-mono transition-colors"
                      onClick={() => { setDuplicating((v) => !v); setDuplicateName(''); setDuplicateError(null) }}
                    >
                      Duplicate
                    </Button>
                    <a
                      href="/app/factory"
                      className={cn(buttonVariants({ variant: 'secondary' }), 'h-auto rounded-none px-4 py-1.5 text-xs font-mono transition-colors')}
                    >
                      Open in Factory →
                    </a>
                  </div>
                </div>
                {duplicating && (
                  <form
                    onSubmit={(event) => { event.preventDefault(); void duplicateProduct() }}
                    className="flex items-center gap-2 mb-4"
                  >
                    <Input
                      autoFocus
                      required
                      placeholder="New product name"
                      value={duplicateName}
                      onChange={(event) => setDuplicateName(event.target.value)}
                      className="h-auto w-56 rounded-none border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-300"
                    />
                    <Button type="submit" variant="default" disabled={isSubmittingDuplicate} className="h-auto rounded-none px-3 py-1.5 text-xs font-mono">
                      {isSubmittingDuplicate ? 'Working…' : 'Confirm'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setDuplicating(false)} className="h-auto rounded-none px-3 py-1.5 text-xs font-mono">
                      Cancel
                    </Button>
                    {duplicateError && <p className="text-xs text-red-400">{duplicateError}</p>}
                  </form>
                )}
                <div className="flex items-center gap-1.5 mb-6">
                  <StatusBadge
                    status={status}
                    className="[&>span:first-child]:h-2 [&>span:first-child]:w-2 [&>span:last-child]:text-sm"
                  />
                </div>

                <Separator className="mb-5" />

                <div className="mb-5">
                  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Pricing & License</p>
                  <div className="flex gap-8">
                    <div>
                      <p className="text-xs text-zinc-600 font-mono mb-1">Price</p>
                      <p className="text-lg font-bold font-mono text-zinc-100">
                        ${detail.price.toFixed(2)} <span className="text-xs text-zinc-500">{detail.currency}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600 font-mono mb-1">License</p>
                      <p className="text-sm font-mono text-zinc-300 capitalize">{detail.licenseType}</p>
                      {detail.licenseType === 'both' && detail.commercialPrice != null && (
                        <p className="text-xs text-zinc-500 font-mono">Commercial: ${detail.commercialPrice.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator className="mb-5" />

                <div className="mb-5">
                  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Etsy Listing</p>
                  {detail.etsyTitle ? (
                    <p className="text-sm font-mono text-zinc-200 mb-3 leading-relaxed">{detail.etsyTitle}</p>
                  ) : (
                    <p className="text-sm font-mono text-zinc-600 mb-3 italic">No title set</p>
                  )}
                  {detail.description ? (
                    <div>
                      <p className={`text-xs font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap ${!showFullDesc ? 'line-clamp-4' : ''}`}>
                        {detail.description}
                      </p>
                      {detail.description.length > 200 && (
                        <button
                          onClick={() => setShowFullDesc(v => !v)}
                          className="text-xs text-zinc-600 hover:text-zinc-400 font-mono mt-1 transition-colors"
                        >
                          {showFullDesc ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-mono text-zinc-600 italic">No description</p>
                  )}
                </div>

                {detail.etsyTags.length > 0 && (
                  <>
                    <Separator className="mb-5" />
                    <div className="mb-5">
                      <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.etsyTags.map(tag => (
                          <Badge key={tag} variant="outline" className="rounded-none border-zinc-700 font-mono text-zinc-400">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator className="mb-5" />

                <div className="mb-5">
                  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">
                    Files <span className="text-zinc-700">({detail.mascotFiles.length})</span>
                  </p>
                  {Object.keys(filesByFolder).length === 0 ? (
                    <p className="text-xs font-mono text-zinc-600">No files uploaded yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {Object.entries(filesByFolder).map(([folder, count]) => (
                        <div key={folder} className="flex justify-between text-xs font-mono">
                          <span className="text-zinc-400">{folder}</span>
                          <span className="text-zinc-600">{count} file{count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator className="mb-5" />

                <div className="mb-5">
                  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Product Template</p>
                  <p className="text-sm font-mono text-zinc-300">{templateName ?? '— None'}</p>
                </div>

                <Separator className="mb-5" />

                <div>
                  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Readiness</p>
                  {[
                    { label: 'Has files', ok: detail.mascotFiles.length > 0 },
                    { label: 'Etsy title set', ok: detail.etsyTitle.trim() !== '' },
                    { label: 'Description written', ok: detail.description.trim() !== '' },
                    { label: 'Tags added', ok: detail.etsyTags.length > 0 },
                    { label: 'Marked complete', ok: detail.complete },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs font-mono mb-1.5">
                      <span className={item.ok ? 'text-emerald-400' : 'text-zinc-600'}>
                        {item.ok ? '✓' : '✗'}
                      </span>
                      <span className={item.ok ? 'text-zinc-400' : 'text-zinc-600'}>{item.label}</span>
                    </div>
                  ))}
                </div>

                {assignedTemplate && assignedTemplate.rules.length > 0 && (
                  <>
                    <Separator className="mb-5 mt-5" />
                    <div>
                      <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Template Validation</p>
                      <TemplateValidation config={detail} rules={assignedTemplate.rules} />
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
