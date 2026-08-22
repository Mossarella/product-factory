import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { assertPaidFeature, EntitlementError, getEntitlement } from '@/lib/entitlements'
import {
  buildEtsyAuthorizationUrl,
  createEtsyAdminClient,
  createOAuthState,
  createPkcePair,
  encryptSecret,
  getEtsyConfig,
  getOAuthStateCookieName,
  getOAuthStateMaxAge,
  hashOAuthState,
} from '@/lib/etsy/oauth'
import { getPublicOrigin } from '@/lib/public-origin'

export const runtime = 'nodejs'

function redirectError(request: Request, code: string) {
  const origin = getPublicOrigin(request)
  return NextResponse.redirect(`${origin}/app/settings?etsy_error=${encodeURIComponent(code)}`)
}

export async function GET(request: Request) {
  try {
    const { origin } = new URL(request.url)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirectError(request, 'auth_required')

    try {
      assertPaidFeature(await getEntitlement(supabase))
    } catch (error) {
      if (error instanceof EntitlementError) return redirectError(request, 'paid_plan_required')
      throw error
    }

    const config = getEtsyConfig(getPublicOrigin(request))
    const state = createOAuthState()
    const { verifier, challenge } = createPkcePair()
    const admin = createEtsyAdminClient()
    const expiresAt = new Date(Date.now() + getOAuthStateMaxAge() * 1000).toISOString()
    const { error } = await admin.from('etsy_oauth_states').insert({
      owner_id: user.id,
      state_hash: hashOAuthState(state),
      code_verifier_ciphertext: encryptSecret(verifier),
      redirect_uri: config.redirectUri,
      expires_at: expiresAt,
    })
    if (error) throw new Error('Could not initialize Etsy OAuth')

    const cookieStore = await cookies()
    cookieStore.set(getOAuthStateCookieName(), state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: getOAuthStateMaxAge(),
    })

    return NextResponse.redirect(buildEtsyAuthorizationUrl(config, state, challenge))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const code = /ETSY_(API_KEYSTRING|SHARED_SECRET|TOKEN_ENCRYPTION_KEY)|configuration is incomplete|must decode/i.test(message)
      ? 'etsy_configuration_missing'
      : 'oauth_unavailable'
    return redirectError(request, code)
  }
}
