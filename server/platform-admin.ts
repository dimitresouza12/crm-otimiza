// Regras do painel master: quem da equipe pode abrir o quê dentro da conta de um cliente, e como ler a assinatura.
export type PlatformRole = 'master' | 'traffic'

export const isPlatformRole = (value: unknown): value is PlatformRole => value === 'master' || value === 'traffic'

// ───────── Quem é administrador e quem é gestor de tráfego ─────────
export type RoleChange = { ok: true } | { ok: false; error: string }

// Regra pura para mudar o papel de uma pessoa da equipe. O servidor aplica; a tela só mostra a mensagem.
export const checkRoleChange = (input: { actorId: string; targetId: string; currentRole: PlatformRole | null; nextRole: PlatformRole | null; masterCount: number }): RoleChange => {
  if (input.currentRole === input.nextRole) return { ok: false, error: 'Esta pessoa já tem esse papel.' }
  if (input.actorId === input.targetId) return { ok: false, error: 'Você não pode mudar o seu próprio papel. Peça a outro administrador.' }
  if (input.currentRole === 'master' && input.nextRole !== 'master' && input.masterCount <= 1) return { ok: false, error: 'É preciso manter pelo menos um administrador.' }
  return { ok: true }
}

export type PlatformAccess = { allowed: true; audit: boolean } | { allowed: false; needsConsent: boolean }

// Rotas de cliente que a equipe pode usar sem ser membro da empresa. O resto continua exigindo vínculo.
// Chatbot e tráfego: leitura e escrita. Conversas: só leitura e só com autorização do cliente.
export const platformAccess = (method: string, path: string, consentGranted: boolean): PlatformAccess => {
  const verb = method.toUpperCase()
  const read = verb === 'GET' || verb === 'HEAD'
  if (path === '/api/chatbot' || path.startsWith('/api/chatbot/')) return { allowed: true, audit: !read }
  if (path === '/api/traffic') return { allowed: true, audit: !read }
  if (read && (path === '/api/reports' || path === '/api/lead-sources')) return { allowed: true, audit: false }
  const conversation = read && (path === '/api/conversations' || /^\/api\/conversations\/[^/]+\/messages$/.test(path) || /^\/api\/messages\/[^/]+\/media$/.test(path))
  if (conversation) return consentGranted ? { allowed: true, audit: true } : { allowed: false, needsConsent: true }
  return { allowed: false, needsConsent: false }
}

export type CycleKind = 'trial' | 'monthly' | 'annual' | 'lifetime'
// 'expired' = acesso liberado à mão que chegou ao fim (mensal ou anual vencido).
export type SubscriptionState = 'trial' | 'trial_expired' | 'active' | 'overdue' | 'canceled' | 'expired'

export type SubscriptionFacts = {
  billingStatus: 'trial' | 'active' | 'expired'
  trialEndsAt: string | null
  subscriptionStatus: string | null
  cycle: string | null
  planPriceCents: number
  largestPaidCents: number | null
  lastPaymentStatus: string | null
  grantKind?: string | null
  grantUntil?: string | null
  now?: number
}

// ───────── Acesso liberado à mão pela equipe ─────────
export type GrantKind = 'monthly' | 'annual' | 'lifetime'
export type AccessAction = 'trial_plus_7' | 'monthly' | 'annual' | 'lifetime' | 'revoke'
export const accessActions: AccessAction[] = ['trial_plus_7', 'monthly', 'annual', 'lifetime', 'revoke']

export const grantIsActive = (kind: string | null | undefined, until: string | null | undefined, now = Date.now()) =>
  kind === 'lifetime' || ((kind === 'monthly' || kind === 'annual') && Boolean(until) && new Date(until as string).getTime() > now)

