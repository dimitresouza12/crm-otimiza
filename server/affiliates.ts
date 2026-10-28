// Regras do programa de afiliados, sem I/O: comissão, carência, saldo, estorno, ranking, código e chave Pix.
export const COMMISSION_RATE = 0.5
export const HOLD_DAYS = 30
const DAY = 86_400_000

// 50% de UMA mensalidade: mesmo que o cliente pague o ano à vista, vale o menor entre a mensalidade e o que foi pago.
export const commissionFor = (planPriceCents: number, paidCents: number) => {
  if (planPriceCents <= 0 || paidCents <= 0) return 0
  return Math.round(Math.min(planPriceCents, paidCents) * COMMISSION_RATE)
}

export const availableAtFor = (confirmedAt: Date) => new Date(confirmedAt.getTime() + HOLD_DAYS * DAY)

export type CommissionRow = { amount_cents: number; status: 'pending' | 'requested' | 'paid' | 'canceled' | 'reversed_after_payout'; available_at: string }
export type Balance = { availableCents: number; pendingCents: number; requestedCents: number; paidCents: number; nextReleaseAt: string | null }

// 'pending' vira disponível só pela data: não precisa de rotina agendada.
export const balanceOf = (rows: CommissionRow[], now = Date.now()): Balance => {
  const balance: Balance = { availableCents: 0, pendingCents: 0, requestedCents: 0, paidCents: 0, nextReleaseAt: null }
  let next: number | null = null
  for (const row of rows) {
    if (row.status === 'pending') {
      const at = new Date(row.available_at).getTime()
      if (at <= now) balance.availableCents += row.amount_cents
      else { balance.pendingCents += row.amount_cents; next = next === null ? at : Math.min(next, at) }
    } else if (row.status === 'requested') balance.requestedCents += row.amount_cents
    else if (row.status === 'paid') balance.paidCents += row.amount_cents
  }
  balance.nextReleaseAt = next === null ? null : new Date(next).toISOString()
  return balance
}

// Eventos do Asaas que desfazem a comissão do pagamento que a gerou. Atraso (OVERDUE) não desfaz: é de uma cobrança futura.
const cancelEvents = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_REVERSED', 'PAYMENT_DELETED'])
export const commissionEffectFor = (eventType: string): 'cancel' | 'none' => cancelEvents.has(eventType) ? 'cancel' : 'none'

// Estorno depois que a comissão já estava a caminho do saque ou paga: não some, vai para a equipe decidir.
export const statusAfterCancel = (status: CommissionRow['status']): CommissionRow['status'] =>
  status === 'pending' ? 'canceled' : status === 'requested' || status === 'paid' ? 'reversed_after_payout' : status

export type PayoutCheck = { ok: true } | { ok: false; error: string }
export const canRequestPayout = (input: { availableCents: number; hasPixKey: boolean; hasOpenPayout: boolean; blocked: boolean }): PayoutCheck => {
  if (input.blocked) return { ok: false, error: 'Sua conta de afiliado está bloqueada. Fale com a equipe.' }
  if (!input.hasPixKey) return { ok: false, error: 'Cadastre a sua chave Pix antes de pedir o saque.' }
  if (input.hasOpenPayout) return { ok: false, error: 'Você já tem um pedido de saque em análise.' }
  if (input.availableCents <= 0) return { ok: false, error: 'Você ainda não tem saldo disponível para sacar.' }
  return { ok: true }
}

// ───────── Código do link e apelido ─────────
const reservedCodes = new Set(['admin', 'app', 'afiliado', 'afiliados', 'api', 'entrar', 'cadastro', 'otimiza', 'suporte', 'teste', 'www'])
export const slugifyCode = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)
export const isValidCode = (code: string) => /^[a-z0-9]{3,24}$/.test(code) && !reservedCodes.has(code)
export const isValidNickname = (value: string) => /^[\p{L}\p{N} ._-]{3,24}$/u.test(value.trim())

// Nome da empresa indicada visto pelo afiliado: duas primeiras letras de cada palavra, no máximo duas palavras.
export const maskCompanyName = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => `${Array.from(word).slice(0, 2).join('')}***`).join(' ') || '***'

// ───────── Chave Pix ─────────
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
export const pixKeyTypes: PixKeyType[] = ['cpf', 'cnpj', 'email', 'phone', 'random']
const digits = (value: string) => value.replace(/\D/g, '')
export const normalizePixKey = (type: PixKeyType, raw: string): { ok: true; value: string } | { ok: false; error: string } => {
  const value = raw.trim()
  if (type === 'cpf') return digits(value).length === 11 ? { ok: true, value: digits(value) } : { ok: false, error: 'O CPF precisa ter 11 números.' }
  if (type === 'cnpj') return digits(value).length === 14 ? { ok: true, value: digits(value) } : { ok: false, error: 'O CNPJ precisa ter 14 números.' }
  if (type === 'phone') {
    const phone = digits(value)
    return phone.length === 10 || phone.length === 11 || ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) ? { ok: true, value: `+${phone.length <= 11 ? '55' : ''}${phone}` } : { ok: false, error: 'Use o celular com DDD, como (85) 99999-9999.' }
  }
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 140 ? { ok: true, value: value.toLowerCase() } : { ok: false, error: 'Informe um e-mail válido.' }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? { ok: true, value: value.toLowerCase() } : { ok: false, error: 'A chave aleatória tem o formato 00000000-0000-0000-0000-000000000000.' }
}
// Para mostrar no painel do afiliado sem expor a chave inteira.
export const maskPixKey = (type: PixKeyType, value: string) => type === 'email' ? value.replace(/^(.{2}).*(@.*)$/, '$1***$2') : type === 'random' ? `${value.slice(0, 4)}…${value.slice(-4)}` : `***${value.slice(-4)}`

// ───────── Ranking ─────────
export type RankRow = { affiliateId: string; nickname: string; sales: number; amountCents: number }
export type RankEntry = { position: number; nickname: string; sales: number; amountCents: number; isMe: boolean }
// Mais vendas primeiro; empate no valor, depois no apelido (estável). Afiliado sem venda não entra no ranking.
export const rankingOf = (rows: RankRow[], meId: string | null, limit = 10): { top: RankEntry[]; me: RankEntry | null } => {
  const sorted = rows.filter((row) => row.sales > 0).sort((a, b) => b.sales - a.sales || b.amountCents - a.amountCents || a.nickname.localeCompare(b.nickname, 'pt-BR'))
  const all = sorted.map((row, index) => ({ position: index + 1, nickname: row.nickname, sales: row.sales, amountCents: row.amountCents, isMe: row.affiliateId === meId }))
  return { top: all.slice(0, limit), me: all.find((entry) => entry.isMe) ?? null }
}
