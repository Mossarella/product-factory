// Deterministic avatar color for a product name initial
const AVATAR_COLORS = [
  'bg-violet-700', 'bg-emerald-700', 'bg-amber-700',
  'bg-sky-700', 'bg-rose-700', 'bg-teal-700',
]
export function avatarColor(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
}

// Greeting based on time of day (hour param for testability)
export function greeting(name: string | null | undefined, hour = new Date().getHours()): string {
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const first = (name && name.trim()) ? name.trim().split(' ')[0] : 'there'
  return `Good ${time}, ${first}`
}

// Formatted date (date param for testability)
export function formatDate(date = new Date()): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// Canonical key for a tag set (sorted, joined) for dedup detection
export function tagKey(tags: string[]): string {
  return [...tags].sort().join('|')
}

// Collision-resistant, filename-safe key for a custom fixed-asset's zip entry
export function sanitizeAssetFilename(name: string): string {
  const cleaned = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'CUSTOM'
}

// Merge a loadout-filtered "visible" subset's edits back into the full
// fixed-assets array without dropping items hidden by the filter.
export function mergeVisibleAssets<T extends { id: string }>(
  current: T[],
  updatedVisible: T[],
  visibleIds: Set<string>,
): T[] {
  const hidden = current.filter((item) => !visibleIds.has(item.id))
  return [...hidden, ...updatedVisible]
}
