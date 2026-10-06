import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import { AlertCircle, ArrowLeft, Bot, Check, CheckCheck, Download, FileText, MessageCircleMore, Mic, Paperclip, Pause, Play, Reply, Search, Send, Trash2, X } from 'lucide-react'
import { api, type ChatMessage, type Session } from './lib/api'
import { onChatEvent } from './lib/events'

type ConversationRow = Awaited<ReturnType<typeof api.conversations>>[number]
type Kind = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker'

const maxFileBytes = 16 * 1024 * 1024
const digits = (value: string) => value.replace(/\D/g, '')
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '#'
const formatPhone = (phone: string) => {
  const d = digits(phone)
  if (d.startsWith('55') && d.length >= 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, d.length - 4)}-${d.slice(-4)}`
  return d ? `+${d}` : phone
}
const kindOf = (message: Pick<ChatMessage, 'message_type'>): Kind => {
  const type = message.message_type.toLowerCase()
  if (type.includes('sticker')) return 'sticker'
  if (type.includes('image')) return 'image'
  if (type.includes('audio') || type === 'ptt') return 'audio'
  if (type.includes('video')) return 'video'
  if (type.includes('document')) return 'document'
  return 'text'
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (iso: string) => {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Hoje'
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}
const listTime = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toDateString() === new Date().toDateString() ? timeLabel(iso) : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
const previewOf = (conversation: ConversationRow) => {
  const kind = conversation.last_type ? kindOf({ message_type: conversation.last_type }) : 'text'
  const base = kind === 'image' ? '📷 Foto' : kind === 'audio' ? '🎤 Áudio' : kind === 'video' ? '🎬 Vídeo' : kind === 'document' ? '📎 Documento' : kind === 'sticker' ? 'Figurinha' : ''
  const text = conversation.last_message ?? ''
  const body = base ? (text ? `${base} · ${text}` : base) : text || 'Sem mensagens'
  return `${conversation.last_direction === 'outbound' ? 'Você: ' : ''}${body}`
}
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
  reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
  reader.readAsDataURL(blob)
})

const mediaCache = new Map<string, string>()
const useMedia = (session: Session, messageId: string, enabled: boolean) => {
  const [url, setUrl] = useState<string | null>(() => mediaCache.get(messageId) ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!enabled || url) return
    let cancelled = false
    api.chatMedia(session, messageId).then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      mediaCache.set(messageId, objectUrl)
      if (!cancelled) setUrl(objectUrl)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [enabled, messageId, session, url])
  return { url, failed }
}

function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const format = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00'
  return (
    <div className="chat-audio">
      <audio ref={ref} src={src} preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)} onEnded={() => { setPlaying(false); setProgress(0) }} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <button type="button" aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'} onClick={() => { const audio = ref.current; if (!audio) return; if (audio.paused) void audio.play(); else audio.pause() }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <input type="range" aria-label="Posição do áudio" min={0} max={duration || 1} step={0.1} value={progress} onChange={(event) => { if (ref.current) ref.current.currentTime = Number(event.target.value) }} />
      <small>{format(playing || progress ? progress : duration)}</small>
    </div>
  )
}

function Ticks({ status }: { status?: ChatMessage['delivery_status'] }) {
  if (!status) return null
  if (status === 'failed') return <span className="chat-ticks chat-ticks--failed" title="Não foi possível entregar"><AlertCircle size={13} /></span>
  const label = status === 'read' ? 'Lida' : status === 'delivered' ? 'Entregue' : 'Enviada'
  return <span className={`chat-ticks chat-ticks--${status}`} title={label} aria-label={label}>{status === 'sent' ? <Check size={14} /> : <CheckCheck size={14} />}</span>
}

function MessageMedia({ session, message, kind, onOpenImage }: { session: Session; message: ChatMessage; kind: Kind; onOpenImage: (url: string) => void }) {
  const { url, failed } = useMedia(session, message.id, message.has_media)
  if (!message.has_media) return <div className="chat-media-pending">Carregando {kind === 'audio' ? 'áudio' : kind === 'image' ? 'foto' : 'arquivo'}…</div>
  if (failed) return <div className="chat-media-pending">Não foi possível carregar o arquivo.</div>
  if (!url) return <div className="chat-media-pending">Carregando…</div>
  if (kind === 'image' || kind === 'sticker') return <button className="chat-image" type="button" onClick={() => onOpenImage(url)} aria-label="Ampliar imagem"><img src={url} alt={message.body || 'Imagem da conversa'} /></button>
  if (kind === 'audio') return <><AudioPlayer src={url} />{message.transcript && <p className="chat-transcript"><b>Transcrição</b>{message.transcript}</p>}</>
  if (kind === 'video') return <video className="chat-video" src={url} controls preload="metadata" />
  return <a className="chat-file" href={url} download={message.media_name ?? 'arquivo'}><FileText size={20} /><span>{message.media_name ?? 'Arquivo'}</span><Download size={16} /></a>
}

type ThreadProps = { session: Session; conversation: ConversationRow; botEnabled: boolean; onBack?: () => void; onClose?: () => void; onActivity?: () => void }

export function ChatThread({ session, conversation, botEnabled, onBack, onClose, onActivity }: ThreadProps) {
  const activeId = conversation.id
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(true)
  const [botPaused, setBotPaused] = useState(Boolean(conversation.bot_paused))
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ file: File; kind: 'image' | 'document'; preview: string | null } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastMessageId = useRef<string | null>(null)
  const markedRead = useRef<string | null>(null)
  const textArea = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const result = await api.conversationMessages(session, activeId)
      setMessages(result.messages)
      setBotPaused(result.botPaused)
      const lastInbound = result.messages.filter((message) => message.direction === 'inbound').at(-1)?.sent_at ?? null
      if (lastInbound && lastInbound !== markedRead.current && document.visibilityState === 'visible') {
        markedRead.current = lastInbound
        void api.markConversationRead(session, activeId).then(() => onActivity?.()).catch(() => { markedRead.current = null })
      }
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a conversa.') }
    finally { setThreadLoading(false) }
  }, [activeId, session, onActivity])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => { void load() }, 15_000)
    const unsubscribe = onChatEvent((event) => { if (event.type === 'reconnected' || !event.conversationId || event.conversationId === activeId) void load() })
    return () => { window.clearInterval(interval); unsubscribe() }
  }, [activeId, load])

  useEffect(() => {
    const last = messages.at(-1)?.id ?? null
    if (last !== lastMessageId.current && stickToBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    lastMessageId.current = last
  }, [messages])

  useEffect(() => () => {
    window.clearInterval(timer.current)
    stream.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const appendSent = (message: ChatMessage) => {
    stickToBottom.current = true
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
    if (botEnabled) setBotPaused(true)
    onActivity?.()
  }

  const run = async (work: () => Promise<void>) => {
    setSending(true); setError('')
    try { await work() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar.') } finally { setSending(false) }
  }

  const sendText = () => {
    const value = text.trim()
    if (sending) return
    if (pending) {
      const file = pending
      void run(async () => {
        appendSent(await api.sendChatMedia(session, activeId, { kind: file.kind, mimeType: file.file.type || 'application/octet-stream', fileName: file.file.name, data: await toBase64(file.file), caption: value || undefined, replyToMessageId: replyTo?.id }))
        setPending(null); setText(''); setReplyTo(null)
      })
      return
    }
    if (!value) return
    void run(async () => { appendSent(await api.sendChatText(session, activeId, value, replyTo?.id)); setText(''); setReplyTo(null) })
  }

  const pickFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > maxFileBytes) { setError('O arquivo passa de 16 MB.'); return }
    setError('')
    const kind = file.type.startsWith('image/') ? 'image' : 'document'
    setPending({ file, kind, preview: kind === 'image' ? URL.createObjectURL(file) : null })
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { pickFile(event.target.files?.[0]); event.target.value = '' }
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = [...event.clipboardData.files].find((item) => item.type.startsWith('image/'))
    if (file) { event.preventDefault(); pickFile(file) }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendText() }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Este navegador não permite gravar áudio.'); return }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      const instance = new MediaRecorder(media, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      instance.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data) }
      instance.start()
      stream.current = media; recorder.current = instance
      setSeconds(0); setRecording(true); setError('')
      timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    } catch {
      setError('Permita o uso do microfone no navegador para gravar áudio.')
    }
  }

  const stopRecording = (send: boolean) => {
    const instance = recorder.current
    window.clearInterval(timer.current)
    setRecording(false)
    if (!instance) return
    instance.onstop = () => {
      stream.current?.getTracks().forEach((track) => track.stop())
      const blob = new Blob(chunks.current, { type: instance.mimeType || 'audio/webm' })
      chunks.current = []
      if (send && blob.size > 0) void run(async () => appendSent(await api.sendChatMedia(session, activeId, { kind: 'audio', mimeType: blob.type, fileName: 'audio', data: await toBase64(blob), replyToMessageId: replyTo?.id })))
    }
    instance.stop()
    recorder.current = null
  }

  const toggleBot = async () => {
    try {
      const result = await api.setConversationBot(session, activeId, !botPaused)
      setBotPaused(result.botPaused)
      onActivity?.()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível alterar o chatbot.') }
  }

  const name = conversation.contact_name || formatPhone(conversation.phone)
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const hasContent = Boolean(text.trim()) || Boolean(pending)

  return (
    <div className="chat-thread">
      <header className="chat-thread__head">
        {onBack && <button className="chat-back" type="button" onClick={onBack} aria-label="Voltar para a lista"><ArrowLeft size={19} /></button>}
        <span className="avatar">{initialsOf(conversation.contact_name || conversation.phone)}</span>
        <div><b>{name}</b><small>{formatPhone(conversation.phone)} · {conversation.channel_name}</small></div>
        {botEnabled && <button className={`chat-bot-chip ${botPaused ? 'is-paused' : 'is-active'}`} type="button" onClick={() => void toggleBot()}><Bot size={14} />{botPaused ? 'Chatbot pausado · Retomar' : 'Chatbot ativo · Pausar'}</button>}
        {onClose && <button className="chat-close" type="button" onClick={onClose} aria-label="Fechar conversa"><X size={19} /></button>}
      </header>
      {botEnabled && botPaused && <div className="chat-banner"><Pause size={14} /> O chatbot está pausado nesta conversa porque um atendente respondeu. Ele volta a responder quando você retomar ou depois de 12 horas sem resposta humana.</div>}
      <div className="chat-messages" ref={scrollRef} onScroll={onScroll}>
        {threadLoading && !messages.length && <div className="chat-media-pending">Carregando mensagens…</div>}
        {!threadLoading && !messages.length && <div className="chat-media-pending">Nenhuma mensagem nesta conversa ainda.</div>}
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const newDay = !previous || new Date(previous.sent_at).toDateString() !== new Date(message.sent_at).toDateString()
          const kind = kindOf(message)
          const outbound = message.direction === 'outbound'
          const author = message.sent_by === 'bot' ? 'bot' : message.sent_by === 'phone' ? 'phone' : outbound ? 'agent' : 'customer'
          return (
            <div key={message.id} className="chat-row">
              {newDay && <div className="chat-day"><span>{dayLabel(message.sent_at)}</span></div>}
              <div className={`chat-msg ${outbound ? 'chat-msg--out' : 'chat-msg--in'} chat-msg--${author}`}>
                <button className="chat-msg__reply" type="button" aria-label="Responder esta mensagem" title="Responder" onClick={() => { setReplyTo(message); textArea.current?.focus() }}><Reply size={13} /></button>
                {author === 'bot' && <span className="chat-msg__who"><Bot size={11} /> Chatbot</span>}
                {author === 'phone' && <span className="chat-msg__who">Pelo celular</span>}
                {message.quoted_text && <div className={`chat-quote chat-quote--${message.quoted_from === 'us' ? 'us' : 'customer'}`}><b>{message.quoted_from === 'us' ? 'Você' : 'Cliente'}</b><span>{message.quoted_text}</span></div>}
                {kind !== 'text' && <MessageMedia session={session} message={message} kind={kind} onOpenImage={setLightbox} />}
                {message.body && <p>{message.body}</p>}
                {!message.body && kind === 'text' && <p className="chat-msg__empty">Mensagem sem texto</p>}
                <span className="chat-msg__meta"><time>{timeLabel(message.sent_at)}</time>{outbound && <Ticks status={message.delivery_status} />}</span>
              </div>
            </div>
          )
        })}
      </div>
      {error && <div className="chat-error" role="alert">{error}<button type="button" aria-label="Fechar aviso" onClick={() => setError('')}><X size={14} /></button></div>}
      {pending && (
        <div className="chat-pending">
          {pending.preview ? <img src={pending.preview} alt="Prévia da imagem" /> : <FileText size={22} />}
          <span>{pending.file.name}<small>{(pending.file.size / 1024 / 1024).toFixed(1)} MB · escreva uma legenda se quiser</small></span>
          <button type="button" aria-label="Remover anexo" onClick={() => setPending(null)}><X size={16} /></button>
        </div>
      )}
      {replyTo && <div className="chat-replying"><Reply size={15} /><span><b>Respondendo a {replyTo.direction === 'inbound' ? 'cliente' : 'você'}</b>{replyTo.body || (replyTo.message_type.includes('image') ? '📷 Foto' : replyTo.message_type.includes('audio') ? '🎤 Áudio' : replyTo.message_type.includes('video') ? '🎬 Vídeo' : replyTo.message_type.includes('document') ? '📎 Documento' : 'Mensagem')}</span><button type="button" aria-label="Cancelar resposta" onClick={() => setReplyTo(null)}><X size={15} /></button></div>}
      {recording ? (
        <div className="chat-composer chat-composer--recording">
          <button type="button" className="chat-icon-button" aria-label="Cancelar gravação" onClick={() => stopRecording(false)}><Trash2 size={19} /></button>
          <span className="chat-rec"><i /> Gravando {clock}</span>
          <button type="button" className="chat-send" aria-label="Enviar áudio" disabled={sending} onClick={() => stopRecording(true)}><Send size={18} /></button>
        </div>
      ) : (
        <div className="chat-composer">
          <input ref={fileInput} type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={onFileChange} />
          <button type="button" className="chat-icon-button" aria-label="Anexar foto ou arquivo" onClick={() => fileInput.current?.click()} disabled={sending}><Paperclip size={19} /></button>
          <textarea ref={textArea} value={text} rows={1} placeholder={pending ? 'Legenda (opcional)' : 'Escreva uma mensagem'} aria-label="Mensagem" onChange={(event) => { setText(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px` }} onKeyDown={onKeyDown} onPaste={onPaste} disabled={sending} />
          {hasContent
            ? <button type="button" className="chat-send" aria-label="Enviar mensagem" disabled={sending} onClick={sendText}><Send size={18} /></button>
            : <button type="button" className="chat-send chat-send--mic" aria-label="Gravar áudio" disabled={sending} onClick={() => void startRecording()}><Mic size={19} /></button>}
        </div>
      )}
      {lightbox && <div className="chat-lightbox" role="dialog" aria-label="Imagem ampliada" onClick={() => setLightbox(null)}><button type="button" aria-label="Fechar imagem" onClick={() => setLightbox(null)}><X size={22} /></button><img src={lightbox} alt="Imagem ampliada" /></div>}
    </div>
  )
}

