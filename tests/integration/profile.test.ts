import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))

const mockFindUnique = mock(() => Promise.resolve(null))
const mockUpdate = mock(() => Promise.resolve(null))

mock.module('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mockFindUnique, update: mockUpdate },
  },
}))

const { GET, POST } = await import('@/app/api/profile/route')

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/profile', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test User',
    shopName: 'Test Shop',
    shopContact: 'test@example.com',
    shopDescription: 'A test shop',
    readmeFooter: 'Thank you!',
    ...overrides,
  }
}

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockClear()
  mockUpdate.mockClear()
  mockFindUnique.mockReturnValue(Promise.resolve(profile()))
  mockUpdate.mockReturnValue(Promise.resolve(profile()))
})

describe('GET /api/profile', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns the mocked profile fields', async () => {
    const expected = profile()
    mockFindUnique.mockReturnValue(Promise.resolve(expected))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(expected)
  })
})

describe('POST /api/profile', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null

    const res = await POST(request({ name: 'Test' }))

    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing or blank', async () => {
    const missingRes = await POST(request({}))
    const blankRes = await POST(request({ name: '   ' }))

    expect(missingRes.status).toBe(400)
    expect(blankRes.status).toBe(400)
  })

  it('trims and saves all profile fields', async () => {
    const expected = profile({
      name: 'Test User',
      shopName: 'Test Shop',
      shopContact: 'test@example.com',
      shopDescription: 'A test shop',
      readmeFooter: 'Thank you!',
    })
    mockUpdate.mockReturnValue(Promise.resolve(expected))

    const res = await POST(request({
      name: '  Test User  ',
      shopName: '  Test Shop  ',
      shopContact: '  test@example.com  ',
      shopDescription: '  A test shop  ',
      readmeFooter: '  Thank you!  ',
    }))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: MOCK_USER.id },
      data: expected,
      select: { name: true, shopName: true, shopContact: true, shopDescription: true, readmeFooter: true },
    })
    expect(await res.json()).toEqual(expected)
  })

  it('saves null for omitted or blank shop fields', async () => {
    const res = await POST(request({ name: 'Test', shopName: ' ', shopContact: '  ', shopDescription: '', readmeFooter: '\t' }))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: MOCK_USER.id },
      data: {
        name: 'Test',
        shopName: null,
        shopContact: null,
        shopDescription: null,
        readmeFooter: null,
      },
      select: { name: true, shopName: true, shopContact: true, shopDescription: true, readmeFooter: true },
    })
  })
})
