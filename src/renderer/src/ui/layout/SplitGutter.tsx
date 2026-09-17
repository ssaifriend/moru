type Props = {
  readonly direction: 'row' | 'col'
  readonly onDrag: (deltaPx: number) => void
  readonly class?: string
}

export const SplitGutter = (props: Props) => {
  const start = (e: PointerEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    const axis = (ev: PointerEvent): number => (props.direction === 'row' ? ev.clientX : ev.clientY)
    let last = axis(e)

    const move = (ev: PointerEvent): void => {
      const now = axis(ev)
      if (now === last) return
      props.onDrag(now - last)
      last = now
    }
    const stop = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
      target.removeEventListener('pointercancel', stop)
      document.body.classList.remove('resizing', `resizing-${props.direction}`)
    }

    target.setPointerCapture(e.pointerId)
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
    document.body.classList.add('resizing', `resizing-${props.direction}`)
  }

  return (
    <div
      class="gutter"
      classList={{ row: props.direction === 'row', col: props.direction === 'col', [props.class ?? '']: props.class !== undefined }}
      data-testid={props.class ?? 'gutter'}
      onPointerDown={start}
    />
  )
}
