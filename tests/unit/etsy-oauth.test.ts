import { createHash, randomBytes } from 'node:crypto'
import {
  buildEtsyAuthorizationUrl,
  createPkcePair,
  createOAuthState,
  decryptSecret,
  encryptSecret,
  getEtsyConfig,
  hashOAuthState,
  safeEqual,
} from '@/lib/etsy/oauth'

describe('Etsy OAuth helpers', () => {
  beforeEach(() => {
    process.env.ETSY_API_KEYSTRING = 'test-keystring'
    process.env.ETSY_SHARED_SECRET = 'test-shared-secret'
    process.env.ETSY_REDIRECT_URI = 'https://factory.example/api/integrations/etsy/callback'
    process.env.ETSY_ALLOWED_SHOP_ID = '123456789'
    process.env.ETSY_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    process.env.ETSY_SCOPES = 'listings_r listings_w shops_r'
  })

  it('creates an S256 PKCE pair and non-repeating OAuth state', () => {
    const first = createPkcePair()
    const second = createPkcePair()
    expect(first.verifier).not.toBe(second.verifier)
    expect(first.challenge).toBe(createHash('sha256').update(first.verifier).digest('base64url'))
    expect(createOAuthState()).not.toBe(createOAuthState())
  })

  it('hashes and compares OAuth state without exposing the raw value', () => {
    const state = createOAuthState()
    const hash = hashOAuthState(state)
    expect(hash).not.toBe(state)
    expect(hash).toHaveLength(64)
    expect(safeEqual(state, state)).toBe(true)
    expect(safeEqual(state, `${state}x`)).toBe(false)
  })

  it('round-trips encrypted secrets and rejects tampering', () => {
    const encrypted = encryptSecret('etsy-refresh-token-fixture')
    expect(encrypted).not.toContain('etsy-refresh-token-fixture')
    expect(decryptSecret(encrypted)).toBe('etsy-refresh-token-fixture')
    expect(() => decryptSecret(`${encrypted}tampered`)).toThrow()
  })

  it('builds an Etsy authorization URL with configured scopes and PKCE', () => {
    const config = getEtsyConfig()
    const url = new URL(buildEtsyAuthorizationUrl(config, 'state-fixture', 'challenge-fixture'))
    expect(url.origin).toBe('https://www.etsy.com')
    expect(url.pathname).toBe('/oauth/connect')
    expect(url.searchParams.get('client_id')).toBe('test-keystring')
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    expect(url.searchParams.get('scope')).toBe('listings_r listings_w shops_r')
    expect(url.searchParams.get('state')).toBe('state-fixture')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
})
