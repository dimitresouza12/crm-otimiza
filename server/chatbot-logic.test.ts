import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBotReply, containsKeyword, defaultBusinessHours, detectMeetingRequest, humanReply, internationalPhone, isWithinBusinessHours, periodsOf, samePhone, scheduleReplies, splitKeywords, wantsHuman, whatsappLink, type BotLocation, type BotRule, type BotSettings } from './chatbot-logic.js'

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

test('perguntar pelos serviços ou produtos mostra o catálogo, mesmo sem falar em preço', () => {
  for (const text of ['queria saber sobre seus serviços', 'quais produtos vocês têm?', 'me manda o cardápio', 'o que vocês fazem?']) {
    const reply = chooseBotReply({ settings, rules, text, isFirstMessage: false, now: open })
    assert.equal(reply?.source, 'price', text)
    assert.match(reply?.text ?? '', /^O que oferecemos:\n• Corte: R\$ 40,00/, text)
  }
  assert.equal(chooseBotReply({ settings: { ...settings, price_replies_enabled: false }, rules, text: 'quais serviços?', isFirstMessage: false, now: open })?.source, 'fallback')
  assert.equal(chooseBotReply({ settings: { ...settings, catalog: [] }, rules, text: 'quais serviços?', isFirstMessage: false, now: open })?.source, 'fallback')
})

test('item sem preço também é respondido, com nome e detalhe', () => {
  const withService: BotSettings = { ...settings, catalog: [...settings.catalog, { name: 'Consultoria jurídica', price: null, description: 'Análise do seu caso e orientação. Valor sob consulta.' }] }
  const asked = chooseBotReply({ settings: withService, rules, text: 'como funciona a consultoria?', isFirstMessage: false, now: open })
  assert.equal(asked?.source, 'price')
  assert.equal(asked?.text, '• Consultoria jurídica — Análise do seu caso e orientação. Valor sob consulta.')
  const listed = chooseBotReply({ settings: withService, rules, text: 'quais serviços vocês têm?', isFirstMessage: false, now: open })
  assert.match(listed?.text ?? '', /^O que oferecemos:\n• Corte: R\$ 40,00/)
  assert.match(listed?.text ?? '', /• Consultoria jurídica — Análise/)
  const priceList = chooseBotReply({ settings: withService, rules, text: 'quanto custa?', isFirstMessage: false, now: open })
  assert.doesNotMatch(priceList?.text ?? '', /Consultoria/)
})

test('só itens sem preço: perguntar o valor não inventa lista de valores', () => {
  const onlyService: BotSettings = { ...settings, catalog: [{ name: 'Consultoria', price: null, description: 'Sob consulta' }] }
  assert.equal(chooseBotReply({ settings: onlyService, rules, text: 'quanto custa?', isFirstMessage: false, now: open })?.source, 'fallback')
  assert.equal(chooseBotReply({ settings: onlyService, rules, text: 'fale da consultoria', isFirstMessage: false, now: open })?.text, '• Consultoria — Sob consulta')
})

test('cumprimento no meio da conversa recebe as boas-vindas, não o "não entendi"', () => {
  for (const text of ['boa tarde', 'Boa tarde!', 'Bom dia, tudo bem?', 'oii', 'Olá', 'e aí, tudo bem']) {
    assert.equal(chooseBotReply({ settings, rules, text, isFirstMessage: false, now: open })?.source, 'welcome', text)
  }
  // frases com conteúdo continuam seguindo as regras normais
  assert.equal(chooseBotReply({ settings, rules, text: 'boa tarde, qual o endereço?', isFirstMessage: false, now: open })?.ruleId, 'r1')
  assert.equal(chooseBotReply({ settings, rules, text: 'boa tarde, queria falar com alguém', isFirstMessage: false, now: open })?.source, 'human')
  assert.equal(chooseBotReply({ settings, rules, text: 'boa tarde, tenho uma dúvida complicada', isFirstMessage: false, now: open })?.source, 'fallback')
  assert.equal(chooseBotReply({ settings, rules, text: 'bem', isFirstMessage: false, now: open })?.source, 'fallback')
  // fora do horário, o cumprimento recebe a mensagem de fechado
  assert.equal(chooseBotReply({ settings, rules, text: 'boa noite', isFirstMessage: false, now: sunday })?.source, 'off_hours')
  // sem boas-vindas configuradas, nada muda
  assert.equal(chooseBotReply({ settings: { ...settings, welcome_message: null }, rules, text: 'boa tarde', isFirstMessage: false, now: open })?.source, 'fallback')
})

