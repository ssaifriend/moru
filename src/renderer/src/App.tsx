import { Show, createEffect, createMemo, createSignal, on as onSignal, onCleanup, onMount } from 'solid-js'
import { R } from '@mobily/ts-belt'
import { channels } from '@shared/channels'
import { whenContext } from './app/context'
import { registerAppCommands } from './app/registerCommands'
import { createDirtySync } from './app/dirtySync'
import { createSettings } from './app/settings'
import { installSessionSync } from './app/sessionSync'
import { installKeymap } from './app/useKeymap'
import { createWorkspace, type CloseChoice } from './app/workspace'
import { createCommandRegistry } from './commands/registry'
import { invoke, on } from './ipc'
import { applyEditorFont } from './editor/editorConfig'
import { type Binding, compileBindings } from './keymap/bindings'
import { defaultBindings } from './keymap/defaults'
import type { Platform } from './keymap/keys'
import { installTestHooks } from './testHooks'
import { applyTheme } from './theme/apply'
import { registerUserThemes, themeById } from './theme/themes'
import { installModifierTracking } from './editor/pathLinks'
import { PaneView } from './ui/layout/PaneView'
import { Sidebar } from './ui/sidebar/Sidebar'
import { SplitGutter } from './ui/layout/SplitGutter'
import { Palette, type PaletteMode } from './ui/palette/Palette'
import { StatusBar } from './ui/statusbar/StatusBar'

const platform = (): Platform => (navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'win')

