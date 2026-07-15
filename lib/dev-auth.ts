// In-memory store for dev magic links. Auth.js stores hashed tokens in the DB,
// so we capture the plain-text URL when sendVerificationRequest runs instead.
const devLoginUrls = new Map<string, { url: string; expires: number }>()

export function storeDevLoginUrl(email: string, url: string, expires: Date) {
  if (process.env.NODE_ENV === 'production') return
  devLoginUrls.set(email.toLowerCase(), { url, expires: expires.getTime() })
}

export function getDevLoginUrl(email: string): string | null {
  if (process.env.NODE_ENV === 'production') return null

  const record = devLoginUrls.get(email.toLowerCase())
  if (!record) return null
  if (record.expires <= Date.now()) {
    devLoginUrls.delete(email.toLowerCase())
    return null
  }
  return record.url
}
