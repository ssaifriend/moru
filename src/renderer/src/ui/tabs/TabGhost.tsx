import { Show } from 'solid-js'
import { draggingTab, ghostAt } from './tabDrag'

export const TabGhost = () => (
  <Show when={ghostAt()}>
    {(at) => (
      <div class="tab-ghost" style={{ left: `${at().x + 14}px`, top: `${at().y + 10}px` }}>
        {draggingTab()?.title ?? ''}
      </div>
    )}
  </Show>
)
