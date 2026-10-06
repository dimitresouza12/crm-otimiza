type Listener = (payload: string) => void

const listeners = new Map<string, Set<Listener>>()

export const subscribeCompany = (companyId: string, listener: Listener) => {
  const set = listeners.get(companyId) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(companyId, set)
  return () => {
    set.delete(listener)
    if (!set.size) listeners.delete(companyId)
  }
}

// Avisa as telas abertas da empresa que algo mudou numa conversa. O front busca os dados novos.
export const publishChat = (companyId: string, conversationId: string) => {
  const payload = JSON.stringify({ type: 'chat', conversationId })
  for (const listener of listeners.get(companyId) ?? []) listener(payload)
}
