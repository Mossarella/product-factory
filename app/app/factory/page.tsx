'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CONFIG } from '@/config'
import { EtsyListing } from '@/components/EtsyListing'
import { EtsySlots } from '@/components/EtsySlots'
import { TemplateValidation } from '@/components/TemplateValidation'
import { FileEntry } from '@/components/FileManager'
import FileManager from '@/components/FileManager'
import { FixedAssets } from '@/components/FixedAssets'
import { FolderManager } from '@/components/FolderManager'
import { LicenseBanner } from '@/components/LicenseBanner'
import { ProductInfo } from '@/components/ProductInfo'
import { ProductSelector } from '@/components/ProductSelector'
import { ReadmePreview } from '@/components/ReadmePreview'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FixedAssetDef, ProductConfig, ProductSummary } from '@/lib/types'
import { type TemplateRule, validateProduct } from '@/lib/template-rules'
import { mergeVisibleAssets, sanitizeAssetFilename } from '@/lib/utils'
import { buildZip, buildZipTree } from '@/lib/zip'

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
  }, [activeProduct, config, etsyTags, files, refreshProducts, selectedTemplateId])

  const gatherData = useCallback(() => {
    if (!config) throw new Error('Select a product first')
    return {
      name: config.productName,
      etsyName: config.etsyTitle,
      shopName: CONFIG.shopName,
      contact: config.contact || CONFIG.contact,
      description: config.description || CONFIG.description,
      notes: config.notes || CONFIG.readmeFooter,
      licenseType: config.licenseType,
      price: config.price,
      commercialPrice: config.commercialPrice,
      currency: config.currency,
      folders: config.folders.map((label) => ({ label, count: files.filter((file) => file.folder === label).length })),
      etsyTags,
    }
  }, [config, etsyTags, files])

  const fillReadmeTemplate = (template: string) => {
    const data = gatherData()
    const folders = data.folders.map((folder) => `  - ${folder.label} (${folder.count} files)`).join('\n')
    const licenseBlock = data.licenseType === 'personal'
      ? 'Personal use only. Not for commercial resale or redistribution.'
      : data.licenseType === 'commercial'
        ? 'Commercial use included. Credit appreciated.'
        : `Personal use: $${data.price} \u00b7 Commercial license: $${data.commercialPrice ?? '\u2014'} (message shop for commercial)`
    return template
      .replace(/{{name}}/g, data.name)
      .replace(/{{etsyName}}/g, data.etsyName)
      .replace(/{{shopName}}/g, data.shopName)
      .replace(/{{contact}}/g, data.contact)
      .replace(/{{description}}/g, data.description)
      .replace(/{{notes}}/g, data.notes)
      .replace(/{{licenseBlock}}/g, licenseBlock)
      .replace(/{{folders}}/g, folders)
      .replace(/{{etsyTags}}/g, data.etsyTags.join(', '))
  }

  const downloadZip = async () => {
    if (!config) return
    const response = await fetch('/api/templates/readme.txt')
    if (!response.ok) throw new Error('Could not load README template')
    const zip = await buildZip(config.productName, files, fixedAssets, fillReadmeTemplate(await response.text()))
    const url = URL.createObjectURL(zip)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${config.productName}Pack.zip`
    anchor.click()
    URL.revokeObjectURL(url)
  }

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
          onDownloadZip={() => void downloadZip()}
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
    </div>
  )
}
