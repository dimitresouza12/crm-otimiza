import assert from 'node:assert/strict'
import test from 'node:test'
import { availableAtFor, balanceOf, canRequestPayout, commissionEffectFor, commissionFor, isValidCode, isValidNickname, maskCompanyName, maskPixKey, normalizePixKey, rankingOf, slugifyCode, statusAfterCancel, type CommissionRow } from './affiliates.js'

const NOW = Date.parse('2026-10-28T12:00:00Z')
const iso = (value: string) => new Date(value).toISOString()

test('comissão é 50% de uma mensalidade, mesmo se o cliente pagar o ano à vista', () => {
  assert.equal(commissionFor(17_990, 17_990), 8_995)
  assert.equal(commissionFor(8_990, 8_990), 4_495)
  // pagou o ano (12 mensalidades): continua 50% de UMA
  assert.equal(commissionFor(17_990, 17_990 * 12), 8_995)
  // pagou menos que a mensalidade (desconto): 50% do que foi pago
  assert.equal(commissionFor(17_990, 10_000), 5_000)
  // arredondamento em centavos
  assert.equal(commissionFor(8_991, 8_991), 4_496)
  // cortesia (preço 0) e valor zero não geram comissão
  assert.equal(commissionFor(0, 17_990), 0)
  assert.equal(commissionFor(17_990, 0), 0)
})

test('carência de 30 dias: pendente vira disponível pela data', () => {
  assert.equal(availableAtFor(new Date('2026-10-01T10:00:00Z')).toISOString(), '2026-10-31T10:00:00.000Z')
  const rows: CommissionRow[] = [
    { amount_cents: 8_995, status: 'pending', available_at: iso('2026-10-20T12:00:00Z') },   // já passou: disponível
    { amount_cents: 4_495, status: 'pending', available_at: iso('2026-11-10T12:00:00Z') },   // ainda a liberar
    { amount_cents: 8_995, status: 'pending', available_at: iso('2026-11-20T12:00:00Z') },   // a liberar, mais tarde
    { amount_cents: 1_000, status: 'requested', available_at: iso('2026-10-01T12:00:00Z') },
    { amount_cents: 2_000, status: 'paid', available_at: iso('2026-09-01T12:00:00Z') },
    { amount_cents: 9_999, status: 'canceled', available_at: iso('2026-09-01T12:00:00Z') },
    { amount_cents: 7_777, status: 'reversed_after_payout', available_at: iso('2026-09-01T12:00:00Z') },
  ]
  assert.deepEqual(balanceOf(rows, NOW), { availableCents: 8_995, pendingCents: 13_490, requestedCents: 1_000, paidCents: 2_000, nextReleaseAt: iso('2026-11-10T12:00:00Z') })
  // no instante exato da liberação já conta como disponível
  assert.equal(balanceOf([{ amount_cents: 500, status: 'pending', available_at: iso('2026-10-28T12:00:00Z') }], NOW).availableCents, 500)
  assert.deepEqual(balanceOf([], NOW), { availableCents: 0, pendingCents: 0, requestedCents: 0, paidCents: 0, nextReleaseAt: null })
})

