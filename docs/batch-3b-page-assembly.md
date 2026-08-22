# Batch 3B — app/page.tsx, app/layout.tsx, config.ts

Read `docs/v2-conventions.md` first.
Read ALL components from `components/` and `lib/types.ts` before writing.
Working directory: `/Users/Noppheera.Bha/Desktop/Work/product-factory`

## Your task
Wire all components together into the main page, update layout, and create config.ts.

---

## `config.ts` (at root, replaces `config.js`)
```ts
export const CONFIG = {
  shopName: 'MossarellaStudio',
  contact: 'etsy.com/shop/MossarellaStudio',
  description: 'A handcrafted digital product made with love.',
  readmeFooter: 'Personal and commercial use allowed with credit. Do not redistribute.',
  etsyTagDefaults: [
    'digital download', 'instant download', 'etsy digital', 'digital art',
    'png file', 'commercial use', 'personal use', 'zip file', 'creative assets',
  ],
  extraFixedAssets: [] as Array<{ id: string; label: string; slot: string; zipName: string }>,
}
```

---

## `app/layout.tsx` — UPDATE
- Change metadata title to "Product Factory — MossarellaStudio"
- Keep existing font setup
- Body: `font-mono bg-zinc-950 text-zinc-100 min-h-screen`
- Remove any Geist font variable classes if they conflict with monospace feel
  (keep Geist Mono, remove Geist Sans if you want — or just keep both)

---

## `app/page.tsx`
`'use client'`

This is the main orchestration component. It holds all state and passes props down.

### State
```ts
const [license, setLicense] = useState<{ plan: 'free'|'pro'; activatedAt?: string }>({ plan: 'free' })
const [products, setProducts] = useState<ProductSummary[]>([])
const [activeProduct, setActiveProduct] = useState<string | null>(null)
const [config, setConfig] = useState<ProductConfig | null>(null)
const [files, setFiles] = useState<FileEntry[]>([])
const [fixedAssets, setFixedAssets] = useState<FixedAssetDef[]>(INITIAL_FIXED_ASSETS)
const [etsyTags, setEtsyTags] = useState<string[]>([])
const [dirty, setDirty] = useState(false)
const [zipPreviewText, setZipPreviewText] = useState<string | null>(null)
const [heroImageLoaded, setHeroImageLoaded] = useState(false)
```

### INITIAL_FIXED_ASSETS
```ts
const INITIAL_FIXED_ASSETS: FixedAssetDef[] = [
  { id: 'thankyou', label: 'Thank You card',  slot: '/api/slot/thank-you-image', zipName: 'THANKYOU.png', builtin: true, blob: null },
  { id: 'howto',    label: 'How To Use',       slot: '/api/slot/how-to-use',      zipName: 'HOWTO.png',   builtin: true, blob: null },
]
```

### On mount
1. Fetch `/api/license` → setLicense
2. Fetch `/api/products` → setProducts
3. Auto-load fixed assets: for each asset with a slot, GET the slot URL and set blob if ok
4. Load CONFIG defaults

### loadProduct(name: string)
1. GET `/api/products/${encodeURIComponent(name)}/config` → ProductConfig
2. setConfig(config)
3. setFiles([]) then restore files from config.mascotFiles (fetch each from `/api/products/${name}/file/${filename}`)
4. setEtsyTags(config.etsyTags || [])
5. Reset veado/extra files (check `/api/products/${name}/veado`)
6. setDirty(false)

### saveProduct()
1. Validate: check no files are missing required fields
2. Upload each file in `files` to `/api/products/${name}/file`
3. Compute `complete`: name set + etsyTitle set + price > 0 + files.length > 0
4. Build mascotFiles manifest from files state
5. POST config to `/api/products/${name}/config`
6. Refresh product list
7. setDirty(false), flash "Saved!"

### downloadZip()
1. Import `buildZip` from `lib/zip.ts`
2. Fetch readme template `/api/templates/readme.txt`
3. Fill template with gatherData()
4. Call `buildZip(productName, files, fixedAssets, readmeText)`
5. Trigger download

### Page layout structure
```tsx
<div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
  {/* Header */}
  <div className="flex items-center gap-3 mb-1">
    <img src="/api/slot/logo" alt="logo" className="w-10 h-10 object-contain rounded" />
    <h1 className="text-xl font-mono font-bold">MossarellaStudio — Product Factory</h1>
  </div>
  <p className="text-zinc-500 text-sm">Pack your digital product → generate README → download ZIP → list on Etsy</p>

  <LicenseBanner ... />

  {/* Section: Product */}
  <section className="border border-zinc-800 bg-zinc-950/80 p-4">
    <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">Product</h2>
    <ProductSelector ... />
  </section>

  {/* Section: 1. Product Info */}
  {config && (
    <section className="border border-zinc-800 p-4">
      <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">1. Product Info</h2>
      <ProductInfo config={config} onChange={handleConfigChange} />
    </section>
  )}

  {/* Section: 2. File Folders */}
  {config && (
    <section className="border border-zinc-800 p-4">
      <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">2. File Folders</h2>
      <p className="text-zinc-600 text-xs mb-3">Define folders to organize your files in the ZIP.</p>
      <FolderManager folders={config.folders} onChange={f => handleConfigChange({ folders: f })} />
    </section>
  )}

  {/* Section: 3. Product Files */}
  {config && (
    <section className="border border-zinc-800 p-4">
      <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">3. Product Files</h2>
      <FileManager files={files} folders={config.folders} onChange={setFiles} productName={config.productName} />
    </section>
  )}

  {/* Section: 4. Fixed Assets */}
  <section className="border border-zinc-800 p-4">
    <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">4. Fixed Assets</h2>
    <p className="text-zinc-600 text-xs mb-3">Shared across all products. Auto-loaded from assets/ folder.</p>
    <FixedAssets assets={fixedAssets} onChange={setFixedAssets} onAddCustom={addCustomAsset} />
  </section>

  {/* Section: 5. README Preview */}
  {config && (
    <section className="border border-zinc-800 p-4">
      <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">5. README Preview</h2>
      <ReadmePreview config={config} files={files} />
    </section>
  )}

  {/* Section: 6. Etsy Listing */}
  {config && (
    <section className="border border-zinc-800 p-4">
      <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">6. Etsy Listing</h2>
      <EtsySlots activeProduct={activeProduct!} onHeroLoaded={setHeroImageLoaded} />
      <div className="mt-4">
        <EtsyListing
          activeProduct={activeProduct}
          config={config}
          files={files}
          fixedAssets={fixedAssets}
          etsyTags={etsyTags}
          onTagsChange={setEtsyTags}
          heroImageLoaded={heroImageLoaded}
        />
      </div>
    </section>
  )}
</div>
```

### ReadmePreview (inline or separate component)
- "Refresh" button → fetch `/api/templates/readme.txt`, fill with `fillTemplate()`, display in `<pre>`
- `<pre className="bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-400 whitespace-pre-wrap max-h-64 overflow-y-auto">`

### Cmd+S shortcut
```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (activeProduct) saveProduct()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [activeProduct, config, files])
```

### `/api/slot/logo` fallback
The logo is served from `assets/logo/logo.png` via the global slot API.
The `img` tag should have `onError` to hide if 404.

---

## EtsySlots: add `onHeroLoaded` prop
When the hero slot image loads successfully, call `onHeroLoaded(true)`.
Pass this prop through to `EtsySlots` (update that component's props too).

Print `=== COMPLETE: batch-3b-page-assembly ===` when done.
