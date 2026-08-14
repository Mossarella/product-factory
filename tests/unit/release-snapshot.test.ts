import { describe, expect, it } from 'bun:test'
import { buildEtsyListingText, buildReleaseSnapshot, validateReleaseSnapshotArtifacts } from '@/lib/release-snapshot'

describe('release snapshot builder', () => {
  const manifest = {
    validation: [{ ruleId: 'files', label: 'Files', required: true, status: 'ok' as const }],
    warnings: ['none'],
    files: [{ folder: 'PNG', zipFilename: 'demo.png', origName: 'demo.png' }],
    fixedAssets: [{ assetKey: 'thankyou', zipFilename: 'THANKYOU.png', source: 'shop-default' as const }],
    template: { id: 'template-1', name: 'Illustration' },
  }

  it('accepts artifacts that match the product and build version', () => {
    expect(validateReleaseSnapshotArtifacts({
      listing: { productName: 'Demo Product', title: 'Demo', description: 'Description', tags: ['printable'] },
      summary: { productId: 'product-1', productName: 'Demo Product', version: 2, builtAt: '2026-08-13T10:00:00.000Z' },
      productId: 'product-1',
      productName: 'Demo Product',
      version: 2,
    })).toBe(true)
  })

  it('rejects stale, mismatched, and malformed release artifacts', () => {
    const base = {
      listing: { productName: 'Demo Product', title: 'Demo', description: 'Description', tags: ['printable'] },
      summary: { productId: 'product-1', productName: 'Demo Product', version: 2, builtAt: '2026-08-13T10:00:00.000Z' },
      productId: 'product-1',
      productName: 'Demo Product',
      version: 2,
    }
    expect(validateReleaseSnapshotArtifacts({ ...base, version: 3 })).toBe(false)
    expect(validateReleaseSnapshotArtifacts({ ...base, productId: 'other-product' })).toBe(false)
    expect(validateReleaseSnapshotArtifacts({ ...base, summary: { ...base.summary, version: 1 } })).toBe(false)
    expect(validateReleaseSnapshotArtifacts({ ...base, listing: null })).toBe(false)
  })

  it('freezes listing and package summary data', () => {
    const tags = ['printable', 'digital download']
    const snapshot = buildReleaseSnapshot({
      productId: 'product-1',
      productName: 'Demo Product',
      sku: 'DEMO-001',
      etsyTitle: 'Demo printable',
      description: 'A useful printable.',
      etsyTags: tags,
      price: 4.5,
      currency: 'USD',
      licenseType: 'personal',
      commercialPrice: null,
      version: 2,
      builtAt: '2026-08-13T10:00:00.000Z',
      manifest,
    })

    tags.push('mutated')
    expect(snapshot.listing.tags).toEqual(['printable', 'digital download'])
    expect(snapshot.summary).toMatchObject({ productId: 'product-1', version: 2, fileCount: 1, fixedAssetCount: 1 })
    expect(buildEtsyListingText(snapshot.listing)).toContain('Title: Demo printable')
    expect(buildEtsyListingText(snapshot.listing)).toContain('Tags: printable, digital download')
  })
})
