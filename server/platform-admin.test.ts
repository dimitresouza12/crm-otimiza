import assert from 'node:assert/strict'
import test from 'node:test'
import { cycleOf, monthlyEquivalentCents, platformAccess, stateOf, type SubscriptionFacts } from './platform-admin.js'

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