test('pedido de reunião ou horário é reconhecido e recebe resposta própria', () => {
  assert.deepEqual(detectMeetingRequest('hoje as 16h da tarde'), { kind: 'schedule', when: 'hoje as 16h da tarde' })
  assert.deepEqual(detectMeetingRequest('Amanhã de manhã'), { kind: 'schedule', when: 'Amanhã de manhã' })
  assert.deepEqual(detectMeetingRequest('pode ser às 15:30?'), { kind: 'schedule', when: 'às 15:30' })
  // só o trecho de dia e hora, com o acento e a caixa que o cliente usou
  assert.equal(detectMeetingRequest('Podemos marcar uma reunião AMANHÃ de manhã? Obrigado!')?.when, 'AMANHÃ de manhã')
  assert.equal(detectMeetingRequest('na sexta, lá pelas 14h, pode ser?')?.when, 'sexta, lá pelas 14h')
  // citações espalhadas pela frase viram uma lista curta, sem copiar o texto todo
  assert.equal(detectMeetingRequest('sexta de manhã ou então hoje, bem cedo, antes das 9h')?.when, 'sexta · manhã · 9h')
  assert.deepEqual(detectMeetingRequest('quero marcar uma reunião'), { kind: 'intent', when: null })
  assert.equal(detectMeetingRequest('pode me mostrar o sistema de advocacia')?.kind, 'intent')
  assert.equal(detectMeetingRequest('queria uma demonstração')?.kind, 'intent')
  for (const text of ['tem promoção hoje?', 'boa tarde', 'qual o endereço?', 'quanto custa?', 'obrigado']) assert.equal(detectMeetingRequest(text), null, text)

  const ask = (text: string) => chooseBotReply({ settings, rules, text, isFirstMessage: false, now: open })
  assert.deepEqual(ask('hoje as 16h da tarde'), { text: scheduleReplies.schedule, source: 'schedule' })
  assert.deepEqual(ask('quero marcar uma reunião'), { text: scheduleReplies.intent, source: 'schedule' })
  // um assunto cadastrado pelo cliente do CRM vence a resposta pronta
  const own: BotRule[] = [...rules, { id: 'r3', trigger_type: 'keyword', trigger_value: 'reunião, agendar', response_text: 'Nossa agenda: seg a sex, 9h às 18h.' }]
  assert.equal(chooseBotReply({ settings, rules: own, text: 'quero marcar uma reunião', isFirstMessage: false, now: open })?.ruleId, 'r3')
  // "quanto custa o corte hoje?" continua sendo pergunta de preço
  assert.equal(ask('quanto custa o corte hoje?')?.source, 'price')
})

test('"queria uma reunião amanhã 9h" não cai no assunto de horário de funcionamento', () => {
  const hoursRule: BotRule = { id: 'h1', trigger_type: 'keyword', trigger_value: 'horário, horas, que horas, funcionamento, abre, fecha', response_text: 'Atendemos de segunda a sexta, das 9h às 18h.' }
  const withHours = [...rules, hoursRule]
  const ask = (text: string) => chooseBotReply({ settings, rules: withHours, text, isFirstMessage: false, now: open })
  for (const text of ['queria uma reunião amanhã 9h', 'Queria uma reunião amanhã às 9 horas.', 'gostaria de marcar uma demonstração hoje às nove horas', 'pode ser uma reunião amanhã às 9?']) {
    assert.deepEqual(ask(text), { text: scheduleReplies.schedule, source: 'schedule' }, text)
  }
  // perguntas sobre o horário da empresa continuam indo para o assunto cadastrado
  for (const text of ['que horas vocês abrem?', 'qual o horário de funcionamento?', 'vocês fecham às 18h?']) assert.equal(ask(text)?.ruleId, 'h1', text)
  // só o horário, sem pedir reunião (resposta à pergunta do bot): o assunto de horas ainda vence
  assert.equal(ask('amanhã às 9 horas')?.ruleId, 'h1')
})

