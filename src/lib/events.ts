import { apiBaseUrl, type Session } from './api'

export type ChatEvent = { type: 'chat' | 'reconnected'; conversationId?: string }

const listeners = new Set<(event: ChatEvent) => void>()
let controller: AbortController | null = null
let activeKey = ''

const emit = (event: ChatEvent) => { for (const listener of listeners) listener(event) }

// Uma única conexão por aba. Se cair, reconecta sozinha e avisa as telas para buscarem o que perderam.
export const connectEvents = (session: Session | null) => {
  const key = session ? `${session.token}|${session.companyId}` : ''
  if (key === activeKey) return
  controller?.abort()
  controller = null
  activeKey = key
  if (!session) return
  const mine = new AbortController()
  controller = mine
  void (async () => {
    let first = true
    while (!mine.signal.aborted) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/events`, { headers: { Authorization: `Bearer ${session.token}`, 'X-Company-Id': session.companyId }, signal: mine.signal })
        if (response.status === 401 || response.status === 403) return
        if (!response.ok || !response.body) throw new Error('indisponível')
        if (!first) emit({ type: 'reconnected' })
        first = false
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let end = buffer.indexOf('\n\n')
          while (end >= 0) {
            const block = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            const line = block.split('\n').find((item) => item.startsWith('data: '))
            if (line) { try { emit(JSON.parse(line.slice(6)) as ChatEvent) } catch { /* evento inválido */ } }
            end = buffer.indexOf('\n\n')
          }
        }
      } catch { /* cai para o bloco de espera e tenta de novo */ }
      if (!mine.signal.aborted) await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }
  })()
}

export const onChatEvent = (listener: (event: ChatEvent) => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
