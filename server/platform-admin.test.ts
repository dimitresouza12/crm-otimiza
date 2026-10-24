import assert from 'node:assert/strict'
import test from 'node:test'
import { accessStateOf, addMonths, applyAccess, checkRoleChange, cycleOf, grantIsActive, monthlyEquivalentCents, platformAccess, stateOf, type AccessCurrent, type SubscriptionFacts } from './platform-admin.js'

const base: SubscriptionFacts = { billingStatus: 'active', trialEndsAt: null, subscriptionStatus: 'active', cycle: 'MONTHLY', planPriceCents: 8_990, largestPaidCents: 8_990, lastPaymentStatus: 'RECEIVED', now: Date.parse('2026-10-18T12:00:00Z') }

test('equipe usa chatbot e tráfego sem ser membro da empresa', () => {
  assert.deepEqual(platformAccess('PUT', '/api/chatbot/settings', false), { allowed: true, audit: true })
  assert.deepEqual(platformAccess('GET', '/api/chatbot', false), { allowed: true, audit: false })
  assert.deepEqual(platformAccess('POST', '/api/traffic', false), { allowed: true, audit: true })
})

test('conversas só abrem com autorização do cliente e só para leitura', () => {
  assert.deepEqual(platformAccess('GET', '/api/conversations', false), { allowed: false, needsConsent: true })
  assert.deepEqual(platformAccess('GET', '/api/conversations/5b8c0d7e-0000-4000-8000-000000000000/messages', true), { allowed: true, audit: true })
  assert.deepEqual(platformAccess('POST', '/api/conversations/5b8c0d7e-0000-4000-8000-000000000000/messages', true), { allowed: false, needsConsent: false })
  assert.deepEqual(platformAccess('PUT', '/api/conversations/5b8c0d7e-0000-4000-8000-000000000000/bot', true), { allowed: false, needsConsent: false })
})

test('cobrança, vendas e leads do cliente continuam fechados para a equipe', () => {
  for (const path of ['/api/billing/current', '/api/billing/checkout', '/api/sales', '/api/leads', '/api/crm', '/api/integrations/whatsapp']) {
    assert.equal(platformAccess('GET', path, true).allowed, false, path)
  }
})

test('plano anual é reconhecido pelo valor pago', () => {
  assert.equal(cycleOf(base), 'monthly')
  assert.equal(cycleOf({ ...base, largestPaidCents: 8_990 * 12 }), 'annual')
  assert.equal(cycleOf({ ...base, largestPaidCents: 8_990 * 10 }), 'annual')
  assert.equal(cycleOf({ ...base, largestPaidCents: 8_990 * 9 }), 'monthly')
  assert.equal(cycleOf({ ...base, cycle: 'YEARLY' }), 'annual')
  assert.equal(cycleOf({ ...base, billingStatus: 'trial', subscriptionStatus: null, largestPaidCents: null }), 'trial')
})

test('teste que expirou sem nunca pagar continua sendo ciclo de teste; conta ativada à mão é mensal', () => {
  assert.equal(cycleOf({ ...base, billingStatus: 'expired', subscriptionStatus: null, largestPaidCents: null }), 'trial')
  assert.equal(cycleOf({ ...base, billingStatus: 'expired', subscriptionStatus: 'canceled', largestPaidCents: 8_990 }), 'monthly')
  assert.equal(cycleOf({ ...base, billingStatus: 'active', subscriptionStatus: null, largestPaidCents: null }), 'monthly')
})

test('estado da assinatura', () => {
  assert.equal(stateOf(base), 'active')
  assert.equal(stateOf({ ...base, subscriptionStatus: 'overdue' }), 'overdue')
  assert.equal(stateOf({ ...base, lastPaymentStatus: 'OVERDUE' }), 'overdue')
  assert.equal(stateOf({ ...base, subscriptionStatus: 'canceled' }), 'canceled')
  const trial = { ...base, billingStatus: 'trial' as const, subscriptionStatus: null, largestPaidCents: null }
  assert.equal(stateOf({ ...trial, trialEndsAt: '2026-10-20T12:00:00Z' }), 'trial')
  assert.equal(stateOf({ ...trial, trialEndsAt: '2026-10-17T12:00:00Z' }), 'trial_expired')
  assert.equal(stateOf({ ...base, billingStatus: 'expired' }), 'trial_expired')
})