export function ChatPage({ session, initial, botEnabled }: { session: Session; initial: ConversationRow[]; botEnabled: boolean }) {
  const [list, setList] = useState<ConversationRow[]>(initial)
  const [listLoaded, setListLoaded] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mobileThread, setMobileThread] = useState(false)
  const [search, setSearch] = useState('')

  const active = useMemo(() => list.find((item) => item.id === activeId) ?? null, [list, activeId])

  const refreshList = useCallback(async () => {
    const rows = await api.conversations(session)
    setList(rows)
    setListLoaded(true)
  }, [session])

  useEffect(() => {
    void refreshList().catch(() => setListLoaded(true))
    const interval = window.setInterval(() => { void refreshList().catch(() => undefined) }, 20_000)
    const unsubscribe = onChatEvent(() => { void refreshList().catch(() => undefined) })
    return () => { window.clearInterval(interval); unsubscribe() }
  }, [refreshList])

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR')
    if (!needle) return list
    return list.filter((item) => `${item.contact_name ?? ''} ${item.phone} ${item.last_message ?? ''}`.toLocaleLowerCase('pt-BR').includes(needle))
  }, [list, search])

  return (
    <>
      <section className="page-head"><div><span className="eyebrow">WHATSAPP CENTRALIZADO</span><h1>Conversas</h1><p>{botEnabled ? 'Acompanhe o chatbot, assuma a conversa quando quiser e responda por aqui.' : 'Veja o histórico e responda seus clientes sem sair do CRM.'}</p></div></section>
      <section className={`chat-layout panel ${mobileThread ? 'chat-layout--thread' : ''}`} aria-label="Conversas do WhatsApp">
        <aside className="chat-list">
          <div className="chat-list__search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" aria-label="Buscar conversa" /></div>
          <div className="chat-list__items">
            {filtered.map((item) => {
              const name = item.contact_name || formatPhone(item.phone)
              return (
                <button type="button" key={item.id} className={`chat-item ${item.id === activeId ? 'is-active' : ''} ${item.unread_count ? 'has-unread' : ''}`} onClick={() => { setActiveId(item.id); setMobileThread(true); setList((current) => current.map((row) => row.id === item.id ? { ...row, unread_count: 0 } : row)) }}>
                  <span className="avatar">{initialsOf(name)}</span>
                  <span className="chat-item__main"><b>{name}</b><small>{item.last_sent_by === 'bot' && <Bot size={12} />}{previewOf(item)}</small></span>
                  <span className="chat-item__meta"><time>{listTime(item.last_message_at ?? item.sent_at)}</time>{item.unread_count ? <em className="chat-unread" aria-label={`${item.unread_count} não lidas`}>{item.unread_count > 99 ? '99+' : item.unread_count}</em> : botEnabled && item.bot_paused ? <i title="Chatbot pausado"><Pause size={10} /></i> : null}</span>
                </button>
              )
            })}
            {!filtered.length && <div className="chat-empty-list"><MessageCircleMore size={22} /><p>{listLoaded ? (search ? 'Nenhuma conversa encontrada.' : 'As conversas aparecem aqui quando os clientes chamarem no WhatsApp.') : 'Carregando conversas…'}</p></div>}
          </div>
        </aside>
        {active
          ? <ChatThread key={active.id} session={session} conversation={active} botEnabled={botEnabled} onBack={() => setMobileThread(false)} onActivity={() => { void refreshList().catch(() => undefined) }} />
          : <div className="chat-thread"><div className="chat-placeholder"><MessageCircleMore size={34} /><h2>Selecione uma conversa</h2><p>Escolha um atendimento na lista para ver as mensagens e responder.</p></div></div>}
      </section>
    </>
  )
}

