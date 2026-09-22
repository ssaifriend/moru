export type DropData = {
  readonly types: ReadonlyArray<string>
  readonly files: ArrayLike<File>
  readonly getData: (type: string) => string
}

export const carriesFiles = (types: ReadonlyArray<string>): boolean => types.includes('Files') || types.includes('text/uri-list')

const fileUrlToPath = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') return null
    const path = decodeURIComponent(parsed.pathname)
    if (path.length < 2) return null
    return /^\/[A-Za-z]:\//.test(path) ? path.slice(1).replace(/\//g, '\\') : path
  } catch {
    return null
  }
}

export const uriListPaths = (list: string): readonly string[] =>
  list
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(fileUrlToPath)
    .filter((path): path is string => path !== null)

// the sandboxed renderer learns a dropped File's path only through the preload; a URL list is the fallback
export const droppedPaths = (data: DropData, pathOf: (file: File) => string): readonly string[] => {
  const fromFiles = Array.from(data.files)
    .map(pathOf)
    .filter((path) => path.length > 0)
  return fromFiles.length > 0 ? fromFiles : uriListPaths(data.getData('text/uri-list'))
}

export const shellQuote = (path: string): string =>
  /^[\w./~:\\-]+$/.test(path) ? path : `"${path.replace(/(["$`])/g, '\\$1')}"`

export type FileDropHandlers = {
  readonly pathOf: (file: File) => string
  readonly onDrop: (paths: readonly string[], intoTerminal: boolean) => void
}

export const installFileDrop = (target: Window, { pathOf, onDrop }: FileDropHandlers): (() => void) => {
  const over = (e: DragEvent): void => {
    if (!e.dataTransfer || !carriesFiles(e.dataTransfer.types)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const drop = (e: DragEvent): void => {
    if (!e.dataTransfer) return
    const paths = droppedPaths(e.dataTransfer, pathOf)
    if (paths.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    onDrop(paths, e.target instanceof Element && e.target.closest('.terminal-host') !== null)
  }

  target.addEventListener('dragover', over, true)
  target.addEventListener('drop', drop, true)
  return () => {
    target.removeEventListener('dragover', over, true)
    target.removeEventListener('drop', drop, true)
  }
}
