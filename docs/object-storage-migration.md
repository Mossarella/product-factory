# Spec: Object storage migration (Phase 2 of filesystem cleanup)

## Overview
Mascot files, fixed assets, the veado scene file, the 6 Etsy listing slot
images, and build ZIPs are all written to local disk under
`products/<userId>/<name>/...` at request time. This breaks on any
deployment where local disk isn't shared/durable across instances (most
serverless/multi-container hosting) — the blocker for deploying this as
a real multi-tenant SaaS.

`assets/` (shop-wide logo/thank-you/how-to defaults) and `templates/*.txt`
stay exactly as they are — read-only, git-committed, deploy-time bundled
content that nothing ever writes to at runtime, so plain `fs.readFileSync`
against them remains correct even in serverless.

## Decision (already made with the user)
S3-compatible object storage (`@aws-sdk/client-s3`) — portable across AWS
S3, Cloudflare R2 (recommended for production, low cost/maintenance), or
any other S3-compatible provider, configured entirely via env vars. Local
dev uses a self-hosted MinIO container in `docker-compose.yml` — same
code path in dev and production, only the endpoint/credentials differ.

## Key design decision: key objects by `Product.id`, not `userId`+`name`
Product names are mutable (rename exists); ids are not. Keying storage by
the immutable `Product.id` means:
- **Rename becomes pure DB** — no storage operation needed at all,
  eliminating today's `fs.renameSync` on the whole product directory.
