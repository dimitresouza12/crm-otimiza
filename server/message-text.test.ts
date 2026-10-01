import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickText } from './message-text.js'

test('ignora campos opcionais ausentes e extrai mensagem recebida', () => {
  assert.equal(pickText(undefined), null)
  assert.equal(pickText({}), null)
  assert.equal(pickText({ ephemeralMessage: { message: { extendedTextMessage: { text: '  Quero um orçamento  ' } } } }), 'Quero um orçamento')
  assert.equal(pickText({ imageMessage: { caption: 'Foto do comprovante' } }), 'Foto do comprovante')
})
