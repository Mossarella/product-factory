import { describe, expect, it } from 'bun:test'
import { generateChangelog } from '@/lib/build-changelog'
import type { BuildManifest } from '@/lib/zip-server'

function manifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    version: 1,
    productName: 'Test',
    builtAt: '2025-01-01T00:00:00.000Z',
    files: [],
    fixedAssets: [],
    template: null,
    validation: null,
    warnings: [],
    readmeHash: 'hash-a',
    ...overrides,
  }
}

describe('generateChangelog()', () => {
  it('returns Initial build when there is no previous manifest', () => {
    expect(generateChangelog(manifest(), null)).toBe('Initial build')
  })

  it('reports files added to one folder', () => {
    const current = manifest({
      files: [
        { folder: 'Expressions', zipFilename: 'happy.png', origName: 'happy.png' },
        { folder: 'Expressions', zipFilename: 'sad.png', origName: 'sad.png' },
      ],
    })

    expect(generateChangelog(current, manifest())).toBe('+ Added 2 files to Expressions')
  })

  it('uses a generic addition fragment for files across folders', () => {
    const current = manifest({
      files: [
        { folder: 'Expressions', zipFilename: 'happy.png', origName: 'happy.png' },
        { folder: 'Main', zipFilename: 'main.png', origName: 'main.png' },
        { folder: 'Main', zipFilename: 'alt.png', origName: 'alt.png' },
      ],
    })

    expect(generateChangelog(current, manifest())).toBe('+ Added 3 files')
  })

  it('reports removed files', () => {
    const previous = manifest({
      files: [{ folder: 'Expressions', zipFilename: 'happy.png', origName: 'happy.png' }],
    })

    expect(generateChangelog(manifest(), previous)).toContain('− Removed 1 file')
  })

  it('reports newly added fixed assets', () => {
    const current = manifest({
      fixedAssets: [{ assetKey: 'thankyou', zipFilename: 'THANKYOU.png', source: 'override' }],
    })

    expect(generateChangelog(current, manifest())).toContain('+ Added thankyou')
  })

  it('reports fixed assets with a changed ZIP filename as updated', () => {
    const previous = manifest({
      fixedAssets: [{ assetKey: 'thankyou', zipFilename: 'THANKYOU.png', source: 'shop-default' }],
    })
    const current = manifest({
      fixedAssets: [{ assetKey: 'thankyou', zipFilename: 'THANKYOU-v2.png', source: 'override' }],
    })

    expect(generateChangelog(current, previous)).toContain('+ Updated thankyou')
  })

  it('reports a changed README hash', () => {
    expect(generateChangelog(manifest({ readmeHash: 'hash-b' }), manifest())).toContain('+ Updated README')
  })

  it('reports no changes for identical manifests', () => {
    const current = manifest({
      files: [{ folder: 'Main', zipFilename: 'main.png', origName: 'main.png' }],
      fixedAssets: [{ assetKey: 'thankyou', zipFilename: 'THANKYOU.png', source: 'override' }],
    })

    expect(generateChangelog(current, current)).toBe('No changes detected')
  })

  it('comma-joins file and README update fragments', () => {
    const current = manifest({
      files: [{ folder: 'Expressions', zipFilename: 'happy.png', origName: 'happy.png' }],
      readmeHash: 'hash-b',
    })

    const result = generateChangelog(current, manifest())

    expect(result).toContain('+ Added')
    expect(result).toContain('+ Updated README')
    expect(result).toContain(', ')
  })
})