- **Duplicate** still needs an explicit copy (it genuinely creates new
  data under a new id) — `copyObjectsByPrefix(oldPrefix, newPrefix)`
  enumerates and copies every object under the source product's prefix,
  matching today's `fs.cpSync(srcDir, destDir, { recursive: true })`
  behavior exactly value-for-value (including that stray build ZIPs get
  copied along even though `ProductBuild` rows aren't duplicated — that's
  today's existing behavior too, not something this migration changes).
- Slot-style storage (veado file, fixed assets, Etsy listing slots — "one
  file per logical slot, replaced on re-upload") gets simpler: always
  write to the same stable key, letting the new upload overwrite the old
  one directly. No more "clear directory, write one file" dance.
- The veado file has no DB row to carry its original filename — it's
  preserved via S3 object `Metadata` (`{ filename: '...' }`), read back
  on GET for the `X-Filename` response header, matching current behavior.

## 1. `lib/object-storage.ts` (new, server-only)
```ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3'

const client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
})

const BUCKET = process.env.S3_BUCKET ?? ''

export function productKey(productId: string, ...segments: string[]): string {
  return ['products', productId, ...segments].join('/')
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType?: string,
  metadata?: Record<string, string>,
): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  }))
}

export async function getObject(
  key: string,
): Promise<{ body: Buffer; contentType?: string; metadata?: Record<string, string> } | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const body = Buffer.from(await result.Body!.transformToByteArray())
    return { body, contentType: result.ContentType, metadata: result.Metadata }
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NoSuchKey' || err.name === 'NotFound')) return null
    throw err
  }
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NotFound' || err.name === 'NoSuchKey')) return false
    throw err
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

export async function copyObjectsByPrefix(sourcePrefix: string, destPrefix: string): Promise<void> {
  let continuationToken: string | undefined
  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: sourcePrefix,
      ContinuationToken: continuationToken,
    }))
    for (const object of listed.Contents ?? []) {
      if (!object.Key) continue
      const destKey = destPrefix + object.Key.slice(sourcePrefix.length)
      await client.send(new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${object.Key}`,
        Key: destKey,
      }))
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)
}
```

## 2. `lib/api-files.ts` (edit — remove now-dead fs-based product storage helpers)
Delete: `PRODUCTS_DIR`, `productPath()`, `userProductPath()`, `clearDirectory()`.
Keep everything else (`ROOT`, `ASSETS_DIR`, `assetPath()`, `MIME`,
`resolveWithinRoot`, `resolveWithin`, `decodeSegment`, `sanitizeName`,
`sanitizeFilename`, `contentTypeFor`, `readBodyBuffer`, and — important —
`firstFile()`, which is still used by `app/api/slot/[name]/route.ts` for
the shop-wide static assets, out of scope for this migration.

## 3. `lib/zip-server.ts` (edit)
- Replace `userId: string; storageProductName: string` in
  `buildZipBuffer()`'s options with `productId: string`.
- Mascot-file loop: change `files.forEach((file, index) => {...})` to a
  `for (const [index, file] of files.entries())` loop (needed so each
  iteration can `await`), replace `fs.existsSync`/`fs.readFileSync`
  against `userProductPath(...)` with `await getObject(productKey(opts.productId, 'mascot-files', file.filename))`,
  `continue` (not `return`) on a miss.
- Fixed-asset loop: same swap — `await getObject(productKey(opts.productId, 'fixed-assets', asset.filename))`
  instead of `fs.existsSync`/`fs.readFileSync`.
- The `BUILTIN_ASSETS` shop-wide fallback loop (`assetPath()` +
  `firstFile()` + `fs.readFileSync`) stays completely unchanged — out of
  scope, still filesystem-backed bundled defaults.
- `rebuildManifestForRevert()` is untouched — it only transforms an
  in-memory buffer, never touches storage itself.
- Imports: remove `userProductPath`, add `getObject`, `productKey` from
  `@/lib/object-storage`; keep `fs`, `path`, `assetPath`, `firstFile` for
  the shop-wide loop.

## 4. `lib/dashboard-stats.ts` (edit)
- `heroSlotEmpty(userId, productName)` → `heroSlotEmpty(productId: string): Promise<boolean>`,
  implemented as `!(await objectExists(productKey(productId, 'etsy-slots', 'etsy-hero')))`.
- `ProductForStats` gains `id: string`.
- `computeStats()` becomes `async`: compute `heroEmptyFlags = await Promise.all(products.map(p => heroSlotEmpty(p.id)))`
  up front (an async predicate inside `.filter()` doesn't work — it
  always returns a truthy Promise), then `missingHero = heroEmptyFlags.filter(Boolean).length`.
  Drop the `userId` parameter entirely (no longer needed).
- `app/api/dashboard/route.ts`: add `id: true` to the Prisma `select`,
  `await computeStats(products)` (no more `userId` arg).

## 5. Route rewrites — general pattern
Every route below currently derives its storage path from `userId`+`name`
directly with no Prisma lookup. Since storage is now keyed by
`product.id`, each needs a `prisma.product.findUnique({ where: {
userId_name: { userId, name: productName } } })` first (a `404` if not
found — a correctness improvement these routes lacked before, not just
incidental). Response/request shapes are unchanged in every case — no
frontend changes needed anywhere in this migration.

### `app/api/products/[name]/file/route.ts` (mascot file upload)
Look up `product`, then `await putObject(productKey(product.id, 'mascot-files', filename), buffer, contentTypeFor(filename))`.

### `app/api/products/[name]/file/[filename]/route.ts` (mascot file serve)
Look up `product`, then `await getObject(productKey(product.id, 'mascot-files', safeFilename))`, 404 if null, serve `object.body` with `object.contentType || contentTypeFor(safeFilename)`.

### `app/api/products/[name]/asset/route.ts` / `asset/[filename]/route.ts`
Identical pattern, `fixed-assets` instead of `mascot-files`.

### `app/api/products/[name]/veado/route.ts`
GET: look up product, `getObject(productKey(product.id, 'veado-file'))`,
404 if null, `filename = object.metadata?.filename ?? 'scene.veado'`,
serve with `Content-Type` and `X-Filename: filename`.
POST: look up product, `putObject(productKey(product.id, 'veado-file'), buffer, contentTypeFor(filename), { filename })`.

### `app/api/products/[name]/slot/[slot]/route.ts`
GET: look up product, `getObject(productKey(product.id, 'etsy-slots', decodedSlot))`,
404 if null, serve with `object.contentType || 'application/octet-stream'`.
POST: look up product, `putObject(productKey(product.id, 'etsy-slots', decodedSlot), buffer, contentTypeFor(originalFilename))`.
DELETE: look up product, `deleteObject(productKey(product.id, 'etsy-slots', decodedSlot))` (idempotent — deleting a nonexistent key doesn't error, same as the current `clearDirectory` on an already-empty dir).

### `app/api/products/route.ts` (product creation)
Delete the `mkdirSync` directory-scaffolding loop entirely — object
storage needs no pre-created "directories," keys are created on first
write. Remove the now-unused `fs`/`path`/`PRODUCTS_DIR` imports (keep
`sanitizeName`).

### `app/api/products/[name]/duplicate/route.ts`
Create the `duplicate` Prisma row first (to get its new `id`), then
`await copyObjectsByPrefix(productKey(source.id) + '/', productKey(duplicate.id) + '/')`.
Remove `fs`/`path`/`PRODUCTS_DIR` imports.

### `app/api/products/[name]/rename/route.ts`
Delete the `fs.renameSync`/`PRODUCTS_DIR` block entirely — renaming is
now pure `prisma.product.update({ data: { name: sanitizedNew } })`, no
storage operation at all. Remove `fs`/`path`/`PRODUCTS_DIR` imports.

### `app/api/products/[name]/build/route.ts`
Replace `fs.mkdirSync`/`fs.writeFileSync` against
`userProductPath(userId, product.name, 'builds')` with
`await putObject(productKey(product.id, 'builds', filename), buffer, 'application/zip')`.
Pass `productId: product.id` (not `userId`/`storageProductName`) into
`buildZipBuffer()`. Remove `fs`/`path`/`userProductPath` imports entirely.

### `app/api/products/[name]/build/latest/route.ts` and `build/[version]/route.ts`
Replace the `fs.existsSync`/`fs.statSync`/`fs.readFileSync` block with
`const object = await getObject(productKey(product.id, 'builds', build.filename)); if (!object) return 404`,
serve `object.body` with `Content-Type: application/zip` and the existing
`Content-Disposition` logic unchanged. Remove `fs`/`userProductPath` imports.

### `app/api/products/[name]/build/[version]/revert/route.ts`
Replace the `fs.readFileSync(sourcePath)` read with
`const sourceObject = await getObject(productKey(product.id, 'builds', targetBuild.filename)); if (!sourceObject) return 404`,
pass `sourceObject.body` into `rebuildManifestForRevert()`, replace the
`fs.mkdirSync`/`fs.writeFileSync` write with
`await putObject(productKey(product.id, 'builds', filename), buffer, 'application/zip')`.
Remove `fs`/`path`/`userProductPath` imports.

## 6. Local dev infra
### `docker-compose.yml` — add MinIO + a bucket-bootstrap init container
```yaml
  minio:
    image: minio/minio:latest
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin &&
      mc mb -p local/product-factory &&
      exit 0
      "
