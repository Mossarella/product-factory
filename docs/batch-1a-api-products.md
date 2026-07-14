# Batch 1A — All product API routes

Read `docs/v2-conventions.md` first.

## Your task
Implement all product-related API routes in the Next.js App Router.
These mirror the v1 `server.js` routes exactly — same URL paths, same behaviour.

## Files to create

### `app/api/products/route.ts`
GET /api/products — list all products
- Read `products/` dir, for each dir read `product.json`
- Return `{ name, complete, createdAt }[]` sorted old→new by createdAt (DD/MM/YYYY)
- Free plan enforcement: just list, no limit here

POST /api/products — create new product
- Body: `{ name: string }`
- Sanitize: `.trim().replace(/[^\w\- ]/g, '')`
- Check license: read `license.json`, if plan==='free' and product count >= 3 → return 403 `{ error: 'Free plan limit reached' }`
- Create dir `products/<name>/` and `products/<name>/mascot-files/` and `products/<name>/etsy-files/` and `products/<name>/veado-file/`
- Also create `products/<name>/assets/<slot>/` for slots: etsy-hero, etsy-expressions, etsy-files, etsy-preview, etsy-detail, etsy-branding
- Write initial `product.json`: `{ name, sku:'', productName: name, etsyTitle:'', description:'', notes:'', contact:'', price:0, currency:'USD', licenseType:'personal', folders:['Main'], mascotFiles:[], etsyTags:[], complete:false, createdAt: DD/MM/YYYY }`
- Return 201 + the config

### `app/api/products/[name]/config/route.ts`
GET — read `products/<name>/product.json`, return JSON
POST — body is raw JSON string, write to `products/<name>/product.json`
- Both: decode name with `decodeURIComponent`
- Params: `{ params }: { params: Promise<{ name: string }> }`, use `await params`

### `app/api/products/[name]/file/route.ts`
POST — upload a mascot file (raw binary)
- Headers: `x-filename` (original name), content-type
- Sanitize filename: `path.basename(...).replace(/[^\w\-. ]/g, '_')`
- Save to `products/<name>/mascot-files/<sanitized>`
- Return 200

### `app/api/products/[name]/file/[filename]/route.ts`
GET — serve a mascot file from `products/<name>/mascot-files/<filename>`
- Use `fs.createReadStream` piped to response, or read buffer and return with correct content-type
- Return 404 if not found
- Params: `{ params }: { params: Promise<{ name: string; filename: string }> }`

### `app/api/products/[name]/veado/route.ts`
POST — upload veadotube file (raw binary)
- Header `x-filename`
- Clear old file in `products/<name>/veado-file/` first
- Save new file
- Return `{ filename }`

GET — serve veadotube file
- Find first file in `products/<name>/veado-file/`
- Return with header `X-Filename: <filename>`
- 404 if empty

### `app/api/products/[name]/slot/[slot]/route.ts`
GET — serve first file from `products/<name>/assets/<slot>/`
POST — upload file to slot (clears old file first)
  - Headers: `x-filename`, content-type
  - Filename: `<slot><ext>`
DELETE — clear all files in slot dir

### `app/api/products/[name]/rename/route.ts`
POST — body `{ newName: string }`
- Sanitize newName
- `fs.renameSync(oldDir, newDir)`
- Update `name` field inside product.json
- 409 if newName already exists

### `app/api/products/[name]/duplicate/route.ts`
POST — body `{ newName: string }`
- Sanitize newName
- Recursive copy of `products/<name>/` to `products/<newName>/`
- Update `name` field and set `complete: false` in new product.json
- 409 if exists, 404 if source not found

### `app/api/slot/[name]/route.ts`
GET — serve first file from `assets/<name>/`
- 404 if dir empty or not found

## MIME type map (use in all file-serving routes)
```ts
const MIME: Record<string, string> = {
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
```

## Helper: readBodyBuffer (for binary uploads in Next.js)
```ts
async function readBodyBuffer(req: NextRequest): Promise<Buffer> {
  const arrayBuffer = await req.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
```

## Helper: readLicense
```ts
import fs from 'fs'
import path from 'path'
function readLicense(): { plan: string } {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'license.json'), 'utf8'))
  } catch { return { plan: 'free' } }
}
```

## Important
- All disk operations: use `fs` (sync is fine for this tool)
- Always `fs.mkdirSync(dir, { recursive: true })` before writing files
- Path traversal guard on any user-supplied path: ensure resolved path starts with ROOT
- Log each operation: `console.log('action: details')`

Print `=== COMPLETE: batch-1a-api-products ===` when done.
