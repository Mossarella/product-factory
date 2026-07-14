'use client'

import {
  ChangeEvent,
  DragEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export interface FileEntry {
  id: string
  file: File
  folder: string
  variant: string
  url: string
}

interface Props {
  files: FileEntry[]
  folders: string[]
  onChange: (files: FileEntry[]) => void
  productName: string
}

interface ZoomState {
  name: string
  url: string
  x: number
  y: number
}

const ZOOM_SIZE = 260

function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function FileManager({ files, folders, onChange, productName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const latestFilesRef = useRef(files)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupByFolder, setGroupByFolder] = useState(false)
  const [bulkFolder, setBulkFolder] = useState(folders[0] ?? '')
  const [zoom, setZoom] = useState<ZoomState | null>(null)

  useEffect(() => {
    latestFilesRef.current = files
  }, [files])

  useEffect(() => {
    return () => {
      latestFilesRef.current.forEach(({ url }) => URL.revokeObjectURL(url))
    }
  }, [])

  const selectedCount = files.filter(({ id }) => selectedIds.has(id)).length
  const allSelected = files.length > 0 && selectedCount === files.length
  const effectiveBulkFolder = folders.includes(bulkFolder) ? bulkFolder : (folders[0] ?? '')

  const fileGroups = useMemo(() => {
    if (!groupByFolder) return [['', files] as const]

    const grouped = new Map<string, FileEntry[]>()
    files.forEach((entry) => {
      const group = grouped.get(entry.folder) ?? []
      group.push(entry)
      grouped.set(entry.folder, group)
    })
    return Array.from(grouped.entries())
  }, [files, groupByFolder])

  function handleFiles(fileList: FileList) {
    const newFiles = Array.from(fileList).map((file) => ({
      id: createId(),
      file,
      folder: folders[0] ?? '',
      variant: '',
      url: URL.createObjectURL(file),
    }))

    if (newFiles.length > 0) onChange([...files, ...newFiles])
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) handleFiles(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files) handleFiles(event.dataTransfer.files)
  }

  function updateFile(id: string, changes: Partial<Pick<FileEntry, 'folder' | 'variant'>>) {
    onChange(files.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)))
  }

  function removeFile(id: string) {
    const entry = files.find((item) => item.id === id)
    if (entry) URL.revokeObjectURL(entry.url)
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    onChange(files.filter((item) => item.id !== id))
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(files.map(({ id }) => id)))
  }

  function applyFolder() {
    if (!effectiveBulkFolder) return
    onChange(files.map((entry) => (selectedIds.has(entry.id) ? { ...entry, folder: effectiveBulkFolder } : entry)))
  }

  function deleteSelected() {
    files.filter((entry) => selectedIds.has(entry.id)).forEach(({ url }) => URL.revokeObjectURL(url))
    onChange(files.filter((entry) => !selectedIds.has(entry.id)))
    setSelectedIds(new Set())
  }

  function positionZoom(event: MouseEvent<HTMLImageElement>, entry: FileEntry) {
    const padding = 12
    const x = Math.max(padding, Math.min(event.clientX + 16, window.innerWidth - ZOOM_SIZE - padding))
    const y = Math.max(padding, Math.min(event.clientY + 16, window.innerHeight - ZOOM_SIZE - padding))
    setZoom({ name: entry.file.name, url: entry.url, x, y })
  }

  return (
    <div className="space-y-3 font-mono">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/gif,image/webp,video/mp4,video/webm,application/zip,*/*"
        className="hidden"
        onChange={handleInputChange}
      />

      <div
        role="button"
        tabIndex={0}
        className={`cursor-pointer border-2 border-dashed p-5 text-center text-sm transition-colors ${
          isDragging ? 'border-violet-500 text-zinc-400' : 'border-zinc-700 text-zinc-600'
        }`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false)
        }}
        onDrop={handleDrop}
      >
        Drop files here or click to choose files
      </div>

      {files.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="text-zinc-400">{productName} folder coverage:</span>
            {folders.map((folder) => {
              const count = files.filter((entry) => entry.folder === folder).length
              return (
                <span key={folder} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
                  {folder} ({count} files)
                </span>
              )
            })}
          </div>

          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 border border-zinc-800 bg-zinc-900 p-2 text-xs">
              <span className="text-zinc-400">{selectedCount} selected →</span>
              <select
                value={effectiveBulkFolder}
                onChange={(event) => setBulkFolder(event.target.value)}
                className="border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-300 outline-none focus:border-violet-500"
                aria-label="Folder for selected files"
              >
                {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
              </select>
              <button type="button" onClick={applyFolder} className="border border-violet-600 bg-violet-600 px-2 py-1 text-zinc-100 hover:bg-violet-500">
                Apply
              </button>
              <button type="button" onClick={deleteSelected} className="border border-red-900 bg-red-900 px-2 py-1 text-red-100 hover:bg-red-800">
                Delete selected
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-zinc-100">
                Deselect all
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-400">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all files" />
            <span>Select all</span>
            <button type="button" onClick={() => setGroupByFolder((value) => !value)} className="ml-auto border border-zinc-700 px-2 py-1 hover:border-violet-500 hover:text-zinc-100">
              {groupByFolder ? 'Ungroup files' : 'Group by folder'}
            </button>
          </div>

          <div className="space-y-2">
            {fileGroups.map(([folder, entries]) => (
              <div key={folder || 'all'} className="space-y-1">
                {groupByFolder && <div className="border-b border-zinc-800 pb-1 text-xs text-zinc-500">{folder || 'No folder'}</div>}
                {entries.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center gap-2 border border-zinc-800 bg-zinc-900 p-2">
                    <input type="checkbox" checked={selectedIds.has(entry.id)} onChange={() => toggleSelected(entry.id)} aria-label={`Select ${entry.file.name}`} />
                    <img
                      src={entry.url}
                      alt={entry.file.name}
                      className="h-9 w-9 cursor-zoom-in object-cover"
                      onMouseEnter={(event) => positionZoom(event, entry)}
                      onMouseMove={(event) => positionZoom(event, entry)}
                      onMouseLeave={() => setZoom(null)}
                    />
                    <span className="min-w-0 flex-1 break-all text-xs text-zinc-500" title={entry.file.name}>{entry.file.name}</span>
                    <select
                      value={entry.folder}
                      onChange={(event) => updateFile(entry.id, { folder: event.target.value })}
                      className="border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-violet-500"
                      aria-label={`Folder for ${entry.file.name}`}
                    >
                      {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                    </select>
                    <input
                      value={entry.variant}
                      onChange={(event) => updateFile(entry.id, { variant: event.target.value })}
                      placeholder="Variant (optional)"
                      className="w-30 border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-violet-500"
                      aria-label={`Variant for ${entry.file.name}`}
                    />
                    <button type="button" onClick={() => removeFile(entry.id)} className="px-1 text-sm text-red-400 hover:text-red-300" aria-label={`Remove ${entry.file.name}`}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {zoom && (
        <div
          id="imgZoom"
          className="pointer-events-none fixed z-50 overflow-hidden border border-violet-500 bg-zinc-950 p-1 shadow-2xl"
          style={{ left: zoom.x, top: zoom.y, width: ZOOM_SIZE, height: ZOOM_SIZE }}
        >
          <img src={zoom.url} alt={zoom.name} className="h-full w-full object-contain" />
        </div>
      )}
    </div>
  )
}
