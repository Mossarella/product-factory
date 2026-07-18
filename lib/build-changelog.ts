import type { BuildManifest } from './zip-server'

function fileKey(f: { folder: string; origName: string }): string {
  return `${f.folder}::${f.origName}`
}

function assetKey(a: { assetKey: string; zipFilename: string }): string {
  return `${a.assetKey}::${a.zipFilename}`
}

export function generateChangelog(current: BuildManifest, previous: BuildManifest | null): string {
  if (!previous) return 'Initial build'

  const fragments: string[] = []

  const prevFileKeys = new Set(previous.files.map(fileKey))
  const currFileKeys = new Set(current.files.map(fileKey))
  const added = current.files.filter((f) => !prevFileKeys.has(fileKey(f)))
  const removed = previous.files.filter((f) => !currFileKeys.has(fileKey(f)))

  if (added.length > 0) {
    const folderCounts = new Map<string, number>()
    for (const f of added) folderCounts.set(f.folder, (folderCounts.get(f.folder) ?? 0) + 1)
    if (folderCounts.size === 1) {
      const [folder, count] = [...folderCounts.entries()][0]
      fragments.push(`+ Added ${count} file${count !== 1 ? 's' : ''} to ${folder}`)
    } else {
      fragments.push(`+ Added ${added.length} files`)
    }
  }
  if (removed.length > 0) {
    fragments.push(`− Removed ${removed.length} file${removed.length !== 1 ? 's' : ''}`)
  }

  const prevAssetKeys = new Set(previous.fixedAssets.map(assetKey))
  const prevAssetIds = new Set(previous.fixedAssets.map((a) => a.assetKey))
  const changedAssets = current.fixedAssets.filter((a) => !prevAssetKeys.has(assetKey(a)))
  const newAssets = changedAssets.filter((a) => !prevAssetIds.has(a.assetKey))
  const updatedAssets = changedAssets.filter((a) => prevAssetIds.has(a.assetKey))
  if (newAssets.length > 0) fragments.push(`+ Added ${newAssets.map((a) => a.assetKey).join(', ')}`)
  if (updatedAssets.length > 0) fragments.push(`+ Updated ${updatedAssets.map((a) => a.assetKey).join(', ')}`)

  if (current.readmeHash && previous.readmeHash && current.readmeHash !== previous.readmeHash) {
    fragments.push('+ Updated README')
  }

  return fragments.length > 0 ? fragments.join(', ') : 'No changes detected'
}