test('receita mensal recorrente conta só quem paga e divide o anual por 12', () => {
  assert.equal(monthlyEquivalentCents(base), 8_990)
  assert.equal(monthlyEquivalentCents({ ...base, largestPaidCents: 96_000 }), 8_000)
  assert.equal(monthlyEquivalentCents({ ...base, billingStatus: 'trial', subscriptionStatus: null, trialEndsAt: '2026-10-20T12:00:00Z' }), 0)
  assert.equal(monthlyEquivalentCents({ ...base, subscriptionStatus: 'canceled' }), 0)
})

// ───────── Acesso liberado à mão ─────────
const NOW = Date.parse('2026-10-24T12:00:00Z')
const iso = (value: string) => new Date(value).toISOString()
const trialCurrent: AccessCurrent = { billingStatus: 'trial', trialEndsAt: '2026-10-20T12:00:00.000Z', grantKind: null, grantUntil: null }

test('soma de meses no calendário não estoura o fim do mês', () => {
  assert.equal(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString(), '2026-02-28T10:00:00.000Z')
  assert.equal(addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString(), '2028-02-29T10:00:00.000Z')
  assert.equal(addMonths(new Date('2026-10-24T12:00:00Z'), 12).toISOString(), '2027-10-24T12:00:00.000Z')
  assert.equal(addMonths(new Date('2026-12-15T12:00:00Z'), 1).toISOString(), '2027-01-15T12:00:00.000Z')
})

test('+7 dias de teste: soma ao que resta, ou conta a partir de hoje se já venceu', () => {
  // venceu em 20/10: o novo prazo é 7 dias a partir de agora
  const expired = applyAccess('trial_plus_7', trialCurrent, NOW)
  assert.deepEqual(expired, { ok: true, billingStatus: 'trial', trialEndsAt: iso('2026-10-31T12:00:00Z'), grantKind: null, grantUntil: null })
  // ainda faltam 3 dias: soma 7 em cima do fim atual, sem perder os 3
  const running = applyAccess('trial_plus_7', { ...trialCurrent, trialEndsAt: '2026-10-27T12:00:00.000Z' }, NOW)
  assert.equal(running.ok && running.trialEndsAt, iso('2026-11-03T12:00:00Z'))
  // uma conta que já expirou como "expired" volta a ser teste
  const reopened = applyAccess('trial_plus_7', { ...trialCurrent, billingStatus: 'expired' }, NOW)
  assert.equal(reopened.ok && reopened.billingStatus, 'trial')
})

test('acesso mensal e anual somam ao que ainda resta; vitalício não tem fim', () => {
  const monthly = applyAccess('monthly', trialCurrent, NOW)
  assert.deepEqual(monthly, { ok: true, billingStatus: 'active', trialEndsAt: trialCurrent.trialEndsAt, grantKind: 'monthly', grantUntil: iso('2026-11-24T12:00:00Z') })
  const annual = applyAccess('annual', trialCurrent, NOW)
  assert.equal(annual.ok && annual.grantUntil, iso('2027-10-24T12:00:00Z'))
  // renovar antes do fim soma em cima da data atual (restam 5 dias, não perde nenhum)
  const renewed = applyAccess('monthly', { billingStatus: 'active', trialEndsAt: null, grantKind: 'monthly', grantUntil: iso('2026-10-29T12:00:00Z') }, NOW)
  assert.equal(renewed.ok && renewed.grantUntil, iso('2026-11-29T12:00:00Z'))
  // já vencido: conta a partir de hoje
  const lapsed = applyAccess('monthly', { billingStatus: 'active', trialEndsAt: null, grantKind: 'monthly', grantUntil: iso('2026-09-01T12:00:00Z') }, NOW)
  assert.equal(lapsed.ok && lapsed.grantUntil, iso('2026-11-24T12:00:00Z'))
  const lifetime = applyAccess('lifetime', trialCurrent, NOW)
  assert.deepEqual(lifetime, { ok: true, billingStatus: 'active', trialEndsAt: trialCurrent.trialEndsAt, grantKind: 'lifetime', grantUntil: null })
})

test('vitalício só muda se for revogado; revogar exige acesso liberado; +7 dias não vale com acesso ativo', () => {
  const life: AccessCurrent = { billingStatus: 'active', trialEndsAt: null, grantKind: 'lifetime', grantUntil: null }
  for (const action of ['monthly', 'annual', 'lifetime', 'trial_plus_7'] as const) assert.equal(applyAccess(action, life, NOW).ok, false, action)
  assert.deepEqual(applyAccess('revoke', life, NOW), { ok: true, billingStatus: 'expired', trialEndsAt: null, grantKind: null, grantUntil: null })
  assert.equal(applyAccess('revoke', trialCurrent, NOW).ok, false)
  const monthlyActive: AccessCurrent = { billingStatus: 'active', trialEndsAt: null, grantKind: 'monthly', grantUntil: iso('2026-11-02T12:00:00Z') }
  assert.equal(applyAccess('trial_plus_7', monthlyActive, NOW).ok, false)
  // acesso vencido não bloqueia: dá para voltar ao teste
  assert.equal(applyAccess('trial_plus_7', { ...monthlyActive, grantUntil: iso('2026-09-01T12:00:00Z') }, NOW).ok, true)
})