// Soma meses no calendário sem estourar o fim do mês (31/01 + 1 mês = 28/02 ou 29/02).
export const addMonths = (from: Date, months: number) => {
  const result = new Date(from.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

// Estado de acesso de uma empresa: o acesso liberado à mão vale mais que o status de cobrança e vence na data.
export const accessStateOf = (facts: { billingStatus: 'trial' | 'active' | 'expired'; trialEndsAt: string | null; grantKind?: string | null; grantUntil?: string | null; now?: number }): 'trial' | 'active' | 'expired' => {
  const now = facts.now ?? Date.now()
  if (facts.grantKind) return grantIsActive(facts.grantKind, facts.grantUntil, now) ? 'active' : 'expired'
  if (facts.billingStatus === 'active') return 'active'
  const trialExpired = facts.billingStatus === 'trial' && facts.trialEndsAt !== null && new Date(facts.trialEndsAt).getTime() <= now
  return trialExpired || facts.billingStatus === 'expired' ? 'expired' : 'trial'
}

export type AccessCurrent = { billingStatus: 'trial' | 'active' | 'expired'; trialEndsAt: string | null; grantKind: string | null; grantUntil: string | null }
export type AccessResult =
  | { ok: true; billingStatus: 'trial' | 'active' | 'expired'; trialEndsAt: string | null; grantKind: GrantKind | null; grantUntil: string | null }
  | { ok: false; error: string }

// Regra pura: o que cada ação da equipe faz com o acesso. Sem I/O, para testar todos os casos.
export const applyAccess = (action: AccessAction, current: AccessCurrent, now = Date.now()): AccessResult => {
  const active = grantIsActive(current.grantKind, current.grantUntil, now)
  if (action === 'revoke') {
    if (!current.grantKind) return { ok: false, error: 'Esta empresa não tem acesso liberado manualmente.' }
    return { ok: true, billingStatus: 'expired', trialEndsAt: current.trialEndsAt, grantKind: null, grantUntil: null }
  }
  if (current.grantKind === 'lifetime') return { ok: false, error: action === 'lifetime' ? 'O acesso vitalício já está liberado.' : 'Esta empresa tem acesso vitalício. Revogue o acesso antes de mudar.' }
  if (action === 'trial_plus_7') {
    if (active) return { ok: false, error: 'Esta empresa já tem acesso liberado. Revogue o acesso para voltar ao teste.' }
    const base = Math.max(now, current.trialEndsAt ? new Date(current.trialEndsAt).getTime() : 0)
    return { ok: true, billingStatus: 'trial', trialEndsAt: new Date(base + 7 * 86_400_000).toISOString(), grantKind: null, grantUntil: null }
  }
  if (action === 'lifetime') return { ok: true, billingStatus: 'active', trialEndsAt: current.trialEndsAt, grantKind: 'lifetime', grantUntil: null }
  // Mensal e anual somam ao que ainda resta do acesso atual, para renovar antes do fim não perder dias.
  const base = active && current.grantUntil ? new Date(current.grantUntil) : new Date(now)
  return { ok: true, billingStatus: 'active', trialEndsAt: current.trialEndsAt, grantKind: action, grantUntil: addMonths(base, action === 'monthly' ? 1 : 12).toISOString() }
}

// O Asaas só cobra MONTHLY hoje; o plano anual é reconhecido pelo valor: um pagamento de pelo menos 10 mensalidades.
export const looksAnnual = (monthlyCents: number, paidCents: number | null) => monthlyCents > 0 && paidCents !== null && paidCents >= monthlyCents * 10

export const cycleOf = (facts: SubscriptionFacts): CycleKind => {
  if (facts.grantKind === 'lifetime') return 'lifetime'
  if (facts.grantKind === 'annual') return 'annual'
  if (facts.grantKind === 'monthly') return 'monthly'
  if (facts.cycle === 'YEARLY' || looksAnnual(facts.planPriceCents, facts.largestPaidCents)) return 'annual'
  if (facts.billingStatus === 'trial') return 'trial'
  // Teste que venceu sem nunca ter assinatura nem pagamento ainda é um teste, não uma mensalidade.
  if (facts.billingStatus === 'expired' && facts.subscriptionStatus === null && facts.largestPaidCents === null) return 'trial'
  return 'monthly'
}

export const stateOf = (facts: SubscriptionFacts): SubscriptionState => {
  const now = facts.now ?? Date.now()
  if (facts.grantKind) return grantIsActive(facts.grantKind, facts.grantUntil, now) ? 'active' : 'expired'
  if (facts.subscriptionStatus === 'canceled') return 'canceled'
  if (facts.billingStatus === 'active') {
    if (facts.subscriptionStatus === 'overdue' || facts.subscriptionStatus === 'refused' || facts.lastPaymentStatus === 'OVERDUE') return 'overdue'
    return 'active'
  }
  const expired = facts.billingStatus === 'expired' || (facts.trialEndsAt !== null && new Date(facts.trialEndsAt).getTime() <= now)
  return expired ? 'trial_expired' : 'trial'
}

// Receita mensal recorrente: no anual, o valor pago dividido por 12; senão a mensalidade do plano.
export const monthlyEquivalentCents = (facts: SubscriptionFacts): number => {
  if (facts.grantKind) return 0 // acesso liberado à mão não gera receita
  if (stateOf(facts) !== 'active' && stateOf(facts) !== 'overdue') return 0
  if (cycleOf(facts) === 'annual' && facts.largestPaidCents) return Math.round(facts.largestPaidCents / 12)
  return facts.planPriceCents
}

export const daysLeft = (iso: string | null, now = Date.now()) => iso === null ? null : Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000))
