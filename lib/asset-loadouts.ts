export interface AssetLoadoutInput {
  name: string
  assetKeys: string[]
}

export interface AssetLoadout {
  id: string
  name: string
  assetKeys: string[]
  createdAt: string
  updatedAt: string
}

export function normalizeAssetLoadout(input: AssetLoadoutInput, availableAssetKeys?: Iterable<string>): AssetLoadoutInput {
  const name = input.name.trim().replace(/\s+/g, ' ')
  const uniqueKeys = [...new Set(input.assetKeys.map((key) => key.trim()).filter(Boolean))]
  if (!availableAssetKeys) return { name, assetKeys: uniqueKeys }
  const available = new Set(availableAssetKeys)
  return { name, assetKeys: uniqueKeys.filter((key) => available.has(key)) }
}

export function mapAssetLoadout(row: {
  id: string
  name: string
  asset_keys: string[]
  created_at: string
  updated_at: string
}): AssetLoadout {
  return {
    id: row.id,
    name: row.name,
    assetKeys: row.asset_keys,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
