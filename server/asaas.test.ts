import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import {
  asaasBillingType,
  billingEffectFor,
  cancelSubscription,
  createCustomer,
  createPayment,
  createSubscription,
  firstPaymentFor,
  fetchPayment,
  isRecurring,
  pixQrCode,
  updateSubscriptionCard,
  AsaasError,
} from './asaas.js'

const originalFetch = globalThis.fetch
const originalKey = process.env.ASAAS_API_KEY
const originalUrl = process.env.ASAAS_API_URL

after(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.ASAAS_API_KEY
  else process.env.ASAAS_API_KEY = originalKey
  if (originalUrl === undefined) delete process.env.ASAAS_API_URL
  else process.env.ASAAS_API_URL = originalUrl
})

test('asaasBillingType mapeia os quatro métodos de pagamento', () => {
  assert.equal(asaasBillingType('pix'), 'PIX')
  assert.equal(asaasBillingType('boleto'), 'BOLETO')
  assert.equal(asaasBillingType('card'), 'CREDIT_CARD')
  assert.equal(asaasBillingType('card_recurring'), 'CREDIT_CARD')
})

test('isRecurring: só o cartão avulso não é recorrente', () => {
  assert.equal(isRecurring('pix'), true)
  assert.equal(isRecurring('boleto'), true)
  assert.equal(isRecurring('card'), false)
  assert.equal(isRecurring('card_recurring'), true)
})

test('billingEffectFor classifica os eventos de webhook do Asaas', () => {
  assert.equal(billingEffectFor('PAYMENT_CONFIRMED'), 'activate')
  assert.equal(billingEffectFor('PAYMENT_RECEIVED'), 'activate')
  assert.equal(billingEffectFor('PAYMENT_OVERDUE'), 'suspend')
  assert.equal(billingEffectFor('PAYMENT_DELETED'), 'suspend')
  assert.equal(billingEffectFor('PAYMENT_REFUNDED'), 'suspend')
  assert.equal(billingEffectFor('PAYMENT_CHARGEBACK_REQUESTED'), 'suspend')
  assert.equal(billingEffectFor('PAYMENT_REVERSED'), 'suspend')
  assert.equal(billingEffectFor('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'), 'refused')
  assert.equal(billingEffectFor('PAYMENT_CREATED'), 'ignore')
  assert.equal(billingEffectFor('ALGO_DESCONHECIDO_NO_FUTURO'), 'ignore')
})

