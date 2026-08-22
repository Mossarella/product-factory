import type { BuildManifest, ValidationEntry } from '@/lib/zip-server'
import type { Json } from '@/lib/supabase/database.types'

export interface ReleaseListingSnapshot {
  productName: string
  sku: string
  title: string
  description: string
  tags: string[]
  price: number
  currency: string
  licenseType: string
  commercialPrice: number | null
}

export interface ReleaseSummary {
  productId: string
  productName: string
  version: number
  builtAt: string
  validation: ValidationEntry[] | null
  warnings: string[]
  fileCount: number
  fixedAssetCount: number
  template: { id: string; name: string } | null
}

export interface ReleaseSnapshot {
  listing: ReleaseListingSnapshot
  summary: ReleaseSummary
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateReleaseSnapshotArtifacts(input: {
  listing: Json
  summary: Json
  productId: string
  productName: string
  version: number
}): boolean {
  if (!isRecord(input.listing) || !isRecord(input.summary)) return false
  const listingTags = input.listing.tags
  return input.listing.productName === input.productName
    && typeof input.listing.title === 'string'
    && typeof input.listing.description === 'string'
    && Array.isArray(listingTags)
    && listingTags.every((tag) => typeof tag === 'string')
    && input.summary.productId === input.productId
    && input.summary.productName === input.productName
    && input.summary.version === input.version
    && typeof input.summary.builtAt === 'string'
}

export function buildEtsyListingText(listing: ReleaseListingSnapshot): string {
  const lines = [
    `Title: ${listing.title}`,
    `Price: ${listing.price.toFixed(2)} ${listing.currency}`,
    `License: ${listing.licenseType}`,
    `SKU: ${listing.sku}`,
    '',
    listing.description,
    '',
    `Tags: ${listing.tags.join(', ')}`,
  ]
  if (listing.commercialPrice != null) lines.splice(2, 0, `Commercial price: ${listing.commercialPrice.toFixed(2)} ${listing.currency}`)
  return `${lines.join('\\n').trim()}\\n`
}

export function buildReleaseSnapshot(input: {
  productId: string
  productName: string
  sku: string
  etsyTitle: string
  description: string
  etsyTags: string[]
  price: number
  currency: string
  licenseType: string
  commercialPrice: number | null
  version: number
  builtAt: string
  manifest: Pick<BuildManifest, 'validation' | 'warnings' | 'files' | 'fixedAssets' | 'template'>
}): ReleaseSnapshot {
  return {
    listing: {
      productName: input.productName,
      sku: input.sku,
      title: input.etsyTitle,
      description: input.description,
      tags: [...input.etsyTags],
      price: input.price,
      currency: input.currency,
      licenseType: input.licenseType,
      commercialPrice: input.commercialPrice,
    },
    summary: {
      productId: input.productId,
      productName: input.productName,
      version: input.version,
      builtAt: input.builtAt,
      validation: input.manifest.validation,
      warnings: [...input.manifest.warnings],
      fileCount: input.manifest.files.length,
      fixedAssetCount: input.manifest.fixedAssets.length,
      template: input.manifest.template,
    },
  }
}
