import { PRODUCT_BUILDS_BUCKET, productStoragePath } from '@/lib/supabase/storage'

export { PRODUCT_BUILDS_BUCKET }

export function productReleaseStoragePath(ownerId: string, productId: string, version: number, filename: string) {
  return productStoragePath(ownerId, productId, 'releases', `v${version}`, filename)
}

export function releaseDownloadFilename(productName: string, version: number) {
  const safeName = productName.replace(/[^\w\- ]/g, '').trim() || 'Product'
  return `${safeName}-Release-v${version}.zip`
}
