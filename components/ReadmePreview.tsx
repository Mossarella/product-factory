'use client'

import { useState } from 'react'
import { CONFIG } from '@/config'
import { ProductConfig } from '@/lib/types'
import { FileEntry } from './FileManager'

interface Props {
  config: ProductConfig
  files: FileEntry[]
}

export function ReadmePreview({ config, files }: Props) {
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
      .replace(/{{shopName}}/g, CONFIG.shopName)
      .replace(/{{contact}}/g, config.contact || CONFIG.contact)
      .replace(/{{description}}/g, config.description || CONFIG.description)
      .replace(/{{notes}}/g, config.notes || CONFIG.readmeFooter)
      .replace(/{{licenseBlock}}/g, licenseBlock)
      .replace(/{{folders}}/g, folders)
      .replace(/{{etsyTags}}/g, config.etsyTags.join(', ')))
  }

  return (
    <div>
      <button type="button" onClick={() => void refresh()} className="mb-3 border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">Refresh</button>
      <pre className="bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-400 whitespace-pre-wrap max-h-64 overflow-y-auto">{preview}</pre>
    </div>
  )
}
