const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const

const FEATURE_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_CREATOR_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
  'ETSY_API_KEYSTRING',
  'ETSY_SHARED_SECRET',
  'ETSY_TOKEN_ENCRYPTION_KEY',
] as const

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return

  const missingRequired = REQUIRED_VARS.filter((name) => !process.env[name])
  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`)
  }

  const missingFeatures = FEATURE_VARS.filter((name) => !process.env[name])
  for (const name of missingFeatures) {
    console.warn(`[env] ${name} is not set — related features will be disabled at request time.`)
  }
}
