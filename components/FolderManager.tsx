'use client'

import { FormEvent, useState } from 'react'

interface Props {
  folders: string[]
  onChange: (folders: string[]) => void
}

export function FolderManager({ folders, onChange }: Props) {
  const [newFolder, setNewFolder] = useState('')

  const moveFolder = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= folders.length) return
    const updated = [...folders]
    ;[updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]]
    onChange(updated)
  }

  const addFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = newFolder.trim()
    if (!trimmedName || folders.some((folder) => folder.toLowerCase() === trimmedName.toLowerCase())) return
    onChange([...folders, `${trimmedName.charAt(0).toUpperCase()}${trimmedName.slice(1)}`])
    setNewFolder('')
  }

  return (
    <div className="font-mono">
      <div className="flex flex-wrap gap-2">
        {folders.map((folder, index) => (
          <span key={`${folder}-${index}`} className="inline-flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
            <span>{folder}</span>
            {folder === 'Main' && <span className="text-zinc-600">built-in</span>}
            <button type="button" aria-label={`Move ${folder} up`} className="text-zinc-600 hover:text-zinc-300" onClick={() => moveFolder(index, -1)}>▲</button>
            <button type="button" aria-label={`Move ${folder} down`} className="text-zinc-600 hover:text-zinc-300" onClick={() => moveFolder(index, 1)}>▼</button>
            {folder !== 'Main' && <button type="button" aria-label={`Remove ${folder}`} className="cursor-pointer text-red-800 hover:text-red-500" onClick={() => onChange(folders.filter((_, folderIndex) => folderIndex !== index))}>✕</button>}
          </span>
        ))}
      </div>

      <form className="mt-3 flex gap-2" onSubmit={addFolder}>
        <input
          value={newFolder}
          onChange={(event) => {
            const value = event.target.value
            setNewFolder(value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '')
          }}
          placeholder="Folder name"
          className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <button type="submit" className="border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">Add</button>
      </form>
    </div>
  )
}
