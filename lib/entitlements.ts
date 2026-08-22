import type { SupabaseClient } from '@supabase/supabase-js'

export type Entitlement = {
  tier: 'free' | 'creator' | 'studio' | 'agency'
  productLimit: number
  storageLimitBytes: number
  maxFileBytes: number
  etsyEnabled: boolean
  releaseRetention: number
  productCount: number
  storageUsedBytes: number
}

export type EntitlementErrorCode = 'PRODUCT_LIMIT_REACHED' | 'STORAGE_LIMIT_REACHED' | 'FILE_LIMIT_REACHED' | 'PAID_FEATURE_REQUIRED'

export class EntitlementError extends Error {
  constructor(
    public readonly code: EntitlementErrorCode,
    public readonly details: Record<string, number | string>,
  ) {
    super(code)
  }
}

export async function getEntitlement(supabase: SupabaseClient): Promise<Entitlement> {
  const { data, error } = await supabase.rpc('get_my_entitlement' as never)
  if (error || !Array.isArray(data) || !data[0]) {
    throw new Error(error?.message ?? 'Could not load account entitlement')
  }
  const row = data[0] as Record<string, unknown>
  return {
    tier: String(row.tier ?? 'free') as Entitlement['tier'],
    productLimit: Number(row.product_limit ?? 3),
    storageLimitBytes: Number(row.storage_limit_bytes ?? 104857600),
    maxFileBytes: Number(row.max_file_bytes ?? 10485760),
    etsyEnabled: Boolean(row.etsy_enabled),
    releaseRetention: Number(row.release_retention ?? 1),
    productCount: Number(row.product_count ?? 0),
    storageUsedBytes: Number(row.storage_used_bytes ?? 0),
  }
}

export function assertProductCapacity(entitlement: Entitlement, additionalProducts = 1) {
  if (entitlement.productCount + additionalProducts > entitlement.productLimit) {
    throw new EntitlementError('PRODUCT_LIMIT_REACHED', {
      current: entitlement.productCount,
      limit: entitlement.productLimit,
    })
  }
}

export function assertStorageCapacity(entitlement: Entitlement, additionalBytes: number) {
  if (additionalBytes > entitlement.maxFileBytes) {
    throw new EntitlementError('FILE_LIMIT_REACHED', {
      bytes: additionalBytes,
      limit: entitlement.maxFileBytes,
    })
  }
  if (entitlement.storageUsedBytes + additionalBytes > entitlement.storageLimitBytes) {
    throw new EntitlementError('STORAGE_LIMIT_REACHED', {
      current: entitlement.storageUsedBytes,
      requested: additionalBytes,
      limit: entitlement.storageLimitBytes,
    })
  }
}

export function assertPaidFeature(entitlement: Entitlement) {
  if (!entitlement.etsyEnabled) {
    throw new EntitlementError('PAID_FEATURE_REQUIRED', { feature: 'etsy' })
  }
}

export function entitlementErrorResponse(error: unknown) {
  if (!(error instanceof EntitlementError)) return null
  return Response.json({ error: error.code, code: error.code, ...error.details }, { status: 403 })
}
