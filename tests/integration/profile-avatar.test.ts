import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))

const mockUpdate = mock(() => Promise.resolve({ id: 'user-test-123' }))
const mockFindUnique = mock(() => Promise.resolve(null))

mock.module('@/lib/db', () => ({
  prisma: {
    user: { update: mockUpdate, findUnique: mockFindUnique },
  },
}))

const { GET, POST } = await import('@/app/api/profile/avatar/route')

function request(body: Uint8Array, headers: HeadersInit = {}) {
  return new NextRequest('http://localhost/api/profile/avatar', {
    method: 'POST',
    body: body as BodyInit,
    headers,
  })
}

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockUpdate.mockClear()
  mockFindUnique.mockClear()
  mockUpdate.mockReturnValue(Promise.resolve({ id: 'user-test-123' }))
  mockFindUnique.mockReturnValue(Promise.resolve(null))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/profile/avatar', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await POST(request(new Uint8Array()))
    expect(res.status).toBe(401)
  })

  it('returns 413 when Content-Length exceeds 5MB', async () => {
    const res = await POST(request(new Uint8Array([1]), {
      'Content-Length': String(5 * 1024 * 1024 + 1),
    }))

    expect(res.status).toBe(413)
    expect((await res.json()).error).toContain('5MB')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 413 when the body exceeds 5MB', async () => {
    const res = await POST(request(new Uint8Array(5 * 1024 * 1024 + 1)))

    expect(res.status).toBe(413)
    expect((await res.json()).error).toContain('5MB')
  })

  it('stores a small valid upload', async () => {
    const body = new Uint8Array(300).fill(7)
    const res = await POST(request(body, { 'X-Filename': 'avatar.png' }))

    expect(res.status).toBe(200)
    expect((await res.json()).image).toMatch(/^\/api\/profile\/avatar\?v=\d+$/)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const update = mockUpdate.mock.calls[0][0]
    expect(update.where).toEqual({ id: MOCK_USER.id })
    expect(update.data.avatarMime).toBe('image/png')
    expect(update.data.avatarData).toBeInstanceOf(Uint8Array)
    expect(update.data.avatarData.byteLength).toBe(body.byteLength)
  })
})

describe('GET /api/profile/avatar', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 404 when no avatar exists', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ avatarData: null, avatarMime: null }))
    const res = await GET()

    expect(res.status).toBe(404)
  })

  it('returns avatar bytes with the stored content type', async () => {
    const avatarData = new Uint8Array([1, 2, 3, 4])
    mockFindUnique.mockReturnValue(Promise.resolve({ avatarData, avatarMime: 'image/jpeg' }))
    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(avatarData)
  })
})
