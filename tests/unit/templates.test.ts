import { describe, expect, it } from 'bun:test'
import { fillTemplate, resolveTemplateData } from '@/lib/templates'
import type { ProductTemplateFields, ShopIdentity, TemplateData } from '@/lib/templates'

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

const DEFAULTS = {
  defaultShopDescription: 'default desc',
  defaultReadmeFooter: 'default footer',
}

function createProduct(overrides: Partial<ProductTemplateFields> = {}): ProductTemplateFields {
  return {
    productName: 'Pack',
    etsyTitle: 'Pack Etsy',
    contact: '',
    description: '',
    notes: '',
    licenseType: 'personal',
    price: 5,
    currency: 'USD',
    folders: [],
    etsyTags: [],
    ...overrides,
  }
}

describe('resolveTemplateData()', () => {
  it('uses the product contact, description, and notes when set', () => {
    const result = resolveTemplateData(
      createProduct({ contact: 'product@example.com', description: 'product desc', notes: 'product notes' }),
      { shopContact: 'shop@example.com', shopDescription: 'shop desc', readmeFooter: 'shop footer' },
      DEFAULTS,
    )

    expect(result.contact).toBe('product@example.com')
    expect(result.description).toBe('product desc')
    expect(result.notes).toBe('product notes')
  })

  it('falls back to shop contact, description, and footer', () => {
    const result = resolveTemplateData(
      createProduct(),
      { shopContact: 'shop@example.com', shopDescription: 'shop desc', readmeFooter: 'shop footer' },
      DEFAULTS,
    )

    expect(result.contact).toBe('shop@example.com')
    expect(result.description).toBe('shop desc')
    expect(result.notes).toBe('shop footer')
  })

  it('uses shopName over name', () => {
    const result = resolveTemplateData(createProduct(), { shopName: 'Named Shop', name: 'Legacy Shop' }, DEFAULTS)

    expect(result.shopName).toBe('Named Shop')
  })

  it('falls back to name when shopName is unset or empty', () => {
    expect(resolveTemplateData(createProduct(), { name: 'Legacy Shop' }, DEFAULTS).shopName).toBe('Legacy Shop')
    expect(resolveTemplateData(createProduct(), { shopName: '', name: 'Legacy Shop' }, DEFAULTS).shopName).toBe('Legacy Shop')
  })

  it("falls back to 'My Shop' when no shop name is set", () => {
    expect(resolveTemplateData(createProduct(), {}, DEFAULTS).shopName).toBe('My Shop')
  })

  it('falls back to default description and footer when product and shop fields are empty', () => {
    const shop: ShopIdentity = { shopDescription: '', readmeFooter: '' }
    const result = resolveTemplateData(createProduct(), shop, DEFAULTS)

    expect(result.description).toBe('default desc')
    expect(result.notes).toBe('default footer')
  })

  it('passes through fields it does not resolve from the product', () => {
    const folders = [{ label: 'Assets', count: 2 }]
    const etsyTags = ['asset', 'pack']
    const product = createProduct({
      productName: 'Assets Pack',
      etsyTitle: 'Assets Pack Etsy',
      licenseType: 'both',
      price: 9,
      commercialPrice: 19,
      currency: 'EUR',
      folders,
      etsyTags,
    })
    const result = resolveTemplateData(product, {}, DEFAULTS)

    expect(result.name).toBe(product.productName)
    expect(result.etsyName).toBe(product.etsyTitle)
    expect(result.licenseType).toBe(product.licenseType)
    expect(result.price).toBe(product.price)
    expect(result.commercialPrice).toBe(product.commercialPrice)
    expect(result.currency).toBe(product.currency)
    expect(result.folders).toBe(folders)
    expect(result.etsyTags).toBe(etsyTags)
  })
})
