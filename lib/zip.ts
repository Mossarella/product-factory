import JSZip from 'jszip'

export interface ZipFile {
  id: string
  file: File
  folder: string
  variant: string
  url: string
}

export interface FixedAsset {
  id: string
  label: string
  zipName: string
  blob: File | null
}

function extension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex === -1 ? '' : filename.slice(dotIndex + 1)
}

export function resolveFilename(
  productName: string,
  f: ZipFile,
  indexInFolder: number,
  totalInFolder: number,
): string {
  const ext = extension(f.file.name)
  const filename = f.variant
    ? `${productName}_${f.folder}_${f.variant}`
    : totalInFolder === 1
      ? `${productName}_${f.folder}`
      : `${productName}_${f.folder}_${indexInFolder + 1}`

  return `${filename}.${ext}`
}

function groupFiles(files: ZipFile[]): Map<string, ZipFile[]> {
  const folders = new Map<string, ZipFile[]>()
  for (const file of files) {
    const group = folders.get(file.folder) ?? []
    group.push(file)
    folders.set(file.folder, group)
  }
  return folders
}

export function buildZipTree(
  productName: string,
  files: ZipFile[],
  fixedAssets: FixedAsset[],
): string {
  const groupedFiles = groupFiles(files)
  const fixedFiles = fixedAssets.filter((asset) => asset.blob && asset.zipName)
  const topLevelItems = [
    ...(groupedFiles.size ? ['Files'] : []),
    'README.txt',
    ...fixedFiles.map((asset) => asset.zipName),
  ]
  const lines = [`${productName}Pack.zip`]

  topLevelItems.forEach((item, topLevelIndex) => {
    const isLastTopLevelItem = topLevelIndex === topLevelItems.length - 1
    const branch = isLastTopLevelItem ? '└──' : '├──'

    if (item !== 'Files') {
      lines.push(`${branch} ${item}`)
      return
    }

    lines.push(`${branch} Files/`)
    const folders = [...groupedFiles.entries()]
    folders.forEach(([folder, folderFiles], folderIndex) => {
      const isLastFolder = folderIndex === folders.length - 1
      const folderBranch = isLastFolder ? '└──' : '├──'
      const topLevelIndent = isLastTopLevelItem ? '    ' : '│   '
      lines.push(`${topLevelIndent}${folderBranch} ${folder}/`)

      folderFiles.forEach((file, fileIndex) => {
        const isLastFile = fileIndex === folderFiles.length - 1
        const fileBranch = isLastFile ? '└──' : '├──'
        const folderIndent = isLastFolder ? '    ' : '│   '
        lines.push(
          `${topLevelIndent}${folderIndent}${fileBranch} ${resolveFilename(productName, file, fileIndex, folderFiles.length)}`,
        )
      })
    })
  })

  return lines.join('\n')
}

export async function buildZip(
  productName: string,
  files: ZipFile[],
  fixedAssets: FixedAsset[],
  readmeText: string,
): Promise<Blob> {
  const zip = new JSZip()
  const groupedFiles = groupFiles(files)

  for (const [folder, folderFiles] of groupedFiles) {
    for (const [index, file] of folderFiles.entries()) {
      zip.folder('Files')!.folder(folder)!.file(
        resolveFilename(productName, file, index, folderFiles.length),
        await file.file.arrayBuffer(),
      )
    }
  }

  zip.file('README.txt', readmeText)
  for (const asset of fixedAssets) {
    if (asset.blob && asset.zipName) {
      zip.file(asset.zipName, await asset.blob.arrayBuffer())
    }
  }

  return zip.generateAsync({ type: 'blob' })
}
