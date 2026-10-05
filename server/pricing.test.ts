import assert from 'node:assert/strict'
import test from 'node:test'
import { calculatePlanPrice } from './pricing.js'

test('calcula o plano CRM para 1, 3 e 5 números', () => {
  assert.equal(calculatePlanPrice('crm', 1), 8_990)
  assert.equal(calculatePlanPrice('crm', 3), 14_970)
  assert.equal(calculatePlanPrice('crm', 5), 20_950)
})

test('calcula o plano Chatbot para 1, 3 e 5 números', () => {
  assert.equal(calculatePlanPrice('chatbot', 1), 17_990)
  assert.equal(calculatePlanPrice('chatbot', 3), 25_970)
  assert.equal(calculatePlanPrice('chatbot', 5), 33_950)
})

test('rejeita limites de número fora da oferta', () => {
  assert.throws(() => calculatePlanPrice('crm', 0), /CHANNEL_LIMIT_INVALID/)
  assert.throws(() => calculatePlanPrice('chatbot', 6), /CHANNEL_LIMIT_INVALID/)
})
