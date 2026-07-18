import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'
import { userProductPath, assetPath, firstFile } from './api-files'
import { sanitizeAssetFilename } from './utils'

export interface BuildMascotFile {
  filename: string
  origName: string
  folder: string
  variant: string
}

export interface BuildFixedAsset {
  assetKey: string
  filename: string
  origName: string
}

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1)
}

export function resolveFilename(
  productName: string,
  f: { origName: string; folder: string; variant: string },
  indexInFolder: number,
  totalInFolder: number,
): string {
  const ext = extension(f.origName)
  const base = f.variant
    ? `${productName}_${f.folder}_${f.variant}`
    : totalInFolder === 1
      ? `${productName}_${f.folder}`
      : `${productName}_${f.folder}_${indexInFolder + 1}`
  return `${base}.${ext}`
}

function groupFiles(files: BuildMascotFile[]): Map<string, BuildMascotFile[]> {
  const folders = new Map<string, BuildMascotFile[]>()
  for (const file of files) {
    const group = folders.get(file.folder) ?? []
    group.push(file)
    folders.set(file.folder, group)
  }
  return folders
}

export interface ManifestFileEntry { folder: string; zipFilename: string; origName: string }
export interface ManifestAssetEntry { assetKey: string; zipFilename: string; source: 'override' | 'shop-default' }
export interface ValidationEntry { ruleId: string; label: string; required: boolean; status: 'ok' | 'missing'; detail?: string }
export interface BuildManifest {
  version: number
  productName: string
  builtAt: string
  files: ManifestFileEntry[]
  fixedAssets: ManifestAssetEntry[]
  template: { id: string; name: string } | null
  validation: ValidationEntry[] | null
  warnings: string[]
}

const BUILTIN_ASSETS = [
  { id: 'thankyou', zipName: 'THANKYOU.png', globalSlot: 'thank-you-image' },
  { id: 'howto', zipName: 'HOWTO.png', globalSlot: 'how-to-use' },
]

export async function buildZipBuffer(opts: {
  userId: string
  storageProductName: string
  displayProductName: string
  mascotFiles: BuildMascotFile[]
  fixedAssetFiles: BuildFixedAsset[]
  readmeText: string
  version: number
  template: { id: string; name: string } | null
  validation: ValidationEntry[] | null
}): Promise<{ buffer: Buffer; manifest: BuildManifest }> {
  const zip = new JSZip()
  const warnings: string[] = []
  const manifestFiles: ManifestFileEntry[] = []
  const manifestAssets: ManifestAssetEntry[] = []

  const grouped = groupFiles(opts.mascotFiles)
  for (const [folder, files] of grouped) {
    files.forEach((file, index) => {
      const diskPath = userProductPath(opts.userId, opts.storageProductName, 'mascot-files', file.filename)
      if (!fs.existsSync(diskPath)) {
        warnings.push(`Skipped missing file: ${file.origName}`)
        return
      }
      const zipFilename = resolveFilename(opts.displayProductName, file, index, files.length)
      zip.folder('Files')!.folder(folder)!.file(zipFilename, fs.readFileSync(diskPath))
      manifestFiles.push({ folder, zipFilename, origName: file.origName })
    })
  }

  zip.file('README.txt', opts.readmeText)

  const overriddenKeys = new Set(opts.fixedAssetFiles.map((f) => f.assetKey))
  for (const asset of opts.fixedAssetFiles) {
    const diskPath = userProductPath(opts.userId, opts.storageProductName, 'fixed-assets', asset.filename)
    if (!fs.existsSync(diskPath)) {
      warnings.push(`Skipped missing fixed asset: ${asset.assetKey}`)
      continue
    }
    const ext = extension(asset.origName) || 'png'
    const zipFilename = `${sanitizeAssetFilename(asset.assetKey)}.${ext}`
    zip.file(zipFilename, fs.readFileSync(diskPath))
    manifestAssets.push({ assetKey: asset.assetKey, zipFilename, source: 'override' })
  }

  for (const builtin of BUILTIN_ASSETS) {
    if (overriddenKeys.has(builtin.id)) continue
    const directory = assetPath(builtin.globalSlot)
    const filename = firstFile(directory)
    if (!filename) continue
    zip.file(builtin.zipName, fs.readFileSync(path.join(directory, filename)))
    manifestAssets.push({ assetKey: builtin.id, zipFilename: builtin.zipName, source: 'shop-default' })
  }

  const manifest: BuildManifest = {
    version: opts.version,
    productName: opts.displayProductName,
    builtAt: new Date().toISOString(),
    files: manifestFiles,
    fixedAssets: manifestAssets,
    template: opts.template,
    validation: opts.validation,
    warnings,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  return { buffer, manifest }
}
