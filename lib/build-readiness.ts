import type { ProductConfig } from '@/lib/types'
import { validateProduct, type TemplateRule } from '@/lib/template-rules'

export type ReadinessSeverity = 'blocking' | 'warning'

export interface ReadinessItem {
  id: string
  label: string
  detail: string
  severity: ReadinessSeverity
  ok: boolean
  target?: string
}

export interface BuildReadiness {
  items: ReadinessItem[]
  blocking: ReadinessItem[]
  warnings: ReadinessItem[]
  canBuild: boolean
}

export interface ReadinessFile {
  origName: string
  folder: string
  variant: string
}

export interface ReadinessAsset {
  id: string
  blob: File | null
}

export interface ShopIdentity {
  name?: string | null
  shopName?: string | null
  shopContact?: string | null
}

function item(id: string, label: string, detail: string, ok: boolean, severity: ReadinessSeverity, target?: string): ReadinessItem {
  return { id, label, detail, ok, severity, target }
}

export function evaluateBuildReadiness(
  config: ProductConfig,
  files: ReadinessFile[],
  assets: ReadinessAsset[],
  rules: TemplateRule[],
  heroImageLoaded: boolean,
  shopIdentity: ShopIdentity,
): BuildReadiness {
  const validationConfig: ProductConfig = {
    ...config,
    mascotFiles: files.map((file, index) => ({
      id: `readiness-${index}`,
      filename: file.origName,
      origName: file.origName,
      folder: file.folder,
      variant: file.variant,
    })),
  }
  const templateResults = validateProduct(validationConfig, rules)
  const tags = config.etsyTags.length
  const shopName = (shopIdentity.shopName ?? shopIdentity.name ?? '').trim()
  const contact = (shopIdentity.shopContact ?? config.contact ?? '').trim()
  const foldersPopulated = config.folders.length > 0 && config.folders.every((folder) => files.some((file) => file.folder === folder))

  const items: ReadinessItem[] = [
    item('product-name', 'Product name', config.productName.trim() ? 'Product name is set.' : 'Add a product name.', Boolean(config.productName.trim()), 'blocking', 'product-info'),
    item('etsy-title', 'Etsy title', config.etsyTitle.trim().length <= 140 && config.etsyTitle.trim() ? `${config.etsyTitle.trim().length}/140 characters` : 'Add an Etsy title up to 140 characters.', Boolean(config.etsyTitle.trim()) && config.etsyTitle.trim().length <= 140, 'blocking', 'product-info'),
    item('description', 'Description', config.description.trim() ? 'Description is ready.' : 'Add a product description.', Boolean(config.description.trim()), 'blocking', 'etsy-description'),
    item('price', 'Price', config.price > 0 ? `${config.currency} ${config.price.toFixed(2)}` : 'Set a price greater than zero.', config.price > 0, 'blocking', 'product-info'),
    item('tags', 'Etsy tags', tags >= 10 && tags <= 13 ? `${tags}/13 tags` : tags > 0 && tags < 10 ? `${tags}/13 tags — add at least 10` : 'Add 10–13 tags.', tags >= 10 && tags <= 13, tags > 0 && tags < 10 ? 'warning' : 'blocking', 'etsy-tags'),
    item('hero', 'Etsy hero image', heroImageLoaded ? 'Hero image is loaded.' : 'Upload an Etsy hero image.', heroImageLoaded, 'blocking', 'etsy-slots'),
    item('files', 'Product files', files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready.` : 'Add at least one product file.', files.length > 0, 'blocking', 'product-files'),
    item('folders', 'Folder contents', foldersPopulated ? 'Every folder is populated.' : 'Every configured folder needs at least one file.', foldersPopulated, 'blocking', 'product-files'),
    item('shop-identity', 'README identity', shopName ? 'Shop identity is set.' : 'Set a shop name in Settings.', Boolean(shopName), 'blocking', 'shop-identity'),
    item('shop-contact', 'README contact', contact ? 'Contact information is set.' : 'Add contact information in Settings or Product Info.', Boolean(contact), 'warning', 'product-info'),
    ...templateResults.map((result) => item(`template-${result.ruleId}`, result.label, result.status === 'ok' ? result.detail ?? 'Rule passed.' : result.detail ?? 'Template requirement is missing.', result.status === 'ok', result.required ? 'blocking' : 'warning', 'template-validation')),
  ]

  if (!assets.some((asset) => asset.blob)) {
    items.push(item('shared-assets', 'Shared assets', 'No optional shared assets selected.', true, 'warning', 'fixed-assets'))
  }

  const blocking = items.filter((entry) => !entry.ok && entry.severity === 'blocking')
  const warnings = items.filter((entry) => !entry.ok && entry.severity === 'warning')
  return { items, blocking, warnings, canBuild: blocking.length === 0 }
}

export function readinessLabel(readiness: BuildReadiness): string {
  if (!readiness.canBuild) return `${readiness.blocking.length} BLOCKING CHECK${readiness.blocking.length === 1 ? '' : 'S'}`
  return readiness.warnings.length ? 'READY WITH WARNINGS' : 'READY TO PACKAGE'
}

export function readinessSummary(readiness: BuildReadiness): string {
  if (!readiness.canBuild) return 'Resolve the blocking checks before generating a package.'
  return readiness.warnings.length ? 'Package can be built, but review the warnings first.' : 'All required checks passed. Your ZIP is ready to generate.'
}

export function getReadinessStatus(readiness: BuildReadiness): 'ready' | 'warning' | 'blocked' {
  if (!readiness.canBuild) return 'blocked'
  return readiness.warnings.length ? 'warning' : 'ready'
}

export function readinessProblems(readiness: BuildReadiness): ReadinessItem[] {
  return [...readiness.blocking, ...readiness.warnings]
}

export function isValidTagCount(tags: string[]): boolean { return tags.length >= 10 && tags.length <= 13 }
export function isValidTitle(title: string): boolean { return title.trim().length > 0 && title.trim().length <= 140 }
export function isValidPrice(price: number): boolean { return Number.isFinite(price) && price > 0 }
export function isValidProductName(name: string): boolean { return name.trim().length > 0 }
export function isValidHeroImage(loaded: boolean): boolean { return loaded }
export function isValidShopIdentity(identity: ShopIdentity): boolean { return Boolean((identity.shopName ?? identity.name ?? '').trim()) }
export function isValidFolderPopulation(config: ProductConfig, files: ReadinessFile[]): boolean { return config.folders.length > 0 && config.folders.every((folder) => files.some((file) => file.folder === folder)) }
export function isReadinessComplete(readiness: BuildReadiness): boolean { return readiness.canBuild && readiness.warnings.length === 0 }
export function emptyBuildReadiness(): BuildReadiness { return { items: [], blocking: [], warnings: [], canBuild: false } }
export function getReadinessActionText(readiness: BuildReadiness): string { return readiness.canBuild ? 'Build Product' : 'Resolve Requirements' }
export function getReadinessIcon(readiness: BuildReadiness): string { return getReadinessStatus(readiness) === 'ready' ? '✓' : getReadinessStatus(readiness) === 'warning' ? '⚠' : '✗' }
export function getReadinessTone(readiness: BuildReadiness): string { return getReadinessStatus(readiness) === 'ready' ? 'emerald' : getReadinessStatus(readiness) === 'warning' ? 'yellow' : 'red' }
export function getReadinessProblemText(readiness: BuildReadiness): string { const count = readinessProblems(readiness).length; return count === 0 ? 'No open requirements.' : `${count} open requirement${count === 1 ? '' : 's'}.` }
export function getReadinessStateCounts(readiness: BuildReadiness): { blocking: number; warnings: number } { return { blocking: readiness.blocking.length, warnings: readiness.warnings.length } }
export function hasRequiredTemplateFailures(config: ProductConfig, rules: TemplateRule[]): boolean { return validateProduct(config, rules).some((result) => result.required && result.status === 'missing') }
export function isReadyToBuild(readiness: BuildReadiness): boolean { return readiness.canBuild }
export function countReadinessProblems(readiness: BuildReadiness): number { return readinessProblems(readiness).length }