test('o acesso liberado vale mais que o status de cobrança e vence na data', () => {
  const grant = { billingStatus: 'active' as const, trialEndsAt: null, now: NOW }
  assert.equal(accessStateOf({ ...grant, grantKind: 'lifetime' }), 'active')
  assert.equal(accessStateOf({ ...grant, grantKind: 'monthly', grantUntil: iso('2026-10-25T12:00:00Z') }), 'active')
  assert.equal(accessStateOf({ ...grant, grantKind: 'monthly', grantUntil: iso('2026-10-24T11:59:59Z') }), 'expired')
  assert.equal(accessStateOf({ ...grant, grantKind: 'annual', grantUntil: null }), 'expired')
  // sem acesso liberado, tudo continua como era
  assert.equal(accessStateOf({ ...grant }), 'active')
  assert.equal(accessStateOf({ billingStatus: 'trial', trialEndsAt: iso('2026-10-30T12:00:00Z'), now: NOW }), 'trial')
  assert.equal(accessStateOf({ billingStatus: 'trial', trialEndsAt: iso('2026-10-20T12:00:00Z'), now: NOW }), 'expired')
  assert.equal(accessStateOf({ billingStatus: 'expired', trialEndsAt: null, now: NOW }), 'expired')
  assert.equal(grantIsActive('monthly', null, NOW), false)
})

test('painel: ciclo, situação e receita do acesso liberado', () => {
  const granted = { ...base, billingStatus: 'active' as const, subscriptionStatus: null, cycle: null, largestPaidCents: null, lastPaymentStatus: null, now: NOW }
  assert.equal(cycleOf({ ...granted, grantKind: 'lifetime' }), 'lifetime')
  assert.equal(cycleOf({ ...granted, grantKind: 'annual', grantUntil: iso('2027-01-01T00:00:00Z') }), 'annual')
  assert.equal(cycleOf({ ...granted, grantKind: 'monthly', grantUntil: iso('2026-12-01T00:00:00Z') }), 'monthly')
  assert.equal(stateOf({ ...granted, grantKind: 'lifetime' }), 'active')
  assert.equal(stateOf({ ...granted, grantKind: 'monthly', grantUntil: iso('2026-09-01T00:00:00Z') }), 'expired')
  // cancelou a assinatura paga e depois ganhou acesso: vale o acesso
  assert.equal(stateOf({ ...granted, subscriptionStatus: 'canceled', grantKind: 'lifetime' }), 'active')
  // cortesia não entra na receita recorrente
  assert.equal(monthlyEquivalentCents({ ...granted, grantKind: 'lifetime' }), 0)
  assert.equal(monthlyEquivalentCents({ ...base }), 8_990)
})

test('mudar o papel de alguém da equipe: regras de segurança', () => {
  const change = { actorId: 'a', targetId: 'b', currentRole: null as 'master' | 'traffic' | null, nextRole: 'traffic' as 'master' | 'traffic' | null, masterCount: 2 }
  assert.deepEqual(checkRoleChange(change), { ok: true })
  assert.deepEqual(checkRoleChange({ ...change, nextRole: 'master' }), { ok: true })
  assert.deepEqual(checkRoleChange({ ...change, currentRole: 'traffic', nextRole: 'master' }), { ok: true })
  assert.deepEqual(checkRoleChange({ ...change, currentRole: 'master', nextRole: null }), { ok: true })
  // sem mudança
  assert.equal(checkRoleChange({ ...change, currentRole: 'traffic' }).ok, false)
  // ninguém muda o próprio papel, nem para subir nem para descer
  assert.equal(checkRoleChange({ ...change, targetId: 'a', currentRole: 'master', nextRole: 'traffic' }).ok, false)
  assert.equal(checkRoleChange({ ...change, targetId: 'a', currentRole: 'traffic', nextRole: 'master' }).ok, false)
  // o último administrador não pode ser rebaixado por outro caminho
  assert.equal(checkRoleChange({ ...change, currentRole: 'master', nextRole: 'traffic', masterCount: 1 }).ok, false)
})
