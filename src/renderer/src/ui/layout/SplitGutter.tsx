type Props = {
  readonly direction: 'row' | 'col'
  readonly onDrag: (deltaPx: number) => void
  readonly class?: string
}

// Dragging is driven from window-level listeners behind a full-window overlay, so it does not depend on
// pointer capture, on the gutter element surviving re-renders, or on what sits under the pointer.
const startDrag = (direction: 'row' | 'col', origin: number, onDrag: (deltaPx: number) => void): void => {
  const axis = (ev: MouseEvent): number => (direction === 'row' ? ev.clientX : ev.clientY)
  let last = origin

  const overlay = document.createElement('div')
  overlay.className = `drag-overlay ${direction}`
  document.body.appendChild(overlay)
  document.body.classList.add('resizing', `resizing-${direction}`)

  const move = (ev: MouseEvent): void => {
    const now = axis(ev)
    if (now === last) return
    onDrag(now - last)
    last = now
  }
  const stop = (): void => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('mousemove', move, true)
    window.removeEventListener('pointerup', stop, true)
    window.removeEventListener('mouseup', stop, true)
    window.removeEventListener('blur', stop)
    overlay.remove()
    document.body.classList.remove('resizing', `resizing-${direction}`)
  }

  window.addEventListener('pointermove', move, true)
  window.addEventListener('mousemove', move, true)
  window.addEventListener('pointerup', stop, true)
  window.addEventListener('mouseup', stop, true)
  window.addEventListener('blur', stop)
}

export const SplitGutter = (props: Props) => {
  let active = false

  const begin = (e: MouseEvent): void => {
    if (e.button !== 0 || active) return
    active = true
    e.preventDefault()
    const origin = props.direction === 'row' ? e.clientX : e.clientY
    startDrag(props.direction, origin, props.onDrag)
    const done = (): void => {
      active = false
      window.removeEventListener('pointerup', done, true)
      window.removeEventListener('mouseup', done, true)
    }
    window.addEventListener('pointerup', done, true)
    window.addEventListener('mouseup', done, true)
  }

  return (
    <div
      class="gutter"
      classList={{ row: props.direction === 'row', col: props.direction === 'col', [props.class ?? '']: props.class !== undefined }}
      data-testid={props.class ?? 'gutter'}
      onPointerDown={begin}
      onMouseDown={begin}
    />
  )
}
