import { describe, expect, it } from 'bun:test'

const { GET } = await import('@/app/auth/callback/route')

describe('auth callback public origin handling', () => {
  it('uses forwarded preview host and protocol when the app runs behind a proxy', async () => {
    const request = new Request('http://0.0.0.0:3000/auth/callback', {
      headers: {
        host: '0.0.0.0:3000',
        'x-forwarded-host': '3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer',
        'x-forwarded-proto': 'https',
      },
    })

    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/login?error=auth_callback_failed',
    )
  })

  it('rejects unsafe next paths while preserving the forwarded public origin', async () => {
    const request = new Request('http://0.0.0.0:3000/auth/callback?next=//evil.example', {
      headers: {
        'x-forwarded-host': 'preview.example.com',
        'x-forwarded-proto': 'https',
      },
    })

    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://preview.example.com/login?error=auth_callback_failed',
    )
  })
})
