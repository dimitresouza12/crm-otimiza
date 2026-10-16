import { foldText } from './message-text.js'

export type CatalogItem = { name: string; price: number | null; description?: string }
export type HoursPeriod = { start: string; end: string }
// start/end continuam existindo (primeiro início e último fim) para o formato antigo; "periods" traz o expediente quebrado, como 07-11 e 13-17.
export type BusinessHours = { enabled: boolean; days: number[]; start: string; end: string; periods?: HoursPeriod[] }
export type BotSettings = {
  is_active: boolean
  welcome_message: string | null
  fallback_message: string | null
  off_hours_message: string | null
  business_hours: BusinessHours
  bot_mode: 'always' | 'outside_hours'
  catalog: CatalogItem[]
  price_replies_enabled: boolean
  promotion_message?: string | null
  promotion_in_welcome?: boolean
}
export type BotRule = { id: string; trigger_type: 'keyword' | 'first_message'; trigger_value: string | null; response_text: string }
export type BotReply = { text: string; source: 'keyword' | 'price' | 'welcome' | 'off_hours' | 'fallback' | 'schedule' | 'human'; ruleId?: string }

export const defaultBusinessHours: BusinessHours = { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }

const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export const periodsOf = (hours: BusinessHours): HoursPeriod[] => hours.periods?.length ? hours.periods : [{ start: hours.start, end: hours.end }]

export const isWithinBusinessHours = (hours: BusinessHours, now = new Date(), timeZone = process.env.BOT_TIMEZONE || 'America/Sao_Paulo') => {
  if (!hours.enabled) return true
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const weekday = weekdays[parts.find((part) => part.type === 'weekday')?.value ?? ''] ?? 0
  const minutes = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hours.days.includes(weekday) && periodsOf(hours).some((period) => minutes >= toMinutes(period.start) && minutes < toMinutes(period.end))
}

