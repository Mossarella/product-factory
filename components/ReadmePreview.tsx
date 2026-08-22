'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CONFIG } from '@/config'
import { ProductConfig } from '@/lib/types'
import { FileEntry } from './FileManager'

interface Props {
  config: ProductConfig
  files: FileEntry[]
  shopIdentity: { name?: string | null; shopName?: string | null; shopContact?: string | null; shopDescription?: string | null; readmeFooter?: string | null }
}

export function ReadmePreview({ config, files, shopIdentity }: Props) {
  const [preview, setPreview] = useState('')

  const refresh = async () => {
    const response = await fetch('/api/templates/readme.txt')
    if (!response.ok) return
    const folders = config.folders
      .map((label) => `  - ${label} (${files.filter((file) => file.folder === label).length} files)`)
      .join('\n')
    const licenseBlock = config.licenseType === 'personal'
      ? 'Personal use only. Not for commercial resale or redistribution.'
      : config.licenseType === 'commercial'
        ? 'Commercial use included. Credit appreciated.'
        : `Personal use: $${config.price} · Commercial license: $${config.commercialPrice ?? '—'} (message shop for commercial)`
    setPreview((await response.text())
      .replace(/{{name}}/g, config.productName)
      .replace(/{{etsyName}}/g, config.etsyTitle)
      .replace(/{{shopName}}/g, shopIdentity.shopName || shopIdentity.name || 'My Shop')
      .replace(/{{contact}}/g, config.contact || shopIdentity.shopContact || '')
      .replace(/{{description}}/g, config.description || shopIdentity.shopDescription || CONFIG.defaultShopDescription)
      .replace(/{{notes}}/g, config.notes || shopIdentity.readmeFooter || CONFIG.defaultReadmeFooter)
      .replace(/{{licenseBlock}}/g, licenseBlock)
      .replace(/{{folders}}/g, folders)
      .replace(/{{etsyTags}}/g, config.etsyTags.join(', ')))
  }

  return (
    <div>
      <Button variant="outline" onClick={() => void refresh()} className="mb-3">Refresh</Button>
      <Card className="p-3">
        <pre className="whitespace-pre-wrap max-h-64 overflow-y-auto text-xs text-zinc-400">{preview}</pre>
      </Card>
    </div>
  )
}
