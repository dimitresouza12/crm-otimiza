import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bot, CheckCircle2, Clock, Plus, Send, Sparkles, Tag, Trash2, X } from 'lucide-react'
import { api, type BotRuleData, type BotSettingsData, type BotSettingsInput, type Session } from './lib/api'

type Form = {
  active: boolean
  ai: boolean
  welcome: string
  fallback: string
  offHours: string
  hoursEnabled: boolean
  days: number[]
  start: string
  end: string
  mode: 'always' | 'outside_hours'
  priceReplies: boolean
  catalog: Array<{ name: string; price: string; description: string }>
}

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const toForm = (settings: BotSettingsData): Form => ({
  active: settings.is_active,
  ai: settings.ai_enabled,
  welcome: settings.welcome_message ?? '',
  fallback: settings.fallback_message ?? '',
  offHours: settings.off_hours_message ?? '',
  hoursEnabled: settings.business_hours.enabled,
  days: settings.business_hours.days,
  start: settings.business_hours.start,
  end: settings.business_hours.end,
  mode: settings.bot_mode,
  priceReplies: settings.price_replies_enabled,
  catalog: settings.catalog.map((item) => ({ name: item.name, price: item.price === null ? '' : String(item.price).replace('.', ','), description: item.description ?? '' })),
})

const parsePrice = (value: string) => {
  const cleaned = value.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  const number = Number(cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned)
  return Number.isFinite(number) ? number : NaN
}

const draftFromForm = (form: Form): Omit<BotSettingsInput, 'isActive' | 'aiEnabled'> => {
  if (form.hoursEnabled && !form.days.length) throw new Error('Escolha pelo menos um dia de atendimento.')
  if (form.hoursEnabled && form.start >= form.end) throw new Error('O horário de início precisa ser antes do horário de término.')
  const catalog = form.catalog.filter((item) => item.name.trim() || item.price.trim()).map((item) => {
    if (!item.name.trim()) throw new Error('Dê um nome para cada item da lista de preços.')
    const price = parsePrice(item.price)
    if (price === null || Number.isNaN(price)) throw new Error(`Informe o valor de "${item.name.trim()}" (exemplo: 40 ou 39,90).`)
    return { name: item.name.trim(), price, description: item.description.trim() || undefined }
  })
  return {
    welcomeMessage: form.welcome, fallbackMessage: form.fallback, offHoursMessage: form.offHours,
    businessHours: { enabled: form.hoursEnabled, days: form.days, start: form.start, end: form.end },
    botMode: form.mode, priceRepliesEnabled: form.priceReplies, catalog,
  }
}

// Um horário garantidamente fora do expediente, para o cliente simular "fora do horário".
const outsideHoursInstant = (form: Form) => {
  for (let offset = 0; offset < 9; offset++) {
    const day = new Date(); day.setUTCDate(day.getUTCDate() + offset); day.setUTCHours(6, 0, 0, 0) // 03:00 em Brasília
    const weekday = new Date(day.getTime() - 3 * 3_600_000).getUTCDay()
    if (day.getTime() > Date.now() && (!form.days.includes(weekday) || form.start > '03:00' || form.end <= '03:00')) return day.toISOString()
  }
  return undefined
}

const topicTemplates = [
  { label: 'Horário de funcionamento', name: 'Horário de funcionamento', keywords: 'que horas, horário de funcionamento, horário de atendimento, funcionamento, abre, fecha, aberto', answer: 'Atendemos de segunda a sexta, das 9h às 18h, e aos sábados das 9h às 13h.' },
  { label: 'Endereço', name: 'Endereço', keywords: 'endereço, onde fica, localização, como chegar', answer: 'Estamos na Rua Exemplo, 100 - Centro. Ponto de referência: ao lado da praça.' },
  { label: 'Formas de pagamento', name: 'Formas de pagamento', keywords: 'pix, cartão, dinheiro, pagamento, forma de pagamento', answer: 'Aceitamos Pix, cartão de crédito e débito e dinheiro.' },
  { label: 'Agendamento', name: 'Agendamento', keywords: 'agendar, marcar, reservar, disponibilidade, horário disponível, vaga', answer: 'Para agendar, me diga o dia e o horário que prefere e já deixo reservado para você.' },
  { label: 'Promoções', name: 'Promoções', keywords: 'promoção, desconto, oferta, cupom', answer: 'Temos uma condição especial esta semana! Me chame que passo os detalhes.' },
  { label: 'Outro assunto', name: '', keywords: '', answer: '' },
]

