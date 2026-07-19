import fs from 'fs'
import path from 'path'

export const ROOT = process.cwd()
export const PRODUCTS_DIR = path.join(ROOT, 'products')
export const ASSETS_DIR = path.join(ROOT, 'assets')

export const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.veado': 'application/octet-stream',
  '.zip': 'application/zip',
}

export function resolveWithinRoot(...segments: string[]): string {
  return resolveWithin(ROOT, ...segments)
}

export function resolveWithin(directory: string, ...segments: string[]): string {
  const resolved = path.resolve(directory, ...segments)
  if (resolved !== directory && !resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error('Invalid path')
  }
  return resolved
}

export function productPath(name: string, ...segments: string[]): string {
  return resolveWithin(PRODUCTS_DIR, name, ...segments)
}

export function userProductPath(userId: string, name: string, ...segments: string[]): string {
  return resolveWithin(PRODUCTS_DIR, userId, name, ...segments)
}

export function assetPath(name: string, ...segments: string[]): string {
  return resolveWithin(ASSETS_DIR, name, ...segments)
}

export function decodeSegment(segment: string): string {
  return decodeURIComponent(segment)
}

export function sanitizeName(name: string): string {
  return name.trim().replace(/[^\w\- ]/g, '')
}

export function sanitizeFilename(filename: string): string {
  return path.basename(filename).replace(/[^\w\-. ]/g, '_')
}

export function contentTypeFor(filename: string): string {
  return MIME[path.extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

export function clearDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true })
  for (const entry of fs.readdirSync(directory)) {
    fs.rmSync(path.join(directory, entry), { recursive: true, force: true })
  }
}

export function firstFile(directory: string): string | undefined {
  if (!fs.existsSync(directory)) return undefined
  return fs.readdirSync(directory).find((entry) =>
    fs.statSync(path.join(directory, entry)).isFile(),
  )
}

export function readBodyBuffer(request: Request): Promise<Buffer> {
  return request.arrayBuffer().then((arrayBuffer) => Buffer.from(arrayBuffer))
}
