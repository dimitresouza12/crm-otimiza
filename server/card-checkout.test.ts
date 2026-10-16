import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { AsaasError } from './asaas.js'
import { tokenizeCard } from './card-checkout.js'

const originalFetch = globalThis.fetch
const originalKey = process.env.ASAAS_API_KEY

after(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.ASAAS_API_KEY
  else process.env.ASAAS_API_KEY = originalKey
})

const card = { holderName: 'Maria Cliente', number: '4111 1111 1111 1111', expiryMonth: '12', expiryYear: '2030', ccv: '123' }
const holder = { name: 'Maria Cliente', email: 'maria@teste.com', cpfCnpj: '12345678909', phone: '85999990000', postalCode: '60000000', addressNumber: '100' }
const PAN = '4111111111111111'

test('tokeniza o cartão e devolve só token, bandeira e últimos 4 dígitos', async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  let sentBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    sentBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    return Response.json({ creditCardToken: 'token-abc', creditCardBrand: 'VISA', creditCardNumber: '1111' })
  }

  const result = await tokenizeCard('cus_1', card, holder, '203.0.113.5')
  assert.deepEqual(result, { token: 'token-abc', brand: 'VISA', last4: '1111' })

  // O PAN precisa chegar ao Asaas sem máscara, mas nunca sair deste módulo em texto plano além da chamada de rede em si.
  assert.equal((sentBody?.creditCard as Record<string, unknown>)?.number, PAN)
  assert.equal(JSON.stringify(result).includes(PAN), false)
})

test('quando o Asaas recusa o cartão, o erro não contém o PAN nem o CVV', async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  globalThis.fetch = async () => Response.json({ errors: [{ description: 'Cartão de crédito inválido.' }] }, { status: 400 })

  await assert.rejects(
    tokenizeCard('cus_1', card, holder, '203.0.113.5'),
    (error: unknown) => {
      assert.ok(error instanceof AsaasError)
      assert.equal(error.message, 'Cartão de crédito inválido.')
      const serialized = JSON.stringify({ message: error.message, stack: error.stack })
      assert.equal(serialized.includes(PAN), false)
      assert.equal(serialized.includes(card.ccv), false)
      return true
    },
  )
})

test('sem token na resposta do Asaas, falha de forma segura sem expor o cartão', async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  globalThis.fetch = async () => Response.json({})
  await assert.rejects(tokenizeCard('cus_1', card, holder, '203.0.113.5'), /não retornou o token/)
})