```
Add `miniodata:` alongside the existing `pgdata:` under top-level `volumes:`.

### `.env.example` — add S3 config block
```
# ─── Object storage (S3-compatible) ────────────────────────────────────────────
# Local dev: self-hosted MinIO via docker compose (see docker-compose.yml)
# Production: point at any S3-compatible provider (Cloudflare R2
# recommended for low cost/maintenance, or AWS S3, Backblaze B2, etc.)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=product-factory
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
# MinIO needs path-style addressing; most hosted S3-compatible providers
# (including R2) do NOT — set to false/omit outside local dev.
S3_FORCE_PATH_STYLE=true
```

### `package.json`
Add `@aws-sdk/client-s3` (I run `npm install` myself, same as other
tooling/dependency commands this session).

## 7. Tests (mandatory)
- New `tests/integration/object-storage.test.ts` — runs against the REAL
  local MinIO instance (no mocking of the AWS SDK) to get genuine
  end-to-end confidence in the S3 client config (path-style addressing,
  credentials, etc. are exactly the kind of thing mocks would hide a bug
  in): `putObject`+`getObject` round-trips bytes/contentType/metadata
  correctly, `getObject` returns `null` for a missing key,
  `objectExists` true/false, `deleteObject` then `getObject` returns
  `null`, `copyObjectsByPrefix` copies multiple objects under a prefix
  to a new prefix without disturbing objects outside that prefix.
- Every existing test file that currently mocks `@/lib/api-files` with
  the old shape (`PRODUCTS_DIR`, `userProductPath`, `clearDirectory`,
  etc.) needs that mock trimmed to the new shape, AND — for routes that
  now call `@/lib/object-storage` — a new mock for that module (mirroring
  how these files already mock `@/lib/db`/`@/auth` as boundaries):
  `tests/integration/products-asset.test.ts`, `products-config.test.ts`,
  `products-duplicate.test.ts`, `products-build.test.ts`,
  `products-build-history.test.ts`, `products.test.ts`,
  `tests/unit/dashboard-stats.test.ts` (also update for the new
  `productId`-based, async `heroSlotEmpty`/`computeStats` signatures),
  `tests/unit/zip-server.test.ts` (mock `@/lib/object-storage` instead of
  `fs` for the per-product reads; the shop-wide `BUILTIN_ASSETS` fs mock
  stays).
- New `tests/integration/products-file.test.ts` — mascot file
  upload/serve route (no test file exists for this today): 401, upload
  success (asserts `putObject` called with the right key/bytes), 404 on
  serve when missing, 200 with correct bytes/content-type on serve.
- New `tests/integration/products-veado.test.ts` and
  `products-slot.test.ts` — same shape, covering the previously
  completely untested veado and Etsy-slot routes (401/404/200 for
  GET/POST, plus DELETE for the slot route), verifying the
  metadata-preserved-filename behavior for veado and the
  invalid-slot-name 400 for the slot route.
- Update `tests/integration/products-duplicate.test.ts`: replace the
  `fs.cpSync` assertion with a `copyObjectsByPrefix` mock assertion
  (called with the source and destination product-id prefixes).
- `tests/integration/products.test.ts`: remove the `mkdirSync` mock/
  assertion entirely (no longer called by the route).
- No rename test file exists today either — add
  `tests/integration/products-rename.test.ts` (401, 400 invalid name,
  404 source not found, 409 name conflict, 200 success) — this one
  needs NO `@/lib/object-storage` mock at all now, which is itself worth
  asserting isn't imported/called, since rename became pure DB.

## Out of Scope
- `assets/` (shop-wide defaults) and `templates/*.txt` — unchanged,
  still filesystem/bundled.
- No data migration of anything currently sitting in the local
  `products/` directory into the new object store — this is dev-only
  data in the current environment (confirmed earlier this session:
  freshly reset local DB/infra), not a concern for existing production
  data since there is no production deployment yet.
- No admin/cleanup tooling for orphaned objects (e.g. from duplicate's
  stray-build-ZIP-copying behavior, matching current behavior as noted
  above).

## Verification
1. `npm install @aws-sdk/client-s3` (me).
2. `docker compose up -d` — confirm `minio` and `minio-init` come up
   healthy and the `product-factory` bucket exists (`docker compose logs
   minio-init` should show `mc mb` succeeding, or already-exists on a
   re-run).
3. `npx tsc --noEmit`, `bun test tests/unit tests/integration` — the new
   `object-storage.test.ts` requires MinIO running locally per step 2.
4. Manually: upload a mascot file, a fixed asset, a veado file, and an
   Etsy slot image on the Factory page — confirm each displays/downloads
   correctly. Build the product — confirm the ZIP downloads and its
   contents are correct. Rename the product — confirm all uploaded files
   and the build history are still reachable afterward (proving the
   productId-keyed storage survived the rename with zero data movement).
   Duplicate the product — confirm the duplicate has its own independent
   copies of the same files.
