import { For, Show } from 'solid-js'
import type { Workspace } from '../../app/workspace'
import type { PaneLeaf } from '../layout/paneTree'
import { draggingTab, dropTarget } from './tabDrag'
import { beginTabPointerDrag } from './tabDragController'

type Props = { readonly ws: Workspace; readonly leaf: () => PaneLeaf }

export const TabStrip = (props: Props) => {
  const dropIndex = () => {
    const target = dropTarget()
    return target?.paneId === props.leaf().id ? target.index : null
  }

  return (
    <div class="tabs" role="tablist">
      <For each={props.leaf().tabs}>
        {(tabId, index) => {
          const tab = () => props.ws.state.tabs[tabId]
          const meta = () => {
            const t = tab()
            return t?.kind === 'buffer' ? props.ws.state.buffers[t.bufferId] : undefined
          }
          const title = () => {
            const t = tab()
            if (t?.kind === 'terminal') return props.ws.state.terminals[t.ptyId]?.title ?? 'Terminal'
            if (t?.kind === 'diff') return t.title
            if (t?.kind === 'preview') return `Preview: ${props.ws.state.buffers[t.bufferId]?.title ?? ''}`
            if (t?.kind === 'search') {
              const pattern = props.ws.state.searches[t.searchId]?.spec.pattern ?? ''
              return pattern ? `Find: ${pattern}` : 'Find in Files'
            }
            return meta()?.title ?? ''
          }
          const grab = (e: MouseEvent): void => {
            if (e.button !== 0 || (e.target instanceof Element && e.target.closest('.tab-close'))) return
            beginTabPointerDrag(props.ws, e, { tabId, paneId: props.leaf().id, title: title() }, (e.currentTarget as HTMLElement).getBoundingClientRect())
          }
          return (
            <div
              class="tab"
              role="tab"
              classList={{
                active: props.leaf().active === tabId,
                dirty: meta()?.dirty ?? false,
                preview: (() => { const t = tab(); return t?.kind === 'buffer' && t.preview === true })(),
                dragging: draggingTab()?.tabId === tabId,
                'drop-before': dropIndex() === index(),
              }}
              title={meta()?.path ?? title()}
              onPointerDown={grab}
              onMouseDown={(e) => {
                if (e.button === 1) void props.ws.closeTab(tabId)
                else props.ws.activateTab(props.leaf().id, tabId)
                grab(e)
              }}
            >
              <span class="tab-title">{title()}</span>
              <span class="tab-dirty">●</span>
              <button
                class="tab-close"
                aria-label="Close tab"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  void props.ws.closeTab(tabId)
                }}
              >
                ×
              </button>
            </div>
          )
        }}
      </For>
      <Show when={dropIndex() === props.leaf().tabs.length}>
        <div class="tab-drop-end" />
      </Show>
    </div>
  )
}
