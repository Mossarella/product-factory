import fs from 'fs'
import path from 'path'

const LICENSE_PATH = path.join(process.cwd(), 'license.json')

export interface LicenseData {
  key: string
  plan: 'free' | 'pro'
  activatedAt: string
}

export function readLicense(): { plan: 'free' | 'pro'; activatedAt?: string; key?: string } {
  try {
    return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'))
  } catch {
    return { plan: 'free' }
  }
}

export function writeLicense(data: LicenseData): void {
  fs.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2))
}
