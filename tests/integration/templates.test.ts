import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const USER_ID = 'user-test-123'
const OTHER_USER_ID = 'other-user-456'
const RULES = [{ id: 'r1', type: 'field_present', label: 'Has notes', required: true, field: 'notes' }]
const TEMPLATE = { id: 't1', name: 'Test Template', assets: ['readme'], rules: RULES }
let currentUser: { id: string } | null = { id: USER_ID }
let templates = [{ ...TEMPLATE }]

const result = (data: unknown, error: unknown = null) => Promise.resolve({ data, error })
const query = (table: string) => {
  const state: { data: unknown; error: unknown } = { data: null, error: null }
  const builder: Record<string, unknown> = {
    select: mock(() => builder),
    eq: mock((_column: string, value: string) => { state.data = table === 'product_templates' ? templates.filter((item) => value === USER_ID ? true : item.id === value) : null; return builder }),
    order: mock(() => result(templates)),
    maybeSingle: mock(() => result(state.data ?? null)),
    insert: mock((payload: { owner_id: string; name: string; assets: string[]; rules: unknown }) => { const created = { id: `t${templates.length + 1}`, name: payload.name, assets: payload.assets, rules: payload.rules }; templates.push(created); state.data = created; return builder }),
    update: mock((payload: Partial<typeof TEMPLATE>) => { const updated = { ...templates[0], ...payload }; templates[0] = updated; state.data = updated; return builder }),
    delete: mock(() => { const deleted = templates[0]; templates = templates.slice(1); state.data = deleted; return builder }),
    single: mock(() => result(state.data)),
  }
  return builder
}

mock.module('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => query(table),
  }),
}))

const { GET, POST } = await import('@/app/api/product-templates/route')
const { GET: GET_ONE, PUT, DELETE: DELETE_ONE } = await import('@/app/api/product-templates/[id]/route')
const params = (id = 't1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  currentUser = { id: USER_ID }
  templates = [{ ...TEMPLATE }]
})

describe('Product Templates Supabase routes', () => {
  it('returns 401 when collection is unauthenticated', async () => {
    currentUser = null
    expect((await GET()).status).toBe(401)
  })

  it('lists owned templates', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([TEMPLATE])
  })

  it('validates creation and creates a template', async () => {
    const invalid = await POST(new NextRequest('http://localhost/api/product-templates', { method: 'POST', body: JSON.stringify({ assets: [] }) }))
    expect(invalid.status).toBe(400)
    const response = await POST(new NextRequest('http://localhost/api/product-templates', { method: 'POST', body: JSON.stringify({ name: ' New ', assets: ['readme'], rules: RULES }) }))
    expect(response.status).toBe(201)
    expect((await response.json()).name).toBe('New')
  })

  it('returns 404 for a missing or foreign template', async () => {
    expect((await GET_ONE(new Request('http://localhost'), params('missing'))).status).toBe(404)
    expect((await GET_ONE(new Request('http://localhost'), params(OTHER_USER_ID))).status).toBe(404)
  })

  it('updates an owned template with validated fields', async () => {
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ name: 'Updated', rules: RULES }) }), params())
    expect(response.status).toBe(200)
    expect((await response.json()).name).toBe('Updated')
  })

  it('deletes an owned template and returns 204', async () => {
    expect((await DELETE_ONE(new Request('http://localhost', { method: 'DELETE' }), params())).status).toBe(204)
  })
})
