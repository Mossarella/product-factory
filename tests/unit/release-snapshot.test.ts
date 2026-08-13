import { describe, expect, it } from 'bun:test'
import { buildEtsyListingText, buildReleaseSnapshot } from '@/lib/release-snapshot'

describe('release snapshot builder', () => {
  const manifest = {
    validation: [{ ruleId: 'files', label: 'Files', required: true, status: 'ok' as const }],
    warnings: ['none'],
    files: [{ folder: 'PNG', zipFilename: 'demo.png', origName: 'demo.png' }],
    fixedAssets: [{ assetKey: 'thankyou', zipFilename: 'THANKYOU.png', source: 'shop-default' as const }],
    template: { id: 'template-1', name: 'Illustration' },
  }

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
