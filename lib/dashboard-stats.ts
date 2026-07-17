import fs from 'fs'
import path from 'path'
import { PRODUCTS_DIR } from '@/lib/api-files'
import { tagKey } from '@/lib/utils'

export interface ProductForStats {
  name: string
  complete: boolean
  description: string
  etsyTitle: string
  etsyTags: string[]
  createdAt: Date | string
  files: { id: string; origName?: string }[]
}

export interface DashboardStats {
  total: number
  readyToPublish: number
  needsReview: number
  missingHero: number
  needReadme: number
  thisMonth: number
  noGifPreview: number
  sharedTags: number
}

export function heroSlotEmpty(userId: string, productName: string): boolean {
  try {
    const heroDir = path.join(PRODUCTS_DIR, userId, productName, 'assets', 'etsy-hero')
    return fs.readdirSync(heroDir).filter((f: string) => !f.startsWith('.')).length === 0
  } catch {
    return true
  }
}

export function computeStats(products: ProductForStats[], userId: string): DashboardStats {
  const total = products.length
  const readyToPublish = products.filter(p => p.complete).length
  const needsReview = products.filter(
    p => !p.complete && (p.files.length > 0 || p.etsyTitle !== '')
  ).length
  const missingHero = products.filter(p => heroSlotEmpty(userId, p.name)).length
  const needReadme = products.filter(p => !p.description || p.description.trim() === '').length

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonth = products.filter(p => new Date(p.createdAt) >= firstOfMonth).length

  const noGifPreview = products.filter(p =>
    !p.files.some(f => f.origName?.toLowerCase().endsWith('.gif'))
  ).length

  const tagGroups: Record<string, number> = {}
  for (const p of products) {
    const key = tagKey(p.etsyTags)
    tagGroups[key] = (tagGroups[key] ?? 0) + 1
  }
  const sharedTags = products.filter(p => (tagGroups[tagKey(p.etsyTags)] ?? 1) > 1).length

  return { total, readyToPublish, needsReview, missingHero, needReadme, thisMonth, noGifPreview, sharedTags }
}
