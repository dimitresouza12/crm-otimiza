// Regras do painel master: quem da equipe pode abrir o quê dentro da conta de um cliente, e como ler a assinatura.
export type PlatformRole = 'master' | 'traffic'

export const isPlatformRole = (value: unknown): value is PlatformRole => value === 'master' || value === 'traffic'

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

export type CycleKind = 'trial' | 'monthly' | 'annual'
export type SubscriptionState = 'trial' | 'trial_expired' | 'active' | 'overdue' | 'canceled'

export type SubscriptionFacts = {
  billingStatus: 'trial' | 'active' | 'expired'
  trialEndsAt: string | null
  subscriptionStatus: string | null
  cycle: string | null
  planPriceCents: number
  largestPaidCents: number | null
  lastPaymentStatus: string | null
  now?: number
}

// O Asaas só cobra MONTHLY hoje; o plano anual é reconhecido pelo valor: um pagamento de pelo menos 10 mensalidades.
export const looksAnnual = (monthlyCents: number, paidCents: number | null) => monthlyCents > 0 && paidCents !== null && paidCents >= monthlyCents * 10

export const cycleOf = (facts: SubscriptionFacts): CycleKind => {
  if (facts.cycle === 'YEARLY' || looksAnnual(facts.planPriceCents, facts.largestPaidCents)) return 'annual'
  if (facts.billingStatus === 'trial') return 'trial'
  // Teste que venceu sem nunca ter assinatura nem pagamento ainda é um teste, não uma mensalidade.
  if (facts.billingStatus === 'expired' && facts.subscriptionStatus === null && facts.largestPaidCents === null) return 'trial'
  return 'monthly'
}

export const stateOf = (facts: SubscriptionFacts): SubscriptionState => {
  const now = facts.now ?? Date.now()
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
  if (stateOf(facts) !== 'active' && stateOf(facts) !== 'overdue') return 0
  if (cycleOf(facts) === 'annual' && facts.largestPaidCents) return Math.round(facts.largestPaidCents / 12)
  return facts.planPriceCents
}

export const daysLeft = (iso: string | null, now = Date.now()) => iso === null ? null : Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000))
