export interface ProductSummary {
  name: string
  complete: boolean
  createdAt: string
}

export interface MascotFile {
  id: string
  filename: string
  origName: string
  folder: string
  variant: string
}

export interface FixedAssetFile {
  id: string
  assetKey: string
  filename: string
  origName: string
}

export interface LatestBuild {
  version: number
  createdAt: string
}

export interface BuildHistoryEntry {
  version: number
  fileSize: number
  changelog: string
  revertedFrom: number | null
  createdAt: string
}

export interface ReleaseHistoryEntry {
  id: string
  product_id: string
  build_id: string
  version: number
  bundle_filename: string
  bundle_size: number
  bundle_sha256: string
  listing_snapshot: Record<string, unknown>
  release_summary: Record<string, unknown>
  created_at: string
}

export interface ProductConfig {
  name: string
  sku: string
  productName: string
  etsyTitle: string
  description: string
  notes: string
  contact: string
  price: number
  currency: string
  licenseType: 'personal' | 'commercial' | 'both'
  commercialPrice?: number
  folders: string[]
  mascotFiles: MascotFile[]
  fixedAssetFiles: FixedAssetFile[]
  etsyTags: string[]
  templateId?: string | null
  latestBuild: LatestBuild | null
  complete: boolean
  createdAt: string
}

export interface FixedAssetDef {
  id: string
  label: string
  slot: string | null
  zipName: string
  builtin: boolean
  optional?: boolean
  accept?: string
  blob: File | null
  manuallyPicked?: boolean
}
