# Batch 2C — FileManager, ZipPreview

Read `docs/v2-conventions.md` first.
Read `lib/types.ts` (created by Batch 2B) for shared types.
Working directory: `/Users/Noppheera.Bha/Desktop/Work/product-factory`

## `components/FileManager.tsx`
`'use client'`

Replaces v1's mascot file section. Universal — no PNGTuber expression system.

### Props
```ts
interface FileEntry {
  id: string
  file: File
  folder: string    // which user-defined folder
  variant: string   // optional free-text (e.g. "512px", "Dark")
  url: string       // blob URL for preview
}

interface Props {
  files: FileEntry[]
  folders: string[]          // available folder names (from FolderManager)
  onChange: (files: FileEntry[]) => void
  productName: string        // for checklist display
}
```

### File row UI
Each file row: `flex gap-2 items-center flex-wrap bg-zinc-900 border border-zinc-800 p-2`
- Checkbox (for bulk select)
- Thumbnail img 36×36 with hover-zoom (same as v1: follow-cursor overlay, 260×260 max)
- Filename (truncated, text-zinc-500 text-xs, min-w-0 break-all)
- Folder select (dropdown of `folders` prop)
- Variant input (text, placeholder "Variant (optional)", width ~120px)
- ✕ remove button

### Drag & drop zone
- Drop zone at top: `border-2 border-dashed border-zinc-700 p-5 text-center text-zinc-600 cursor-pointer`
- `dragover` → `border-violet-500 text-zinc-400`
- Accept: `image/png, image/gif, image/webp, video/mp4, video/webm, application/zip, */*`
  (any file type — this is universal now)
- `<input type="file" multiple>` hidden, triggered by click

### Bulk operations
When 1+ files selected, show a toolbar above the list:
- "X selected →" label
- Folder assign dropdown + "Apply" button
- "Delete selected" button (danger)
- "Deselect all" button

### Select-all header
When files exist, show a header row:
- Select-all checkbox
- "Select all" label
- "Group by folder" toggle button (right-aligned)

### Group by folder mode
When enabled: group files under folder heading dividers, same as v1's group-by-state mode.

### Expression checklist (repurposed as folder coverage summary)
Show above the file list when files are present:
- For each folder: show folder name + file count badge
  `Folder name (N files)`
- Style: compact, text-xs, inline chips

### Hover zoom
- Fixed position overlay `#imgZoom` (260×260 max)
- Follow cursor with edge-detection
- On mouseenter thumbnail → show; mouseleave → hide

### File handling
- `handleFiles(fileList: FileList)`: create FileEntry for each, assign first folder as default, generate blob URL
- `removeFile(id)`: revoke blob URL, filter out
- On unmount: revoke all blob URLs

Print `=== COMPLETE: batch-2c-file-manager ===` when done.
