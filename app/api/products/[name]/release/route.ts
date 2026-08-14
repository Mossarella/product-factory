import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_BUILDS_BUCKET, productReleaseStoragePath, releaseDownloadFilename } from '@/lib/release-storage'
import type { Json } from '@/lib/supabase/database.types'
import { validateReleaseSnapshotArtifacts } from '@/lib/release-snapshot'

interface RouteContext {
  params: Promise<{ name: string }>
}

interface ReleaseArtifacts {
  listing: Json
  summary: Json
}

type ArtifactExtraction = { artifacts: ReleaseArtifacts } | { code: 'RELEASE_ARTIFACTS_MISSING' | 'RELEASE_ARTIFACTS_INVALID' }

async function extractReleaseArtifacts(buffer: Buffer): Promise<ArtifactExtraction> {
  const zip = await JSZip.loadAsync(buffer)
  const listingFile = zip.file('etsy-listing.json')
  const summaryFile = zip.file('release-summary.json')
  if (!listingFile || !summaryFile) return { code: 'RELEASE_ARTIFACTS_MISSING' }
  try {
    return {
      artifacts: {
        listing: JSON.parse(await listingFile.async('text')) as Json,
        summary: JSON.parse(await summaryFile.async('text')) as Json,
      },
    }
  } catch {
    return { code: 'RELEASE_ARTIFACTS_INVALID' }
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const { data: product, error: productError } = await supabase.from('products').select('id').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const { data: releases, error: releasesError } = await supabase.from('product_releases').select('id, product_id, build_id, version, bundle_filename, bundle_size, bundle_sha256, listing_snapshot, release_summary, created_at').eq('owner_id', user.id).eq('product_id', product.id).order('version', { ascending: false })
  if (releasesError) return NextResponse.json({ error: releasesError.message }, { status: 500 })
  return NextResponse.json(releases ?? [])
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const { data: product, error: productError } = await supabase.from('products').select('id, name, product_name, build_version').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as { version?: number }
  const version = typeof body.version === 'number' ? body.version : null
  if (!version || !Number.isInteger(version) || version < 1) return NextResponse.json({ error: 'A valid build version is required' }, { status: 400 })

  const { data: build, error: buildError } = await supabase.from('product_builds').select('id, version, filename, storage_path').eq('owner_id', user.id).eq('product_id', product.id).eq('version', version).maybeSingle()
  if (buildError) return NextResponse.json({ error: buildError.message }, { status: 500 })
  if (!build) return NextResponse.json({ error: 'Build not found' }, { status: 404 })
  if (product.build_version !== version) {
    return NextResponse.json({ error: `Build v${version} is stale; the current package is v${product.build_version}`, code: 'STALE_BUILD', latestVersion: product.build_version }, { status: 409 })
  }

  const { data: existing, error: existingError } = await supabase.from('product_releases').select('id, product_id, build_id, version, bundle_filename, bundle_size, bundle_sha256, listing_snapshot, release_summary, created_at').eq('owner_id', user.id).eq('product_id', product.id).eq('build_id', build.id).maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (existing) return NextResponse.json({ release: existing, created: false })

  const sourcePath = build.storage_path
  if (!sourcePath) return NextResponse.json({ error: 'Build has no stored ZIP' }, { status: 409 })
  const { data: object, error: downloadError } = await supabase.storage.from(PRODUCT_BUILDS_BUCKET).download(sourcePath)
  if (downloadError || !object) return NextResponse.json({ error: 'Build file not found' }, { status: 404 })
  const buffer = Buffer.from(await object.arrayBuffer())
  const extracted = await extractReleaseArtifacts(buffer).catch(() => ({ code: 'RELEASE_ARTIFACTS_INVALID' as const }))
  if ('code' in extracted) {
    const message = extracted.code === 'RELEASE_ARTIFACTS_MISSING' ? 'Build does not contain release artifacts' : 'Build contains invalid release artifacts'
    return NextResponse.json({ error: message, code: extracted.code }, { status: 422 })
  }
  if (!validateReleaseSnapshotArtifacts({ ...extracted.artifacts, productId: product.id, productName: product.product_name || product.name, version })) {
    return NextResponse.json({ error: 'Release artifacts do not match this product and build version', code: 'RELEASE_ARTIFACTS_MISMATCH' }, { status: 422 })
  }
  const artifacts = extracted.artifacts

  const bundleFilename = releaseDownloadFilename(product.product_name || product.name, version)
  const bundleStoragePath = productReleaseStoragePath(user.id, product.id, version, bundleFilename)
  const bundleSha256 = createHash('sha256').update(buffer).digest('hex')
  const { error: uploadError } = await supabase.storage.from(PRODUCT_BUILDS_BUCKET).upload(bundleStoragePath, buffer, { contentType: 'application/zip', upsert: false })
  if (uploadError) {
    const { data: concurrent } = await supabase.from('product_releases').select('id, product_id, build_id, version, bundle_filename, bundle_size, bundle_sha256, listing_snapshot, release_summary, created_at').eq('owner_id', user.id).eq('product_id', product.id).eq('build_id', build.id).maybeSingle()
    if (concurrent) return NextResponse.json({ release: concurrent, created: false })
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: release, error: insertError } = await supabase.from('product_releases').insert({
    owner_id: user.id,
    product_id: product.id,
    build_id: build.id,
    version,
    bundle_storage_path: bundleStoragePath,
    bundle_filename: bundleFilename,
    bundle_size: buffer.byteLength,
    bundle_sha256: bundleSha256,
    listing_snapshot: artifacts.listing,
    release_summary: artifacts.summary,
  }).select('id, product_id, build_id, version, bundle_filename, bundle_size, bundle_sha256, listing_snapshot, release_summary, created_at').single()
  if (insertError || !release) {
    await supabase.storage.from(PRODUCT_BUILDS_BUCKET).remove([bundleStoragePath])
    if (insertError?.code === '23505') {
      const { data: concurrent } = await supabase.from('product_releases').select('id, product_id, build_id, version, bundle_filename, bundle_size, bundle_sha256, listing_snapshot, release_summary, created_at').eq('owner_id', user.id).eq('product_id', product.id).eq('build_id', build.id).maybeSingle()
      if (concurrent) return NextResponse.json({ release: concurrent, created: false })
    }
    return NextResponse.json({ error: insertError?.message ?? 'Could not persist release' }, { status: 500 })
  }

  return NextResponse.json({ release, created: true }, { status: 201 })
}
