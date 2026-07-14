export interface TemplateData {
  name: string
  etsyName: string
  shopName: string
  contact: string
  description: string
  notes: string
  licenseType: 'personal' | 'commercial' | 'both'
  price: number
  commercialPrice?: number
  currency: string
  folders: Array<{ label: string; count: number }>
  etsyTags: string[]
}

/** Client-safe template replacement helper. */
export function fillTemplate(template: string, d: TemplateData): string {
  const folders = d.folders
    .map((folder) => `  - ${folder.label} (${folder.count} files)`)
    .join('\n')
  const licenseBlock = d.licenseType === 'personal'
    ? 'Personal use only. Not for commercial resale or redistribution.'
    : d.licenseType === 'commercial'
      ? 'Commercial use included. Credit appreciated.'
      : `Personal use: $${d.price} · Commercial license: $${d.commercialPrice ?? '—'} (message shop for commercial)`

  return template
    .replace(/{{name}}/g, d.name)
    .replace(/{{etsyName}}/g, d.etsyName)
    .replace(/{{shopName}}/g, d.shopName)
    .replace(/{{contact}}/g, d.contact)
    .replace(/{{description}}/g, d.description)
    .replace(/{{notes}}/g, d.notes)
    .replace(/{{etsyTags}}/g, d.etsyTags.join(', '))
    .replace(/{{folders}}/g, folders)
    .replace(/{{licenseBlock}}/g, licenseBlock)
}
