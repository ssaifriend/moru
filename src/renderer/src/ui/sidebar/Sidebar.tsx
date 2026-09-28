import { For, Show, createSignal, onMount } from 'solid-js'
import type { TreeEntry } from '@shared/ipc'
import type { Workspace } from '../../app/workspace'
import { basenameOf } from '../../editor/lang'
import { Popup, type PopupItem } from '../statusbar/Popup'
import { FileIcon, FolderIcon } from './icons'

type Props = { readonly ws: Workspace }

type Menu = { readonly entry: TreeEntry; readonly x: number; readonly y: number }

// the tree edits names in place: prompt() does not exist in an Electron renderer
export type TreeEdit = { readonly kind: 'new'; readonly dir: string } | { readonly kind: 'rename'; readonly entry: TreeEntry }

type EditProps = {
  readonly initial: string
  readonly depth: number
  readonly onCommit: (name: string) => void
  readonly onCancel: () => void
}

const stemLength = (name: string): number => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? dot : name.length
}

const NameEditor = (props: EditProps) => {
  let input!: HTMLInputElement

  onMount(() => {
    input.focus()
    input.setSelectionRange(0, stemLength(props.initial))
  })

  return (
    <div class="tree-row editing" style={{ 'padding-left': `${8 + props.depth * 12}px` }}>
      <span class="tree-chevron" />
      <input
        class="tree-name-input"
        data-testid="tree-name-input"
        ref={input}
        value={props.initial}
        spellcheck={false}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            props.onCommit(input.value.trim())
          } else if (e.key === 'Escape') {
            e.preventDefault()
            props.onCancel()
          }
        }}
        onBlur={() => props.onCancel()}
      />
    </div>
  )
}

type RowsProps = {
  readonly ws: Workspace
  readonly dir: string
  readonly depth: number
  readonly edit: () => TreeEdit | null
  readonly onMenu: (entry: TreeEntry, e: MouseEvent) => void
  readonly onCommit: (edit: TreeEdit, name: string) => void
  readonly onCancel: () => void
}

const Rows = (props: RowsProps) => {
  const entries = () => props.ws.state.sidebar.entries[props.dir] ?? []
  const activePath = (): string | null => {
    const leaf = props.ws.activeLeaf()
    const tab = leaf.active ? props.ws.state.tabs[leaf.active] : undefined
    return tab?.kind === 'buffer' ? (props.ws.state.buffers[tab.bufferId]?.path ?? null) : null
  }
  const newHere = () => {
    const edit = props.edit()
    return edit?.kind === 'new' && edit.dir === props.dir ? edit : null
  }
  const renaming = (entry: TreeEntry) => {
    const edit = props.edit()
    return edit?.kind === 'rename' && edit.entry.path === entry.path ? edit : null
  }

  const onClick = (entry: TreeEntry): void => {
    if (entry.kind === 'dir') {
      if (props.ws.state.sidebar.expanded[entry.path]) props.ws.collapseDir(entry.path)
      else void props.ws.expandDir(entry.path)
    } else {
      void props.ws.openFile(entry.path)
    }
  }

  return (
    <>
      <Show when={newHere()}>
        {(edit) => <NameEditor initial="" depth={props.depth} onCommit={(name) => props.onCommit(edit(), name)} onCancel={props.onCancel} />}
      </Show>
      <For each={entries()}>
        {(entry) => (
          <>
            <Show
              when={renaming(entry)}
              fallback={
                <div
                  class="tree-row"
                  data-testid="tree-row"
                  data-path={entry.path}
                  classList={{
                    dir: entry.kind === 'dir',
                    expanded: props.ws.state.sidebar.expanded[entry.path] === true,
                    active: entry.kind === 'file' && activePath() === entry.path,
                  }}
                  style={{ 'padding-left': `${8 + props.depth * 12}px` }}
                  onClick={() => onClick(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    props.onMenu(entry, e)
                  }}
                >
                  <span class="tree-chevron">{entry.kind === 'dir' ? (props.ws.state.sidebar.expanded[entry.path] ? '▾' : '▸') : ''}</span>
                  <Show when={entry.kind === 'dir'} fallback={<FileIcon name={entry.name} />}>
                    <FolderIcon open={props.ws.state.sidebar.expanded[entry.path] === true} />
                  </Show>
                  <span class="tree-name">{entry.name}</span>
                </div>
              }
            >
              {(edit) => <NameEditor initial={entry.name} depth={props.depth} onCommit={(name) => props.onCommit(edit(), name)} onCancel={props.onCancel} />}
            </Show>
            <Show when={entry.kind === 'dir' && props.ws.state.sidebar.expanded[entry.path]}>
              <Rows {...props} dir={entry.path} depth={props.depth + 1} />
            </Show>
          </>
        )}
      </For>
    </>
  )
}

const validName = (name: string): boolean => name.length > 0 && !/[\\/]/.test(name) && name !== '.' && name !== '..'

export const Sidebar = (props: Props) => {
  const [menu, setMenu] = createSignal<Menu | null>(null)
  const [edit, setEdit] = createSignal<TreeEdit | null>(null)

  const parentOf = (entry: TreeEntry): string => entry.path.slice(0, entry.path.length - entry.name.length - 1)

  const startNewFile = (entry: TreeEntry): void => {
    const dir = entry.kind === 'dir' ? entry.path : parentOf(entry)
    if (entry.kind === 'dir' && !props.ws.state.sidebar.expanded[entry.path]) void props.ws.expandDir(entry.path)
    setEdit({ kind: 'new', dir })
  }

  const commit = (pending: TreeEdit, name: string): void => {
    setEdit(null)
    if (!validName(name)) {
      if (name.length > 0) props.ws.setStatus('a name cannot contain a path separator')
      return
    }
    if (pending.kind === 'new') void props.ws.createFileIn(pending.dir, name)
    else if (name !== pending.entry.name) void props.ws.renameEntry(pending.entry.path, name)
  }

  const items = (entry: TreeEntry): PopupItem[] => [
    { label: 'New File…', onSelect: () => startNewFile(entry) },
    { label: 'Rename…', onSelect: () => setEdit({ kind: 'rename', entry }) },
    {
      label: 'Delete',
      onSelect: () => {
        if (window.confirm(`Move ${entry.name} to the trash?`)) void props.ws.deleteEntry(entry.path)
      },
    },
  ]

  return (
    <Show when={props.ws.state.sidebar.open && props.ws.state.projectRoot !== null}>
      <aside class="sidebar" data-testid="sidebar" style={{ flex: `0 0 ${props.ws.state.sidebar.width}px` }}>
        <div class="sidebar-header" title={props.ws.state.projectRoot ?? ''}>
          {props.ws.state.projectRoot ? basenameOf(props.ws.state.projectRoot).toUpperCase() : 'NO FOLDER'}
        </div>
        <div class="sidebar-tree">
          <Show when={props.ws.state.projectRoot}>
            {(root) => (
              <Rows
                ws={props.ws}
                dir={root()}
                depth={0}
                edit={edit}
                onMenu={(entry, e) => setMenu({ entry, x: e.clientX, y: e.clientY })}
                onCommit={commit}
                onCancel={() => setEdit(null)}
              />
            )}
          </Show>
        </div>
        <Show when={menu()}>
          {(m) => (
            <div class="sidebar-menu" style={{ left: `${m().x}px`, top: `${m().y}px` }}>
              <Popup items={items(m().entry)} onClose={() => setMenu(null)} />
            </div>
          )}
        </Show>
      </aside>
    </Show>
  )
}
