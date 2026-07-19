import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { validateEnv } from '@/lib/env'

const REQUIRED_VARS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const

const OPTIONAL_VARS = ['RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY'] as const
const ENV_KEYS = ['NODE_ENV', ...REQUIRED_VARS, ...OPTIONAL_VARS] as const

const originalEnv = new Map<string, string | undefined>()

beforeEach(() => {
  for (const name of ENV_KEYS) {
    originalEnv.set(name, process.env[name])
  }
})

afterEach(() => {
  for (const name of ENV_KEYS) {
    const value = originalEnv.get(name)
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
  originalEnv.clear()
})

describe('validateEnv()', () => {
  it('does nothing outside production when required variables are unset', () => {
    process.env.NODE_ENV = 'test'
    for (const name of REQUIRED_VARS) {
      delete process.env[name]
    }

    expect(() => validateEnv()).not.toThrow()
  })

  it('throws with every missing required variable in production', () => {
    process.env.NODE_ENV = 'production'
    for (const name of REQUIRED_VARS) {
      delete process.env[name]
    }

    expect(() => validateEnv()).toThrow(
      `Missing required environment variables: ${REQUIRED_VARS.join(', ')}`,
    )
  })

  it('does not throw in production when required variables are set', () => {
    process.env.NODE_ENV = 'production'
    for (const name of REQUIRED_VARS) {
      process.env[name] = 'test-value'
    }
    for (const name of OPTIONAL_VARS) {
      delete process.env[name]
    }

    expect(() => validateEnv()).not.toThrow()
  })
})
