'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CONFIG } from '@/config'
import { EtsyListing } from '@/components/EtsyListing'
import { EtsySlots } from '@/components/EtsySlots'
import { BuildProduct } from '@/components/BuildProduct'
import { TemplateValidation } from '@/components/TemplateValidation'
import { FileEntry } from '@/components/FileManager'
import FileManager from '@/components/FileManager'
import { FixedAssets } from '@/components/FixedAssets'
import { FolderManager } from '@/components/FolderManager'
import { LicenseBanner } from '@/components/LicenseBanner'
import { ProductInfo } from '@/components/ProductInfo'
import { ProductSelector } from '@/components/ProductSelector'
import { ReadmePreview } from '@/components/ReadmePreview'
import { VersionHistory } from '@/components/VersionHistory'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FixedAssetDef, ProductConfig, ProductSummary } from '@/lib/types'
import { type TemplateRule, validateProduct } from '@/lib/template-rules'
import { mergeVisibleAssets, sanitizeAssetFilename } from '@/lib/utils'
import { buildZipTree } from '@/lib/zip'

const INITIAL_FIXED_ASSETS: FixedAssetDef[] = [
  { id: 'thankyou', label: 'Thank You card', slot: '/api/slot/thank-you-image', zipName: 'THANKYOU.png', builtin: true, blob: null },
  { id: 'howto', label: 'How To Use', slot: '/api/slot/how-to-use', zipName: 'HOWTO.png', builtin: true, blob: null },
]
const DECORATIVE_ASSET_KEYS = ['readme', 'license']

type License = { plan: 'free' | 'pro'; activatedAt?: string }

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot)
}

function storedFilename(file: FileEntry) {
  return `${file.id}${fileExtension(file.file.name)}`
}

function storedAssetFilename(asset: FixedAssetDef) {
  return `${asset.id}${fileExtension(asset.blob!.name)}`
}

function normalizeProductConfig(loaded: Partial<ProductConfig>, fallbackName: string): ProductConfig {
  return {
    name: loaded.name ?? fallbackName,
    sku: loaded.sku ?? '',
    productName: loaded.productName ?? loaded.name ?? fallbackName,
    etsyTitle: loaded.etsyTitle ?? '',
    description: loaded.description ?? '',
    notes: loaded.notes ?? '',
    contact: loaded.contact ?? '',
    price: loaded.price ?? 0,
    currency: loaded.currency ?? 'USD',
    licenseType: loaded.licenseType ?? 'personal',
    commercialPrice: loaded.commercialPrice,
    folders: loaded.folders?.length ? loaded.folders : ['Main'],
    mascotFiles: (loaded.mascotFiles ?? []).map((file) => ({
      ...file,
      folder: file.folder || 'Main',
      variant: file.variant || '',
    })),
    fixedAssetFiles: loaded.fixedAssetFiles ?? [],
    latestBuild: loaded.latestBuild ?? null,
    etsyTags: loaded.etsyTags ?? [],
    complete: loaded.complete === true,
    createdAt: loaded.createdAt ?? '',
  }
}

