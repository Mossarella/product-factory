import { describe, expect, it } from 'bun:test'
import { getPublicOrigin } from '@/lib/public-origin'

describe('getPublicOrigin', () => {
  it('prefers forwarded public host and protocol', () => {
    const request = new Request('http://0.0.0.0:3000/app/dashboard', {
      headers: {
        host: '0.0.0.0:3000',
        'x-forwarded-host': '3000-preview.example.com',
        'x-forwarded-proto': 'https',
      },
    })

    expect(getPublicOrigin(request)).toBe('https://3000-preview.example.com')
  })

  it('falls back to the request host when forwarded headers are absent', () => {
    const request = new Request('http://localhost:3000/app/dashboard')

    expect(getPublicOrigin(request)).toBe('http://localhost:3000')
  })
})