export const App = () => {
  const [paletteMode, setPaletteMode] = createSignal<PaletteMode | null>(null)
  const [paletteText, setPaletteText] = createSignal('')
  const paletteOpen = () => paletteMode() !== null
  const openPalette = (mode: PaletteMode, text = ''): void => {
    setPaletteText(text)
    setPaletteMode(mode)
  }
  const [ready, setReady] = createSignal(false)
  const settingsStore = createSettings()
  const dirtySync = createDirtySync({
    write: (entry) => invoke('dirty.write', entry),
    clear: (id) => invoke('dirty.clear', id),
  })

  const ws = createWorkspace({
    settings: settingsStore.settings,
    dirtySync,
    confirmClose: async (title, kind = 'buffer'): Promise<CloseChoice> => {
      const result = await invoke('dialog.confirmClose', { title, kind })
      return R.match(
        result,
        (r) => r.choice,
        () => 'cancel' as const,
      )
    },
  })

  const [userBindings, setUserBindings] = createSignal<readonly Binding[]>([])
  const bindings = createMemo(() => compileBindings([...defaultBindings(platform()), ...userBindings()], platform()))
  const compiledUserBindings = createMemo(() => compileBindings(userBindings(), platform()))

  const context = () => whenContext(ws, { paletteOpen: paletteOpen() })
  const registry = createCommandRegistry(context)
  registerAppCommands(registry, ws, { openPalette, userBindings: compiledUserBindings })

  createEffect(
    onSignal(
      settingsStore.settings,
      (s) => {
        applyEditorFont(s.editor)
        applyTheme(themeById(s.theme))
        ws.applySettings(s)
      },
      { defer: true },
    ),
  )

  createEffect(
    onSignal(
      () => ws.state.projectRoot,
      (root) => {
        if (!root) return
        void invoke('index.build', { root }).then((result) =>
          R.tap(result, ({ files, truncated }) => {
            if (truncated) ws.setStatus(`file index truncated at ${files.toLocaleString()} files — open a narrower folder for Goto Anything`)
          }),
        )
      },
    ),
  )

  // macOS drops the IME composition when the native window title changes, so title updates are
  // debounced and deferred until no composition is in progress.
  let titleTimer: ReturnType<typeof setTimeout> | null = null
  const applyTitle = (next: string): void => {
    if (ws.activeView()?.composing) {
      titleTimer = setTimeout(() => applyTitle(next), 300)
      return
    }
    if (document.title !== next) document.title = next
  }
  const scheduleTitle = (next: string): void => {
    if (titleTimer) clearTimeout(titleTimer)
    titleTimer = setTimeout(() => applyTitle(next), 400)
  }

  createEffect(() => {
    const leaf = ws.activeLeaf()
    const tab = leaf.active ? ws.state.tabs[leaf.active] : undefined
    const meta = tab?.kind === 'buffer' ? ws.state.buffers[tab.bufferId] : undefined
    const name =
      meta ? `${meta.title}${meta.dirty ? ' •' : ''}` : tab?.kind === 'terminal' ? (ws.state.terminals[tab.ptyId]?.title ?? 'Terminal') : tab?.kind === 'search' ? 'Find in Files' : tab?.kind === 'preview' ? 'Preview' : tab?.kind === 'diff' ? tab.title : ''
    const root = ws.state.projectRoot
    const project = root ? root.slice(Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\')) + 1) : null
    scheduleTitle([name, project ?? 'moru'].filter((part) => part !== '').join(' — '))
  })

  onMount(async () => {
    const uninstall = installKeymap(window, bindings, registry, context)
    const uninstallModifiers = installModifierTracking(window)
    const offCommand = on('command.run', ({ id, args }) => void registry.run(id, args))
    onCleanup(() => {
      uninstall()
      uninstallModifiers()
      offCommand()
    })

    requestAnimationFrame(() => window.moru.send(channels.perfFirstPaint, undefined))

    const bootstrap = await invoke('app.bootstrap', undefined)
    const boot = R.getWithDefault(bootstrap, {
      paths: [] as string[],
      projectRoot: null as string | null,
      windowId: 'main',
      session: null,
      recoverDirtyIds: [] as string[],
      test: false,
    })
    if (boot.test) installTestHooks(ws, registry, paletteMode, ready, bindings)

    const userThemes = await invoke('themes.get', undefined)
    R.tap(userThemes, (snapshot) => registerUserThemes(snapshot.themes))
    onCleanup(
      on('themes.changed', (snapshot) => {
        registerUserThemes(snapshot.themes)
        applyTheme(themeById(settingsStore.settings().theme))
        ws.applySettings(settingsStore.settings())
      }),
    )

    await settingsStore.load()
    applyEditorFont(settingsStore.settings().editor)
    applyTheme(themeById(settingsStore.settings().theme))
    onCleanup(settingsStore.subscribe())

    const keymap = await invoke('keymap.get', undefined)
    R.tap(keymap, (snapshot) => setUserBindings(snapshot.bindings))
    onCleanup(on('keymap.changed', (snapshot) => setUserBindings(snapshot.bindings)))

    window.addEventListener('beforeunload', () => void dirtySync.flush())

    ws.setWindowId(boot.windowId)
    await ws.setProjectRoot(boot.session?.projectRoot ?? boot.projectRoot)
    if (boot.session) {
      const listed = await invoke('dirty.list', undefined)
      await ws.restoreSession(boot.session, R.getWithDefault(listed, []))
    }
    if (boot.recoverDirtyIds.length > 0) await ws.restoreDirty(boot.recoverDirtyIds)
    for (const path of boot.paths) await ws.openFile(path)
    if (boot.paths.length === 0 && ws.activeLeaf().tabs.length === 0) ws.newUntitled()
    ws.activeView()?.focus()
    installSessionSync(ws, { send: (snapshot) => window.moru.send('session.save', snapshot) })
    setReady(true)
  })

  return (
    <div class="app">
      <div class="app-row">
        <Sidebar ws={ws} />
        <Show when={ws.state.sidebar.open && ws.state.projectRoot !== null}>
          <SplitGutter direction="row" class="sidebar-gutter" onDrag={(delta) => ws.setSidebarWidth(ws.state.sidebar.width + delta)} />
        </Show>
        <div class="main-column">
          <div class="workspace">
            <PaneView ws={ws} node={ws.tree} />
          </div>
          <StatusBar ws={ws} />
        </div>
      </div>
      <Palette
        open={paletteMode}
        initialText={paletteText}
        onClose={() => {
          setPaletteMode(null)
          ws.activeView()?.focus()
        }}
        registry={registry}
        bindings={bindings}
        platform={platform()}
        ws={ws}
      />
    </div>
  )
}
