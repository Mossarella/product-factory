import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const USER = { id: 'user-test-123' }
let currentUser: typeof USER | null = USER
let storedObject: Blob | null = null
let uploaded: { path: string; body: Buffer; contentType?: string } | null = null

mock.module('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    storage: {
      from: () => ({
        upload: mock(async (path: string, body: Buffer, options: { contentType?: string }) => {
          uploaded = { path, body, contentType: options.contentType }
          storedObject = new Blob([body], { type: options.contentType })
          return { data: { path }, error: null }
        }),
        download: mock(async () => storedObject ? { data: storedObject, error: null } : { data: null, error: { message: 'Not found' } }),
      }),
    },
  }),
}))

const { GET, POST } = await import('@/app/api/profile/avatar/route')
const request = (body: Uint8Array, headers: HeadersInit = {}) => new NextRequest('http://localhost/api/profile/avatar', { method: 'POST', body: body as BodyInit, headers })

beforeEach(() => {
  currentUser = USER
  storedObject = null
  uploaded = null
})

describe('Supabase avatar route', () => {
  it('requires authentication', async () => {
    currentUser = null
    expect((await POST(request(new Uint8Array()))).status).toBe(401)
    expect((await GET()).status).toBe(401)
  })

  it('enforces the 5 MB upload limit', async () => {
    const response = await POST(request(new Uint8Array([1]), { 'Content-Length': String(5 * 1024 * 1024 + 1) }))
    expect(response.status).toBe(413)
  })

  it('uploads to a user-rooted private path', async () => {
    const body = new Uint8Array([1, 2, 3])
    const response = await POST(request(body, { 'X-Filename': 'avatar.png' }))
    expect(response.status).toBe(200)
    expect((await response.json()).image).toMatch(/^\/api\/profile\/avatar\?v=\d+$/)
    expect(uploaded?.path).toBe(`${USER.id}/profile/avatar`)
    expect(uploaded?.contentType).toBe('image/png')
  })

  it('returns 404 when no avatar exists', async () => {
    expect((await GET()).status).toBe(404)
  })

  it('downloads the private avatar with its content type', async () => {
    storedObject = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
  })
})
