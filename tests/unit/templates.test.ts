import { describe, expect, it } from 'bun:test'
import { fillTemplate } from '@/lib/templates'
import type { TemplateData } from '@/lib/templates'

const BASE: TemplateData = {
  name: 'CutePack',
  etsyName: 'Cute Pack',
  shopName: 'MossarellaStudio',
  contact: 'hello@mossarella.com',
  description: 'A cute digital pack.',
  notes: 'Extra notes.',
  licenseType: 'personal',
  price: 8.5,
  currency: 'USD',
  folders: [{ label: 'Main', count: 5 }, { label: 'Transparent', count: 3 }],
  etsyTags: ['cute', 'digital', 'pack'],
}

describe('fillTemplate()', () => {
  it('replaces {{name}}', () => {
    expect(fillTemplate('Hello {{name}}', BASE)).toBe('Hello CutePack')
  })
  it('replaces {{shopName}}', () => {
    expect(fillTemplate('Shop: {{shopName}}', BASE)).toBe('Shop: MossarellaStudio')
  })
  it('replaces {{etsyTags}} as comma-separated', () => {
    expect(fillTemplate('Tags: {{etsyTags}}', BASE)).toBe('Tags: cute, digital, pack')
  })
  it('replaces {{folders}} with label + count lines', () => {
    const result = fillTemplate('{{folders}}', BASE)
    expect(result).toContain('Main (5 files)')
    expect(result).toContain('Transparent (3 files)')
  })
  it('personal licenseBlock says "Personal use only"', () => {
    const result = fillTemplate('{{licenseBlock}}', { ...BASE, licenseType: 'personal' })
    expect(result).toContain('Personal use only')
  })
  it('commercial licenseBlock says "Commercial use included"', () => {
    const result = fillTemplate('{{licenseBlock}}', { ...BASE, licenseType: 'commercial' })
    expect(result).toContain('Commercial use included')
  })
  it('both licenseBlock includes both prices', () => {
    const result = fillTemplate('{{licenseBlock}}', { ...BASE, licenseType: 'both', commercialPrice: 18 })
    expect(result).toContain('$8.5')
    expect(result).toContain('$18')
  })
  it('replaces all occurrences of the same placeholder', () => {
    const result = fillTemplate('{{name}} and {{name}}', BASE)
    expect(result).toBe('CutePack and CutePack')
  })
  it('leaves unknown placeholders untouched', () => {
    expect(fillTemplate('Hello {{unknown}}', BASE)).toBe('Hello {{unknown}}')
  })
})
