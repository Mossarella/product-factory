import { createHash, timingSafeEqual } from 'node:crypto'

export type MonitorAuthResult =
  | { kind: 'monitor'; ownerId: string }
  | { kind: 'no-monitor-config' }
  | { kind: 'invalid-monitor' }

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function hashMonitorApiKey(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function verifyMonitorApiKey(request: Request): MonitorAuthResult {
  const configuredHash = process.env.ETSY_HEALTH_MONITOR_KEY_HASH?.trim().toLowerCase()
  const ownerId = process.env.ETSY_HEALTH_OWNER_ID?.trim()
  const token = getBearerToken(request)

  if (!configuredHash || !ownerId) return { kind: 'no-monitor-config' }
  if (!token) return { kind: 'invalid-monitor' }

  const providedHash = Buffer.from(hashMonitorApiKey(token), 'utf8')
  const expectedHash = Buffer.from(configuredHash, 'utf8')
  const valid = providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash)
  return valid ? { kind: 'monitor', ownerId } : { kind: 'invalid-monitor' }
}

export function monitorApiKeySetupCommand() {
  return 'openssl rand -base64 32 | tee /dev/stderr | tr -d "\\n" | openssl dgst -sha256'
}
