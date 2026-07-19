const REQUIRED_VARS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const

const OPTIONAL_VARS = [
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'ANTHROPIC_API_KEY',
] as const

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return

  const missingRequired = REQUIRED_VARS.filter((name) => !process.env[name])
  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`)
  }

  const missingOptional = OPTIONAL_VARS.filter((name) => !process.env[name])
  for (const name of missingOptional) {
    console.warn(`[env] ${name} is not set — related features will be disabled at request time.`)
  }
}
