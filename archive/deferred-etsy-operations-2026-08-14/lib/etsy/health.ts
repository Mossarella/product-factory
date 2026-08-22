export type EtsyHealthCheck = {
  status: 'healthy' | 'degraded' | 'unconfigured'
  latencyMs?: number
  message?: string
}

export type EtsyHealthPayload = {
  status: 'healthy' | 'degraded' | 'unconfigured'
  checkedAt: string
  checks: {
    supabase: EtsyHealthCheck
    etsy: EtsyHealthCheck
  }
  connection?: {
    shopName: string | null
    shopId: string
    tokenExpiresAt: string | null
  }
}

export function buildEtsyHealthPayload(input: {
  checkedAt?: string
  supabase: EtsyHealthCheck
  etsy: EtsyHealthCheck
  connection?: EtsyHealthPayload['connection']
}): EtsyHealthPayload {
  const status = input.supabase.status === 'degraded' || input.etsy.status === 'degraded'
    ? 'degraded'
    : input.supabase.status === 'unconfigured' || input.etsy.status === 'unconfigured'
      ? 'unconfigured'
      : 'healthy'

  return {
    status,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    checks: {
      supabase: input.supabase,
      etsy: input.etsy,
    },
    ...(input.connection ? { connection: input.connection } : {}),
  }
}
