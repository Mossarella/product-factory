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
  etsyTags: string[]
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
}
