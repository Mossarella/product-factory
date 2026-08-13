import { describe, expect, test } from 'bun:test'
import { normalizeAssetLoadout } from '@/lib/asset-loadouts'

describe('asset loadouts', () => {
  test('normalizes names and removes duplicate asset keys', () => {
    expect(normalizeAssetLoadout({ name: '  Studio   Pack ', assetKeys: ['thankyou', 'thankyou', ' howto ', ''] })).toEqual({
      name: 'Studio Pack',
      assetKeys: ['thankyou', 'howto'],
    })
  })

  test('filters keys that are unavailable in the current asset catalog', () => {
    expect(normalizeAssetLoadout({ name: 'Pack', assetKeys: ['thankyou', 'missing', 'howto'] }, ['thankyou', 'howto'])).toEqual({
      name: 'Pack',
      assetKeys: ['thankyou', 'howto'],
    })
  })
})
