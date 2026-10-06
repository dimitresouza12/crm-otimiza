import assert from 'node:assert/strict'
import { test } from 'node:test'
import { foldText, pickText } from './message-text.js'

test('ignora campos opcionais ausentes e extrai mensagem recebida', () => {
  assert.equal(pickText(undefined), null)
  assert.equal(pickText({}), null)
  assert.equal(pickText({ ephemeralMessage: { message: { extendedTextMessage: { text: '  Quero um orçamento  ' } } } }), 'Quero um orçamento')
  assert.equal(pickText({ imageMessage: { caption: 'Foto do comprovante' } }), 'Foto do comprovante')
})

test("palavra-chave ignora acento, maiusculas e espacos extras", () => {
  assert.equal(foldText("  PREÇO   do Corte "), "preco do corte")
  assert.ok(foldText("Qual o preco?").includes(foldText("preço")))
  assert.ok(foldText("Que HORARIO vocês abrem?").includes(foldText("horário")))
  assert.ok(foldText("Quero AGENDAR").includes(foldText("agendar")))
})