export const splitKeywords = (value: string | null) => (value ?? '').split(/[,;\n]/).map(foldText).filter((keyword) => keyword.length >= 2)

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Palavras curtas ("oi", "dia") só valem como palavra inteira, para não acionar dentro de "doido" ou "media".
export const containsKeyword = (foldedText: string, keyword: string) =>
  keyword.length < 4 ? new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword)}([^a-z0-9]|$)`).test(foldedText) : foldedText.includes(keyword)

const nameWords = (name: string) => foldText(name).split(/[^a-z0-9]+/).filter((word) => word.length >= 4)

const priceWords = ['preco', 'precos', 'valor', 'valores', 'quanto custa', 'quanto custam', 'quanto e', 'quanto fica', 'quanto sai', 'quanto cobra', 'tabela', 'orcamento']

// Quem pergunta pelos serviços ou produtos quer ver a lista do catálogo, mesmo sem falar em preço.
const catalogWords = ['servico', 'servicos', 'produto', 'produtos', 'catalogo', 'cardapio', 'o que voces fazem', 'o que voces vendem', 'o que voces oferecem', 'o que voces tem', 'trabalham com', 'trabalhamos com']

// Pedido de reunião, demonstração ou horário. Serve para avisar a equipe no lead e para o bot não cair no "não entendi".
const meetingIntent = /\b(reuni(?:ao|oes)|agend\w*|marcar|remarcar|demonstra\w*|demo|apresenta(?:r|cao)|visita|videochamada|video chamada|call|me ligar|ligacao|me mostr\w+|mostrar (?:o|a|um|uma|seu|sua|os|as) \w+|conhecer (?:o|a) \w+)\b/
// Horas escritas de vários jeitos, inclusive como a transcrição de um áudio sai: "9h", "9h30", "9:00", "9 horas", "nove horas", "9 da manhã", "meio-dia".
const clockTime = /\b\d{1,2}\s?(?:h|hs|hr|hrs|horas?)\b|\b\d{1,2}h\d{2}\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s+(?:da|de)\s+(?:manha|tarde|noite)\b|\b(?:uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+(?:horas?|da manha|da tarde|da noite)\b|\bmeio[- ]?dia\b|\bmeia[- ]?noite\b/
const dayWord = /\b(?:hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|semana que vem|proxima semana)\b/
const dayPart = /\b(?:manha|tarde|noite|almoco)\b/
const dayAtHour = /\bas \d{1,2}\b/ // "amanhã às 9": o número solto só vale junto de um dia

export type MeetingRequest = { kind: 'intent' | 'schedule'; when: string | null }

// Sem acento e em minúsculas, letra a letra, para achar trechos e recortá-los do texto original (com acento e maiúsculas).
const foldWithMap = (text: string) => {
  let folded = ''
  const origin: number[] = []
  for (let index = 0; index < text.length; index++) {
    const piece = text[index].normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')
    for (const char of piece) { folded += char; origin.push(index) }
  }
  return { folded, origin }
}

// Trecho do dia e da hora que o cliente citou ("amanhã de manhã", "hoje às 16h"), do jeito que ele escreveu.
const quotedWhen = (text: string, folded: string, origin: number[]) => {
  const spans = [clockTime, dayWord, dayPart, dayAtHour].map((pattern) => new RegExp(pattern.source).exec(folded)).filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ start: origin[match.index], end: origin[match.index + match[0].length - 1] + 1 })).sort((a, b) => a.start - b.start)
  if (!spans.length) return null
  const first = spans[0].start
  const last = Math.max(...spans.map((span) => span.end))
  const slice = last - first <= 50 ? text.slice(first, last) : spans.map((span) => text.slice(span.start, span.end)).join(' · ')
  return slice.trim().slice(0, 160)
}

// Devolve null quando a mensagem não pede nada. "when" vem preenchido quando o cliente já disse dia/horário.
export const detectMeetingRequest = (text: string): MeetingRequest | null => {
  const { folded, origin } = foldWithMap(text)
  const schedule = clockTime.test(folded) || (dayWord.test(folded) && (dayPart.test(folded) || dayAtHour.test(folded)))
  if (schedule) return { kind: 'schedule', when: quotedWhen(text, folded, origin) }
  return meetingIntent.test(folded) ? { kind: 'intent', when: null } : null
}

// "queria uma reunião amanhã às 9h": pede a reunião E dá o horário. Isso vale mais que um assunto de "horário de funcionamento".
export const hasMeetingIntent = (text: string) => meetingIntent.test(foldText(text))

// Pedido explícito por uma pessoa: "quero falar com um atendente", "me passa pra alguém", "chama o responsável".
const humanRequest = /\b(?:falar|conversar|chamar|chama|passa|passar|transferir|transfere)\b.{0,30}\b(?:atendente|humano|pessoa|alguem|vendedor|consultor|responsavel|gerente|dono|especialista)\b|\b(?:atendente|humano)\b/
export const wantsHuman = (text: string) => humanRequest.test(foldText(text))

// "ok", "obrigado", "valeu", "👍": não pedem nada. Responder "não entendi" a isso incomoda; o bot fica quieto.
const ackWords = new Set(['ok', 'okay', 'blz', 'beleza', 'certo', 'combinado', 'fechado', 'show', 'perfeito', 'otimo', 'entendi', 'entendido', 'sim', 'obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'tmj', 'top', 'joia', 'legal', 'massa', 'ta', 'bom', 'gracas', 'muito', 'de', 'nada', 'tudo', 'certeza', 'claro', 'uhum', 'aham'])
export const isAcknowledgement = (foldedText: string) => {
  if (!foldedText) return false
  if (!/[a-z0-9]/.test(foldedText)) return true // só emoji ou pontuação
  const tokens = foldedText.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
  return tokens.length > 0 && tokens.length <= 4 && tokens.every((token) => ackWords.has(token))
}

export const humanReply = 'Claro! 😊 Já avisei um atendente, que vai falar com você por aqui assim que possível.'

export const scheduleReplies = {
  intent: 'Claro! 😊 Me diga o dia e o horário que ficam melhores para você, que um atendente confirma.',
  schedule: 'Anotado! 😊 Um atendente vai confirmar esse horário com você em instantes.',
}

// "oi", "boa tarde", "tudo bem?" valem como cumprimento mesmo no meio da conversa, não como "não entendi".
const greetingWords = new Set(['oi', 'oie', 'oii', 'oiii', 'ola', 'opa', 'eae', 'eai', 'e', 'ai', 'bom', 'boa', 'dia', 'tarde', 'noite', 'tudo', 'bem', 'td', 'como', 'vai', 'voce', 'ta', 'gente', 'pessoal'])
const greetingStarters = new Set(['oi', 'oie', 'oii', 'oiii', 'ola', 'opa', 'eae', 'eai', 'bom', 'boa', 'tudo', 'td'])
export const isGreeting = (foldedText: string) => {
  const tokens = foldedText.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
  return tokens.length > 0 && tokens.length <= 5 && tokens.every((token) => greetingWords.has(token)) && tokens.some((token) => greetingStarters.has(token))
}

export const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

const hasPrice = (item: CatalogItem) => item.price !== null && Number(item.price) >= 0

// Item sem preço também é respondido: sai o nome e o detalhe, sem valor.
const priceLines = (items: CatalogItem[]) => items.map((item) => `• ${item.name}${hasPrice(item) ? `: ${formatMoney(Number(item.price))}` : ''}${item.description?.trim() ? ` — ${item.description.trim()}` : ''}`).join('\n')

export const chooseBotReply = (input: { settings: BotSettings; rules: BotRule[]; text: string; isFirstMessage: boolean; now?: Date }): BotReply | null => {
  const { settings, rules } = input
  const hours = settings.business_hours
  const outside = hours.enabled && !isWithinBusinessHours(hours, input.now ?? new Date())
  if (settings.bot_mode === 'outside_hours' && hours.enabled && !outside) return null

  const folded = foldText(input.text)
  const meeting = detectMeetingRequest(input.text)
  // Pediu a reunião e já deu o horário ("queria uma reunião amanhã às 9h"): vale mais que um assunto de "horário de funcionamento".
  if (meeting?.kind === 'schedule' && hasMeetingIntent(input.text)) return { text: scheduleReplies.schedule, source: 'schedule' }

  // Vence o assunto com a palavra mais específica (mais longa); se empatar, o que casou mais palavras; depois, a ordem da lista.
  let best: { rule: BotRule; longest: number; hits: number } | null = null
  for (const rule of rules) {
    if (rule.trigger_type !== 'keyword' || !rule.response_text.trim()) continue
    const matched = splitKeywords(rule.trigger_value).filter((keyword) => containsKeyword(folded, keyword))
    if (!matched.length) continue
    const longest = Math.max(...matched.map((keyword) => keyword.length))
    if (!best || longest > best.longest || (longest === best.longest && matched.length > best.hits)) best = { rule, longest, hits: matched.length }
  }
  if (best) return { text: best.rule.response_text, source: 'keyword', ruleId: best.rule.id }

  const named = settings.catalog.filter((item) => item.name.trim())
  if (settings.price_replies_enabled && named.length) {
    const fullName = named.filter((item) => { const name = foldText(item.name); return name.length >= 3 && folded.includes(name) })
    // Sem o nome inteiro, vale uma palavra do nome ("combo" encontra "Combo corte + barba").
    const mentioned = fullName.length ? fullName : named.filter((item) => nameWords(item.name).some((word) => containsKeyword(folded, word)))
    if (mentioned.length) return { text: priceLines(mentioned), source: 'price' }
    const priced = named.filter(hasPrice)
    if (priced.length && priceWords.some((word) => containsKeyword(folded, word))) return { text: `Nossos valores:\n${priceLines(priced.slice(0, 20))}`, source: 'price' }
    if (catalogWords.some((word) => containsKeyword(folded, word))) return { text: `O que oferecemos:\n${priceLines(named.slice(0, 20))}`, source: 'price' }
  }

  if (wantsHuman(input.text)) return { text: humanReply, source: 'human' }
  if (meeting) return { text: scheduleReplies[meeting.kind], source: 'schedule' }

  const offHours = settings.off_hours_message?.trim()
  const welcome = settings.welcome_message?.trim() || rules.find((rule) => rule.trigger_type === 'first_message')?.response_text.trim()
  const promotion = settings.promotion_message?.trim()
  if (input.isFirstMessage || isGreeting(folded)) {
    if (outside && offHours) return { text: offHours, source: 'off_hours' }
    const firstReply = [welcome, settings.promotion_in_welcome && promotion ? promotion : ''].filter(Boolean).join('\n\n')
    if (firstReply) return { text: firstReply, source: 'welcome' }
  }
  if (isAcknowledgement(folded)) return null
  if (outside && offHours) return { text: offHours, source: 'off_hours' }
  const fallback = settings.fallback_message?.trim()
  return fallback ? { text: fallback, source: 'fallback' } : null
}