export default function Home() {
  const [license, setLicense] = useState<License>({ plan: 'free' })
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [activeProduct, setActiveProduct] = useState<string | null>(null)
  const [config, setConfig] = useState<ProductConfig | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [fixedAssets, setFixedAssets] = useState<FixedAssetDef[]>(INITIAL_FIXED_ASSETS)
  const [templates, setTemplates] = useState<{ id: string; name: string; assets: string[]; rules: TemplateRule[] }[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [etsyTags, setEtsyTags] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const [zipPreviewText, setZipPreviewText] = useState<string | null>(null)
  const [heroImageLoaded, setHeroImageLoaded] = useState(false)
  const [buildSignal, setBuildSignal] = useState(0)

  const refreshProducts = useCallback(async () => {
    const response = await fetch('/api/products')
    if (response.ok) setProducts(await response.json() as ProductSummary[])
  }, [])

  useEffect(() => {
    void (async () => {
      const [licenseResponse] = await Promise.all([fetch('/api/license'), refreshProducts()])
      if (licenseResponse.ok) setLicense(await licenseResponse.json() as License)

      setEtsyTags(CONFIG.etsyTagDefaults)
      setFixedAssets([
        ...INITIAL_FIXED_ASSETS,
        ...CONFIG.extraFixedAssets.map((asset) => ({ ...asset, builtin: true, blob: null })),
      ])
    })()
  }, [refreshProducts])

  useEffect(() => {
    fetch('/api/product-templates')
      .then(async (r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [])

  const activeAssets = useMemo(() => (
    selectedTemplateId
      ? (templates.find(t => t.id === selectedTemplateId)?.assets ?? ['thankyou', 'howto'])
      : ['thankyou', 'howto']
  ), [selectedTemplateId, templates])

  useEffect(() => {
    setFixedAssets((current) => {
      const knownIds = new Set(current.map((a) => a.id))
      const missingKeys = activeAssets.filter(
        (key) => !DECORATIVE_ASSET_KEYS.includes(key) && !knownIds.has(key)
      )
      if (missingKeys.length === 0) return current
      return [
        ...current,
        ...missingKeys.map((key) => ({
          id: key,
          label: key,
          slot: null,
          zipName: `${sanitizeAssetFilename(key)}.png`,
          builtin: false,
          accept: '*/*',
          blob: null,
        })),
      ]
    })
  }, [activeAssets])

  useEffect(() => {
    void Promise.all(INITIAL_FIXED_ASSETS.map(async (asset) => {
      if (!asset.slot) return
      const response = await fetch(asset.slot)
      if (!response.ok) return
      const blob = await response.blob()
      setFixedAssets((current) => current.map((item) => (
        item.id === asset.id ? { ...item, blob: new File([blob], item.zipName, { type: blob.type }) } : item
      )))
    }))
  }, [])

  const loadProduct = useCallback(async (name: string) => {
    const encodedName = encodeURIComponent(name)
    const response = await fetch(`/api/products/${encodedName}/config`)
    if (!response.ok) return

    const loaded = await response.json() as Partial<ProductConfig>
    const normalized = normalizeProductConfig(loaded, name)
    setActiveProduct(name)
    setConfig(normalized)
    setSelectedTemplateId((loaded as { templateId?: string | null }).templateId ?? null)
    setFiles([])
    setHeroImageLoaded(false)
    setEtsyTags(normalized.etsyTags)

    const restored = await Promise.all(normalized.mascotFiles.map(async (entry) => {
      const fileResponse = await fetch(`/api/products/${encodedName}/file/${encodeURIComponent(entry.filename)}`)
      if (!fileResponse.ok) return null
      const blob = await fileResponse.blob()
      const file = new File([blob], entry.origName || entry.filename, { type: blob.type })
      return { id: entry.id, file, folder: entry.folder, variant: entry.variant, url: URL.createObjectURL(file) }
    }))
    setFiles(restored.filter((entry): entry is FileEntry => entry !== null))
    const restoredAssets = (await Promise.all(normalized.fixedAssetFiles.map(async (entry) => {
      const assetResponse = await fetch(`/api/products/${encodedName}/asset/${encodeURIComponent(entry.filename)}`)
      if (!assetResponse.ok) return null
      const blob = await assetResponse.blob()
      const file = new File([blob], entry.origName || entry.filename, { type: blob.type })
      return { assetKey: entry.assetKey, file }
    }))).filter((entry): entry is { assetKey: string; file: File } => entry !== null)

    setFixedAssets((current) => {
      const known = new Set(current.map((a) => a.id))
      const additions = restoredAssets
        .filter((r) => !known.has(r.assetKey))
        .map((r) => ({
          id: r.assetKey, label: r.assetKey, slot: null,
          zipName: `${sanitizeAssetFilename(r.assetKey)}.png`,
          builtin: false, accept: '*/*', blob: null,
        }))
      return [...current, ...additions].map((asset) => {
        const match = restoredAssets.find((r) => r.assetKey === asset.id)
        return match ? { ...asset, blob: match.file, manuallyPicked: true } : asset
      })
    })
    void fetch(`/api/products/${encodedName}/veado`)
    setDirty(false)
  }, [])

  const handleConfigChange = (updates: Partial<ProductConfig>) => {
    setConfig((current) => current ? { ...current, ...updates } : current)
    setDirty(true)
  }

  const handleFilesChange = (nextFiles: FileEntry[]) => {
    setFiles(nextFiles)
    setDirty(true)
  }

  const handleTagsChange = (tags: string[]) => {
    setEtsyTags(tags)
    setDirty(true)
  }

  const createProduct = async (name: string) => {
    const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!response.ok) throw new Error('Could not create product')
    const created = await response.json() as ProductConfig
    await refreshProducts()
    await loadProduct(created.name)
  }

  const renameProduct = async (newName: string) => {
    if (!activeProduct) return
    const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName }) })
    if (!response.ok) throw new Error('Could not rename product')
    const renamed = await response.json() as ProductConfig
    await refreshProducts()
    await loadProduct(renamed.name)
  }

  const duplicateProduct = async (newName: string) => {
    if (!activeProduct) return
    const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/duplicate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName }) })
    if (!response.ok) throw new Error('Could not duplicate product')
    const duplicate = await response.json() as ProductConfig
    await refreshProducts()
    await loadProduct(duplicate.name)
  }

  const saveProduct = useCallback(async () => {
    if (!activeProduct || !config) return
    if (files.some((file) => !file.file || !file.folder)) {
      window.alert('Each product file needs a file and folder.')
      return
    }

    const encodedName = encodeURIComponent(activeProduct)
    await Promise.all(files.map(async (file) => {
      const response = await fetch(`/api/products/${encodedName}/file`, {
        method: 'POST',
        headers: { 'X-Filename': storedFilename(file) },
        body: file.file,
      })
      if (!response.ok) throw new Error(`Could not upload ${file.file.name}`)
    }))

    const persistableAssets = fixedAssets.filter((asset) => asset.blob && (!asset.builtin || asset.manuallyPicked))

    await Promise.all(persistableAssets.map(async (asset) => {
      const response = await fetch(`/api/products/${encodedName}/asset`, {
        method: 'POST',
        headers: { 'X-Filename': storedAssetFilename(asset) },
        body: asset.blob,
      })
      if (!response.ok) throw new Error(`Could not upload ${asset.label}`)
    }))

    const fixedAssetFiles = persistableAssets.map((asset) => ({
      id: config.fixedAssetFiles.find((file) => file.assetKey === asset.id)?.id ?? crypto.randomUUID(),
      assetKey: asset.id,
      filename: storedAssetFilename(asset),
      origName: asset.blob!.name,
    }))

    const mascotFiles = files.map((file) => ({
      id: file.id,
      filename: storedFilename(file),
      origName: file.file.name,
      folder: file.folder,
      variant: file.variant,
    }))
    const nextConfig: ProductConfig = {
      ...config,
      name: activeProduct,
      mascotFiles,
      fixedAssetFiles,
      etsyTags,
      complete: Boolean(config.productName && config.etsyTitle && config.price > 0 && files.length > 0),
    }
    const response = await fetch(`/api/products/${encodedName}/config`, { method: 'POST', body: JSON.stringify({ ...nextConfig, templateId: selectedTemplateId }) })
    if (!response.ok) throw new Error('Could not save product')
    setConfig(nextConfig)
    await refreshProducts()
    setDirty(false)
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 2000)
  }, [activeProduct, config, etsyTags, files, fixedAssets, refreshProducts, selectedTemplateId])

  const toggleZipPreview = () => {
    if (!config) return
    setZipPreviewText((current) => current === null ? buildZipTree(config.productName, files, fixedAssets) : null)
  }

  const addCustomAsset = () => {
    setFixedAssets((current) => [...current, {
      id: crypto.randomUUID(), label: 'Custom asset', slot: null, zipName: 'CUSTOM.png', builtin: false, accept: '*/*', blob: null,
    }])
  }

  const activateLicense = async (key: string) => {
    const response = await fetch('/api/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
    if (!response.ok) throw new Error('Could not activate license')
    setLicense(await response.json() as License)
  }

  const buyLicense = () => { window.location.href = '/api/buy' }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        if (activeProduct) void saveProduct()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeProduct, config, files, saveProduct])

  const canCreate = license.plan === 'pro' || products.length < 3
  const visibleFixedAssets = fixedAssets.filter(a => activeAssets.includes(a.id))
  const templateSelectItems = [
    { value: '__none__', label: '— None —' },
    ...templates.map((template) => ({ value: template.id, label: template.name })),
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <img src="/api/slot/logo" alt="logo" className="w-10 h-10 object-contain rounded" onError={(event) => { event.currentTarget.style.display = 'none' }} />
        <h1 className="text-xl font-mono font-bold">MossarellaStudio — Product Factory</h1>
      </div>
      <p className="text-zinc-500 text-sm">Pack your digital product → generate README → download ZIP → list on Etsy</p>

      <LicenseBanner plan={license.plan} activatedAt={license.activatedAt} onActivate={activateLicense} onBuyClick={buyLicense} />

      <Card className="gap-0 bg-zinc-950 px-4">
        <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">Product</h2>
        <ProductSelector
          products={products}
          activeProduct={activeProduct}
          onSelect={loadProduct}
          onCreate={createProduct}
          onRename={renameProduct}
          onDuplicate={duplicateProduct}
          canCreate={canCreate}
          onUpgradeClick={buyLicense}
          dirty={dirty}
          saveFlash={saveFlash}
          onSave={saveProduct}
          onToggleZipPreview={toggleZipPreview}
          zipPreviewText={zipPreviewText}
        />
        {/* Product Template selector */}
        {config && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
            <label className="text-xs uppercase tracking-widest text-zinc-600 font-mono w-28 shrink-0">Template</label>
            <Select
              value={selectedTemplateId ?? '__none__'}
              items={templateSelectItems}
              onValueChange={(value) => setSelectedTemplateId(value === '__none__' ? null : value)}
            >
              <SelectTrigger className="w-auto border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 font-mono focus:border-violet-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
              </SelectContent>
            </Select>
            <a href="/app/product-templates" className="text-xs text-zinc-600 hover:text-zinc-400 font-mono transition-colors">
              Manage →
            </a>
          </div>
        )}
        {config && (
          <TemplateValidation
            config={config}
            rules={templates.find((t) => t.id === selectedTemplateId)?.rules ?? []}
          />
        )}
      </Card>

      {!config && (
        <Card className="gap-0 border border-dashed border-zinc-800 p-8 text-center text-zinc-600 text-sm ring-0">
          <p className="mb-1">Select a product above to get started</p>
          <p className="text-xs text-zinc-700">or create a new one with &quot;+ New&quot;</p>
        </Card>
      )}

      {config && (
        <Card className="gap-0 px-4">
          <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">1. Product Info</h2>
          <ProductInfo config={config} onChange={handleConfigChange} />
        </Card>
      )}
      {config && (
        <Card className="gap-0 px-4">
          <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">2. File Folders</h2>
          <p className="text-zinc-600 text-xs mb-3">Define folders to organize your files in the ZIP.</p>
          <FolderManager folders={config.folders} onChange={(folders) => handleConfigChange({ folders })} />
        </Card>
      )}
      {config && (
        <Card className="gap-0 px-4">
          <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">3. Product Files</h2>
          <FileManager files={files} folders={config.folders} onChange={handleFilesChange} productName={config.productName} />
        </Card>
      )}

      <Card className="gap-0 px-4">
        <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">4. Fixed Assets</h2>
        <p className="text-zinc-600 text-xs mb-3">Shared across all products. Auto-loaded from assets/ folder.</p>
        <FixedAssets
          assets={visibleFixedAssets}
          onChange={(updatedVisible) =>
            setFixedAssets((current) =>
              mergeVisibleAssets(current, updatedVisible, new Set(visibleFixedAssets.map((a) => a.id)))
            )
          }
          onAddCustom={addCustomAsset}
        />
      </Card>
      {config && (
        <Card className="gap-0 px-4">
          <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">5. README Preview</h2>
          <ReadmePreview config={config} files={files} />
        </Card>
      )}
      {config && (
        <Card className="gap-0 px-4">
          <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">6. Etsy Listing</h2>
          <EtsySlots activeProduct={activeProduct!} onHeroLoaded={setHeroImageLoaded} />
          <div className="mt-4">
            <EtsyListing
              activeProduct={activeProduct}
              config={config}
              files={files}
              fixedAssets={fixedAssets}
              etsyTags={etsyTags}
              onTagsChange={handleTagsChange}
              heroImageLoaded={heroImageLoaded}
            />
          </div>
        </Card>
      )}
      {config && (
        <Card className="gap-0 px-4">
          <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">7. Build</h2>
          <BuildProduct activeProduct={activeProduct!} onBuilt={() => setBuildSignal((s) => s + 1)} />
        </Card>
      )}
      {config && (
        <Card className="gap-0 px-4">
          <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">8. Version History</h2>
          <VersionHistory activeProduct={activeProduct!} mode="revert" refreshSignal={buildSignal} />
        </Card>
      )}
    </div>
  )
}
