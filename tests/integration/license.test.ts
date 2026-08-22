import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

// Mock auth and prisma before importing the route
mock.module('@/auth', () => ({ auth: async () => currentSession }))

const mockFindUnique = mock((..._args: unknown[]) => Promise.resolve<null>(null))

mock.module('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
  },
}))

const { GET } = await import('@/app/api/license/route')

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockClear()
  mockFindUnique.mockReturnValue(Promise.resolve(null))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('GET /api/license', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns a free license when the user has not activated one', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ plan: 'free', licenseActivatedAt: null, subscriptionStatus: null }))

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ plan: 'free' })
    expect(body.activatedAt).toBeUndefined()
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: MOCK_USER.id },
      select: { plan: true, licenseActivatedAt: true, subscriptionStatus: true },
    })
  })

  it('returns a pro license with its activation time', async () => {
    const activatedAt = '2026-01-01T00:00:00.000Z'
    mockFindUnique.mockReturnValue(Promise.resolve({
      plan: 'pro',
      licenseActivatedAt: new Date(activatedAt),
      subscriptionStatus: null,
    }))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: 'pro', activatedAt })
  })

  it('returns the subscription status when present', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({
      plan: 'pro',
      licenseActivatedAt: null,
      subscriptionStatus: 'active',
    }))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: 'pro', subscriptionStatus: 'active' })
  })

  it('keeps license results isolated to the current session user', async () => {
    mockFindUnique.mockImplementation((args: { where: { id: string } }) => Promise.resolve(
      args.where.id === 'user-a'
        ? { plan: 'pro', licenseActivatedAt: null, subscriptionStatus: null }
        : { plan: 'free', licenseActivatedAt: null, subscriptionStatus: null },
    ))

    currentSession = { user: { id: 'user-a', email: 'a@example.com', name: 'User A' } }
    const firstResponse = await GET()

    currentSession = { user: { id: 'user-b', email: 'b@example.com', name: 'User B' } }
    const secondResponse = await GET()

    expect(await firstResponse.json()).toEqual({ plan: 'pro' })
    expect(await secondResponse.json()).toEqual({ plan: 'free' })
    expect(mockFindUnique.mock.calls.map(([args]) => (args as { where: { id: string } }).where.id)).toEqual(['user-a', 'user-b'])
  })
})
