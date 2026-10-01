import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createEvolutionInstance, evolutionQr, evolutionSendText, evolutionState, setEvolutionWebhook } from './evolution.js'

const originalFetch = globalThis.fetch
const originalUrl = process.env.EVOLUTION_API_URL
const originalKey = process.env.EVOLUTION_API_KEY

after(() => {
  globalThis.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.EVOLUTION_API_URL
  else process.env.EVOLUTION_API_URL = originalUrl
  if (originalKey === undefined) delete process.env.EVOLUTION_API_KEY
  else process.env.EVOLUTION_API_KEY = originalKey
})

test('cria instância isolada, configura eventos, gera QR local e consulta estado', async () => {
  process.env.EVOLUTION_API_URL = 'https://evolution.test'
  process.env.EVOLUTION_API_KEY = 'global-test-key'
  const calls: Array<{ url: string; method: string; apikey: string; body: Record<string, unknown> | null }> = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({ url, method: init?.method ?? 'GET', apikey: headers.get('apikey') ?? '', body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null })
    if (url.endsWith('/instance/connectionState/canal-1')) return Response.json({ instance: { state: 'open' } })
    if (url.endsWith('/instance/connect/canal-1')) return Response.json({ code: '2@codigo-de-pareamento' })
    return Response.json({ ok: true })
  }

  await createEvolutionInstance('canal-1', 'token-do-canal')
  await setEvolutionWebhook('canal-1', 'token-do-canal', 'https://crm.test/webhooks/evolution/id?secret=segredo')
  assert.equal(await evolutionState('canal-1', 'token-do-canal'), 'open')
  assert.match(await evolutionQr('canal-1', 'token-do-canal'), /^data:image\/png;base64,/)
  await evolutionSendText('canal-1', 'token-do-canal', '5585999999999', 'Olá')

  assert.equal(calls[0].apikey, 'global-test-key')
  assert.deepEqual(calls[0].body, { instanceName: 'canal-1', integration: 'WHATSAPP-BAILEYS', token: 'token-do-canal', qrcode: true })
  assert.equal(calls[1].apikey, 'token-do-canal')
  assert.deepEqual((calls[1].body?.webhook as Record<string, unknown>)?.events, ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'])
  assert.deepEqual(calls[4].body, { number: '5585999999999', text: 'Olá' })
})
