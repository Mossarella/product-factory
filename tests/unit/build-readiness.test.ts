import { describe, expect, it } from 'bun:test'
import { evaluateBuildReadiness, getReadinessStatus, readinessLabel } from '@/lib/build-readiness'
import type { ProductConfig } from '@/lib/types'

const baseConfig: ProductConfig = {
  name: 'wall-art',
  sku: 'WALL-001',
  productName: 'Wall Art',
  etsyTitle: 'Printable Wall Art',
  description: 'A printable wall art set.',
  notes: '',
  contact: 'hello@example.com',
  price: 8,
  currency: 'USD',
  licenseType: 'personal',
  folders: ['Main'],
  mascotFiles: [],
  fixedAssetFiles: [],
  etsyTags: Array.from({ length: 10 }, (_, index) => `tag-${index}`),
  latestBuild: null,
  complete: false,
  createdAt: '',
}

const files = [{ origName: 'printable.pdf', folder: 'Main', variant: 'A' }]
const assets = [{ id: 'thankyou', blob: null as File | null }]

const readyIdentity = { shopName: 'Pixel Shop', shopContact: 'hello@example.com' }

describe('evaluateBuildReadiness()', () => {
  it('blocks packaging when required product data is missing', () => {
    const readiness = evaluateBuildReadiness({ ...baseConfig, productName: '', etsyTags: [] }, [], assets, [], false, {})

    expect(readiness.canBuild).toBe(false)
    expect(readiness.blocking.map((entry) => entry.id)).toEqual(expect.arrayContaining(['product-name', 'tags', 'hero', 'files', 'folders', 'shop-identity']))
    expect(getReadinessStatus(readiness)).toBe('blocked')
    expect(readinessLabel(readiness)).toContain('BLOCKING')
  })

  it('allows packaging with a warning when optional contact is absent', () => {
    const readiness = evaluateBuildReadiness({ ...baseConfig, contact: '' }, files, assets, [], true, { shopName: 'Pixel Shop', shopContact: '' })

    expect(readiness.canBuild).toBe(true)
    expect(readiness.warnings.map((entry) => entry.id)).toContain('shop-contact')
    expect(getReadinessStatus(readiness)).toBe('warning')
  })

  it('reports a fully ready package when all required checks pass', () => {
    const readiness = evaluateBuildReadiness(baseConfig, files, assets, [], true, readyIdentity)

    expect(readiness.canBuild).toBe(true)
    expect(readiness.blocking).toHaveLength(0)
    expect(readiness.warnings).toHaveLength(0)
    expect(getReadinessStatus(readiness)).toBe('ready')
    expect(readinessLabel(readiness)).toBe('READY TO PACKAGE')
  })
})
