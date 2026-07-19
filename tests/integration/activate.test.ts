import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))

const mockFindUnique = mock(() => Promise.resolve(null))
const mockLicenseKeyUpdate = mock(() => Promise.resolve({}))
const mockUserUpdate = mock(() => Promise.resolve({}))
const mockTransaction = mock((operations: Promise<unknown>[]) => Promise.all(operations))

mock.module('@/lib/db', () => ({
  prisma: {
    licenseKey: {
      findUnique: mockFindUnique,
      update: mockLicenseKeyUpdate,
    },
    user: { update: mockUserUpdate },
    $transaction: mockTransaction,
  },
}))

const { POST } = await import('@/app/api/activate/route')

function request(key: string) {
  return new NextRequest('http://localhost/api/activate', {
    method: 'POST',
    body: JSON.stringify({ key }),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockReset()
  mockLicenseKeyUpdate.mockReset()
  mockUserUpdate.mockReset()
  mockTransaction.mockReset()
  mockFindUnique.mockReturnValue(Promise.resolve(null))
  mockLicenseKeyUpdate.mockReturnValue(Promise.resolve({}))
  mockUserUpdate.mockReturnValue(Promise.resolve({}))
  mockTransaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/activate', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null

    expect((await POST(request('abc'))).status).toBe(401)
  })

  it('returns 404 for an unknown key', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))

    const response = await POST(request('unknown'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Invalid license key' })
  })

  it('redeems a fresh key', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({
      key: 'abc', plan: 'pro', usedAt: null, usedByUserId: null,
    }))

    const response = await POST(request('abc'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      plan: 'pro', activatedAt: expect.any(String),
    })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(Array.isArray(mockTransaction.mock.calls[0][0])).toBe(true)
  })

  it('returns the original activation for a same-user reactivation', async () => {
    const activatedAt = new Date('2026-01-01T00:00:00.000Z')
    mockFindUnique.mockReturnValue(Promise.resolve({
      key: 'abc', plan: 'pro', usedAt: activatedAt, usedByUserId: MOCK_USER.id,
    }))

    const response = await POST(request('abc'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ plan: 'pro', activatedAt: activatedAt.toISOString() })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('returns 409 when another user has already activated the key', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({
      key: 'abc', plan: 'pro', usedAt: new Date('2026-01-01T00:00:00.000Z'), usedByUserId: 'someone-else',
    }))

    const response = await POST(request('abc'))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Key already activated' })
  })
})
