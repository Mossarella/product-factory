'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { TemplateValidation } from '@/components/TemplateValidation'
import { VersionHistory } from '@/components/VersionHistory'
import { ReleasePanel } from '@/components/ReleasePanel'
import { cn } from '@/lib/cn'
import type { TemplateRule } from '@/lib/template-rules'
import { productPlaceholder } from '@/lib/product-placeholder'
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleMessage, setSampleMessage] = useState<string | null>(null)
  const [sampleError, setSampleError] = useState<string | null>(null)

  const refreshProducts = useCallback(async () => {
    const response = await fetch('/api/products')
    if (response.ok) setProducts(await response.json() as ProductSummary[])
  }, [])

  useEffect(() => {
    fetch('/api/products')
      .then((response) => (response.ok ? response.json() as Promise<ProductSummary[]> : null))
      .then((data) => { if (data) setProducts(data) })
    fetch('/api/product-templates').then(r => r.json()).then(setTemplates)
  }, [])

  async function loadSampleCollection() {
    setLoadingSamples(true)
    setSampleMessage(null)
    setSampleError(null)
    try {
      const response = await fetch('/api/products/sample', { method: 'POST' })
      const body = await response.json().catch(() => ({})) as { created?: number; existing?: number; products?: string[]; error?: string }
      if (!response.ok) {
        setSampleError(body.error || 'Could not load the sample collection')
        return
      }
      await refreshProducts()
      setSampleMessage(`${body.created ?? 0} sample products added${body.existing ? ` · ${body.existing} already in stock` : ''}`)
      if (body.products?.[0]) await selectProduct(body.products[0])
    } catch {
      setSampleError('Could not load the sample collection')
    } finally {
      setLoadingSamples(false)
    }
  }

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

  async function deleteProduct() {
    if (!selectedName) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(selectedName)}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setDeleteError(body.error || 'Could not delete product')
        return
      }
      const deletedName = selectedName
      setProducts((previous) => previous.filter((p) => p.name !== deletedName))
      setDetailCache((previous) => {
        const next = { ...previous }
        delete next[deletedName]
        return next
      })
      setSelectedName(null)
      setDeleteDialogOpen(false)
    } catch {
      setDeleteError('Could not delete product')
    } finally {
      setIsDeleting(false)
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
      {/* Inventory HUD header */}
      <div className="shrink-0 border-b border-white/10 bg-zinc-950/80 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-violet-300/70">
              <span className="h-1.5 w-1.5 bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" />
              Digital stockroom / collection
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-100 font-mono">Collection</h1>
            <p className="mt-1 max-w-2xl text-xs font-mono leading-relaxed text-zinc-500">
              Package digital products, keep every listing detail together, and prepare Etsy-ready stock. No sales or performance tracking.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              <span className="text-zinc-200">{products.length}</span> stock items
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={loadingSamples}
              onClick={() => void loadSampleCollection()}
              className="h-auto rounded-none border-violet-400/40 bg-violet-950/20 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-violet-200 hover:bg-violet-900/30"
            >
              {loadingSamples ? 'Loading samples…' : 'Load sample collection'}
            </Button>
            <Input
              aria-label="Search collection"
              placeholder="Search stock…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-auto w-full rounded-none border-white/10 bg-black/30 px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus-visible:border-violet-500 focus-visible:ring-0 sm:w-48"
            />
          </div>
        </div>
        {sampleMessage && <p role="status" className="mt-3 text-xs font-mono text-emerald-400">{sampleMessage}</p>}
        {sampleError && <p role="alert" className="mt-3 text-xs font-mono text-red-400">{sampleError}</p>}
      </div>

      {/* Main inventory + detail area */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-4 py-5 sm:px-6 lg:flex-row lg:px-8">
        {/* Inventory grid */}
        <div className="min-h-0 w-full overflow-y-auto pr-1 lg:w-[min(54%,680px)]">
          {filtered.length === 0 && (
            <div className="border border-dashed border-white/10 bg-zinc-900/30 p-8 text-center text-zinc-600 font-mono text-sm">No products found.</div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map(p => {
              const status = productStatus(p)
              const isSelected = p.name === selectedName
              const placeholder = productPlaceholder(p.name)
              return (
                <button
                  key={p.name}
                  aria-pressed={isSelected}
                  onClick={() => void selectProduct(p.name)}
                  className={cn(
                    'group relative overflow-hidden border bg-zinc-950 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                    isSelected ? `${placeholder.accent} ring-1 ring-violet-300/80 shadow-[0_0_28px_rgba(139,92,246,.18)]` : 'border-white/10 hover:border-white/30',
                  )}
                >
                  <div aria-hidden="true" className={cn('relative aspect-[4/3] overflow-hidden bg-gradient-to-br', placeholder.panel, placeholder.art)}>
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:18px_18px] opacity-30" />
                    <div className="absolute left-2 top-2 flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-white/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.9)]" />
                      STOCKED
                    </div>
                    <span className="absolute bottom-1 right-2 text-4xl font-black text-white/80 drop-shadow-lg">{placeholder.glyph}</span>
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
                  </div>
                  <div className="border-t border-white/10 p-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[9px] font-mono uppercase tracking-widest text-violet-200/80">{placeholder.category}</p>
                      <span className="shrink-0 text-[10px] font-mono text-zinc-400">${placeholder.price}</span>
                    </div>
                    <p className="min-h-8 text-xs font-semibold leading-4 text-zinc-100">{p.name}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <span className="truncate text-[9px] font-mono text-zinc-600">{p.name.slice(0, 12).toUpperCase()}</span>
                      <StatusBadge status={status} className="[&>span:last-child]:text-[9px]" />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="hidden h-auto w-px bg-white/10 lg:block" />

        {/* Right — detail */}
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
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
              <div className="min-w-0 max-w-full overflow-x-hidden pb-12">
                <div className="flex min-w-0 flex-col gap-3 mb-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-bold text-zinc-100 font-mono">{detail.productName || detail.name}</h2>
                    <p className="text-xs text-zinc-600 font-mono mt-0.5">
                      {detail.sku && <span className="mr-3">{detail.sku}</span>}
                      Created {formatDate(detail.createdAt)}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2 sm:ml-4 sm:justify-end">
                    {detail.latestBuild ? (
                      <a
                        href={`/api/products/${encodeURIComponent(detail.name)}/build/latest`}
                        className={cn(buttonVariants({ variant: 'outline' }), 'h-auto max-w-full rounded-none px-3 py-1.5 text-xs font-mono transition-colors')}
                      >
                        ⬇ Download (v{detail.latestBuild.version})
                      </a>
                    ) : (
                      <Button
                        variant="outline"
                        disabled
                        title="Build this product in the Factory page first"
                        className="h-auto max-w-full rounded-none px-3 py-1.5 text-xs font-mono transition-colors"
                      >
                        ⬇ Download
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="h-auto max-w-full rounded-none px-3 py-1.5 text-xs font-mono transition-colors"
                      onClick={() => { setDuplicating((v) => !v); setDuplicateName(''); setDuplicateError(null) }}
                    >
                      Duplicate
                    </Button>
                    <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (open) setDeleteError(null) }}>
                      <DialogTrigger
                        render={
                          <Button
                            variant="destructive"
                            className="h-auto max-w-full rounded-none px-3 py-1.5 text-xs font-mono transition-colors"
                          />
                        }
                      >
                        Delete
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete {detail.productName || detail.name}?</DialogTitle>
                          <DialogDescription>
                            This permanently deletes the product and all of its files. This cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                        <DialogFooter>
                          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                          <Button type="button" variant="destructive" disabled={isDeleting} onClick={() => void deleteProduct()}>
                            {isDeleting ? 'Deleting…' : 'Confirm delete'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
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
                    <p className="break-words text-sm font-mono text-zinc-200 mb-3 leading-relaxed">{detail.etsyTitle}</p>
                  ) : (
                    <p className="text-sm font-mono text-zinc-600 mb-3 italic">No title set</p>
                  )}
                  {detail.description ? (
                    <div>
                      <p className={`break-words text-xs font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap ${!showFullDesc ? 'line-clamp-4' : ''}`}>
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
                        <div key={folder} className="flex min-w-0 items-start justify-between gap-3 text-xs font-mono">

                          <span className="min-w-0 break-words text-zinc-400">{folder}</span>
                          <span className="shrink-0 text-zinc-600">{count} file{count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator className="mb-5" />

                <div className="mb-5">
                  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Version History</p>
                  <VersionHistory activeProduct={detail.name} mode="download" />
                </div>

                <Separator className="mb-5" />

                <div className="mb-5 border border-violet-400/20 bg-zinc-950/50 p-3 ring-1 ring-inset ring-violet-400/5">
                  <ReleasePanel activeProduct={detail.name} buildVersion={detail.latestBuild?.version ?? null} />
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
