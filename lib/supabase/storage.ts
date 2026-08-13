export const PRODUCT_FILES_BUCKET = 'product-files'
export const PRODUCT_BUILDS_BUCKET = 'product-builds'

export function productStoragePath(ownerId: string, productId: string, ...segments: string[]) {
  return [ownerId, productId, ...segments].map((segment) => segment.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')
}
