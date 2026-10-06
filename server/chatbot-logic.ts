import { foldText } from './message-text.js'

export type CatalogItem = { name: string; price: number | null; description?: string }
export type BusinessHours = { enabled: boolean; days: number[]; start: string; end: string }
export type BotSettings = {
  is_active: boolean
  welcome_message: string | null
  fallback_message: string | null
  off_hours_message: string | null
  business_hours: BusinessHours
  bot_mode: 'always' | 'outside_hours'
  catalog: CatalogItem[]
  price_replies_enabled: boolean
}
export type BotRule = { id: string; trigger_type: 'keyword' | 'first_message'; trigger_value: string | null; response_text: string }
export type BotReply = { text: string; source: 'keyword' | 'price' | 'welcome' | 'off_hours' | 'fallback'; ruleId?: string }

export const defaultBusinessHours: BusinessHours = { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }

const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export const isWithinBusinessHours = (hours: BusinessHours, now = new Date(), timeZone = process.env.BOT_TIMEZONE || 'America/Sao_Paulo') => {
  if (!hours.enabled) return true
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const weekday = weekdays[parts.find((part) => part.type === 'weekday')?.value ?? ''] ?? 0
  const minutes = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hours.days.includes(weekday) && minutes >= toMinutes(hours.start) && minutes < toMinutes(hours.end)
}

export const splitKeywords = (value: string | null) => (value ?? '').split(/[,;\n]/).map(foldText).filter((keyword) => keyword.length >= 2)

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Palavras curtas ("oi", "dia") só valem como palavra inteira, para não acionar dentro de "doido" ou "media".
export const containsKeyword = (foldedText: string, keyword: string) =>
  keyword.length < 4 ? new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword)}([^a-z0-9]|$)`).test(foldedText) : foldedText.includes(keyword)

const nameWords = (name: string) => foldText(name).split(/[^a-z0-9]+/).filter((word) => word.length >= 4)

const priceWords = ['preco', 'precos', 'valor', 'valores', 'quanto custa', 'quanto custam', 'quanto e', 'quanto fica', 'quanto sai', 'quanto cobra', 'tabela', 'orcamento']

export const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

const priceLines = (items: CatalogItem[]) => items.map((item) => `• ${item.name}: ${formatMoney(Number(item.price))}${item.description?.trim() ? ` — ${item.description.trim()}` : ''}`).join('\n')

export const chooseBotReply = (input: { settings: BotSettings; rules: BotRule[]; text: string; isFirstMessage: boolean; now?: Date }): BotReply | null => {
  const { settings, rules } = input
  const hours = settings.business_hours
  const outside = hours.enabled && !isWithinBusinessHours(hours, input.now ?? new Date())
  if (settings.bot_mode === 'outside_hours' && hours.enabled && !outside) return null

  const folded = foldText(input.text)
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

  const priced = settings.catalog.filter((item) => item.name.trim() && item.price !== null && Number(item.price) >= 0)
  if (settings.price_replies_enabled && priced.length) {
    const fullName = priced.filter((item) => { const name = foldText(item.name); return name.length >= 3 && folded.includes(name) })
    // Sem o nome inteiro, vale uma palavra do nome ("combo" encontra "Combo corte + barba").
    const mentioned = fullName.length ? fullName : priced.filter((item) => nameWords(item.name).some((word) => containsKeyword(folded, word)))
    if (mentioned.length) return { text: priceLines(mentioned), source: 'price' }
    if (priceWords.some((word) => containsKeyword(folded, word))) return { text: `Nossos valores:\n${priceLines(priced.slice(0, 20))}`, source: 'price' }
  }

  const offHours = settings.off_hours_message?.trim()
  const welcome = settings.welcome_message?.trim() || rules.find((rule) => rule.trigger_type === 'first_message')?.response_text.trim()
  if (input.isFirstMessage) {
    if (outside && offHours) return { text: offHours, source: 'off_hours' }
    if (welcome) return { text: welcome, source: 'welcome' }
  }
  if (outside && offHours) return { text: offHours, source: 'off_hours' }
  const fallback = settings.fallback_message?.trim()
  return fallback ? { text: fallback, source: 'fallback' } : null
}