test('estorno, chargeback, remoção e reversão desfazem a comissão; atraso não', () => {
  for (const event of ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_REVERSED', 'PAYMENT_DELETED']) assert.equal(commissionEffectFor(event), 'cancel', event)
  for (const event of ['PAYMENT_OVERDUE', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_CREATED', 'ALGO_NOVO']) assert.equal(commissionEffectFor(event), 'none', event)
  assert.equal(statusAfterCancel('pending'), 'canceled')
  // já em saque ou paga: vira "estornada após o saque" para a equipe decidir, não some
  assert.equal(statusAfterCancel('requested'), 'reversed_after_payout')
  assert.equal(statusAfterCancel('paid'), 'reversed_after_payout')
  assert.equal(statusAfterCancel('canceled'), 'canceled')
})

test('pedido de saque: precisa de saldo, de chave Pix e de nenhum pedido aberto', () => {
  const ok = { availableCents: 8_995, hasPixKey: true, hasOpenPayout: false, blocked: false }
  assert.deepEqual(canRequestPayout(ok), { ok: true })
  assert.equal(canRequestPayout({ ...ok, availableCents: 0 }).ok, false)
  assert.equal(canRequestPayout({ ...ok, hasPixKey: false }).ok, false)
  assert.equal(canRequestPayout({ ...ok, hasOpenPayout: true }).ok, false)
  assert.equal(canRequestPayout({ ...ok, blocked: true }).ok, false)
})

test('código do link e apelido', () => {
  assert.equal(slugifyCode('João Silva!'), 'joaosilva')
  assert.equal(slugifyCode('a'.repeat(40)).length, 20)
  for (const code of ['joao10', 'abc', 'vendas2026']) assert.equal(isValidCode(code), true, code)
  for (const code of ['ab', 'admin', 'api', 'a b', 'João', 'x'.repeat(25)]) assert.equal(isValidCode(code), false, code)
  assert.equal(isValidNickname('João Silva'), true)
  assert.equal(isValidNickname('ab'), false)
  assert.equal(isValidNickname('<script>'), false)
})

test('o afiliado vê o nome da empresa indicada mascarado', () => {
  assert.equal(maskCompanyName('Barbearia Morada Nova'), 'Ba*** Mo***')
  assert.equal(maskCompanyName('Loja'), 'Lo***')
  assert.equal(maskCompanyName('  '), '***')
  assert.equal(maskCompanyName('55.512.725 FRANCISCO VINICIOS'), '55*** FR***')
})

test('chave Pix: valida e normaliza por tipo', () => {
  assert.deepEqual(normalizePixKey('cpf', '091.774.653-85'), { ok: true, value: '09177465385' })
  assert.equal(normalizePixKey('cpf', '123').ok, false)
  assert.deepEqual(normalizePixKey('cnpj', '55.512.725/0001-00'), { ok: true, value: '55512725000100' })
  assert.deepEqual(normalizePixKey('phone', '(88) 99369-9357'), { ok: true, value: '+5588993699357' })
  assert.deepEqual(normalizePixKey('phone', '+55 88 99369-9357'), { ok: true, value: '+5588993699357' })
  assert.equal(normalizePixKey('phone', '99999').ok, false)
  assert.deepEqual(normalizePixKey('email', ' Pessoa@Exemplo.com '), { ok: true, value: 'pessoa@exemplo.com' })
  assert.equal(normalizePixKey('email', 'sem-arroba').ok, false)
  assert.equal(normalizePixKey('random', '123e4567-e89b-12d3-a456-426614174000').ok, true)
  assert.equal(normalizePixKey('random', 'qualquer coisa').ok, false)
  assert.equal(maskPixKey('cpf', '09177465385'), '***5385')
  assert.equal(maskPixKey('email', 'pessoa@exemplo.com'), 'pe***@exemplo.com')
})

test('ranking: mais vendas primeiro, desempate pelo valor, sem vendas não entra', () => {
  const rows = [
    { affiliateId: 'a', nickname: 'Ana', sales: 3, amountCents: 26_985 },
    { affiliateId: 'b', nickname: 'Bia', sales: 5, amountCents: 40_000 },
    { affiliateId: 'c', nickname: 'Caio', sales: 3, amountCents: 30_000 },
    { affiliateId: 'd', nickname: 'Davi', sales: 0, amountCents: 0 },
  ]
  const ranking = rankingOf(rows, 'a')
  assert.deepEqual(ranking.top.map((entry) => `${entry.position}:${entry.nickname}`), ['1:Bia', '2:Caio', '3:Ana'])
  assert.equal(ranking.me?.position, 3)
  assert.equal(ranking.top.find((entry) => entry.nickname === 'Ana')?.isMe, true)
  // fora do top: o afiliado ainda sabe a própria posição
  const many = Array.from({ length: 12 }, (_, index) => ({ affiliateId: `x${index}`, nickname: `P${index}`, sales: 20 - index, amountCents: 1 }))
  const outside = rankingOf(many, 'x11', 10)
  assert.equal(outside.top.length, 10)
  assert.equal(outside.me?.position, 12)
  assert.equal(rankingOf(rows, 'd').me, null)
})
