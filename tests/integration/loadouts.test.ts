import { describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_SESSION = { user: { id: 'user-test-123', email: 'test@example.com' } }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  PRODUCTS_DIR: '/tmp/test-products',
  ROOT: '/tmp/test-root',
  sanitizeName: (n: string) => n.replace(/[^a-zA-Z0-9-_]/g, ''),
}))
mock.module('fs', () => ({
  default: { mkdirSync: () => {}, readFileSync: () => JSON.stringify({ plan: 'pro' }) },
  mkdirSync: () => {},
  readFileSync: () => JSON.stringify({ plan: 'pro' }),
}))

const mockFindMany = mock(() => Promise.resolve([]))
const mockCreate = mock(() => Promise.resolve({ id: 'l1', name: 'Test Loadout', assets: ['readme'] }))

mock.module('@/lib/db', () => ({
  prisma: {
    loadout: { findMany: mockFindMany, create: mockCreate },
  },
}))

const { GET, POST } = await import('@/app/api/loadouts/route')

describe('GET /api/loadouts', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const req = new NextRequest('http://localhost/api/loadouts')
    const res = await GET(req)
    expect(res.status).toBe(401)
    currentSession = MOCK_SESSION
  })

  it('returns empty array when no loadouts', async () => {
    mockFindMany.mockReturnValue(Promise.resolve([]))
    const req = new NextRequest('http://localhost/api/loadouts')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})

describe('POST /api/loadouts', () => {
  it('returns 400 for missing name', async () => {
    const req = new NextRequest('http://localhost/api/loadouts', {
      method: 'POST',
      body: JSON.stringify({ assets: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates loadout and returns 201', async () => {
    const req = new NextRequest('http://localhost/api/loadouts', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Loadout', assets: ['readme', 'thankyou'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Test Loadout')
  })
})
