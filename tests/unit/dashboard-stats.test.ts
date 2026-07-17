import { describe, expect, it, mock } from 'bun:test'

// Mock fs and api-files BEFORE importing dashboard-stats
mock.module('fs', () => ({
  default: {
    readdirSync: () => { throw new Error('ENOENT') }, // simulate no hero dir
  },
  readdirSync: () => { throw new Error('ENOENT') },
}))

mock.module('@/lib/api-files', () => ({
  PRODUCTS_DIR: '/tmp/test-products',
}))

const { computeStats } = await import('@/lib/dashboard-stats')

function makeProduct(overrides = {}) {
  return {
    name: 'TestProduct',
    complete: false,
    description: 'A product',
    etsyTitle: 'Test Etsy Title',
    etsyTags: ['tag1', 'tag2'],
    createdAt: new Date(),
    files: [{ id: '1', origName: 'image.png' }],
    ...overrides,
  }
}

describe('computeStats()', () => {
  it('counts total correctly', () => {
    const stats = computeStats([makeProduct(), makeProduct({ name: 'P2' })], 'user1')
    expect(stats.total).toBe(2)
  })

  it('counts readyToPublish (complete: true)', () => {
    const stats = computeStats([
      makeProduct({ complete: true }),
      makeProduct({ complete: false }),
    ], 'user1')
    expect(stats.readyToPublish).toBe(1)
  })

  it('counts needsReview (not complete but has files or title)', () => {
    const stats = computeStats([
      makeProduct({ complete: false, files: [{ id: '1', origName: 'x.png' }], etsyTitle: '' }),
      makeProduct({ complete: false, files: [], etsyTitle: 'Has Title' }),
      makeProduct({ complete: false, files: [], etsyTitle: '' }),
    ], 'user1')
    expect(stats.needsReview).toBe(2)
  })

  it('needReadme counts products with empty description', () => {
    const stats = computeStats([
      makeProduct({ description: '' }),
      makeProduct({ description: '   ' }),
      makeProduct({ description: 'Has desc' }),
    ], 'user1')
    expect(stats.needReadme).toBe(2)
  })

  it('noGifPreview counts products without any .gif file', () => {
    const stats = computeStats([
      makeProduct({ files: [{ id: '1', origName: 'anim.gif' }] }),
      makeProduct({ name: 'P2', files: [{ id: '2', origName: 'image.png' }] }),
    ], 'user1')
    expect(stats.noGifPreview).toBe(1)
  })

  it('sharedTags counts products with duplicate tag sets', () => {
    const stats = computeStats([
      makeProduct({ name: 'P1', etsyTags: ['a', 'b'] }),
      makeProduct({ name: 'P2', etsyTags: ['b', 'a'] }), // same as P1 after sort
      makeProduct({ name: 'P3', etsyTags: ['c'] }),
    ], 'user1')
    expect(stats.sharedTags).toBe(2) // P1 and P2 share identical tags
  })

  it('returns zero stats for empty product list', () => {
    const stats = computeStats([], 'user1')
    expect(stats.total).toBe(0)
    expect(stats.readyToPublish).toBe(0)
    expect(stats.needsReview).toBe(0)
  })
})
