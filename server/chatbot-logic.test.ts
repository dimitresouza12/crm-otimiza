import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBotReply, containsKeyword, defaultBusinessHours, isWithinBusinessHours, splitKeywords, type BotRule, type BotSettings } from './chatbot-logic.js'

const settings: BotSettings = {
  is_active: true,
  welcome_message: 'Olá! Bem-vindo à Barbearia X 💈',
  fallback_message: 'Não entendi. Pergunte por preço, horário ou endereço.',
  off_hours_message: 'Estamos fechados agora. Respondemos amanhã a partir das 9h.',
  business_hours: { enabled: true, days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '19:00' },
  bot_mode: 'always',
  catalog: [{ name: 'Corte', price: 40, description: 'na tesoura ou máquina' }, { name: 'Barba', price: 30 }, { name: 'Combo corte + barba', price: 60 }],
  price_replies_enabled: true,
}
const rules: BotRule[] = [
  { id: 'r1', trigger_type: 'keyword', trigger_value: 'endereço, onde fica, localização', response_text: 'Rua das Flores, 100 - Centro.' },
  { id: 'r2', trigger_type: 'keyword', trigger_value: 'pix; cartão; pagamento', response_text: 'Aceitamos Pix, cartão e dinheiro.' },
]
// quarta-feira 14h em Fortaleza/São Paulo (UTC-3) e domingo 14h
const open = new Date('2026-10-07T17:00:00Z')
const sunday = new Date('2026-10-11T17:00:00Z')
const night = new Date('2026-10-07T01:00:00Z')

test('palavras-chave separadas por vírgula, sem acento e sem diferença de maiúsculas', () => {
  assert.deepEqual(splitKeywords('Endereço, onde fica; LOCALIZAÇÃO\npix'), ['endereco', 'onde fica', 'localizacao', 'pix'])
  assert.equal(chooseBotReply({ settings, rules, text: 'Qual o ENDERECO?', isFirstMessage: false, now: open })?.ruleId, 'r1')
  assert.equal(chooseBotReply({ settings, rules, text: 'vocês aceitam cartao?', isFirstMessage: false, now: open })?.ruleId, 'r2')
})

test('palavra curta só vale como palavra inteira', () => {
  assert.equal(containsKeyword('doido', 'oi'), false)
  assert.equal(containsKeyword('oi, tudo bem', 'oi'), true)
  assert.equal(containsKeyword('quero um preco', 'preco'), true)
})

test('pergunta de preço lista o catálogo com valores formatados', () => {
  const reply = chooseBotReply({ settings, rules, text: 'Qual o preço?', isFirstMessage: false, now: open })
  assert.equal(reply?.source, 'price')
  assert.match(reply?.text ?? '', /Corte: R\$ 40,00 — na tesoura ou máquina/)
  assert.match(reply?.text ?? '', /Barba: R\$ 30,00/)
})

test('citar um item responde só o preço dele', () => {
  const reply = chooseBotReply({ settings, rules, text: 'quanto custa a barba?', isFirstMessage: false, now: open })
  assert.equal(reply?.text, '• Barba: R$ 30,00')
})

test('primeira mensagem recebe as boas-vindas; depois cai na resposta padrão', () => {
  assert.equal(chooseBotReply({ settings, rules, text: 'oi', isFirstMessage: true, now: open })?.source, 'welcome')
  assert.equal(chooseBotReply({ settings, rules, text: 'blá', isFirstMessage: false, now: open })?.source, 'fallback')
})

test('assunto ou preço na primeira mensagem tem prioridade sobre as boas-vindas', () => {
  assert.equal(chooseBotReply({ settings, rules, text: 'oi, qual o endereço?', isFirstMessage: true, now: open })?.ruleId, 'r1')
})

test('fora do horário de atendimento usa a mensagem de fechado', () => {
  assert.equal(isWithinBusinessHours(settings.business_hours, open), true)
  assert.equal(isWithinBusinessHours(settings.business_hours, sunday), false)
  assert.equal(isWithinBusinessHours(settings.business_hours, night), false)
  assert.equal(chooseBotReply({ settings, rules, text: 'oi', isFirstMessage: true, now: sunday })?.source, 'off_hours')
  assert.equal(chooseBotReply({ settings, rules, text: 'blá', isFirstMessage: false, now: night })?.source, 'off_hours')
  assert.equal(chooseBotReply({ settings, rules, text: 'qual o endereço?', isFirstMessage: false, now: night })?.source, 'keyword')
})

test('modo "só fora do horário" deixa o bot calado durante o expediente', () => {
  const quiet = { ...settings, bot_mode: 'outside_hours' as const }
  assert.equal(chooseBotReply({ settings: quiet, rules, text: 'oi', isFirstMessage: true, now: open }), null)
  assert.equal(chooseBotReply({ settings: quiet, rules, text: 'oi', isFirstMessage: true, now: sunday })?.source, 'off_hours')
})

test('sem horário configurado o bot está sempre disponível', () => {
  const always = { ...settings, business_hours: defaultBusinessHours, off_hours_message: 'x' }
  assert.equal(isWithinBusinessHours(always.business_hours, sunday), true)
  assert.equal(chooseBotReply({ settings: always, rules, text: 'blá', isFirstMessage: false, now: sunday })?.source, 'fallback')
})

test('regras antigas de primeira mensagem continuam valendo como boas-vindas', () => {
  const legacy = { ...settings, welcome_message: null }
  const legacyRules: BotRule[] = [{ id: 'old', trigger_type: 'first_message', trigger_value: null, response_text: 'Olá, antigo!' }]
  assert.equal(chooseBotReply({ settings: legacy, rules: legacyRules, text: 'oi', isFirstMessage: true, now: open })?.text, 'Olá, antigo!')
})

test('sem nada configurado o bot fica em silêncio', () => {
  const empty = { ...settings, welcome_message: null, fallback_message: null, off_hours_message: null, catalog: [] }
  assert.equal(chooseBotReply({ settings: empty, rules: [], text: 'oi', isFirstMessage: true, now: open }), null)
})

test('uma palavra do nome do item basta para achar o preço', () => {
  const reply = chooseBotReply({ settings, rules, text: 'vocês têm algum combo?', isFirstMessage: false, now: open })
  assert.equal(reply?.source, 'price')
  assert.equal(reply?.text, '• Combo corte + barba: R$ 60,00')
})

test('nome inteiro do item tem prioridade sobre palavra solta', () => {
  assert.equal(chooseBotReply({ settings, rules, text: 'quanto é o corte?', isFirstMessage: false, now: open })?.text, '• Corte: R$ 40,00 — na tesoura ou máquina')
})

test('entre dois assuntos vence o de palavra mais específica', () => {
  const topics: BotRule[] = [
    { id: 'hours', trigger_type: 'keyword', trigger_value: 'horário, funcionamento', response_text: 'Abrimos às 9h.' },
    { id: 'booking', trigger_type: 'keyword', trigger_value: 'agendar, horário disponível', response_text: 'Vamos agendar!' },
  ]
  assert.equal(chooseBotReply({ settings, rules: topics, text: 'tem horário disponível sexta?', isFirstMessage: false, now: open })?.ruleId, 'booking')
  assert.equal(chooseBotReply({ settings, rules: topics, text: 'qual o horário?', isFirstMessage: false, now: open })?.ruleId, 'hours')
})
