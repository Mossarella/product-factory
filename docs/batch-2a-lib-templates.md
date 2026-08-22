# Batch 2A — lib/templates.ts, lib/zip.ts, updated templates

Read `docs/v2-conventions.md` first.

## Your task
Implement the template filling logic and ZIP building logic for the universal (non-PNGTuber) model.
Also rewrite the readme.txt and etsy.txt templates.

---

## `lib/templates.ts`

### Types
```ts
export interface TemplateData {
  name: string           // product name
  etsyName: string       // Etsy title
  shopName: string
  contact: string
  description: string
  notes: string
  licenseType: 'personal' | 'commercial' | 'both'
  price: number
  commercialPrice?: number
  currency: string
  folders: Array<{ label: string; count: number }>
  etsyTags: string[]
}
```

### `fillTemplate(template: string, d: TemplateData): string`
Replace all `{{variable}}` placeholders:

- `{{name}}` → `d.name`
- `{{etsyName}}` → `d.etsyName`
- `{{shopName}}` → `d.shopName`
- `{{contact}}` → `d.contact`
- `{{description}}` → `d.description`
- `{{notes}}` → `d.notes`
- `{{etsyTags}}` → `d.etsyTags.join(', ')`
- `{{folders}}` → multiline list:
  ```
    - Main (4 files)
    - Transparent (2 files)
  ```
- `{{licenseBlock}}` → based on licenseType:
  - personal: `"Personal use only. Not for commercial resale or redistribution."`
  - commercial: `"Commercial use included. Credit appreciated."`
  - both: `"Personal use: $${price} · Commercial license: $${commercialPrice ?? '—'} (message shop for commercial)"`

### `buildReadmeText(d: TemplateData): string`
- Read `templates/readme.txt` using `fs.readFileSync`
- Call `fillTemplate` and return

### `buildEtsyText(d: TemplateData): string`
- Read `templates/etsy.txt`
- Call `fillTemplate` and return

Both functions are sync. Export them as named exports.

---

## `lib/zip.ts` (client-side only — this is called from browser)

This file will be imported by the frontend React component, NOT by server code.
Use `'use client'` directive is NOT needed (it's a lib), but do NOT import `fs` or `path`.

### Types
```ts
export interface ZipFile {
  id: string
  file: File          // browser File object
  folder: string      // user-defined folder name
  variant: string     // optional free-text variant
  url: string         // blob URL
}

export interface FixedAsset {
  id: string
  label: string
  zipName: string
  blob: File | null
}
```

### `resolveFilename(productName: string, f: ZipFile, indexInFolder: number, totalInFolder: number): string`
File naming:
- If `f.variant` is set: `${productName}_${f.folder}_${f.variant}.${ext}`
- If only one file in folder: `${productName}_${f.folder}.${ext}`
- Multiple files, no variant: `${productName}_${f.folder}_${indexInFolder + 1}.${ext}`

### `buildZipTree(productName: string, files: ZipFile[], fixedAssets: FixedAsset[]): string`
Build an ASCII tree preview string. Example:
```
DuckPack.zip
├── Files/
│   ├── Main/
│   │   ├── Duck_Main_1.png
│   │   └── Duck_Main_2.png
│   └── Transparent/
│       └── Duck_Transparent.png
├── README.txt
└── THANKYOU.png
```

### `buildZip(productName: string, files: ZipFile[], fixedAssets: FixedAsset[], readmeText: string): Promise<Blob>`
- Use `JSZip` (import from 'jszip')
- For each file: `zip.folder('Files')!.folder(f.folder)!.file(filename, await f.file.arrayBuffer())`
- Add `README.txt`
- For each fixedAsset with blob and zipName: `zip.file(asset.zipName, await asset.blob.arrayBuffer())`
- Return `zip.generateAsync({ type: 'blob' })`

---

## `templates/readme.txt` — REWRITE (generic, no PNGTuber copy)

```
{{name}}
by {{shopName}}
────────────────────────────────────────

{{description}}

────────────────────────────────────────
WHAT'S INCLUDED
────────────────────────────────────────

{{folders}}

────────────────────────────────────────
USAGE & RIGHTS
────────────────────────────────────────

{{licenseBlock}}

{{notes}}

────────────────────────────────────────
QUESTIONS?
────────────────────────────────────────

{{contact}}
We actually read these — don't hesitate!

────────────────────────────────────────
Thanks for supporting {{shopName}} —
you just picked up {{name}}. Enjoy! 🎉
```

## `templates/etsy.txt` — UPDATE (add {{licenseBlock}}, keep existing tone)

Read the existing `templates/etsy.txt` first, then:
- Replace `{{notes}}` in the USAGE RIGHTS section with `{{licenseBlock}}\n\n{{notes}}`
- Keep everything else exactly as-is
- The existing file path: `templates/etsy.txt`

Print `=== COMPLETE: batch-2a-lib-templates ===` when done.
