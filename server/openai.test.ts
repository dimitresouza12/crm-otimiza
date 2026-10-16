import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { OpenAIError, transcribeAudio } from './openai.js'

// Servidor de mentira da OpenAI: devolve o status configurado para cada modelo pedido.
const withFakeOpenAI = async (answers: Record<string, { status: number; text?: string }>, run: (requested: string[]) => Promise<void>) => {
  const requested: string[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString('latin1')
    const model = /name="model"\r\n\r\n([^\r]+)/.exec(body)?.[1] ?? 'desconhecido'
    requested.push(model)
    const answer = answers[model] ?? { status: 500 }
    response.writeHead(answer.status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(answer.status === 200 ? { text: answer.text } : { error: { message: 'x' } }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const before = { key: process.env.OPENAI_API_KEY, base: process.env.OPENAI_BASE_URL, model: process.env.OPENAI_TRANSCRIBE_MODEL }
  process.env.OPENAI_API_KEY = 'sk-teste'
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  delete process.env.OPENAI_TRANSCRIBE_MODEL
  try { await run(requested) } finally {
    server.close()
    for (const [name, value] of [['OPENAI_API_KEY', before.key], ['OPENAI_BASE_URL', before.base], ['OPENAI_TRANSCRIBE_MODEL', before.model]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value
    }
  }
}

const audio = Buffer.from('audio-de-teste')

test('transcrição usa o modelo padrão quando ele responde', async () => {
  await withFakeOpenAI({ 'gpt-4o-mini-transcribe': { status: 200, text: ' quero ver o sistema ' } }, async (requested) => {
    assert.equal(await transcribeAudio(audio, 'audio/ogg; codecs=opus', 'a.ogg'), 'quero ver o sistema')
    assert.deepEqual(requested, ['gpt-4o-mini-transcribe'])
  })
})

test('modelo não liberado (403) cai para o whisper-1', async () => {
  await withFakeOpenAI({ 'gpt-4o-mini-transcribe': { status: 403 }, 'whisper-1': { status: 200, text: 'oi, tudo bem' } }, async (requested) => {
    assert.equal(await transcribeAudio(audio, 'audio/ogg', 'a.ogg'), 'oi, tudo bem')
    assert.deepEqual(requested, ['gpt-4o-mini-transcribe', 'whisper-1'])
  })
})

test('sem saldo (429) não tenta outro modelo e o erro mostra o status', async () => {
  await withFakeOpenAI({ 'gpt-4o-mini-transcribe': { status: 429 } }, async (requested) => {
    await assert.rejects(() => transcribeAudio(audio, 'audio/ogg', 'a.ogg'), (error) => error instanceof OpenAIError && error.status === 429)
    assert.deepEqual(requested, ['gpt-4o-mini-transcribe'])
  })
})

test('se os dois modelos recusam, o erro sobe', async () => {
  await withFakeOpenAI({ 'gpt-4o-mini-transcribe': { status: 403 }, 'whisper-1': { status: 403 } }, async () => {
    await assert.rejects(() => transcribeAudio(audio, 'audio/ogg', 'a.ogg'), (error) => error instanceof OpenAIError && error.status === 403)
  })
})

test('áudio sem fala (texto vazio) devolve null', async () => {
  await withFakeOpenAI({ 'gpt-4o-mini-transcribe': { status: 200, text: '   ' } }, async () => {
    assert.equal(await transcribeAudio(audio, 'audio/ogg', 'a.ogg'), null)
  })
})
