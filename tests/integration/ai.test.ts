import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

const mockGenerateDescription = mock(() => Promise.resolve('A helpful listing description.'))
const mockSuggestTags = mock(() => Promise.resolve(['digital download', 'printable']))
const mockReviewListing = mock(() => Promise.resolve({
  score: 8,
  issues: [{ summary: 'Add more details', suggestion: 'Describe the included files.' }],
}))

class AiNotConfiguredError extends Error {}

// Mock auth and AI before importing the route
mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/ai', () => ({
  AiNotConfiguredError,
  generateDescription: mockGenerateDescription,
  suggestTags: mockSuggestTags,
  reviewListing: mockReviewListing,
}))

const { POST } = await import('@/app/api/products/[name]/ai/route')

const context = {
  name: 'X',
  etsyName: 'X',
  shopName: '',
  contact: '',
  description: '',
  notes: '',
  licenseType: 'personal' as const,
  price: 0,
  currency: 'USD',
  folders: [],
  etsyTags: [],
}

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockGenerateDescription.mockReturnValue(Promise.resolve('A helpful listing description.'))
  mockSuggestTags.mockReturnValue(Promise.resolve(['digital download', 'printable']))
  mockReviewListing.mockReturnValue(Promise.resolve({
    score: 8,
    issues: [{ summary: 'Add more details', suggestion: 'Describe the included files.' }],
  }))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/products/[name]/ai', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'description', context }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when action or context is missing', async () => {
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for an unknown action', async () => {
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'bogus', context }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns a description for the description action', async () => {
    mockGenerateDescription.mockReturnValue(Promise.resolve('Generated description'))
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'description', context }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ description: 'Generated description' })
  })

  it('returns tags for the tags action', async () => {
    mockSuggestTags.mockReturnValue(Promise.resolve(['wall art', 'instant download']))
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'tags', context }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tags: ['wall art', 'instant download'] })
  })

  it('returns a review for the review action', async () => {
    mockReviewListing.mockReturnValue(Promise.resolve({ score: 9, issues: [] }))
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'review', context }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ score: 9, issues: [] })
  })

  it('returns 503 when AI is not configured', async () => {
    mockGenerateDescription.mockImplementation(() => {
      throw new AiNotConfiguredError('ANTHROPIC_API_KEY is not set')
    })
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'description', context }),
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('AI features are not configured')
  })

  it('returns 502 when AI generation fails', async () => {
    mockGenerateDescription.mockImplementation(() => {
      throw new Error('AI request failed')
    })
    const req = new NextRequest('http://localhost/api/products/Foo/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'description', context }),
    })
    const res = await POST(req)
    expect(res.status).toBe(502)
  })
})
