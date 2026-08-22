import { describe, expect, test } from 'bun:test'
import {
  assertPaidFeature,
  assertProductCapacity,
  assertStorageCapacity,
  EntitlementError,
  type Entitlement,
} from '@/lib/entitlements'

const free: Entitlement = {
  tier: 'free',
  productLimit: 3,
  storageLimitBytes: 100 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  etsyEnabled: false,
  releaseRetention: 1,
  productCount: 2,
  storageUsedBytes: 20 * 1024 * 1024,
}

const creator: Entitlement = {
  ...free,
  tier: 'creator',
  productLimit: 500,
  storageLimitBytes: 5 * 1024 * 1024 * 1024,
  maxFileBytes: 100 * 1024 * 1024,
  etsyEnabled: true,
  releaseRetention: 3,
  productCount: 499,
}

describe('bounded entitlements', () => {
  test('allows a free user below the three-product cap', () => {
    expect(() => assertProductCapacity(free)).not.toThrow()
  })

  test('blocks a free user at the product cap', () => {
    expect(() => assertProductCapacity({ ...free, productCount: 3 })).toThrow(EntitlementError)
    try {
      assertProductCapacity({ ...free, productCount: 3 })
    } catch (error) {
      expect(error).toMatchObject({ code: 'PRODUCT_LIMIT_REACHED' })
    }
  })

  test('blocks an upload above the per-file cap', () => {
    expect(() => assertStorageCapacity(free, 11 * 1024 * 1024)).toThrow(EntitlementError)
    try {
      assertStorageCapacity(free, 11 * 1024 * 1024)
    } catch (error) {
      expect(error).toMatchObject({ code: 'FILE_LIMIT_REACHED' })
    }
  })

  test('blocks pooled storage even when the individual file is valid', () => {
    expect(() => assertStorageCapacity({ ...free, storageUsedBytes: 95 * 1024 * 1024 }, 6 * 1024 * 1024)).toThrow(EntitlementError)
    try {
      assertStorageCapacity({ ...free, storageUsedBytes: 95 * 1024 * 1024 }, 6 * 1024 * 1024)
    } catch (error) {
      expect(error).toMatchObject({ code: 'STORAGE_LIMIT_REACHED' })
    }
  })

  test('permits Creator capacity and Etsy access', () => {
    expect(() => assertProductCapacity(creator)).not.toThrow()
    expect(() => assertStorageCapacity(creator, 50 * 1024 * 1024)).not.toThrow()
    expect(() => assertPaidFeature(creator)).not.toThrow()
  })

  test('blocks Etsy access on Free', () => {
    expect(() => assertPaidFeature(free)).toThrow(EntitlementError)
    try {
      assertPaidFeature(free)
    } catch (error) {
      expect(error).toMatchObject({ code: 'PAID_FEATURE_REQUIRED' })
    }
  })
})