test('horários escritos de vários jeitos são reconhecidos', () => {
  for (const text of ['9h', '9h30', '09:00', '9 horas', 'nove horas', '9 da manhã', 'meio-dia', 'meio dia', 'amanhã às 9', 'sexta às 15', 'hoje à tarde']) {
    assert.equal(detectMeetingRequest(text)?.kind, 'schedule', text)
  }
  for (const text of ['as 2 camisas', 'tenho 2 filhos', 'moro no 9', 'quero 3 unidades']) assert.equal(detectMeetingRequest(text), null, text)
  assert.equal(detectMeetingRequest('amanhã às 9 horas')?.when, 'amanhã às 9 horas')
})

test('pedido explícito por um atendente passa para uma pessoa', () => {
  const ask = (text: string) => chooseBotReply({ settings, rules, text, isFirstMessage: false, now: open })
  for (const text of ['quero falar com um atendente', 'pode me passar para alguém?', 'chama o responsável', 'prefiro falar com uma pessoa', 'quero um humano']) {
    assert.deepEqual(ask(text), { text: humanReply, source: 'human' }, text)
    assert.equal(wantsHuman(text), true, text)
  }
  assert.equal(wantsHuman('qual o endereço?'), false)
  // um assunto cadastrado pela empresa continua vencendo
  const own: BotRule[] = [...rules, { id: 'r9', trigger_type: 'keyword', trigger_value: 'atendente', response_text: 'Nosso atendimento é pelo WhatsApp mesmo.' }]
  assert.equal(chooseBotReply({ settings, rules: own, text: 'quero falar com um atendente', isFirstMessage: false, now: open })?.ruleId, 'r9')
})

test('"ok", "obrigado" e emoji não recebem o "não entendi"', () => {
  const ask = (text: string, isFirstMessage = false) => chooseBotReply({ settings, rules, text, isFirstMessage, now: open })
  for (const text of ['ok', 'Obrigado!', 'muito obrigada', 'valeu', 'blz', 'beleza, combinado', 'fechado', '👍', '🙏🙏', 'sim', 'Certo.']) assert.equal(ask(text), null, text)
  // o que tem conteúdo continua sendo respondido
  assert.equal(ask('não')?.source, 'fallback')
  assert.equal(ask('ok mas e o preço?')?.source, 'price')
  // primeira mensagem e áudio sem texto (vazio) seguem o fluxo normal
  assert.equal(ask('ok', true)?.source, 'welcome')
  assert.equal(ask('')?.source, 'fallback')
})

const units: BotLocation[] = [
  { id: 'u-for', city: 'Fortaleza', aliases: ['Aldeota', 'Messejana'], phone: '(85) 99999-0001', label: 'Fortaleza Centro' },
  { id: 'u-cau', city: 'Caucaia', aliases: ['Jurema'], phone: '85999990002' },
  { id: 'u-jua', city: 'Juazeiro do Norte', phone: '+55 88 99999-0003' },
]
const withUnits: BotSettings = { ...settings, locations: units }

test('telefones brasileiros são comparados sem DDI e sem o 9 extra', () => {
  assert.equal(samePhone('(85) 99999-0001', '5585999990001'), true)
  assert.equal(samePhone('+55 85 99999-0001', '85 9999-0001'), true)
  assert.equal(samePhone('85999990001', '85999990002'), false)
  assert.equal(samePhone('123', '123'), false)
  assert.equal(internationalPhone('(85) 99999-0001'), '5585999990001')
  assert.equal(internationalPhone('5585999990001'), '5585999990001')
  assert.equal(whatsappLink('85999990002', 'Olá! Vim de Caucaia.'), 'https://wa.me/5585999990002?text=Ol%C3%A1!%20Vim%20de%20Caucaia.')
})