const sourceLabel: Record<string, string> = {
  keyword: 'Respondeu por um assunto', price: 'Respondeu pela lista de preços', welcome: 'Mensagem de boas-vindas', off_hours: 'Mensagem de fora do horário', fallback: 'Resposta de "não entendi"',
  silent: 'O bot não responderia (confira o dia, o horário e o modo escolhidos)',
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="bot-toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="bot-toggle__track" aria-hidden="true"><i /></span>
      <span className="bot-toggle__text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  )
}

function TopicCard({ rule, onSave, onToggle, onDelete }: { rule: BotRuleData; onSave: (id: string, fields: { name: string; triggerValue: string; responseText: string }) => Promise<void>; onToggle: (rule: BotRuleData) => void; onDelete: (rule: BotRuleData) => void }) {
  const [name, setName] = useState(rule.name)
  const [keywords, setKeywords] = useState(rule.trigger_value ?? '')
  const [answer, setAnswer] = useState(rule.response_text)
  const [busy, setBusy] = useState(false)
  const dirty = name !== rule.name || keywords !== (rule.trigger_value ?? '') || answer !== rule.response_text
  const chips = keywords.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)
  return (
    <article className={`bot-topic ${rule.is_active ? '' : 'is-off'}`}>
      <header>
        <input className="bot-topic__name" value={name} onChange={(event) => setName(event.target.value)} aria-label="Nome do assunto" placeholder="Nome do assunto" />
        <Toggle checked={rule.is_active} onChange={() => onToggle(rule)} label={rule.is_active ? 'Ligado' : 'Desligado'} />
        <button className="bot-icon" type="button" aria-label={`Apagar ${rule.name}`} onClick={() => onDelete(rule)}><Trash2 size={16} /></button>
      </header>
      <label>Quando o cliente falar<small>Separe as palavras por vírgula. Acentos e letras maiúsculas não importam.</small>
        <input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="endereço, onde fica, localização" />
      </label>
      {!!chips.length && <div className="bot-chips">{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>}
      <label>O bot responde
        <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} placeholder="Escreva a resposta como você falaria com o cliente" />
      </label>
      {dirty && <div className="bot-topic__actions"><button className="bot-link" type="button" onClick={() => { setName(rule.name); setKeywords(rule.trigger_value ?? ''); setAnswer(rule.response_text) }}>Desfazer</button><button className="primary-button" type="button" disabled={busy} onClick={() => { setBusy(true); void onSave(rule.id, { name, triggerValue: keywords, responseText: answer }).finally(() => setBusy(false)) }}>{busy ? 'Salvando...' : 'Salvar assunto'}</button></div>}
    </article>
  )
}