test('cria cliente, assinatura e cobrança avulsa com os cabeçalhos e corpo certos', async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ASAAS_API_URL = 'https://asaas.test/v3'
  const calls: Array<{ url: string; method: string; accessToken: string; body: Record<string, unknown> | null }> = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({ url, method: init?.method ?? 'GET', accessToken: headers.get('access_token') ?? '', body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null })
    if (url.endsWith('/customers')) return Response.json({ id: 'cus_1' })
    if (url.endsWith('/subscriptions')) return Response.json({ id: 'sub_1', status: 'ACTIVE' })
    if (url.endsWith('/payments')) return Response.json({ id: 'pay_1', status: 'PENDING', value: 89.9, invoiceUrl: 'https://asaas.test/i/pay_1', dueDate: '2026-10-20', billingType: 'PIX', subscription: null })
    if (url.includes('/payments?subscription=sub_1')) return Response.json({ data: [{ id: 'pay_2', status: 'PENDING', value: 89.9, dueDate: '2026-10-16' }] })
    if (url.endsWith('/payments/pay_1')) return Response.json({ id: 'pay_1', status: 'RECEIVED', value: 89.9 })
    if (url.endsWith('/payments/pay_1/pixQrCode')) return Response.json({ payload: '00020126-copia-e-cola', encodedImage: 'base64-png', expirationDate: '2026-10-17T00:00:00Z' })
    if (url.endsWith('/subscriptions/sub_1') && init?.method === 'DELETE') return Response.json({ deleted: true })
    if (url.endsWith('/subscriptions/sub_1') && init?.method === 'PUT') return Response.json({ id: 'sub_1', status: 'ACTIVE' })
    return Response.json({})
  }

  const customer = await createCustomer({ name: 'Maria Cliente', email: 'maria@teste.com', cpfCnpj: '123.456.789-09', phone: '(85) 99999-0000', postalCode: '60000-000', addressNumber: '100' }, 'empresa-1')
  assert.deepEqual(customer, { id: 'cus_1' })
  assert.deepEqual(calls[0].body, {
    name: 'Maria Cliente', email: 'maria@teste.com', cpfCnpj: '12345678909', mobilePhone: '85999990000',
    postalCode: '60000000', addressNumber: '100', externalReference: 'empresa-1',
  })
  assert.equal(calls[0].accessToken, 'chave-de-teste')

  // Pix e boleto: CEP e número vazios não vão para o Asaas (o cadastro do cliente aceita sem endereço)
  await createCustomer({ name: 'Maria Cliente', email: 'maria@teste.com', cpfCnpj: '12345678909', phone: '85999990000', postalCode: '', addressNumber: '' }, 'empresa-2')
  assert.deepEqual(calls[calls.length - 1].body, { name: 'Maria Cliente', email: 'maria@teste.com', cpfCnpj: '12345678909', mobilePhone: '85999990000', externalReference: 'empresa-2' })
  calls.pop()

  const subscription = await createSubscription({ customerId: 'cus_1', billingType: 'PIX', valueCents: 8_990, description: 'Otimiza CRM', externalReference: 'empresa-1' })
  assert.deepEqual(subscription, { id: 'sub_1', status: 'ACTIVE' })
  assert.equal(calls[1].body?.cycle, 'MONTHLY')
  assert.equal(calls[1].body?.value, 89.9)

  const payment = await createPayment({ customerId: 'cus_1', billingType: 'PIX', valueCents: 8_990, description: 'Otimiza CRM', externalReference: 'empresa-1' })
  assert.equal(payment.id, 'pay_1')
  assert.equal(payment.valueCents, 8_990)

  const first = await firstPaymentFor('sub_1')
  assert.equal(first.id, 'pay_2')

  const fetched = await fetchPayment('pay_1')
  assert.equal(fetched.status, 'RECEIVED')

  const qr = await pixQrCode('pay_1')
  assert.deepEqual(qr, { payload: '00020126-copia-e-cola', encodedImage: 'data:image/png;base64,base64-png', expirationDate: '2026-10-17T00:00:00Z' })

  await updateSubscriptionCard('sub_1', 'token-novo')
  assert.equal(calls.at(-1)?.method, 'PUT')
  assert.deepEqual(calls.at(-1)?.body, { creditCardToken: 'token-novo' })

  await cancelSubscription('sub_1')
  assert.equal(calls.at(-1)?.method, 'DELETE')
})

test('erro do Asaas chega com a descrição amigável, sem embutir o payload enviado', async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  globalThis.fetch = async () => Response.json({ errors: [{ description: 'Valor inválido para a cobrança.' }] }, { status: 400 })
  await assert.rejects(
    createPayment({ customerId: 'cus_1', billingType: 'PIX', valueCents: 100, description: 'x', externalReference: 'y' }),
    (error: unknown) => {
      assert.ok(error instanceof AsaasError)
      assert.equal(error.status, 400)
      assert.equal(error.message, 'Valor inválido para a cobrança.')
      assert.ok(!JSON.stringify(error).includes('cus_1'))
      return true
    },
  )
})

test('sem ASAAS_API_KEY configurada, qualquer chamada falha com 503 em vez de tentar a rede', async () => {
  delete process.env.ASAAS_API_KEY
  let fetchCalled = false
  globalThis.fetch = async () => { fetchCalled = true; return Response.json({}) }
  await assert.rejects(fetchPayment('pay_1'), /Asaas ainda não foi configurado/)
  assert.equal(fetchCalled, false)
})