test('cidade citada recebe o link da unidade, sem acento e sem diferença de maiúsculas', () => {
  const ask = (text: string, extra: Partial<Parameters<typeof chooseBotReply>[0]> = {}) => chooseBotReply({ settings: withUnits, rules, text, isFirstMessage: false, now: open, ...extra })
  let reply = ask('sou de Caucaia')
  assert.equal(reply?.source, 'location')
  assert.deepEqual(reply?.locationIds, ['u-cau'])
  assert.match(reply?.text ?? '', /Caucaia.*https:\/\/wa\.me\/5585999990002\?text=/)
  assert.equal(ask('MORO NA JUREMA')?.locationIds?.[0], 'u-cau')
  assert.equal(ask('tem unidade em juazeiro do norte?')?.locationIds?.[0], 'u-jua')
  assert.equal(ask('Moro na Aldeota')?.locationIds?.[0], 'u-for')
  // palavra inteira: "caucaiana" não é Caucaia
  assert.notEqual(ask('a caucaiana chegou')?.source, 'location')
  // prioridade sobre assunto e preço: o valor pode mudar por unidade
  assert.equal(ask('quanto custa em Caucaia?')?.source, 'location')
  assert.equal(ask('onde fica? sou de Caucaia')?.source, 'location')
  // duas cidades: as duas unidades, na ordem em que aparecem
  reply = ask('estou entre Caucaia e Fortaleza')
  assert.deepEqual(reply?.locationIds, ['u-cau', 'u-for'])
  assert.equal((reply?.text.match(/https:\/\/wa\.me\//g) ?? []).length, 2)
  // sem lista de unidades nada muda
  assert.notEqual(chooseBotReply({ settings, rules, text: 'sou de Caucaia', isFirstMessage: false, now: open })?.source, 'location')
})

test('o número que atende não manda o cliente para si mesmo, nem repete a mesma unidade', () => {
  const ask = (text: string, extra: Partial<Parameters<typeof chooseBotReply>[0]> = {}) => chooseBotReply({ settings: withUnits, rules, text, isFirstMessage: false, now: open, ...extra })
  // este número é o de Caucaia (escrito de outro jeito): segue o fluxo normal
  assert.notEqual(ask('sou de Caucaia', { ownPhone: '+55 (85) 9999-90002' })?.source, 'location')
  // Fortaleza continua sendo outra unidade
  assert.deepEqual(ask('sou de Caucaia ou Fortaleza', { ownPhone: '5585999990002' })?.locationIds, ['u-for'])
  // já indicada há pouco: não repete
  assert.notEqual(ask('sou de Caucaia', { sentLocationIds: ['u-cau'] })?.source, 'location')
  assert.deepEqual(ask('Caucaia e Fortaleza', { sentLocationIds: ['u-cau'] })?.locationIds, ['u-for'])
})

test('a mensagem do encaminhamento pode ser personalizada', () => {
  const custom = chooseBotReply({ settings: { ...withUnits, location_message: 'Atendemos {cidade} pela {unidade}! Chame aqui: {link}' }, rules, text: 'Fortaleza', isFirstMessage: false, now: open })
  assert.match(custom?.text ?? '', /^Atendemos Fortaleza pela Fortaleza Centro! Chame aqui: https:\/\/wa\.me\/5585999990001/)
  const noLink = chooseBotReply({ settings: { ...withUnits, location_message: 'Fale com a gente em {cidade}.' }, rules, text: 'Caucaia', isFirstMessage: false, now: open })
  assert.match(noLink?.text ?? '', /^Fale com a gente em Caucaia\.\nhttps:\/\/wa\.me\/5585999990002/)
})

test('pergunta a cidade só na primeira mensagem e só se o cliente ainda não a disse', () => {
  const ask = (text: string, extra: { first?: boolean; ownPhone?: string; ask?: boolean; units?: BotLocation[] } = {}) => chooseBotReply({
    settings: { ...withUnits, ask_city: extra.ask ?? true, locations: extra.units ?? units }, rules, text, isFirstMessage: extra.first ?? true, now: open, ownPhone: extra.ownPhone,
  })
  const asked = ask('oi')
  assert.equal(asked?.source, 'welcome')
  assert.match(asked?.text ?? '', /Bem-vindo à Barbearia X.*\n\nEm qual cidade você está\? 📍$/s)
  // já disse a cidade: vai direto ao link, sem perguntar
  assert.equal(ask('oi, sou de Caucaia')?.source, 'location')
  // disse a cidade deste mesmo número: não encaminha nem pergunta
  const own = ask('oi, sou de Caucaia', { ownPhone: '5585999990002' })
  assert.equal(own?.source, 'welcome')
  assert.doesNotMatch(own?.text ?? '', /Em qual cidade/)
  // opção desligada, sem unidades ou cumprimento no meio da conversa: não pergunta
  assert.doesNotMatch(ask('oi', { ask: false })?.text ?? '', /Em qual cidade/)
  assert.doesNotMatch(ask('oi', { units: [] })?.text ?? '', /Em qual cidade/)
  assert.doesNotMatch(ask('boa tarde', { first: false })?.text ?? '', /Em qual cidade/)
})

test('primeira mensagem recebe as boas-vindas; depois cai na resposta padrão', () => {
  assert.equal(chooseBotReply({ settings, rules, text: 'oi', isFirstMessage: true, now: open })?.source, 'welcome')
  assert.equal(chooseBotReply({ settings, rules, text: 'blá', isFirstMessage: false, now: open })?.source, 'fallback')
})

test('promoção pode ser incluída na mensagem de boas-vindas', () => {
  const withPromotion = { ...settings, promotion_message: 'Esta semana, avaliação gratuita até sexta.', promotion_in_welcome: true }
  const reply = chooseBotReply({ settings: withPromotion, rules, text: 'oi', isFirstMessage: true, now: open })
  assert.match(reply?.text ?? '', /Bem-vindo à Barbearia X/)
  assert.match(reply?.text ?? '', /avaliação gratuita até sexta/)
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

test('expediente com pausa para o almoço: 07h–11h e 13h–17h', () => {
  const split = { enabled: true, days: [1, 2, 3, 4, 5], start: '07:00', end: '17:00', periods: [{ start: '07:00', end: '11:00' }, { start: '13:00', end: '17:00' }] }
  // quarta-feira, horário de Brasília (UTC-3)
  const at = (time: string, day = '2026-10-07') => new Date(`${day}T${String(Number(time.slice(0, 2)) + 3).padStart(2, '0')}:${time.slice(3)}:00Z`)
  const expected: Array<[string, boolean]> = [['06:59', false], ['07:00', true], ['10:59', true], ['11:00', false], ['12:00', false], ['12:59', false], ['13:00', true], ['16:59', true], ['17:00', false], ['20:00', false]]
  for (const [time, inside] of expected) assert.equal(isWithinBusinessHours(split, at(time)), inside, time)
  // fora dos dias marcados continua fechado, mesmo dentro de um período
  assert.equal(isWithinBusinessHours(split, at('08:00', '2026-10-11')), false)
  // formato antigo, sem "periods", segue valendo: um período só
  assert.equal(isWithinBusinessHours({ enabled: true, days: [3], start: '09:00', end: '18:00' }, at('12:00')), true)
  assert.equal(periodsOf({ enabled: true, days: [3], start: '09:00', end: '18:00' }).length, 1)
  // o bot usa o horário: no almoço responde a mensagem de fechado
  const lunch = chooseBotReply({ settings: { ...settings, business_hours: split }, rules, text: 'oi', isFirstMessage: true, now: at('12:00') })
  assert.equal(lunch?.source, 'off_hours')
  assert.equal(chooseBotReply({ settings: { ...settings, business_hours: split }, rules, text: 'oi', isFirstMessage: true, now: at('09:00') })?.source, 'welcome')
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
