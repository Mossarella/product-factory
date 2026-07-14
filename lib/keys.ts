import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const KEYS_PATH = path.join(process.cwd(), 'keys.json')

export interface KeyRecord {
  plan: 'pro'
  issuedAt: string
  used: boolean
}

export type KeyStore = Record<string, KeyRecord>

export function readKeys(): KeyStore {
  try {
    return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

export function writeKeys(store: KeyStore): void {
  fs.writeFileSync(KEYS_PATH, JSON.stringify(store, null, 2))
}

export function issueKey(): string {
  const store = readKeys()
  const key = randomUUID()
  store[key] = { plan: 'pro', issuedAt: new Date().toISOString(), used: false }
  writeKeys(store)
  return key
}

export function validateKey(key: string): KeyRecord | null {
  const store = readKeys()
  return store[key] ?? null
}

export function markKeyUsed(key: string): void {
  const store = readKeys()
  if (store[key]) {
    store[key].used = true
    writeKeys(store)
  }
}