export function ChatbotPage({ session, account, onRequestAccess, onOpenIntegrations }: { session: Session | null; account: { plan: string } | null; onRequestAccess: () => void; onOpenIntegrations: () => void }) {
  const [saved, setSaved] = useState<BotSettingsData | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [rules, setRules] = useState<BotRuleData[]>([])
  const [channels, setChannels] = useState<Array<{ id: string; name: string; phone_number: string | null; status: string; provider: string }>>([])
  const [aiAvailable, setAiAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopic, setNewTopic] = useState({ name: '', keywords: '', answer: '' })
  const [testText, setTestText] = useState('')
  const [testFirst, setTestFirst] = useState(true)
  const [testOutside, setTestOutside] = useState(false)
  const [testing, setTesting] = useState(false)
  const [conversation, setConversation] = useState<Array<{ from: 'client' | 'bot'; text: string; note?: string }>>([])
  const [uazapi, setUazapi] = useState({ channelName: 'Comercial', phone: '', serverUrl: '', instance: '', token: '' })

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const result = await api.chatbot(session)
      setSaved(result.settings); setForm(toForm(result.settings)); setRules(result.rules); setChannels(result.channels); setAiAvailable(result.aiAvailable)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o chatbot.') }
    finally { setLoading(false) }
  }, [session])

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(() => Boolean(saved && form && JSON.stringify(toForm(saved)) !== JSON.stringify(form)), [saved, form])
  const update = (patch: Partial<Form>) => setForm((current) => current ? { ...current, ...patch } : current)

  if (!session) return <section className="empty-page panel"><div className="empty-page__icon"><Bot size={24} /></div><span className="eyebrow">CHATBOT</span><h1>Configure seu atendimento automático.</h1><p>Entre no CRM para conectar seu WhatsApp e ensinar o chatbot a responder seus clientes.</p><button className="primary-button" type="button" onClick={onRequestAccess}>Entrar no CRM <ArrowRight size={16} /></button></section>
  if (account?.plan !== 'chatbot') return <section className="empty-page panel"><div className="empty-page__icon"><Bot size={24} /></div><span className="eyebrow">PLANO CHATBOT</span><h1>Um assistente que responde por você.</h1><p>Com o plano Chatbot, o WhatsApp responde sozinho: boas-vindas, preços, horários, endereço e o que mais você quiser.</p><button className="primary-button" type="button" onClick={() => setError('Solicite à equipe Otimiza AI a ativação do plano Chatbot para sua empresa.')}>Ativar plano Chatbot <ArrowRight size={16} /></button>{error && <p className="form-error">{error}</p>}</section>
  if (loading || !form) return <section className="panel chatbot-loading">{error || 'Carregando configurações...'}</section>

  const save = async () => {
    setSaving(true); setError(''); setNotice('')
    try {
      const draft = draftFromForm(form)
      const result = await api.saveChatbotSettings(session, { isActive: form.active, aiEnabled: form.ai, ...draft })
      setSaved(result); setForm(toForm(result)); setNotice('Alterações salvas. O chatbot já usa a nova configuração.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar.') } finally { setSaving(false) }
  }

  const runRule = async (work: () => Promise<unknown>, success?: string) => {
    setError(''); setNotice('')
    try { await work(); await load(); if (success) setNotice(success) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.') }
  }

  const sendTest = async () => {
    const message = testText.trim()
    if (!message || testing) return
    setTesting(true); setError('')
    try {
      const reply = await api.chatbotTest(session, { message, firstMessage: testFirst, at: testOutside ? outsideHoursInstant(form) : undefined, draft: draftFromForm(form) })
      setConversation((current) => [...current, { from: 'client', text: message }, { from: 'bot', text: reply.reply ?? 'O bot ficaria em silêncio.', note: sourceLabel[reply.source] + (reply.ruleName ? `: ${reply.ruleName}` : '') }])
      setTestText(''); setTestFirst(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível testar.') } finally { setTesting(false) }
  }

  const connected = channels.filter((channel) => channel.status === 'connected')
  const canSimulateOutside = form.hoursEnabled && Boolean(outsideHoursInstant(form))

  return (
    <>
      <section className="page-head chatbot-head">
        <div><span className="eyebrow">ATENDIMENTO AUTOMÁTICO</span><h1>Chatbot</h1><p>Ensine o bot a responder seus clientes no WhatsApp. É só preencher abaixo, testar e ligar.</p></div>
        <span className={`security-status ${form.active ? '' : 'security-status--neutral'}`}><Bot size={16} />{form.active ? 'Chatbot ligado' : 'Chatbot desligado'}</span>
      </section>

      <div className="bot-page">
        <section className="panel bot-card">
          <div className="bot-card__head"><span className="bot-step">1</span><div><h2>Ligar o chatbot</h2><p>Quando está ligado, o bot responde as mensagens novas dos clientes. Se você mesmo responder uma conversa, ele para nela.</p></div></div>
          <Toggle checked={form.active} onChange={(value) => update({ active: value })} label={form.active ? 'Chatbot ligado' : 'Chatbot desligado'} hint={connected.length ? `Número conectado: ${connected.map((channel) => channel.phone_number ?? channel.name).join(', ')}` : 'Nenhum número conectado ainda'} />
          {!channels.length && (
            <div className="bot-connect">
              <p>Você ainda não conectou um WhatsApp. Conecte lendo um QR Code, como no WhatsApp Web.</p>
              <button className="primary-button" type="button" onClick={onOpenIntegrations}>Conectar WhatsApp com QR Code <ArrowRight size={16} /></button>
              <details>
                <summary>Uso a UAZAPI da Otimiza</summary>
                <form className="bot-uazapi" onSubmit={(event) => { event.preventDefault(); void runRule(async () => { const result = await api.connectWhatsapp(session, { provider: 'uazapi', channelName: uazapi.channelName, phoneNumber: uazapi.phone || undefined, externalAccountId: uazapi.instance, serverUrl: uazapi.serverUrl, accessToken: uazapi.token }); if (result.setupError) throw new Error(result.setupError); setUazapi({ ...uazapi, token: '' }) }, 'Número conectado.') }}>
                  <label>Nome do canal<input value={uazapi.channelName} onChange={(event) => setUazapi({ ...uazapi, channelName: event.target.value })} required /></label>
                  <label>Número do WhatsApp <small>opcional</small><input value={uazapi.phone} onChange={(event) => setUazapi({ ...uazapi, phone: event.target.value })} placeholder="5585999999999" /></label>
                  <label>Endereço da UAZAPI<input value={uazapi.serverUrl} onChange={(event) => setUazapi({ ...uazapi, serverUrl: event.target.value })} type="url" required placeholder="https://sua-api.exemplo.com" /></label>
                  <label>Nome da instância<input value={uazapi.instance} onChange={(event) => setUazapi({ ...uazapi, instance: event.target.value })} required /></label>
                  <label>Token da instância<input value={uazapi.token} onChange={(event) => setUazapi({ ...uazapi, token: event.target.value })} type="password" minLength={10} required /></label>
                  <button className="primary-button" type="submit">Conectar UAZAPI</button>
                </form>
              </details>
            </div>
          )}
        </section>

        <section className="panel bot-card">
          <div className="bot-card__head"><span className="bot-step">2</span><div><h2>O que o bot diz</h2><p>Escreva como você falaria com o cliente. Pode usar emojis.</p></div></div>
          <label>Boas-vindas <small>enviada na primeira mensagem do cliente</small>
            <textarea rows={3} value={form.welcome} onChange={(event) => update({ welcome: event.target.value })} placeholder="Olá! 👋 Sou o assistente da Minha Empresa. Pergunte por preços, horários ou endereço que eu respondo na hora." />
          </label>
          <label>Quando o bot não entender <small>resposta padrão</small>
            <textarea rows={3} value={form.fallback} onChange={(event) => update({ fallback: event.target.value })} placeholder="Não entendi 🤔 Você pode perguntar sobre preços, horários ou endereço. Se preferir, aguarde que um atendente responde." />
          </label>
        </section>

        <section className="panel bot-card">
          <div className="bot-card__head"><span className="bot-step">3</span><div><h2><Clock size={16} /> Horário de atendimento</h2><p>Defina quando sua equipe está disponível e quando o bot deve falar.</p></div></div>
          <Toggle checked={form.hoursEnabled} onChange={(value) => update({ hoursEnabled: value })} label="Tenho horário de atendimento" hint="Se desligado, o bot trata todos os horários igual" />
          {form.hoursEnabled && (
            <div className="bot-hours">
              <div className="bot-days" role="group" aria-label="Dias de atendimento">{dayNames.map((day, index) => <button key={day} type="button" className={form.days.includes(index) ? 'is-on' : ''} aria-pressed={form.days.includes(index)} onClick={() => update({ days: form.days.includes(index) ? form.days.filter((value) => value !== index) : [...form.days, index].sort() })}>{day}</button>)}</div>
              <div className="bot-times"><label>Das<input type="time" value={form.start} onChange={(event) => update({ start: event.target.value })} /></label><label>Até<input type="time" value={form.end} onChange={(event) => update({ end: event.target.value })} /></label></div>
              <fieldset className="bot-modes"><legend>Quando o bot responde?</legend>
                <label><input type="radio" name="bot-mode" checked={form.mode === 'always'} onChange={() => update({ mode: 'always' })} /><span><b>Sempre</b><small>O bot responde dentro e fora do horário.</small></span></label>
                <label><input type="radio" name="bot-mode" checked={form.mode === 'outside_hours'} onChange={() => update({ mode: 'outside_hours' })} /><span><b>Só fora do horário de atendimento</b><small>Durante o expediente, a sua equipe responde e o bot fica quieto.</small></span></label>
              </fieldset>
              <label>Mensagem de fora do horário <small>enviada quando o cliente escreve com a loja fechada</small>
                <textarea rows={3} value={form.offHours} onChange={(event) => update({ offHours: event.target.value })} placeholder="Estamos fechados agora 😴 Nosso atendimento é de segunda a sexta, das 9h às 18h. Deixe sua mensagem que respondemos assim que abrirmos!" />
              </label>
            </div>
          )}
        </section>

        <section className="panel bot-card">
          <div className="bot-card__head"><span className="bot-step">4</span><div><h2><Tag size={16} /> Seus preços</h2><p>Cadastre o que você vende. Quando o cliente perguntar “quanto custa?”, o bot responde com estes valores.</p></div></div>
          <Toggle checked={form.priceReplies} onChange={(value) => update({ priceReplies: value })} label="Responder preços automaticamente" hint="Também ajuda a IA a calcular o valor de cada lead" />
          <div className="bot-catalog">
            {!!form.catalog.length && <div className="bot-catalog__head"><span>Produto ou serviço</span><span>Valor (R$)</span><span>Detalhe <small>opcional</small></span><span /></div>}
            {form.catalog.map((item, index) => (
              <div className="bot-catalog__row" key={index}>
                <input aria-label="Produto ou serviço" value={item.name} onChange={(event) => update({ catalog: form.catalog.map((row, position) => position === index ? { ...row, name: event.target.value } : row) })} placeholder="Corte de cabelo" />
                <input aria-label="Valor" inputMode="decimal" value={item.price} onChange={(event) => update({ catalog: form.catalog.map((row, position) => position === index ? { ...row, price: event.target.value } : row) })} placeholder="40,00" />
                <input aria-label="Detalhe" value={item.description} onChange={(event) => update({ catalog: form.catalog.map((row, position) => position === index ? { ...row, description: event.target.value } : row) })} placeholder="Tesoura ou máquina" />
                <button className="bot-icon" type="button" aria-label="Remover item" onClick={() => update({ catalog: form.catalog.filter((_, position) => position !== index) })}><X size={16} /></button>
              </div>
            ))}
            <button className="bot-add" type="button" onClick={() => update({ catalog: [...form.catalog, { name: '', price: '', description: '' }] })}><Plus size={16} /> Adicionar produto ou serviço</button>
          </div>
        </section>

        <section className="panel bot-card">
          <div className="bot-card__head"><span className="bot-step">5</span><div><h2>Respostas por assunto</h2><p>Para cada assunto, diga que palavras o cliente costuma usar e o que o bot deve responder.</p></div><span className="count-pill">{rules.length}</span></div>
          <div className="bot-topics">
            {rules.map((rule) => <TopicCard key={`${rule.id}-${rule.name}-${rule.trigger_value}-${rule.response_text}`} rule={rule}
              onSave={(id, fields) => runRule(() => api.updateChatbotRule(session, id, fields), 'Assunto salvo.')}
              onToggle={(item) => void runRule(() => api.updateChatbotRule(session, item.id, { isActive: !item.is_active }))}
              onDelete={(item) => { if (window.confirm(`Apagar o assunto "${item.name}"?`)) void runRule(() => api.deleteChatbotRule(session, item.id), 'Assunto apagado.') }} />)}
            {!rules.length && !addingTopic && <p className="chatbot-empty">Nenhum assunto ainda. Comece por um modelo pronto abaixo e ajuste o texto.</p>}
          </div>
          {addingTopic ? (
            <form className="bot-topic bot-topic--new" onSubmit={(event) => { event.preventDefault(); void runRule(async () => { await api.createChatbotRule(session, { name: newTopic.name, triggerValue: newTopic.keywords, responseText: newTopic.answer }); setAddingTopic(false); setNewTopic({ name: '', keywords: '', answer: '' }) }, 'Assunto criado.') }}>
              <label>Nome do assunto<input value={newTopic.name} onChange={(event) => setNewTopic({ ...newTopic, name: event.target.value })} required minLength={2} placeholder="Ex.: Endereço" /></label>
              <label>Quando o cliente falar<small>Separe as palavras por vírgula.</small><input value={newTopic.keywords} onChange={(event) => setNewTopic({ ...newTopic, keywords: event.target.value })} required placeholder="endereço, onde fica, localização" /></label>
              <label>O bot responde<textarea rows={3} value={newTopic.answer} onChange={(event) => setNewTopic({ ...newTopic, answer: event.target.value })} required placeholder="Escreva a resposta" /></label>
              <div className="bot-topic__actions"><button className="bot-link" type="button" onClick={() => setAddingTopic(false)}>Cancelar</button><button className="primary-button" type="submit">Criar assunto</button></div>
            </form>
          ) : (
            <div className="bot-templates"><span>Adicionar:</span>{topicTemplates.map((template) => <button key={template.label} type="button" onClick={() => { setNewTopic({ name: template.name, keywords: template.keywords, answer: template.answer }); setAddingTopic(true) }}><Plus size={13} /> {template.label}</button>)}</div>
          )}
        </section>

        <section className="panel bot-card">
          <div className="bot-card__head"><span className="bot-step">6</span><div><h2>Teste o seu bot</h2><p>Escreva como se fosse um cliente e veja a resposta, sem enviar nada de verdade. Vale também para o que você ainda não salvou.</p></div></div>
          <div className="bot-sim">
            <div className="bot-sim__chat" aria-live="polite">
              {!conversation.length && <p className="chatbot-empty">Experimente: “oi”, “quanto custa?”, “onde fica?”…</p>}
              {conversation.map((line, index) => <div key={index} className={`bot-sim__msg bot-sim__msg--${line.from}`}><p>{line.text}</p>{line.note && <small>{line.note}</small>}</div>)}
            </div>
            <div className="bot-sim__options">
              <label><input type="checkbox" checked={testFirst} onChange={(event) => setTestFirst(event.target.checked)} /> É a primeira mensagem do cliente</label>
              {canSimulateOutside && <label><input type="checkbox" checked={testOutside} onChange={(event) => setTestOutside(event.target.checked)} /> Simular fora do horário de atendimento</label>}
              {!!conversation.length && <button className="bot-link" type="button" onClick={() => { setConversation([]); setTestFirst(true) }}>Limpar teste</button>}
            </div>
            <form className="bot-sim__form" onSubmit={(event) => { event.preventDefault(); void sendTest() }}>
              <input value={testText} onChange={(event) => setTestText(event.target.value)} placeholder="Escreva a mensagem do cliente" aria-label="Mensagem do cliente para teste" />
              <button className="primary-button" type="submit" disabled={testing || !testText.trim()}>Enviar <Send size={15} /></button>
            </form>
          </div>
        </section>

        <section className="panel bot-card">
          <div className="bot-card__head"><span className="bot-step"><Sparkles size={14} /></span><div><h2>Inteligência artificial (GPT) <small className="bot-optional">recomendado</small></h2><p>Faz o bot entender os áudios dos clientes (ele responde ao que foi dito) e organiza seus leads sozinha: etapa do funil, valor e origem.</p></div></div>
          <Toggle checked={form.ai} onChange={(value) => update({ ai: value })} label={form.ai ? 'IA ligada' : 'IA desligada: o bot não entende áudios'} hint={aiAvailable ? 'O texto das conversas e a transcrição dos áudios são enviados à OpenAI. Avise seus clientes (LGPD). Só desligue se não quiser usar este recurso.' : 'Ligada, mas ainda não funciona: falta configurar a chave da OpenAI no servidor.'} />
        </section>
      </div>

      {(dirty || notice || error) && (
        <div className={`bot-savebar ${error ? 'is-error' : ''}`} role="status">
          <span>{error || (dirty ? 'Você tem alterações que ainda não foram salvas.' : <><CheckCircle2 size={16} /> {notice}</>)}</span>
          {dirty && <><button className="bot-link" type="button" onClick={() => { if (saved) { setForm(toForm(saved)); setError('') } }}>Descartar</button><button className="primary-button" type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></>}
          {!dirty && <button className="bot-link" type="button" onClick={() => { setNotice(''); setError('') }}>Fechar</button>}
        </div>
      )}
    </>
  )
}
