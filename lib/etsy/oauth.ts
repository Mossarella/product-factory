import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

const ETSY_AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect'
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'
const ETSY_API_URL = 'https://openapi.etsy.com/v3/application'
const OAUTH_STATE_COOKIE = 'etsy_oauth_state'
const OAUTH_STATE_TTL_SECONDS = 10 * 60

export type EtsyConfig = {
  apiKeystring: string
  sharedSecret: string
  redirectUri: string
  allowedShopId: string | null
  scopes: string[]
}

export type EtsyTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user_id?: number | string
}

export function getEtsyConfig(origin?: string): EtsyConfig {
  const apiKeystring = process.env.ETSY_API_KEYSTRING
  const sharedSecret = process.env.ETSY_SHARED_SECRET
  const redirectUri = process.env.ETSY_REDIRECT_URI ?? (origin ? `${origin}/api/integrations/etsy/callback` : undefined)
  if (!apiKeystring || !sharedSecret || !redirectUri) {
    throw new Error('Etsy OAuth server configuration is incomplete')
  }

  return {
    apiKeystring,
    sharedSecret,
    redirectUri,
    allowedShopId: process.env.ETSY_ALLOWED_SHOP_ID || null,
    scopes: (process.env.ETSY_SCOPES ?? 'listings_r listings_w shops_r').split(/[ ,]+/).filter(Boolean),
  }
}

export function getOAuthStateCookieName() {
  return OAUTH_STATE_COOKIE
}

export function getOAuthStateMaxAge() {
  return OAUTH_STATE_TTL_SECONDS
}

export function createPkcePair() {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function createOAuthState() {
  return randomBytes(32).toString('base64url')
}

export function hashOAuthState(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function getEncryptionKey() {
  const raw = process.env.ETSY_TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('ETSY_TOKEN_ENCRYPTION_KEY is not configured')
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('ETSY_TOKEN_ENCRYPTION_KEY must decode to 32 bytes')
  return key
}

export function encryptSecret(value: string) {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(':')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted Etsy secret')
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function createEtsyAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Supabase server configuration is incomplete')
  return createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as SupabaseClient
}

export function buildEtsyAuthorizationUrl(config: EtsyConfig, state: string, challenge: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.apiKeystring,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${ETSY_AUTHORIZE_URL}?${params.toString()}`
}

export async function refreshEtsyToken(config: EtsyConfig, refreshToken: string) {
  const response = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.apiKeystring,
      refresh_token: refreshToken,
    }),
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as EtsyTokenResponse | null
  if (!response.ok || !body?.access_token || !body.refresh_token || !body.expires_in) {
    throw new Error('Etsy token refresh failed')
  }
  return body as Required<Pick<EtsyTokenResponse, 'access_token' | 'refresh_token' | 'expires_in'>>
}

export async function exchangeEtsyCode(config: EtsyConfig, code: string, verifier: string) {
  const response = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.apiKeystring,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    }),
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as EtsyTokenResponse | { error?: string } | null
  if (!response.ok || !body || !('access_token' in body) || !body.access_token || !body.refresh_token || !body.expires_in || !body.user_id) {
    throw new Error('Etsy token exchange failed')
  }
  return body as Required<Pick<EtsyTokenResponse, 'access_token' | 'refresh_token' | 'expires_in' | 'user_id'>>
}

export async function createEtsyDraftListing(config: EtsyConfig, accessToken: string, input: {
  shopId: number
  title: string
  description: string
  price: number
  tags: string[]
  taxonomyId: number
  whoMade: string
  whenMade: string
}) {
  const response = await fetch(`${ETSY_API_URL}/shops/${input.shopId}/listings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': `${config.apiKeystring}:${config.sharedSecret}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      quantity: '1',
      title: input.title,
      description: input.description,
      price: input.price.toFixed(2),
      who_made: input.whoMade,
      when_made: input.whenMade,
      taxonomy_id: String(input.taxonomyId),
      type: 'download',
      state: 'draft',
      is_supply: 'false',
      should_auto_renew: 'false',
      tags: input.tags.slice(0, 13).join(','),
    }),
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as { listing_id?: number; [key: string]: unknown } | null
  if (!response.ok || !body?.listing_id) throw new Error('Etsy draft listing creation failed')
  return body
}

export async function uploadEtsyDigitalFile(config: EtsyConfig, accessToken: string, input: {
  shopId: number
  listingId: number
  filename: string
  blob: Blob
}) {
  const form = new FormData()
  form.append('file', new File([input.blob], input.filename, { type: 'application/zip' }))
  form.append('name', input.filename)
  form.append('type', 'application/zip')
  const response = await fetch(`${ETSY_API_URL}/shops/${input.shopId}/listings/${input.listingId}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': `${config.apiKeystring}:${config.sharedSecret}`,
      accept: 'application/json',
    },
    body: form,
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as { file_id?: number; [key: string]: unknown } | null
  if (!response.ok || !body?.file_id) throw new Error('Etsy digital file upload failed')
  return body
}

export type EtsyShopListing = {
  listing_id: number
  title?: string
  state?: string
  skus?: string[]
  price?: { amount?: number; divisor?: number; currency_code?: string }
  [key: string]: unknown
}

export type EtsyListingInventory = {
  products?: Array<{
    product_id?: number
    sku?: string[]
    offerings?: Array<{ offering_id?: number; quantity?: number; is_enabled?: boolean; price?: { amount?: number; divisor?: number; currency_code?: string } }>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export async function fetchEtsyShopListings(config: EtsyConfig, accessToken: string, shopId: number) {
  const byId = new Map<number, EtsyShopListing>()
  const limit = 100
  for (const state of ['active', 'draft', 'inactive']) {
    for (let offset = 0; ; offset += limit) {
      const page = await fetchAuthorizedEtsy<{ results?: EtsyShopListing[]; count?: number }>(config, accessToken, `/shops/${shopId}/listings?limit=${limit}&offset=${offset}&state=${state}`)
      const results = page.results ?? []
      for (const listing of results) if (Number.isSafeInteger(listing.listing_id)) byId.set(listing.listing_id, listing)
      if (results.length < limit || offset + results.length >= (page.count ?? offset + results.length)) break
    }
  }
  return [...byId.values()]
}

export async function fetchEtsyListingInventory(config: EtsyConfig, accessToken: string, listingId: number) {
  return fetchAuthorizedEtsy<EtsyListingInventory>(config, accessToken, `/listings/${listingId}/inventory`)
}

export async function fetchAuthorizedEtsy<T>(config: EtsyConfig, accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${ETSY_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': `${config.apiKeystring}:${config.sharedSecret}`,
      accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Etsy shop lookup failed')
  return response.json() as Promise<T>
}

export function createRequestId() {
  return randomUUID()
}

export { OAUTH_STATE_TTL_SECONDS }