const samePhone = (a: string, b: string) => {
  const first = digits(a), second = digits(b)
  return Boolean(first && second) && (first === second || first.endsWith(second) || second.endsWith(first))
}

export function ChatDrawer({ session, name, phone, botEnabled, onClose }: { session: Session; name: string; phone: string; botEnabled: boolean; onClose: () => void }) {
  const [conversation, setConversation] = useState<ConversationRow | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    api.conversations(session).then((rows) => {
      if (cancelled) return
      const found = rows.find((row) => samePhone(row.phone, phone))
      setConversation(found ?? null)
      setState(found ? 'ready' : 'missing')
    }).catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [phone, session])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <button className="chat-drawer-backdrop" type="button" aria-label="Fechar conversa" onClick={onClose} />
      <aside className="chat-drawer" role="dialog" aria-label={`Conversa com ${name}`}>
        {state === 'ready' && conversation
          ? <ChatThread session={session} conversation={conversation} botEnabled={botEnabled} onClose={onClose} />
          : (
            <div className="chat-thread">
              <header className="chat-thread__head"><span className="avatar">{initialsOf(name)}</span><div><b>{name}</b><small>{formatPhone(phone)}</small></div><button className="chat-close" type="button" onClick={onClose} aria-label="Fechar conversa"><X size={19} /></button></header>
              <div className="chat-placeholder"><MessageCircleMore size={30} /><h2>{state === 'loading' ? 'Abrindo conversa…' : state === 'error' ? 'Não foi possível abrir' : 'Ainda não há conversa'}</h2><p>{state === 'loading' ? 'Buscando as mensagens deste lead.' : state === 'error' ? 'Tente novamente em alguns segundos.' : 'Este lead ainda não trocou mensagens pelo WhatsApp conectado.'}</p></div>
            </div>
          )}
      </aside>
    </>
  )
}
