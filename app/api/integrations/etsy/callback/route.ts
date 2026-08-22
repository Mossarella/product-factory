import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getPublicOrigin } from '@/lib/public-origin'
import {
  createEtsyAdminClient,
  decryptSecret,
  encryptSecret,
  exchangeEtsyCode,
  fetchAuthorizedEtsy,
  getEtsyConfig,
  getOAuthStateCookieName,
  hashOAuthState,
  safeEqual,
} from '@/lib/etsy/oauth'

export const runtime = 'nodejs'

type EtsyShop = {
  shop_id?: number | string
  shop_name?: string
}

type EtsyShopResponse = {
  results?: EtsyShop[]
}

function redirectResult(request: Request, result: 'connected' | 'error', code?: string) {
  const origin = getPublicOrigin(request)
  const params = new URLSearchParams({ etsy: result })
  if (code) params.set('etsy_error', code)
  return NextResponse.redirect(`${origin}/app/settings?${params.toString()}`)
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const returnedState = requestUrl.searchParams.get('state')
  if (!code || !returnedState) return redirectResult(request, 'error', 'callback_parameters_missing')

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirectResult(request, 'error', 'auth_required')

    const cookieStore = await cookies()
    const cookieState = cookieStore.get(getOAuthStateCookieName())?.value
    if (!cookieState || !safeEqual(cookieState, returnedState)) {
      return redirectResult(request, 'error', 'state_mismatch')
    }

    const config = getEtsyConfig(getPublicOrigin(request))
    const admin = createEtsyAdminClient()
    const now = new Date().toISOString()
    const { data: stateRow, error: stateError } = await admin
      .from('etsy_oauth_states')
      .update({ consumed_at: now })
      .eq('state_hash', hashOAuthState(returnedState))
      .eq('owner_id', user.id)
      .is('consumed_at', null)
      .gt('expires_at', now)
      .select('owner_id, code_verifier_ciphertext, redirect_uri')
      .maybeSingle()

    if (stateError || !stateRow || stateRow.redirect_uri !== config.redirectUri) {
      return redirectResult(request, 'error', 'state_invalid_or_expired')
    }

    const verifier = decryptSecret(stateRow.code_verifier_ciphertext)
    const tokens = await exchangeEtsyCode(config, code, verifier)
    const etsyUserId = Number(tokens.user_id)
    if (!Number.isSafeInteger(etsyUserId) || etsyUserId <= 0) throw new Error('Invalid Etsy user identity')

    const shopResponse = await fetchAuthorizedEtsy<EtsyShopResponse>(config, tokens.access_token, `/users/${etsyUserId}/shops`)
    const shop = shopResponse.results?.[0]
    const shopId = Number(shop?.shop_id)
    if (!Number.isSafeInteger(shopId) || shopId <= 0 || !shop?.shop_name) {
      return redirectResult(request, 'error', 'shop_not_found')
    }
    if (config.allowedShopId && String(shopId) !== config.allowedShopId) {
      return redirectResult(request, 'error', 'shop_not_allowed')
    }

    const expiresAt = new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    const { data: connection, error: connectionError } = await admin
      .from('etsy_connections')
      .upsert({
        owner_id: user.id,
        etsy_user_id: etsyUserId,
        shop_id: shopId,
        shop_name: shop.shop_name,
        scopes: config.scopes,
        status: 'connected',
        last_error: null,
      }, { onConflict: 'owner_id' })
      .select('id')
      .single()
    if (connectionError || !connection) throw new Error('Could not save Etsy connection')

    const { error: secretError } = await admin
      .from('etsy_connection_secrets')
      .upsert({
        connection_id: connection.id,
        access_token_ciphertext: encryptSecret(tokens.access_token),
        refresh_token_ciphertext: encryptSecret(tokens.refresh_token),
        access_token_expires_at: expiresAt,
      }, { onConflict: 'connection_id' })
    if (secretError) throw new Error('Could not save Etsy credentials')

    cookieStore.delete(getOAuthStateCookieName())
    return redirectResult(request, 'connected')
  } catch {
    return redirectResult(request, 'error', 'oauth_exchange_failed')
  }
}
