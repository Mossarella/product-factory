import { describe, expect, it, beforeEach, mock } from 'vitest'
import { SAMPLE_PRODUCTS } from '@/lib/sample-products'

const USER_ID = 'user-test-123'
let currentUser: { id: string } | null = { id: USER_ID }
let products: Array<Record<string, unknown>> = []

const result = (data: unknown, error: unknown = null) => Promise.resolve({ data, error })

const query = (table: string) => {
  const state: { data: unknown; error: unknown } = { data: null, error: null }
  const builder: Record<string, unknown> = {
    select: mock(() => builder),
    eq: mock((_column: string, value: string) => {
      if (table === 'products' && value === USER_ID) state.data = products
      return builder
    }),
    in: mock((_column: string, values: string[]) => {
      state.data = products.filter((product) => values.includes(String(product.name)))
      return builder
    }),
    upsert: mock((rows: Array<Record<string, unknown>>) => {
      for (const row of rows) {
        const existing = products.find((product) => product.owner_id === row.owner_id && product.name === row.name)
        if (existing) Object.assign(existing, row)
        else products.push({ id: `p${products.length + 1}`, ...row })
      }
      return result(null)
    }),
  }
  return builder
}

mock.module('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => query(table),
  }),
}))

const { POST } = await import('@/app/api/products/sample/route')

beforeEach(() => {
  currentUser = { id: USER_ID }
  products = []
})

describe('sample collection Supabase route', () => {
  it('requires an authenticated owner', async () => {
    currentUser = null
    expect((await POST()).status).toBe(401)
  })

  it('loads all six sample products with complete metadata', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ created: 6, existing: 0, products: SAMPLE_PRODUCTS.map((sample) => sample.name) })
    expect(products).toHaveLength(6)
    expect(products.every((product) => product.owner_id === USER_ID && product.description && product.etsy_title && Array.isArray(product.etsy_tags))).toBe(true)
  })

  it('is idempotent for the same owner', async () => {
    await POST()
    const response = await POST()
    expect(await response.json()).toMatchObject({ created: 0, existing: 6 })
    expect(products).toHaveLength(6)
  })

  it('does not treat another owner’s samples as existing', async () => {
    products = SAMPLE_PRODUCTS.map((sample, index) => ({ id: `other-${index}`, owner_id: 'other-user-456', name: sample.name }))
    const response = await POST()
    expect(await response.json()).toMatchObject({ created: 6, existing: 0 })
    expect(products.filter((product) => product.owner_id === USER_ID)).toHaveLength(6)
  })
})
