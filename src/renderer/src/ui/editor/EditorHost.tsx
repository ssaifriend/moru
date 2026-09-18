import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { createEffect, on, onCleanup, onMount } from 'solid-js'
import type { Workspace } from '../../app/workspace'
import { createView } from '../../editor/createEditor'
import type { PaneLeaf } from '../layout/paneTree'

type Props = { readonly ws: Workspace; readonly leaf: () => PaneLeaf }

export const topPositionOf = (view: EditorView): number => {
  const scrollTop = view.scrollDOM.scrollTop
  if (scrollTop <= 0) return 0
  return view.lineBlockAtHeight(scrollTop).from
}

const emptyState = (): EditorState => EditorState.create({ doc: '', extensions: [EditorState.readOnly.of(true)] })

export const EditorHost = (props: Props) => {
  let host!: HTMLDivElement

  onMount(() => {
    const view = createView(host, emptyState())

    createEffect(
      on(
        () => props.leaf().id,
        (id, prev) => {
          if (prev !== undefined && prev !== id) props.ws.unregisterView(prev)
          props.ws.registerView(id, view)
        },
      ),
    )

    createEffect(
      on(
        () => {
          const leaf = props.leaf()
          const tab = leaf.active ? props.ws.state.tabs[leaf.active] : undefined
          return tab?.kind === 'buffer' ? tab.bufferId : null
        },
        (bufferId, previous) => {
          if (previous) props.ws.rememberScroll(previous, topPositionOf(view))
          const buffer = bufferId ? props.ws.getBuffer(bufferId) : null
          view.setState(buffer ? buffer.state : emptyState())
          if (bufferId) {
            // restore by document position, not pixels: CodeMirror re-anchors the scroller while it
            // measures line heights after setState, so a raw scrollTop write drifts
            const pos = Math.min(props.ws.scrollOf(bufferId), view.state.doc.length)
            view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
          }
        },
      ),
    )

    onCleanup(() => {
      props.ws.unregisterView(props.leaf().id)
      view.destroy()
    })
  })

  return (
    <div
      class="editor-host"
      ref={host}
      onMouseDown={() => props.ws.focusPane(props.leaf().id)}
      onFocusIn={() => props.ws.setEditorFocus(props.leaf().id, true)}
      onFocusOut={() => props.ws.setEditorFocus(props.leaf().id, false)}
      onContextMenu={(e) => {
        e.preventDefault()
        props.ws.focusPane(props.leaf().id)
        const view = props.ws.activeView()
        const buffer = props.ws.activeBuffer()
        window.moru.send('menu.context', {
          kind: 'editor',
          hasSelection: view ? view.state.selection.ranges.some((r) => !r.empty) : false,
          languageId: buffer?.languageId ?? 'plain',
          path: buffer?.meta?.path ?? null,
          hasTerminal: props.ws.activeTerminalId() !== null || Object.values(props.ws.state.terminals).some((t) => t.alive),
        })
      }}
    />
  )
}
