import type { WebContents } from 'electron'
import type { PushChannel, PushPayload } from '@shared/ipc'
import { type IndexItem, type IndexService, createIndexService } from './service'

type Push = <C extends PushChannel>(channel: C, payload: PushPayload<C>) => void
type Subscribe = Parameters<typeof createIndexService>[0]['subscribe']

type Deps = { readonly rgPath: string; readonly subscribe: Subscribe; readonly pushTo: (target: WebContents, ...args: Parameters<Push>) => void }

export type IndexRegistry = {
  readonly build: (sender: WebContents, root: string) => Promise<{ files: number; truncated: boolean }>
  readonly query: (sender: WebContents, text: string, limit: number) => Promise<IndexItem[]>
  readonly release: (sender: WebContents) => Promise<void>
  readonly dispose: () => Promise<void>
}

export const createIndexRegistry = ({ rgPath, subscribe, pushTo }: Deps): IndexRegistry => {
  const services: Record<string, IndexService> = {}
  const rootOf = new Map<number, string>()
  const sendersOf = new Map<number, WebContents>()

  const sendersFor = (root: string): WebContents[] =>
    [...rootOf.entries()].filter(([, r]) => r === root).flatMap(([id]) => (sendersOf.get(id) ? [sendersOf.get(id)!] : []))

  const serviceFor = (root: string): IndexService => {
    const existing = services[root]
    if (existing) return existing
    const created = createIndexService({
      rgPath,
      subscribe,
      push: (channel, payload) => sendersFor(root).forEach((target) => pushTo(target, channel, payload)),
    })
    services[root] = created
    return created
  }

  const detach = async (sender: WebContents): Promise<void> => {
    const previous = rootOf.get(sender.id)
    rootOf.delete(sender.id)
    sendersOf.delete(sender.id)
    if (previous && sendersFor(previous).length === 0 && services[previous]) {
      const orphan = services[previous]
      delete services[previous]
      await orphan.dispose()
    }
  }

  return {
    build: async (sender, root) => {
      if (rootOf.get(sender.id) !== root) await detach(sender)
      rootOf.set(sender.id, root)
      sendersOf.set(sender.id, sender)
      const service = serviceFor(root)
      return service.root() === root && service.size() > 0 ? { files: service.size(), truncated: service.truncated() } : service.build(root)
    },
    query: async (sender, text, limit) => {
      const root = rootOf.get(sender.id)
      return root && services[root] ? services[root].query(text, limit) : []
    },
    release: detach,
    dispose: async () => {
      await Promise.all(Object.values(services).map((s) => s.dispose()))
      rootOf.clear()
      sendersOf.clear()
    },
  }
}
