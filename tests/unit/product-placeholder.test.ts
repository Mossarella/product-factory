import { describe, expect, it } from 'vitest'
import { allProductPlaceholders, productPlaceholder } from '@/lib/product-placeholder'
import { SAMPLE_PRODUCTS } from '@/lib/sample-products'

describe('product placeholder artwork', () => {
  it('maps every sample product to a stable, distinct visual variant', () => {
    const variants = SAMPLE_PRODUCTS.map((product) => productPlaceholder(product.name))

    expect(variants).toEqual(SAMPLE_PRODUCTS.map((product) => productPlaceholder(product.name)))
    expect(new Set(variants.map((variant) => variant.key)).size).toBe(6)
    expect(new Set(variants.map((variant) => variant.category)).size).toBe(6)
  })

  it('exposes a complete visual token for every variant', () => {
    for (const variant of allProductPlaceholders()) {
      expect(variant.key).not.toBe('')
      expect(variant.category).not.toBe('')
      expect(variant.glyph).not.toBe('')
      expect(variant.accent).toContain('border-')
      expect(variant.panel).toContain('from-')
      expect(variant.art).toContain('bg-')
    }
  })

  it('uses a safe fallback for unknown products', () => {
    expect(productPlaceholder('Untitled Product').key).toBe('wall-art')
  })
})
