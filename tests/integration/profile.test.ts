import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const USER = { id: 'user-test-123', email: 'test@example.com', user_metadata: { full_name: 'Test User' } }
let currentUser: typeof USER | null = USER
let currentProfile: Record<string, unknown> | null = {
  display_name: 'Test User', shop_name: 'Test Shop', shop_contact: 'test@example.com', shop_description: 'A test shop', readme_footer: 'Thank you!',
}

mock.module('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => {
      const builder: Record<string, unknown> = {
        select: mock(() => builder),
        eq: mock(() => builder),
        maybeSingle: mock(() => Promise.resolve({ data: currentProfile, error: null })),
        upsert: mock((payload: Record<string, unknown>) => {
          currentProfile = { ...currentProfile, ...payload }
          return builder
        }),
        single: mock(() => Promise.resolve({ data: currentProfile, error: null })),
      }
      return builder
    },
  }),
}))

const { GET, POST } = await import('@/app/api/profile/route')
const request = (body: Record<string, unknown>) => new NextRequest('http://localhost/api/profile', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  currentUser = USER
  currentProfile = { display_name: 'Test User', shop_name: 'Test Shop', shop_contact: 'test@example.com', shop_description: 'A test shop', readme_footer: 'Thank you!' }
})

describe('Supabase profile routes', () => {
  it('requires authentication', async () => {
    currentUser = null
    expect((await GET()).status).toBe(401)
    expect((await POST(request({ name: 'Test' }))).status).toBe(401)
  })

  it('maps the profile to the existing API shape', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: 'Test User', shopName: 'Test Shop', shopContact: 'test@example.com', shopDescription: 'A test shop', readmeFooter: 'Thank you!' })
  })

  it('rejects a blank display name', async () => {
    expect((await POST(request({ name: ' ' }))).status).toBe(400)
  })

  it('trims editable profile fields and stores blank shop values as null', async () => {
    const response = await POST(request({ name: '  New User  ', shopName: '  Shop  ', shopContact: ' ', shopDescription: '', readmeFooter: '\t' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: 'New User', shopName: 'Shop', shopContact: null, shopDescription: null, readmeFooter: null })
  })
})
