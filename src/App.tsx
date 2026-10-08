import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  CheckCircle2,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  ArrowUpRight,
  Eye,
  Receipt,
  EyeOff,
  Filter,
  Goal,
  Link2,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircleMore,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react'
import otimizaSymbol from './assets/otimiza-ai-symbol.svg'
import { api, type Session } from './lib/api'
import { ChatDrawer, ChatPage } from './ChatPage'
import { ChatbotPage } from './ChatbotPage'
import { connectEvents, onChatEvent } from './lib/events'

type Page = 'dashboard' | 'crm' | 'leads' | 'conversas' | 'vendas' | 'trafego' | 'relatorios' | 'chatbot' | 'configuracoes'
type Stage = 'Novos leads' | 'Qualificados' | 'Proposta enviada' | 'Negociação' | 'Ganhos' | 'Perdidos'
type Channel = 'Todos os canais' | 'Comercial' | 'Unidade Aldeota' | 'Pós-venda'

type Lead = {
  id: number | string
  opportunityId?: string
  stageId?: string
  phone?: string
  name: string
  initials: string
  stage: Stage
  channel: Exclude<Channel, 'Todos os canais'>
  source: string
  createdAt?: string
  value?: number
  time: string
  lastMessage: string
  temperature: 'Quente' | 'Morno' | 'Novo'
  owner: string
  avatar: string
}

const stages: Stage[] = ['Novos leads', 'Qualificados', 'Proposta enviada', 'Negociação', 'Ganhos', 'Perdidos']
const channels: Channel[] = ['Todos os canais', 'Comercial', 'Unidade Aldeota', 'Pós-venda']

const initialLeads: Lead[] = [
  { id: 1, name: 'Mariana Costa', initials: 'MC', stage: 'Novos leads', channel: 'Comercial', source: 'Meta Ads', time: 'há 3 min', lastMessage: 'Olá, queria saber os valores para setembro.', temperature: 'Quente', owner: 'Lara', avatar: 'LC' },
  { id: 2, name: 'Lucas Almeida', initials: 'LA', stage: 'Novos leads', channel: 'Unidade Aldeota', source: 'Google Ads', time: 'há 18 min', lastMessage: 'Tem disponibilidade para esta semana?', temperature: 'Novo', owner: 'Rafael', avatar: 'RP' },
  { id: 3, name: 'Beatriz Nunes', initials: 'BN', stage: 'Novos leads', channel: 'Comercial', source: 'Orgânico', time: 'há 42 min', lastMessage: 'Vi o perfil de vocês e gostaria de entender.', temperature: 'Morno', owner: 'Lara', avatar: 'LC' },
  { id: 4, name: 'João Gabriel', initials: 'JG', stage: 'Qualificados', channel: 'Comercial', source: 'Meta Ads', value: 1890, time: 'há 8 min', lastMessage: 'Pode me enviar a condição à vista?', temperature: 'Quente', owner: 'Lara', avatar: 'LC' },
  { id: 5, name: 'Camila Rocha', initials: 'CR', stage: 'Qualificados', channel: 'Unidade Aldeota', source: 'Indicação', value: 1250, time: 'há 1 h', lastMessage: 'Consigo começar na segunda-feira?', temperature: 'Quente', owner: 'Rafael', avatar: 'RP' },
  { id: 6, name: 'André Lima', initials: 'AL', stage: 'Proposta enviada', channel: 'Comercial', source: 'Google Ads', value: 2400, time: 'ontem', lastMessage: 'Vou olhar a proposta com calma.', temperature: 'Morno', owner: 'Lara', avatar: 'LC' },
  { id: 7, name: 'Tainá Freitas', initials: 'TF', stage: 'Proposta enviada', channel: 'Comercial', source: 'Meta Ads', value: 3200, time: 'ontem', lastMessage: 'Gostei. Podemos dividir em 3 vezes?', temperature: 'Quente', owner: 'Rafael', avatar: 'RP' },
  { id: 8, name: 'Paulo Viana', initials: 'PV', stage: 'Negociação', channel: 'Unidade Aldeota', source: 'Meta Ads', value: 1500, time: 'há 2 h', lastMessage: 'Se mantiver essa condição eu fecho hoje.', temperature: 'Quente', owner: 'Lara', avatar: 'LC' },
  { id: 9, name: 'Fernanda Melo', initials: 'FM', stage: 'Negociação', channel: 'Comercial', source: 'Indicação', value: 2800, time: 'ontem', lastMessage: 'Me chama depois das 15h, por favor.', temperature: 'Morno', owner: 'Rafael', avatar: 'RP' },
  { id: 10, name: 'Ricardo Matos', initials: 'RM', stage: 'Ganhos', channel: 'Comercial', source: 'Meta Ads', value: 2100, time: 'hoje', lastMessage: 'Pagamento confirmado, obrigado!', temperature: 'Quente', owner: 'Lara', avatar: 'LC' },
  { id: 11, name: 'Débora Lopes', initials: 'DL', stage: 'Ganhos', channel: 'Pós-venda', source: 'Orgânico', value: 950, time: 'ontem', lastMessage: 'Pode agendar para quarta pela manhã.', temperature: 'Quente', owner: 'Rafael', avatar: 'RP' },
]

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })

type PurchasablePlan = 'crm' | 'chatbot'
type PublicRoute = 'landing' | 'login' | 'signup' | 'app'
type SignupSelection = { plan: PurchasablePlan; channelLimit: number }

const publicPlans: Record<PurchasablePlan, { name: string; baseCents: number; extraCents: number; description: string; features: string[] }> = {
  crm: {
    name: 'Otimiza CRM', baseCents: 8_990, extraCents: 2_990,
    description: 'Para organizar o atendimento e acompanhar cada resultado comercial.',
    features: ['Kanban de leads e etapas', 'Conversas por WhatsApp', 'Faturamento confirmado', 'Origem do lead e tráfego informado'],
  },
  chatbot: {
    name: 'Otimiza CRM + Chatbot', baseCents: 17_990, extraCents: 3_990,
    description: 'Para quem também quer configurar respostas automáticas por número.',
    features: ['Tudo do Otimiza CRM', 'Chatbot configurável', 'Regras por palavra-chave', 'Boas-vindas e resposta padrão'],
  },
}

const formatCents = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const selectedPrice = (plan: PurchasablePlan, channelLimit: number) => publicPlans[plan].baseCents + (channelLimit - 1) * publicPlans[plan].extraCents
const planTitle = (plan: string) => plan === 'chatbot' ? 'Otimiza CRM + Chatbot' : 'Otimiza CRM'
const routeFromPath = (path: string): PublicRoute => path === '/entrar' ? 'login' : path === '/cadastro' ? 'signup' : path === '/app' ? 'app' : 'landing'
const selectionFromLocation = (): SignupSelection => {
  const params = new URLSearchParams(window.location.search)
  const plan = params.get('plano') === 'chatbot' ? 'chatbot' : 'crm'
  const rawLimit = Number(params.get('numeros') ?? '1')
  return { plan, channelLimit: Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 5 ? rawLimit : 1 }
}
const signupPath = (selection: SignupSelection) => `/cadastro?plano=${selection.plan}&numeros=${selection.channelLimit}`
const salesHref = (phone: string, message = 'Olá! Quero conversar sobre o Otimiza AI CRM.') => phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : undefined

function BrandLockup({ dark = false }: { dark?: boolean }) {
  return <span className={`landing-brand ${dark ? 'landing-brand--dark' : ''}`}><span className="landing-brand__mark"><img src={otimizaSymbol} alt="" /></span><span>Otimiza <b>AI</b><small>CRM</small></span></span>
}

function LandingPage({ onNavigate, salesWhatsapp }: { onNavigate: (path: string) => void; salesWhatsapp: string }) {
  const [plan, setPlan] = useState<PurchasablePlan>('crm')
  const [channelLimit, setChannelLimit] = useState(1)
  const activePlan = publicPlans[plan]
  const activePrice = selectedPrice(plan, channelLimit)
  const startTrial = (nextPlan = plan, nextLimit = channelLimit) => onNavigate(signupPath({ plan: nextPlan, channelLimit: nextLimit }))
  const whatsapp = salesHref(salesWhatsapp)
  return <main className="landing-page">
    <header className="landing-header">
      <a className="landing-logo-link" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }} aria-label="Página inicial do Otimiza AI CRM"><BrandLockup dark /></a>
      <nav aria-label="Navegação da página"><a href="#recursos">Recursos</a><a href="#planos">Planos</a><a href="#perguntas">Dúvidas</a></nav>
      <div className="landing-header__actions"><button className="landing-login" type="button" onClick={() => onNavigate('/entrar')}>Entrar</button><button className="landing-button landing-button--small" type="button" onClick={() => startTrial()}>Teste grátis <ArrowRight size={15}/></button></div>
    </header>

    <section className="landing-hero">
      <div className="landing-hero__copy">
        <span className="landing-kicker"><i/> CRM para quem atende pelo WhatsApp</span>
        <h1>De conversa em conversa, <em>resultado visível.</em></h1>
        <p>Organize seus leads, acompanhe as vendas confirmadas e entenda de onde cada oportunidade chegou.</p>
        <div className="landing-hero__actions"><button className="landing-button" type="button" onClick={() => startTrial()}>Experimentar por 7 dias <ArrowRight size={18}/></button>{whatsapp && <a className="landing-text-link" href={whatsapp} target="_blank" rel="noreferrer">Falar com a Otimiza <MessageCircleMore size={17}/></a>}</div>
        <p className="landing-trial-note"><CheckCircle2 size={15}/> Sem cartão de crédito. Cobrança somente depois do teste.</p>
      </div>
      <div className="landing-hero__visual" aria-label="Demonstração do painel Otimiza AI CRM">
        <span className="landing-demo-label">Demonstração</span>
        <div className="landing-demo-app">
          <header><BrandLockup/><span><i/> Atualizado agora</span></header>
          <div className="landing-demo-app__body">
            <aside><span className="is-active"><LayoutDashboard size={16}/> Dashboard</span><span><Target size={16}/> CRM</span><span><UsersRound size={16}/> Leads</span><span><MessageCircleMore size={16}/> Conversas</span><span><CircleDollarSign size={16}/> Vendas</span></aside>
            <section>
              <div className="landing-demo-title"><div><small>VISÃO GERAL</small><b>Resultados do mês</b></div><span>Set. 2026</span></div>
              <div className="landing-demo-metrics"><article><small>Faturamento confirmado</small><b>R$ 18.740</b><span>↗ 24% este mês</span></article><article><small>Leads recebidos</small><b>126</b><span>34 em negociação</span></article></div>
              <div className="landing-demo-chart"><div><span>R$ 18k</span><span>R$ 12k</span><span>R$ 6k</span></div><svg viewBox="0 0 420 122" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="landingChart" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8a7dff" stopOpacity=".32"/><stop offset="100%" stopColor="#8a7dff" stopOpacity="0"/></linearGradient></defs><path d="M0 104 C29 100 39 87 62 91 S97 108 123 75 S158 83 185 61 S220 72 248 39 S282 54 311 31 S352 45 378 16 S399 24 420 8 L420 122 L0 122Z" fill="url(#landingChart)"/><path d="M0 104 C29 100 39 87 62 91 S97 108 123 75 S158 83 185 61 S220 72 248 39 S282 54 311 31 S352 45 378 16 S399 24 420 8" fill="none" stroke="#7669ef" strokeWidth="3" strokeLinecap="round"/></svg></div>
            </section>
          </div>
        </div>
        <article className="landing-float-card"><span className="landing-float-card__icon"><CheckCircle2 size={18}/></span><div><small>Venda confirmada</small><b>R$ 2.890 entrou no faturamento</b></div></article>
      </div>
    </section>

    <section className="landing-proof" aria-label="Benefícios do Otimiza AI CRM"><span><b>7 dias</b> para testar tudo</span><span><b>1 lugar</b> para atendimento e resultado</span><span><b>5 números</b> em uma mesma conta</span></section>

    <section className="landing-section landing-how" id="recursos">
      <div className="landing-section__intro"><span className="landing-section__eyebrow">FLUXO SIMPLES</span><h2>Seu atendimento deixa de ficar espalhado.</h2><p>O CRM organiza a operação desde a entrada do lead até a confirmação da venda.</p></div>
      <div className="landing-steps"><article><span>01</span><div className="landing-step-icon"><Link2 size={21}/></div><h3>Conecte o WhatsApp</h3><p>Crie sua conta e conecte cada número pelo QR Code da Evolution.</p></article><article><span>02</span><div className="landing-step-icon landing-step-icon--purple"><Target size={21}/></div><h3>Organize o funil</h3><p>Leads entram no Kanban e sua equipe acompanha a etapa de cada negociação.</p></article><article><span>03</span><div className="landing-step-icon landing-step-icon--mint"><CircleDollarSign size={21}/></div><h3>Confirme o resultado</h3><p>Quando uma venda é confirmada, o valor aparece no faturamento do painel.</p></article></div>
    </section>

    <section className="landing-section landing-feature-grid">
      <article className="landing-feature-card landing-feature-card--kanban"><div><span className="landing-section__eyebrow">CRM + WHATSAPP</span><h2>O Kanban acompanha o ritmo de cada conversa.</h2><p>Encontre o próximo passo, registre valores e avance o lead com sua equipe.</p><ul><li><CheckCircle2 size={16}/> Etapas personalizáveis</li><li><CheckCircle2 size={16}/> Histórico centralizado</li><li><CheckCircle2 size={16}/> Vários números por conta</li></ul></div><div className="landing-kanban-demo" aria-label="Exemplo demonstrativo de Kanban"><span className="landing-demo-label">Demonstração</span><div><section><b>Novos leads</b><small>3 contatos</small><article><span>MC</span><strong>Mariana Costa</strong><small>Quero saber os valores</small><i>Meta Ads</i></article><article><span>LA</span><strong>Lucas Almeida</strong><small>Tem disponibilidade?</small><i>Orgânico</i></article></section><section><b>Negociação</b><small>2 contatos</small><article><span>PV</span><strong>Paulo Viana</strong><small>Fecho hoje nessa condição</small><i>R$ 1.500</i></article></section><section><b>Ganhos</b><small>1 contato</small><article><span>RM</span><strong>Ricardo Matos</strong><small>Pagamento confirmado</small><i>R$ 2.100</i></article></section></div></div></article>
      <article className="landing-feature-card landing-feature-card--revenue"><div className="landing-revenue-demo"><span className="landing-demo-label">Demonstração</span><div className="landing-revenue-total"><small>Faturamento confirmado</small><strong>R$ 18.740</strong><span>12 vendas confirmadas</span></div><div className="landing-revenue-bars"><i style={{ height: '42%' }}/><i style={{ height: '62%' }}/><i style={{ height: '51%' }}/><i style={{ height: '78%' }}/><i style={{ height: '92%' }}/><i style={{ height: '72%' }}/></div></div><div><span className="landing-section__eyebrow">RESULTADOS REAIS</span><h2>Faturamento que se apoia em vendas confirmadas.</h2><p>O total do painel reúne somente os valores que sua equipe confirmou. Assim, você vê o que de fato entrou no resultado.</p><a href="#perguntas">Entenda o cálculo <ArrowRight size={16}/></a></div></article>
    </section>

    <section className="landing-section landing-origin">
      <div><span className="landing-section__eyebrow">ORIGEM DOS LEADS</span><h2>Veja o que está trazendo oportunidades para o seu negócio.</h2><p>Registre a origem quando o lead entrar e informe o investimento de cada fonte no CRM. A visualização reúne seus dados comerciais e de tráfego.</p><div className="landing-origin__notice"><ShieldCheck size={17}/><span>Nesta fase, o investimento é informado no CRM. A integração automática com Meta Ads não faz parte da oferta inicial.</span></div></div>
      <div className="landing-origin-demo" aria-label="Demonstração de origem de leads"><span className="landing-demo-label">Demonstração</span><header><div><small>ORIGEM DOS RESULTADOS</small><b>Leads e receita</b></div><span>Setembro</span></header><div className="landing-origin-row"><i className="landing-origin-dot landing-origin-dot--purple"/><b>Campanha clínica</b><span><em style={{ width: '78%' }}/></span><strong>R$ 9.540</strong></div><div className="landing-origin-row"><i className="landing-origin-dot landing-origin-dot--mint"/><b>Indicação</b><span><em style={{ width: '52%' }}/></span><strong>R$ 5.310</strong></div><div className="landing-origin-row"><i className="landing-origin-dot landing-origin-dot--coral"/><b>Orgânico</b><span><em style={{ width: '36%' }}/></span><strong>R$ 3.890</strong></div><footer>Dados demonstrativos. Receita considera vendas confirmadas.</footer></div>
    </section>

    <section className="landing-section landing-pricing" id="planos">
      <div className="landing-section__intro landing-section__intro--center"><span className="landing-section__eyebrow">PLANOS MENSAIS</span><h2>Comece com o plano certo para o seu atendimento.</h2><p>Todos começam com 7 dias grátis, sem cartão. Você escolhe o número de WhatsApps antes de criar a conta.</p></div>
      <p className="landing-pricing__instruction"><b>1. Escolha o plano</b><span>Clique no plano que combina com a sua operação.</span></p>
      <div className="landing-plan-cards landing-plan-cards--picker" role="radiogroup" aria-label="Escolha seu plano">{(Object.keys(publicPlans) as PurchasablePlan[]).map((item) => { const current = publicPlans[item]; const total = selectedPrice(item, channelLimit); const isSelected = plan === item; return <article className={`landing-plan-card ${item === 'chatbot' ? 'landing-plan-card--featured' : ''} ${isSelected ? 'is-selected' : ''}`} key={item} onClick={() => setPlan(item)}>{item === 'chatbot' && <span className="landing-plan-card__badge">Para automatizar respostas</span>}<div className="landing-plan-card__selection" aria-hidden="true">{isSelected && <><CheckCircle2 size={16}/> Selecionado</>}</div><span className="landing-section__eyebrow">{item === 'crm' ? 'ESSENCIAL' : 'CHATBOT'}</span><h3>{current.name}</h3><p>{current.description}</p><strong>{formatCents(total)}<small>/mês</small></strong><span className="landing-plan-card__detail">{channelLimit === 1 ? '1 número incluso' : `1 número incluso + ${channelLimit - 1} adicional${channelLimit === 2 ? '' : 'is'}`}</span><ul>{current.features.map((feature) => <li key={feature}><CheckCircle2 size={16}/>{feature}</li>)}</ul><button className={isSelected ? 'landing-plan-selected' : 'landing-outline-button'} type="button" role="radio" aria-checked={isSelected} onClick={(event) => { event.stopPropagation(); setPlan(item) }}>{isSelected ? <>Plano escolhido <CheckCircle2 size={16}/></> : <>Escolher este plano <ArrowRight size={16}/></>}</button></article>})}</div>
      <div className="landing-calculator" aria-label="Defina a quantidade de números"><div className="landing-calculator__controls"><div><span className="landing-calculator__step">2. Quantos números de WhatsApp você quer conectar?</span><p>Você pode usar até 5 números em uma mesma conta.</p><div className="landing-number-switch" aria-label="Quantidade de números">{[1, 2, 3, 4, 5].map((count) => <button type="button" aria-pressed={channelLimit === count} className={channelLimit === count ? 'is-active' : ''} key={count} onClick={() => setChannelLimit(count)}><b>{count}</b><span>{count === 1 ? 'número' : 'números'}</span></button>)}</div></div></div><div className="landing-calculator__total"><small>Seu plano: <b>{activePlan.name}</b></small><strong>{formatCents(activePrice)}<small>/mês</small></strong><span>1 número incluso{channelLimit > 1 ? ` + ${channelLimit - 1} adicional${channelLimit === 2 ? '' : 'is'}` : ''}</span><button className="landing-button" type="button" onClick={() => startTrial()}>Começar teste grátis <ArrowRight size={17}/></button></div></div>
      <p className="landing-pricing-note">Número adicional: {formatCents(activePlan.extraCents)}/mês no plano escolhido. A contratação é concluída com a equipe Otimiza após o teste.</p>
    </section>

    <section className="landing-section landing-faq" id="perguntas"><div className="landing-faq__intro"><span className="landing-section__eyebrow">PERGUNTAS FREQUENTES</span><h2>Para começar com clareza.</h2><p>Se ainda restar alguma dúvida, fale com a nossa equipe.</p>{whatsapp && <a className="landing-text-link" href={whatsapp} target="_blank" rel="noreferrer">Chamar no WhatsApp <MessageCircleMore size={17}/></a>}</div><div className="landing-faq__list"><details><summary>Como conecto meu WhatsApp?<ChevronRight size={18}/></summary><p>Depois de criar a conta, acesse Configurações e conecte cada número pelo QR Code. O CRM registra as conversas do número conectado.</p></details><details><summary>Como sei de onde o lead veio?<ChevronRight size={18}/></summary><p>Você pode registrar a origem ao criar o lead ou padronizar as origens usadas pela equipe, como campanha, indicação, orgânico e Google.</p></details><details><summary>Como o faturamento é calculado?<ChevronRight size={18}/></summary><p>O faturamento reúne apenas vendas confirmadas no CRM. Valores em negociação ficam separados até a confirmação.</p></details><details><summary>Qual é a diferença do plano Chatbot?<ChevronRight size={18}/></summary><p>Ele libera a aba de Chatbot para criar mensagens de boas-vindas, respostas padrão e regras por palavra-chave para cada número conectado.</p></details><details><summary>Posso integrar mais de um número?<ChevronRight size={18}/></summary><p>Sim. Cada plano começa com um número e permite contratar até cinco. O total é atualizado no cadastro conforme a quantidade escolhida.</p></details><details><summary>O teste grátis pede cartão?<ChevronRight size={18}/></summary><p>Não. O teste dura 7 dias e não cria cobrança automática. Ao término, sua escolha fica registrada e a equipe da Otimiza conclui a contratação.</p></details></div></section>

    <section className="landing-final"><div><span className="landing-kicker"><i/> Comece em poucos minutos</span><h2>Seu próximo resultado pode começar com uma conversa organizada.</h2><p>Crie a conta, conecte seu WhatsApp e acompanhe seu funil por 7 dias.</p></div><button className="landing-button landing-button--light" type="button" onClick={() => startTrial()}>Experimentar o CRM <ArrowRight size={18}/></button></section>
    <footer className="landing-footer"><a href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }}><BrandLockup dark /></a><span>© {new Date().getFullYear()} Otimiza AI. CRM para resultados comerciais.</span><button type="button" onClick={() => onNavigate('/entrar')}>Entrar no CRM</button></footer>
  </main>
}


const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'crm', label: 'CRM', icon: Target },
  { id: 'leads', label: 'Leads', icon: UsersRound },
  { id: 'conversas', label: 'Conversas', icon: MessageCircleMore },
  { id: 'vendas', label: 'Vendas', icon: CircleDollarSign },
  { id: 'trafego', label: 'Tráfego pago', icon: TrendingUp },
  { id: 'relatorios', label: 'Resultados', icon: BarChart3 },
]

const chatbotNavItem: typeof navItems[number] = { id: 'chatbot', label: 'Chatbot', icon: Bot }

function MetricCard({ title, value, trend, emphasis, tone, onOpen }: { title: string; value: string; trend: string; emphasis?: boolean; tone?: 'revenue' | 'pipeline' | 'leads' | 'ticket'; onOpen?: () => void }) {
  const interactive = onOpen ? {
    role: 'button' as const,
    tabIndex: 0,
    'aria-haspopup': 'dialog' as const,
    'aria-label': `${title}: ${value}. Abrir detalhes`,
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } },
  } : {}
  return (
    <article className={`metric-card ${emphasis ? 'metric-card--emphasis' : ''} ${tone ? `metric-card--${tone}` : ''} ${onOpen ? 'metric-card--clickable' : ''}`} {...interactive}>
      <div className="metric-card__top"><span>{title}</span>{onOpen ? <ArrowUpRight className="metric-card__open" size={17} aria-hidden="true" /> : <MoreHorizontal size={18} />}</div>
      <strong>{value}</strong>
      <p><TrendingUp size={14} /> {trend}</p>
    </article>
  )
}

function Avatar({ initials, small = false }: { initials: string; small?: boolean }) {
  return <span className={`avatar ${small ? 'avatar--small' : ''}`}>{initials}</span>
}

const leadInterest: Record<Lead['temperature'], { label: string; description: string }> = {
  Quente: { label: 'Prioritário', description: 'Demonstrou forte intenção de compra' },
  Morno: { label: 'Em análise', description: 'Ainda está avaliando a proposta' },
  Novo: { label: 'Primeiro contato', description: 'Chegou recentemente e ainda precisa ser qualificado' },
}

function LeadInterest({ temperature }: { temperature: Lead['temperature'] }) {
  const interest = leadInterest[temperature]
  return <span className={`temperature temperature--${temperature.toLowerCase()}`} title={interest.description}><i aria-hidden="true" />{interest.label}</span>
}

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.78 7.05L4 20l1.48-4.02A8 8 0 1 1 20 11.5Z" fill="currentColor"/><path d="M9.05 7.75c.18-.43.36-.44.63-.44h.54c.16 0 .38.06.49.35l.75 1.78c.08.19.05.4-.08.55l-.43.54c-.09.1-.12.25-.06.37.25.53.72 1.17 1.28 1.62.57.46 1.24.79 1.79.95.13.04.27 0 .36-.11l.46-.55c.13-.15.33-.21.51-.13l1.69.79c.28.13.32.35.29.51-.1.58-.34 1.09-.77 1.33-.3.17-.7.31-1.16.24-1.02-.17-2.35-.88-3.54-1.98-1.19-1.09-1.95-2.42-2.15-3.41-.1-.46.01-.87.15-1.2Z" fill="#fff"/></svg>
}

function LeadCard({ lead, onClick, onOpenChat, onDragStart, onDragEnd }: { lead: Lead; onClick: () => void; onOpenChat?: () => void; onDragStart?: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd?: () => void }) {
  return (
    <button className="lead-card" onClick={onClick} type="button" draggable={Boolean(onDragStart)} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="lead-card__top">
        <Avatar initials={lead.initials} />
        <LeadInterest temperature={lead.temperature} />
      </div>
      <div className="lead-card__name-row"><strong>{lead.name}</strong>{onOpenChat && <span className="lead-card__actions"><span className="lead-card__chat lead-card__chat--whatsapp" role="button" tabIndex={0} title="Abrir conversa no WhatsApp" aria-label={`Abrir conversa no WhatsApp com ${lead.name}`} draggable={false} onClick={(event) => { event.stopPropagation(); onOpenChat() }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onOpenChat() } }}><WhatsAppIcon size={15} /></span></span>}</div>
      <p>{lead.lastMessage}</p>
      <div className="lead-card__tags"><span>{lead.source}</span><span>{lead.channel}</span></div>
      <div className="lead-card__footer">
        <span><Clock3 size={14} />{lead.time}</span>
        <span className="card-owner"><Avatar initials={lead.avatar} small />{lead.value ? money(lead.value) : 'Sem valor'}</span>
      </div>
    </button>
  )
}

type MetricKind = 'revenue' | 'pipeline' | 'leads' | 'ticket'
type MetricAction = { kind: 'lead'; lead: Lead } | { kind: 'stage'; stage: Stage } | { kind: 'page'; page: Page } | { kind: 'search'; text: string }
type MetricRow = { label: string; sub?: string; value: string; share?: number; action?: MetricAction; hint?: string }
type MetricDetail = {
  kind: MetricKind
  eyebrow: string
  title: string
  value: string
  definition: string
  how: string
  stats: Array<{ label: string; value: string }>
  sections: Array<{ title: string; empty: string; rows: MetricRow[] }>
  note?: string
  cta: { label: string; page: Page }
}
type DashboardMetrics = { confirmedRevenue: number; confirmedSales: number; openLeads: number; averageTicket: number; leadsThisMonth: number }

const metricIcons: Record<MetricKind, typeof Target> = { revenue: CircleDollarSign, pipeline: Target, leads: UsersRound, ticket: Receipt }

// Monta o conteúdo do card de detalhes. Respeita o botão "ocultar números" do Dashboard.
function buildMetricDetail(kind: MetricKind, { metrics, leads, sales, hide }: { metrics?: DashboardMetrics; leads: Lead[]; sales: SaleRow[]; hide: boolean }): MetricDetail {
  const mask = (value: string) => hide ? '••••' : value
  const m = (value: number) => mask(money(value))
  const sum = (rows: SaleRow[]) => rows.reduce((total, sale) => total + Number(sale.amount), 0)
  const confirmed = sales.filter((sale) => sale.status === 'confirmed')
  const detected = sales.filter((sale) => sale.status === 'detected')
  const dateOf = (sale: SaleRow) => new Date(sale.confirmed_at ?? sale.created_at)
  const saleName = (sale: SaleRow) => sale.contact_name ?? sale.opportunity_title ?? 'Venda sem contato'
  const openStages: Stage[] = stages.filter((stage) => stage !== 'Ganhos' && stage !== 'Perdidos')
  const openLeads = leads.filter((lead) => openStages.includes(lead.stage))
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

  if (kind === 'revenue') {
    return {
      kind, eyebrow: 'FATURAMENTO', title: 'Receita confirmada', value: m(metrics?.confirmedRevenue ?? 0),
      definition: 'Tudo o que já foi confirmado como venda e entrou de verdade no seu faturamento.',
      how: 'Soma de todas as vendas com status Confirmada. Só você confirma uma venda; a IA apenas sinaliza as possíveis. O total é acumulado desde o início, não só do mês.',
      stats: [{ label: 'Vendas confirmadas', value: mask(String(confirmed.length)) }, { label: 'Ticket médio', value: m(metrics?.averageTicket ?? 0) }, { label: 'Em revisão pela IA', value: m(sum(detected)) }],
      sections: [{
        title: 'Últimas vendas confirmadas', empty: 'Nenhuma venda confirmada ainda. Quando você confirmar a primeira, ela aparece aqui.',
        rows: [...confirmed].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()).slice(0, 5).map((sale) => ({ label: saleName(sale), sub: `Confirmada em ${dateOf(sale).toLocaleDateString('pt-BR')}`, value: m(Number(sale.amount)), action: { kind: 'page' as const, page: 'vendas' as const }, hint: 'Ver em Vendas' })),
      }],
      note: detected.length ? `Há ${m(sum(detected))} em ${hide ? '••••' : plural(detected.length, 'venda', 'vendas')} esperando sua revisão. Esse valor só vira receita depois que você confirmar.` : undefined,
      cta: { label: 'Abrir Vendas', page: 'vendas' },
    }
  }

  if (kind === 'pipeline') {
    const potential = openLeads.reduce((total, lead) => total + (lead.value ?? 0), 0)
    return {
      kind, eyebrow: 'FUNIL DE VENDAS', title: 'Em negociação', value: mask(`${openLeads.length} ${openLeads.length === 1 ? 'lead' : 'leads'}`),
      definition: 'Leads que ainda estão em atendimento no funil: não fecharam e também não foram perdidos.',
      how: 'Conta os leads das etapas Novos leads, Qualificados, Proposta enviada e Negociação. Ganhos e Perdidos ficam de fora.',
      stats: [{ label: 'Valor em jogo', value: m(potential) }, { label: 'Leads quentes', value: mask(String(openLeads.filter((lead) => lead.temperature === 'Quente').length)) }, { label: 'Sem valor definido', value: mask(String(openLeads.filter((lead) => !lead.value).length)) }],
      sections: [
        { title: 'Por etapa do funil', empty: 'Nenhum lead em andamento.', rows: openStages.map((stage) => { const inStage = openLeads.filter((lead) => lead.stage === stage); return { label: stage, sub: m(inStage.reduce((total, lead) => total + (lead.value ?? 0), 0)), value: mask(String(inStage.length)), share: openLeads.length ? Math.round((inStage.length / openLeads.length) * 100) : 0, action: { kind: 'stage' as const, stage }, hint: `Ver a etapa ${stage} no CRM` } }) },
        { title: 'Maiores oportunidades', empty: 'Defina o valor dos leads para ver as maiores oportunidades.', rows: [...openLeads].filter((lead) => lead.value).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 3).map((lead) => ({ label: lead.name, sub: lead.stage, value: m(lead.value ?? 0), action: { kind: 'lead' as const, lead }, hint: 'Abrir o lead' })) },
      ],
      cta: { label: 'Abrir CRM', page: 'crm' },
    }
  }

  if (kind === 'leads') {
    const bySource = Array.from(leads.reduce((acc, lead) => acc.set(lead.source, (acc.get(lead.source) ?? 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1])
    const byHeat = (['Quente', 'Morno', 'Novo'] as const).map((temperature) => ({ temperature, count: leads.filter((lead) => lead.temperature === temperature).length }))
    return {
      kind, eyebrow: 'NOVOS CONTATOS', title: 'Novos leads', value: mask(String(metrics?.leadsThisMonth ?? 0)),
      definition: 'Pessoas que falaram com você pela primeira vez neste mês.',
      how: 'Conta contatos novos desde o dia 1 do mês, tanto os que chegaram pelo WhatsApp quanto os cadastrados à mão.',
      stats: [{ label: 'Neste mês', value: mask(String(metrics?.leadsThisMonth ?? 0)) }, { label: 'Total no CRM', value: mask(String(leads.length)) }, { label: 'Principal origem', value: bySource[0]?.[0] ?? '—' }],
      sections: [
        { title: 'De onde vieram', empty: 'As origens aparecem quando entrarem os primeiros leads.', rows: bySource.slice(0, 5).map(([source, count]) => ({ label: source, sub: plural(count, 'lead', 'leads'), value: mask(`${Math.round((count / Math.max(leads.length, 1)) * 100)}%`), share: Math.round((count / Math.max(leads.length, 1)) * 100), action: { kind: 'search' as const, text: source }, hint: `Ver leads de ${source}` })) },
        { title: 'Momento dos leads', empty: 'Sem leads ainda.', rows: leads.length ? byHeat.map(({ temperature, count }) => ({ label: leadInterest[temperature].label, sub: leadInterest[temperature].description, value: mask(String(count)), share: Math.round((count / Math.max(leads.length, 1)) * 100), action: { kind: 'page' as const, page: 'leads' as const }, hint: 'Ver leads' })) : [] },
      ],
      cta: { label: 'Ver Leads', page: 'leads' },
    }
  }

  const biggest = [...confirmed].sort((a, b) => Number(b.amount) - Number(a.amount))
  return {
    kind, eyebrow: 'VENDAS', title: 'Ticket médio', value: m(metrics?.averageTicket ?? 0),
    definition: 'Quanto cada venda confirmada rende, em média.',
    how: 'Receita confirmada dividida pelo número de vendas confirmadas.',
    stats: [{ label: 'Receita confirmada', value: m(metrics?.confirmedRevenue ?? 0) }, { label: 'Vendas confirmadas', value: mask(String(confirmed.length)) }, { label: 'Maior venda', value: m(Number(biggest[0]?.amount ?? 0)) }],
    sections: [{
      title: 'Vendas que formam a média', empty: 'Ainda não há vendas confirmadas. Quando você confirmar a primeira, a média aparece aqui.',
      rows: biggest.slice(0, 5).map((sale) => ({ label: saleName(sale), sub: `Confirmada em ${dateOf(sale).toLocaleDateString('pt-BR')}`, value: m(Number(sale.amount)), share: Math.round((Number(sale.amount) / Math.max(Number(biggest[0]?.amount ?? 1), 1)) * 100), action: { kind: 'page' as const, page: 'vendas' as const }, hint: 'Ver em Vendas' })),
    }],
    cta: { label: 'Abrir Vendas', page: 'vendas' },
  }
}

function MetricDetailModal({ detail, onClose, onNavigate, onAction }: { detail: MetricDetail; onClose: () => void; onNavigate: (page: Page) => void; onAction: (action: MetricAction) => void }) {
  const Icon = metricIcons[detail.kind]
  return (
    <Modal onClose={onClose} label={detail.title} wide>
      <header className="modal__header metric-detail__header">
        <span className={`metric-detail__badge metric-detail__badge--${detail.kind}`} aria-hidden="true"><Icon size={19} /></span>
        <div><span className="eyebrow">{detail.eyebrow}</span><h2>{detail.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes"><X size={18} /></button>
      </header>
      <div className="metric-detail__hero"><strong>{detail.value}</strong><p>{detail.definition}</p></div>
      <dl className="metric-detail__stats">{detail.stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
      {detail.note && <p className="metric-detail__note"><ClipboardCheck size={15} aria-hidden="true" />{detail.note}</p>}
      {detail.sections.map((section) => (
        <section className="metric-detail__section" key={section.title}>
          <h3>{section.title}</h3>
          {section.rows.length ? <ul>{section.rows.map((row) => {
            const content = <><div><b>{row.label}</b>{row.sub && <small>{row.sub}</small>}{row.share !== undefined && <i className="metric-detail__bar" aria-hidden="true"><em style={{ width: `${Math.min(Math.max(row.share, 2), 100)}%` }} /></i>}</div><span>{row.value}</span></>
            const key = `${row.label}-${row.sub ?? ''}`
            const action = row.action
            return action
              ? <li className="is-link" key={key}><button type="button" title={row.hint} aria-label={`${row.label}: ${row.value}. ${row.hint ?? 'Abrir'}`} onClick={() => onAction(action)}>{content}<ChevronRight className="metric-detail__go" size={16} aria-hidden="true" /></button></li>
              : <li key={key}>{content}</li>
          })}</ul> : <p className="metric-detail__empty">{section.empty}</p>}
        </section>
      ))}
      <details className="metric-detail__how"><summary>Como esse número é calculado</summary><p>{detail.how}</p></details>
      <footer className="metric-detail__footer">
        <button className="secondary-button" type="button" onClick={onClose}>Fechar</button>
        <button className="primary-button" type="button" onClick={() => { onClose(); onNavigate(detail.cta.page) }}>{detail.cta.label} <ArrowRight size={16} /></button>
      </footer>
    </Modal>
  )
}

function DashboardRevenueChart({ timeline }: { timeline: Array<{ date: string; revenue: string }> }) {
  const cumulative = timeline.reduce<number[]>((values, day) => { values.push((values.at(-1) ?? 0) + Number(day.revenue)); return values }, [])
  const maximum = Math.max(...cumulative, 1)
  const points = cumulative.map((value, index) => `${cumulative.length === 1 ? 340 : index * 680 / (cumulative.length - 1)},${184 - (value / maximum) * 160}`).join(' ')
  const axis = [0, .25, .5, .75, 1].map((fraction) => timeline[Math.round((timeline.length - 1) * fraction)]?.date ?? '')
  return <><div className="chart" role="img" aria-label={`Evolução acumulada do faturamento confirmado: ${money(cumulative.at(-1) ?? 0)}`}><div className="chart__grid"/><svg viewBox="0 0 680 208" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="dashboardChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a69cff" stopOpacity=".48"/><stop offset="100%" stopColor="#a69cff" stopOpacity="0"/></linearGradient></defs>{points && <><path d={`M 0 208 L ${points} L 680 208 Z`} fill="url(#dashboardChartFill)"/><polyline points={points} fill="none" stroke="#655ce0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}</svg></div><div className="chart-axis">{axis.map((date, index) => <span key={`${date}-${index}`}>{date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '—'}</span>)}</div></>
}

function Dashboard({ session, onNavigate, onOpenLead, onFocusStage, onSearchLeads, metrics, leads, sales }: { session: Session; onNavigate: (page: Page) => void; onOpenLead: (lead: Lead) => void; onFocusStage: (stage: Stage) => void; onSearchLeads: (text: string) => void; metrics?: { confirmedRevenue: number; confirmedSales: number; openLeads: number; averageTicket: number; leadsThisMonth: number }; leads: Lead[]; sales: SaleRow[] }) {
  const [areValuesVisible, setAreValuesVisible] = useState(true)
  const [openMetric, setOpenMetric] = useState<MetricKind | null>(null)
  const currentDate = new Date()
  const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.reports>> | null>(null)
  const [reportError, setReportError] = useState('')
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => { const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - index, 1); const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; return { value, label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) } }), [currentMonth])
  useEffect(() => {
    let cancelled = false
    const [year, month] = selectedMonth.split('-').map(Number)
    const start = `${selectedMonth}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = selectedMonth === currentMonth ? `${selectedMonth}-${String(currentDate.getDate()).padStart(2, '0')}` : `${selectedMonth}-${lastDay}`
    setReport(null); setReportError('')
    void api.reports(session, start, end).then((data) => { if (!cancelled) setReport(data) }).catch((reason) => { if (!cancelled) setReportError(reason instanceof Error ? reason.message : 'Não foi possível carregar este período.') })
    return () => { cancelled = true }
  }, [session, selectedMonth, currentMonth])
  if (!report) return <section className="panel page-loading">{reportError || 'Carregando os resultados do mês...'}</section>
  const revenue = Number(report.totals.revenue)
  const confirmedSales = Number(report.totals.sales)
  const openLeads = metrics?.openLeads ?? 0
  const averageTicket = Number(report.totals.ticket)
  const leadsThisMonth = Number(report.totals.leads)
  const selectedLabel = monthOptions.find((item) => item.value === selectedMonth)?.label ?? selectedMonth
  const periodSales = sales.filter((sale) => sale.status === 'confirmed' && sale.confirmed_at?.slice(0, 7) === selectedMonth)
  const periodLeads = leads.filter((lead) => lead.createdAt?.slice(0, 7) === selectedMonth)
  const periodMetrics = { confirmedRevenue: revenue, confirmedSales, averageTicket, leadsThisMonth, openLeads }
  const attention = leads.filter((lead) => lead.stage !== 'Ganhos' && lead.stage !== 'Perdidos').slice(0, 3)
  const show = (value: string) => areValuesVisible ? value : '••••'
  const showMoney = (value: number) => show(money(value))
  const sourceResults = report.sources.map((source) => ({ name: source.source, revenue: Number(source.revenue), leads: Number(source.leads) })).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)
  return (
    <>
      <section className="page-head">
        <div><span className="eyebrow">VISÃO GERAL · {selectedLabel.toLocaleUpperCase('pt-BR')}</span><h1>Resultados do seu atendimento.</h1><p>Receita confirmada no período e oportunidades que precisam de atenção.</p></div>
        <div className="head-actions"><button className="icon-button" type="button" title={areValuesVisible ? 'Ocultar números' : 'Mostrar números'} aria-label={areValuesVisible ? 'Ocultar números do Dashboard' : 'Mostrar números do Dashboard'} aria-pressed={!areValuesVisible} onClick={() => setAreValuesVisible((current) => !current)}>{areValuesVisible ? <Eye size={17}/> : <EyeOff size={17}/>}</button><label className="period-button"><CalendarDays size={15}/><select aria-label="Selecionar mês dos resultados" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16}/></label></div>
      </section>
      <section className="metric-grid">
        <MetricCard title="Receita confirmada" value={showMoney(revenue)} trend={areValuesVisible ? `${confirmedSales} venda${confirmedSales === 1 ? '' : 's'} confirmada${confirmedSales === 1 ? '' : 's'}` : 'Vendas confirmadas'} emphasis tone="revenue" onOpen={() => setOpenMetric('revenue')} />
        <MetricCard title="Em negociação" value={areValuesVisible ? `${openLeads} leads` : '••••'} trend="Situação atual do funil" tone="pipeline" onOpen={() => setOpenMetric('pipeline')} />
        <MetricCard title="Novos leads" value={show(String(leadsThisMonth))} trend="Entraram no período" tone="leads" onOpen={() => setOpenMetric('leads')} />
        <MetricCard title="Ticket médio" value={showMoney(averageTicket)} trend="Receita confirmada" tone="ticket" onOpen={() => setOpenMetric('ticket')} />
      </section>
      {openMetric && <MetricDetailModal detail={buildMetricDetail(openMetric, { metrics: periodMetrics, leads: openMetric === 'pipeline' ? leads : periodLeads, sales: periodSales, hide: !areValuesVisible })} onClose={() => setOpenMetric(null)} onNavigate={onNavigate} onAction={(action) => { setOpenMetric(null); if (action.kind === 'page') onNavigate(action.page); else if (action.kind === 'lead') onOpenLead(action.lead); else if (action.kind === 'stage') onFocusStage(action.stage); else onSearchLeads(action.text) }} />}
      <section className="dashboard-grid">
        <article className="revenue-panel panel">
          <div className="panel__header"><div><span className="eyebrow">RECEITA CONFIRMADA</span><h2>Faturamento ao longo do mês</h2></div><button className="text-button" type="button" onClick={() => onNavigate('relatorios')}>Ver resultados <ArrowRight size={16} /></button></div>
          <div className="chart-summary"><strong>{showMoney(revenue)}</strong><span><TrendingUp size={15} /> Atualizado</span></div>
          <DashboardRevenueChart timeline={report.timeline}/>
        </article>
        <article className="attention-panel panel">
          <div className="panel__header"><div><span className="eyebrow">PRÓXIMA AÇÃO</span><h2>Não deixe esfriar</h2></div><span className="count-pill">{areValuesVisible ? attention.length : '••'}</span></div>
          {attention.map((lead) => <div className="attention-lead" key={lead.id}><Avatar initials={lead.initials} /><div><strong>{lead.name}</strong><p>{lead.lastMessage}</p></div><button type="button" aria-label={`Abrir ${lead.name}`} onClick={() => onNavigate('crm')}><ChevronRight size={19} /></button></div>)}
          {!attention.length && <div className="dashboard-empty">Conecte seu WhatsApp ou crie um lead para acompanhar as próximas ações.</div>}
          <button className="wide-secondary" type="button" onClick={() => onNavigate('conversas')}>Abrir conversas pendentes <ArrowRight size={16} /></button>
        </article>
      </section>
      <section className="source-section panel">
        <div className="panel__header"><div><span className="eyebrow">ORIGEM DOS RESULTADOS</span><h2>O que trouxe as vendas do período</h2></div><button className="text-button" type="button" onClick={() => onNavigate('trafego')}>Analisar tráfego <ArrowRight size={16} /></button></div>
        <div className="source-rows">
          {sourceResults.length ? sourceResults.map((source, index) => { const percent = revenue ? Math.round((source.revenue / revenue) * 100) : Math.round((source.leads / Math.max(leadsThisMonth, 1)) * 100); const types = ['meta', 'google', 'referral', 'organic']; return <div className="source-row" key={source.name}><span className={`source-dot source-dot--${types[index % types.length]}`} /><strong>{source.name}</strong><div className="progress"><i style={{ width: `${percent}%` }} /></div><b>{showMoney(source.revenue)}</b><small>{show(`${percent}%`)}</small></div> }) : <div className="dashboard-empty">As origens aparecerão quando entrarem os primeiros leads.</div>}
        </div>
      </section>
    </>
  )
}

function Crm({ leads, channel, setChannel, onSelectLead, onAddLead, onMoveLead, onOpenChat, focusStage, onFocusHandled }: { leads: Lead[]; channel: Channel; setChannel: (channel: Channel) => void; onSelectLead: (lead: Lead) => void; onAddLead: () => void; onOpenChat?: (lead: Lead) => void; onMoveLead: (leadId: Lead['id'], stage: Stage) => void; focusStage?: Stage | null; onFocusHandled?: () => void }) {
  const [spotlight, setSpotlight] = useState<Stage | null>(null)
  useEffect(() => {
    if (!focusStage) return
    document.querySelector<HTMLElement>(`.kanban-column[data-stage="${focusStage}"]`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })
    setSpotlight(focusStage)
    onFocusHandled?.()
  }, [focusStage])
  useEffect(() => {
    if (!spotlight) return
    const timer = window.setTimeout(() => setSpotlight(null), 2800)
    return () => window.clearTimeout(timer)
  }, [spotlight])
  const [draggingId, setDraggingId] = useState<Lead['id'] | null>(null)
  const [overStage, setOverStage] = useState<Stage | null>(null)
  const [search, setSearch] = useState('')
  const searchTerm = search.trim().toLocaleLowerCase('pt-BR')
  const visible = useMemo(() => leads.filter((lead) => {
    const isChannelMatch = channel === 'Todos os canais' || lead.channel === channel
    const isSearchMatch = !searchTerm || `${lead.name} ${lead.phone ?? ''} ${lead.source}`.toLocaleLowerCase('pt-BR').includes(searchTerm)
    return isChannelMatch && isSearchMatch
  }), [leads, channel, searchTerm])
  return (
    <>
      <section className="page-head crm-head">
        <div><span className="eyebrow">PIPELINE COMERCIAL</span><h1>CRM</h1><p>Acompanhe cada conversa até a venda confirmada.</p></div>
        <div className="head-actions"><label className="channel-select"><Activity size={16}/><select value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>{channels.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16}/></label><button className="primary-button" type="button" onClick={onAddLead}><Plus size={18} /> Novo lead</button></div>
      </section>
      <section className="crm-toolbar"><div className="lead-search"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead ou telefone" aria-label="Buscar lead ou telefone" /></div>{searchTerm && <div className="lead-search__results" role="listbox" aria-label="Leads encontrados">{visible.slice(0, 5).map((lead) => <button className="lead-search__result" type="button" role="option" key={lead.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearch(''); onSelectLead(lead) }}><Avatar initials={lead.initials} small/><span><b>{lead.name}</b><small>{lead.phone || lead.source}</small></span><ChevronRight size={15}/></button>)}{!visible.length && <p>Nenhum lead encontrado.</p>}</div>}</div><button className="toolbar-button" type="button"><Filter size={16} /> Filtros</button><button className="toolbar-button" type="button"><Settings2 size={16} /> Etapas</button><span className="toolbar-spacer"/><span className="sync-status"><i /> WhatsApp sincronizado agora</span></section>
      <div className="kanban-shell">
      <div className="kanban-scroll-guide" aria-label="Há mais etapas do funil à direita"><span>Deslize para ver as próximas etapas</span><ArrowRight size={17}/></div>
      <section className="kanban" aria-label="Pipeline de vendas">
        {stages.map((stage, index) => {
          const columnLeads = visible.filter((lead) => lead.stage === stage)
          const total = columnLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0)
          return <article
            className={`kanban-column column-${index + 1}${overStage === stage ? ' kanban-column--over' : ''}${spotlight === stage ? ' kanban-column--spotlight' : ''}`}
            data-stage={stage}
            key={stage}
            onDragOver={(event) => { if (draggingId === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (overStage !== stage) setOverStage(stage) }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage((current) => current === stage ? null : current) }}
            onDrop={(event) => { event.preventDefault(); if (draggingId !== null) onMoveLead(draggingId, stage); setDraggingId(null); setOverStage(null) }}
          >
            <header><div><span className="column-marker"/><h2>{stage}</h2><b>{columnLeads.length}</b></div><button type="button" aria-label={`Ações de ${stage}`}><MoreHorizontal size={18}/></button></header>
            <div className="column-value">{total ? money(total) : '—'}</div>
            <div className="column-cards">{columnLeads.map((lead) => <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} onOpenChat={onOpenChat && lead.phone ? () => onOpenChat(lead) : undefined} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(lead.id)); setDraggingId(lead.id) }} onDragEnd={() => { setDraggingId(null); setOverStage(null) }} />)}</div>
            <button className="add-card" type="button" onClick={onAddLead}><Plus size={16} /> Adicionar lead</button>
          </article>
        })}
      </section>
      </div>
    </>
  )
}

function LeadsPage({ leads, onSelectLead, onAddLead, initialSearch = '' }: { leads: Lead[]; onSelectLead: (lead: Lead) => void; onAddLead: () => void; initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch)
  const visible = leads.filter((lead) => `${lead.name} ${lead.source}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  return <><section className="page-head crm-head"><div><span className="eyebrow">BASE DE CONTATOS</span><h1>Leads</h1><p>Todos os contatos que entraram no seu processo comercial.</p></div><button className="primary-button" type="button" onClick={onAddLead}><Plus size={18}/> Novo lead</button></section><section className="list-panel panel"><div className="list-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou origem"/></div><span>{visible.length} contato{visible.length === 1 ? '' : 's'}</span></div><div className="data-list">{visible.map((lead) => <button type="button" className="data-row" onClick={() => onSelectLead(lead)} key={lead.id}><Avatar initials={lead.initials}/><span className="data-row__main"><b>{lead.name}</b><small>{lead.lastMessage}</small></span><span className="data-row__source">{lead.source}</span><LeadInterest temperature={lead.temperature}/><span className="data-row__value">{lead.value ? money(lead.value) : 'Sem valor'}</span><ChevronRight size={17}/></button>)}{!visible.length && <div className="empty-list"><UsersRound size={19}/><p>Nenhum lead encontrado.</p></div>}</div></section></>
}

type SaleRow = { id: string; status: 'negotiation' | 'detected' | 'confirmed' | 'lost'; amount: string; confirmed_at: string | null; created_at: string; opportunity_id: string | null; contact_name: string | null; opportunity_title: string | null }

function SalesTrendChart({ sales }: { sales: SaleRow[] }) {
  const days = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (6 - index))
      const key = date.toISOString().slice(0, 10)
      const total = sales.filter((sale) => sale.status === 'confirmed' && (sale.confirmed_at ?? sale.created_at).slice(0, 10) === key).reduce((sum, sale) => sum + Number(sale.amount), 0)
      return { key, label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''), total }
    })
  }, [sales])
  const highest = Math.max(...days.map((day) => day.total), 1)
  const total = days.reduce((sum, day) => sum + day.total, 0)
  const best = days.reduce((current, day) => day.total > current.total ? day : current, days[0])
  return <section className="sales-overview panel">
    <header><div><span className="eyebrow">EVOLUÇÃO DE VENDAS</span><h2>Faturamento dos últimos 7 dias</h2></div><span className="sales-overview__total">{money(total)}</span></header>
    <div className="sales-bars" role="img" aria-label="Gráfico de faturamento confirmado dos últimos sete dias">{days.map((day) => <div className="sales-bars__item" key={day.key}><div className="sales-bars__track"><i style={{ height: `${Math.max(day.total ? 12 : 3, (day.total / highest) * 100)}%` }} title={`${day.label}: ${money(day.total)}`}/></div><small>{day.label}</small></div>)}</div>
    <footer><span><i/> Apenas vendas confirmadas</span><b>{best.total ? `Melhor dia: ${best.label} · ${money(best.total)}` : 'As vendas confirmadas aparecerão aqui'}</b></footer>
  </section>
}

function SalesPage({ sales, session, onRefresh }: { sales: SaleRow[]; session: Session; onRefresh: () => Promise<void> }) {
  const totals = sales.reduce((accumulator, sale) => { if (sale.status === 'confirmed') accumulator.confirmed += Number(sale.amount); else if (sale.status === 'detected') accumulator.detected += Number(sale.amount); return accumulator }, { confirmed: 0, detected: 0 })
  const confirmedCount = sales.filter((sale) => sale.status === 'confirmed').length
  const reviewSales = sales.filter((sale) => sale.status === 'detected')
  const averageTicket = confirmedCount ? totals.confirmed / confirmedCount : 0
  const statusLabel: Record<SaleRow['status'], string> = { confirmed: 'Confirmada', detected: 'Em revisão', negotiation: 'Negociação', lost: 'Perdida' }
  return <><section className="page-head"><div><span className="eyebrow">RESULTADOS COMERCIAIS</span><h1>Vendas</h1><p>Acompanhe a receita confirmada e revise os valores que a IA encontrou nas conversas.</p></div></section><section className="sales-summary"><article className="panel sales-summary__primary"><span>Receita confirmada</span><strong>{money(totals.confirmed)}</strong><small><TrendingUp size={13}/> {confirmedCount} venda{confirmedCount === 1 ? '' : 's'} confirmada{confirmedCount === 1 ? '' : 's'}</small></article><article className="panel"><span>Ticket médio</span><strong>{money(averageTicket)}</strong><small>Baseado nas vendas confirmadas</small></article><article className="panel"><span>Revisão da IA</span><strong>{money(totals.detected)}</strong><small>{reviewSales.length} venda(s) aguardando aprovação</small></article></section><div className={`sales-grid ${reviewSales.length ? '' : 'sales-grid--single'}`}><SalesTrendChart sales={sales}/>{reviewSales.length > 0 && <section className="ai-review panel"><div><span className="eyebrow">REVISÃO DA IA</span><h2>Confirme o que entrou no faturamento</h2><p>A IA sinaliza uma possível venda; somente sua confirmação registra receita no dashboard.</p></div><div className="ai-review__items">{reviewSales.slice(0, 5).map((sale) => <article key={sale.id}><span><ClipboardCheck size={17}/></span><div><b>{sale.contact_name ?? sale.opportunity_title ?? 'Venda detectada'}</b><small>Valor identificado: {money(Number(sale.amount))}</small></div><button className="secondary-button" type="button" onClick={() => { void api.confirmSale(session, sale.id).then(onRefresh) }}>Confirmar</button></article>)}</div>{reviewSales.length > 5 && <small className="ai-review__more">+{reviewSales.length - 5} venda(s) em revisão no histórico abaixo</small>}</section>}</div><section className="list-panel panel"><div className="list-toolbar"><b>Histórico de vendas</b><span>{sales.length} registro{sales.length === 1 ? '' : 's'}</span></div><div className="data-list">{sales.map((sale) => <div className="data-row data-row--static" key={sale.id}><span className={`sale-status sale-status--${sale.status}`}>{statusLabel[sale.status]}</span><span className="data-row__main"><b>{sale.contact_name ?? sale.opportunity_title ?? 'Venda sem contato'}</b><small>{sale.confirmed_at ? `Confirmada em ${new Date(sale.confirmed_at).toLocaleDateString('pt-BR')}` : sale.status === 'detected' ? 'Identificada pela IA · precisa de revisão' : 'Registrada no CRM'}</small></span><span className="data-row__value">{money(Number(sale.amount))}</span></div>)}{!sales.length && <div className="empty-list"><CircleDollarSign size={19}/><p>As vendas confirmadas aparecerão aqui.</p></div>}</div></section></>
}

type ConversationRow = { id: string; status: 'open' | 'closed'; last_message_at: string | null; contact_name: string | null; phone: string; channel_name: string; last_message: string | null; last_direction: 'inbound' | 'outbound' | null; sent_at: string | null; bot_paused?: boolean; last_type?: string | null; unread_count?: number }

function ConversationsPage({ conversations }: { conversations: ConversationRow[] }) {
  return <><section className="page-head"><div><span className="eyebrow">WHATSAPP CENTRALIZADO</span><h1>Conversas</h1><p>Consulte o histórico que chegou pelos números conectados.</p></div><span className="security-status"><ShieldCheck size={16}/> Somente leitura</span></section><section className="list-panel panel"><div className="list-toolbar"><b>Atendimentos recentes</b><span>{conversations.length} conversa{conversations.length === 1 ? '' : 's'}</span></div><div className="data-list">{conversations.map((conversation) => <article className="conversation-row" key={conversation.id}><Avatar initials={initialsFor(conversation.contact_name ?? conversation.phone)}/><div><b>{conversation.contact_name ?? conversation.phone}</b><p>{conversation.last_message ?? 'Nenhuma mensagem de texto disponível.'}</p><small>{conversation.channel_name} · {conversation.last_direction === 'outbound' ? 'Mensagem enviada' : 'Mensagem recebida'}</small></div><time>{conversation.sent_at ? new Date(conversation.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</time></article>)}{!conversations.length && <div className="empty-list"><MessageCircleMore size={19}/><p>Conecte um número para começar a registrar conversas.</p></div>}</div></section></>
}

function Placeholder({ icon: Icon, eyebrow, title, text }: { icon: typeof Bot; eyebrow: string; title: string; text: string }) {
  return <section className="empty-page panel"><div className="empty-page__icon"><Icon size={24}/></div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p><button className="primary-button" type="button"><Plus size={18}/> Configurar agora</button></section>
}

type TrafficRow = { id: string; source: string; platform: string; period_start: string; period_end: string; spend: string; reported_leads: string; impressions: string; clicks: string; crm_leads: string; confirmed_sales: string; confirmed_revenue: string }

function TrafficPage({ session }: { session: Session }) {
  const [items, setItems] = useState<TrafficRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState('Meta Ads')
  const [platform, setPlatform] = useState('Meta Ads')
  const [spend, setSpend] = useState('')
  const [reportedLeads, setReportedLeads] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 8)}01`)
  const [periodEnd, setPeriodEnd] = useState(today)
  const load = async () => { setLoading(true); try { setItems(await api.traffic(session)); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o tráfego.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [session])
  const totals = items.reduce((acc, item) => ({ spend: acc.spend + Number(item.spend), revenue: acc.revenue + Number(item.confirmed_revenue), leads: acc.leads + Math.max(Number(item.reported_leads), Number(item.crm_leads)), sales: acc.sales + Number(item.confirmed_sales) }), { spend: 0, revenue: 0, leads: 0, sales: 0 })
  const campaigns = items.map((item) => {
    const spend = Number(item.spend); const revenue = Number(item.confirmed_revenue); const leads = Math.max(Number(item.reported_leads), Number(item.crm_leads)); const sales = Number(item.confirmed_sales)
    return { ...item, spend, revenue, leads, sales, roas: spend ? revenue / spend : 0, cpl: leads ? spend / leads : 0 }
  }).sort((a, b) => b.roas - a.roas || b.revenue - a.revenue)
  const bestCampaign = campaigns[0]
  const costPerLead = totals.leads ? totals.spend / totals.leads : 0
  const revenuePerLead = totals.leads ? totals.revenue / totals.leads : 0
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { await api.createTraffic(session, { source, platform, periodStart, periodEnd, spend: Number(spend.replace(',', '.')), reportedLeads: Number(reportedLeads || 0) }); setSpend(''); setReportedLeads(''); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a métrica.') } finally { setSaving(false) }
  }
  return <><section className="page-head"><div><span className="eyebrow">RESULTADO DO TRÁFEGO</span><h1>Tráfego pago</h1><p>Veja quanto cada campanha colocou em investimento, trouxe de contatos e devolveu em vendas confirmadas.</p></div></section><section className="traffic-summary"><MetricCard title="Investimento" value={money(totals.spend)} trend={`${campaigns.length} campanha${campaigns.length === 1 ? '' : 's'} acompanhada${campaigns.length === 1 ? '' : 's'}`}/><MetricCard title="Receita atribuída" value={money(totals.revenue)} trend="Vendas já confirmadas" emphasis/><MetricCard title="ROAS" value={totals.spend ? `${(totals.revenue / totals.spend).toFixed(2)}x` : '—'} trend="Retorno por real investido"/><MetricCard title="Custo por lead" value={totals.leads ? money(costPerLead) : '—'} trend={`${totals.leads} lead${totals.leads === 1 ? '' : 's'} relacionado${totals.leads === 1 ? '' : 's'}`}/></section><section className="traffic-hero panel">{bestCampaign ? <><div><span className="eyebrow">LEITURA DO PERÍODO</span><h2>{bestCampaign.source} está trazendo o melhor retorno.</h2><p>Para cada R$ 1 investido nessa origem, o CRM atribuiu {money(bestCampaign.roas)} em vendas confirmadas.</p></div><div className="traffic-hero__numbers"><span><small>Melhor ROAS</small><b>{bestCampaign.roas.toFixed(2)}x</b></span><span><small>Receita por lead</small><b>{money(revenuePerLead)}</b></span><span><small>Vendas confirmadas</small><b>{totals.sales}</b></span></div></> : <><div><span className="eyebrow">COMECE A MEDIR</span><h2>Transforme o investimento em resultado visível.</h2><p>Registre cada campanha com o mesmo nome usado na origem do lead. O CRM relaciona os contatos e as vendas confirmadas automaticamente.</p></div><div className="traffic-hero__steps"><span><b>1</b> Registre a campanha</span><span><b>2</b> Use a origem nos leads</span><span><b>3</b> Acompanhe a receita</span></div></>}</section><section className="traffic-layout"><form className="traffic-form panel" onSubmit={submit}><div><span className="eyebrow">LANÇAMENTO MANUAL</span><h2>Registrar campanha</h2><p>Use a mesma origem cadastrada nos leads para o CRM atribuir contatos e vendas.</p></div><label>Nome da origem ou campanha<input required list="traffic-source-options" maxLength={80} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Ex.: Meta Ads · Implante outubro"/><datalist id="traffic-source-options">{[...new Set(items.map((item) => item.source))].map((item) => <option key={item} value={item}/>)}</datalist></label><label>Plataforma<select value={platform} onChange={(event) => setPlatform(event.target.value)}><option>Meta Ads</option><option>Google Ads</option><option>TikTok Ads</option><option>Outro</option></select></label><div className="form-inline"><label>Início<input required type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)}/></label><label>Fim<input required type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)}/></label></div><div className="form-inline"><label>Investimento (R$)<input required inputMode="decimal" value={spend} onChange={(event) => setSpend(event.target.value)} placeholder="0,00"/></label><label>Leads da campanha<input inputMode="numeric" value={reportedLeads} onChange={(event) => setReportedLeads(event.target.value)} placeholder="Opcional"/></label></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving} type="submit">{saving ? 'Salvando...' : 'Registrar campanha'} <ArrowRight size={16}/></button></form><section className="traffic-table panel"><div className="panel__header"><div><span className="eyebrow">CAMPANHAS REGISTRADAS</span><h2>Onde o investimento virou resultado</h2></div><span className="count-pill">{campaigns.length}</span></div>{loading ? <p className="page-loading">Carregando métricas...</p> : campaigns.length ? <div className="traffic-rows traffic-campaigns">{campaigns.map((item) => { const returnRate = item.spend ? Math.min((item.revenue / Math.max(item.spend, item.revenue, 1)) * 100, 100) : 0; const status = !item.revenue ? 'Aguardando venda' : item.roas >= 2 ? 'Retorno positivo' : 'Em acompanhamento'; return <article key={item.id}><div className="traffic-campaign__title"><span>{item.platform.slice(0, 1)}</span><div><b>{item.source}</b><small>{item.platform} · {new Date(`${item.period_start}T12:00:00`).toLocaleDateString('pt-BR')} a {new Date(`${item.period_end}T12:00:00`).toLocaleDateString('pt-BR')}</small></div><em className={item.roas >= 2 ? 'is-positive' : ''}>{status}</em></div><div className="traffic-campaign__metrics"><span><small>Investimento</small><b>{money(item.spend)}</b></span><span><small>Leads</small><b>{item.leads}</b></span><span><small>CPL</small><b>{item.leads ? money(item.cpl) : '—'}</b></span><span><small>Receita</small><b>{money(item.revenue)}</b></span><span><small>ROAS</small><b>{item.spend ? `${item.roas.toFixed(2)}x` : '—'}</b></span></div><div className="traffic-campaign__bar" aria-label={`Retorno de ${item.roas.toFixed(2)} vezes`}><i style={{ width: `${returnRate}%` }} /></div></article> })}</div> : <div className="traffic-empty"><span><TrendingUp size={20}/></span><div><b>Ainda não há campanhas registradas.</b><p>Comece pelo formulário ao lado. Depois, cadastre os leads com a mesma origem para acompanhar o retorno.</p></div></div>}</section></section></>
}

type ResultsMetric = 'revenue' | 'sales' | 'leads'

function ResultsTrendChart({ timeline, metric }: { timeline: Array<{ date: string; revenue: string; sales: string; leads: string }>; metric: ResultsMetric }) {
  const values = timeline.map((item) => Number(item[metric]))
  const max = Math.max(...values, 1)
  const height = 156
  const width = 720
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
    const y = height - (value / max) * (height - 20) - 10
    return `${x},${y}`
  }).join(' ')
  const color = metric === 'revenue' ? '#7669ef' : metric === 'sales' ? '#20a97f' : '#4291ee'
  return <div className="results-trend__body"><div className="results-trend__total"><b>{metric === 'revenue' ? money(values.reduce((sum, value) => sum + value, 0)) : values.reduce((sum, value) => sum + value, 0)}</b><span>{metric === 'revenue' ? 'Faturamento confirmado no período' : metric === 'sales' ? 'Vendas confirmadas no período' : 'Leads recebidos no período'}</span></div><div className="results-chart" role="img" aria-label={`Gráfico de ${metric === 'revenue' ? 'faturamento' : metric === 'sales' ? 'vendas' : 'leads'} no período selecionado`}><div className="results-chart__grid"/><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="resultsTrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs><path d={`M 0 ${height} L ${points} L ${width} ${height} Z`} fill="url(#resultsTrendFill)"/><polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{values.map((value, index) => { const [x, y] = points.split(' ')[index].split(',').map(Number); return <circle key={timeline[index].date} cx={x} cy={y} r="4" fill={color} stroke="#fff" strokeWidth="2"/> })}</svg></div><div className="results-chart__axis">{timeline.map((item) => <span key={item.date}>{item.date.slice(8, 10)}/{item.date.slice(5, 7)}</span>)}</div></div>
}

function ReportsPage({ session }: { session: Session }) {
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(`${today.slice(0, 8)}01`)
  const [end, setEnd] = useState(today)
  const [periodPreset, setPeriodPreset] = useState<'today' | 'week' | 'month' | 'custom'>('month')
  const [chartMetric, setChartMetric] = useState<ResultsMetric>('revenue')
  const [data, setData] = useState<Awaited<ReturnType<typeof api.reports>> | null>(null)
  const [error, setError] = useState('')
  const load = async () => { try { setData(await api.reports(session, start, end)); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o relatório.') } }
  useEffect(() => { void load() }, [session, start, end])
  const applyPreset = (preset: 'today' | 'week' | 'month' | 'custom') => {
    setPeriodPreset(preset)
    if (preset === 'custom') return
    const first = new Date(`${today}T12:00:00`)
    if (preset === 'week') first.setDate(first.getDate() - 6)
    if (preset === 'month') first.setDate(1)
    const nextStart = preset === 'today' ? today : first.toISOString().slice(0, 10)
    setStart(nextStart)
    setEnd(today)
  }
  const totals = data?.totals
  const revenue = Number(totals?.revenue ?? 0)
  const sales = Number(totals?.sales ?? 0)
  const leads = Number(totals?.leads ?? 0)
  const conversion = leads ? (sales / leads) * 100 : 0
  const topSource = data?.sources.reduce((best, source) => Number(source.revenue) > Number(best?.revenue ?? 0) ? source : best, data.sources[0])
  const spend = data?.sources.reduce((sum, source) => sum + Number(source.spend), 0) ?? 0
  const openPipeline = data?.pipeline.filter((stage) => stage.kind === 'open').reduce((sum, stage) => sum + Number(stage.total), 0) ?? 0
  return <><section className="page-head report-head"><div><span className="eyebrow">RESULTADO COMERCIAL</span><h1>Resultados</h1><p>Faturamento só considera vendas que já foram confirmadas no CRM.</p></div><div className="results-periods" aria-label="Selecione o período"><div className="results-periods__presets">{([{ id: 'today', label: 'Hoje' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mês' }, { id: 'custom', label: 'Personalizado' }] as const).map((item) => <button type="button" className={periodPreset === item.id ? 'is-active' : ''} key={item.id} onClick={() => applyPreset(item.id)}>{item.label}</button>)}</div>{periodPreset === 'custom' && <div className="report-filter"><input type="date" value={start} onChange={(event) => setStart(event.target.value)}/><span>até</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)}/></div>}</div></section>{error && <p className="form-error">{error}</p>}{!data ? <section className="panel page-loading">Calculando seus resultados...</section> : <><section className="results-hero"><div><span className="eyebrow">FATURAMENTO CONFIRMADO</span><strong>{money(revenue)}</strong><p>{sales ? `${sales} venda${sales === 1 ? '' : 's'} confirmada${sales === 1 ? '' : 's'} no período selecionado.` : 'Confirme a primeira venda para acompanhar seu faturamento aqui.'}</p></div><div className="results-hero__stats"><article><small>Melhor origem</small><b>{topSource?.source ?? 'Sem dados'}</b><span>{topSource ? `${money(Number(topSource.revenue))} em receita confirmada` : 'Cadastre a origem dos leads'}</span></article><article><small>Oportunidades em aberto</small><b>{openPipeline}</b><span>Leads que ainda podem virar venda</span></article><article><small>Retorno do tráfego</small><b>{spend ? `${(revenue / spend).toFixed(2)}x` : '—'}</b><span>{spend ? `${money(spend)} de investimento informado` : 'Informe o investimento para calcular'}</span></article></div></section><section className="results-trend panel"><header><div><span className="eyebrow">EVOLUÇÃO NO PERÍODO</span><h2>Veja o resultado acontecendo</h2></div><div className="results-trend__switch" aria-label="Dados do gráfico"><button type="button" className={chartMetric === 'revenue' ? 'is-active' : ''} onClick={() => setChartMetric('revenue')}>Faturamento</button><button type="button" className={chartMetric === 'sales' ? 'is-active' : ''} onClick={() => setChartMetric('sales')}>Vendas</button><button type="button" className={chartMetric === 'leads' ? 'is-active' : ''} onClick={() => setChartMetric('leads')}>Leads</button></div></header><ResultsTrendChart timeline={data.timeline} metric={chartMetric}/></section><section className="metric-grid"><MetricCard title="Receita confirmada" value={money(revenue)} trend={`${sales} venda(s) no período`} emphasis/><MetricCard title="Leads recebidos" value={String(leads)} trend="Entraram no funil"/><MetricCard title="Ticket médio" value={money(Number(totals?.ticket ?? 0))} trend="Vendas confirmadas"/><MetricCard title="Conversão por lead" value={leads ? `${conversion.toFixed(1)}%` : '—'} trend="Vendas ÷ leads"/></section><section className="report-layout"><article className="report-panel panel"><div className="panel__header"><div><span className="eyebrow">ORIGEM DA RECEITA</span><h2>O que trouxe resultado</h2></div></div>{data.sources.length ? <div className="report-source-list">{data.sources.map((item) => { const itemRevenue = Number(item.revenue); const itemSpend = Number(item.spend); return <article key={item.source}><div><b>{item.source}</b><small>{item.leads} lead(s) · {item.sales} venda(s)</small></div><span><small>Investimento</small><b>{money(itemSpend)}</b></span><span><small>Receita</small><b>{money(itemRevenue)}</b></span><span><small>ROAS</small><b>{itemSpend ? `${(itemRevenue / itemSpend).toFixed(2)}x` : '—'}</b></span></article>})}</div> : <div className="empty-list"><BarChart3 size={20}/><p>Os resultados por origem aparecerão quando houver leads ou métricas no período.</p></div>}</article><article className="report-panel panel"><div className="panel__header"><div><span className="eyebrow">FUNIL ATUAL</span><h2>Distribuição das oportunidades</h2></div></div><div className="funnel-report">{data.pipeline.map((stage) => <div key={stage.name}><span className={`funnel-dot funnel-dot--${stage.kind}`}/><b>{stage.name}</b><i style={{ width: `${Math.max(8, Math.min(100, Number(stage.total) * 14))}%` }}/><strong>{stage.total}</strong></div>)}</div></article></section></>}</>
}

function HelpCenter({ onClose, onNavigate }: { onClose: () => void; onNavigate: (page: Page) => void }) {
  const guides: Array<[string, string, Page]> = [['Conectar WhatsApp', 'Crie uma instância Evolution e leia o QR Code para começar a registrar conversas.', 'configuracoes'], ['Organizar o funil', 'Use as etapas para acompanhar cada lead até Ganhos ou Perdidos.', 'crm'], ['Confirmar uma venda', 'Apenas vendas confirmadas entram na receita do Dashboard e dos Relatórios.', 'vendas'], ['Acompanhar tráfego', 'Cadastre investimento e mantenha a origem do lead igual à campanha.', 'trafego']]
  return <Modal onClose={onClose}><header className="modal__header"><div><span className="eyebrow">CENTRAL DE AJUDA</span><h2>Como começar</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header><div className="help-guides">{guides.map(([title, text, page]) => <button key={title} type="button" onClick={() => { onNavigate(page); onClose() }}><CircleHelp size={18}/><span><b>{title}</b><small>{text}</small></span><ChevronRight size={17}/></button>)}</div></Modal>
}

type Notification = { id: string; type: 'channel' | 'lead' | 'trial'; title: string; body: string; action: string }

function NotificationsPanel({ notifications, onClose, onNavigate }: { notifications: Notification[]; onClose: () => void; onNavigate: (page: Page) => void }) {
  const target: Record<Notification['type'], Page> = { channel: 'configuracoes', lead: 'crm', trial: 'configuracoes' }
  return <section className="notifications-panel" aria-label="Notificações"><header><span><Bell size={16}/> Notificações</span><button type="button" onClick={onClose}><X size={16}/></button></header>{notifications.length ? notifications.map((item) => <article key={item.id}><b>{item.title}</b><p>{item.body}</p><button type="button" onClick={() => { onNavigate(target[item.type]); onClose() }}>{item.action}</button></article>) : <div className="empty-list"><CheckCircle2 size={19}/><p>Você está em dia.</p></div>}</section>
}

function Integrations({ session, account, onRequestAccess, onOpenChatbot }: { session: Session | null; account: { plan: string; uses_automation: boolean } | null; onRequestAccess: () => void; onOpenChatbot: () => void }) {
  const [provider, setProvider] = useState<'evolution' | 'uazapi'>('evolution')
  const chatbotEnabled = account?.plan === 'chatbot'
  const detail = provider === 'evolution'
    ? { eyebrow: 'CONEXÃO POR QR CODE', title: 'Conecte seu WhatsApp', text: 'Use a Evolution hospedada pela Otimiza AI para registrar conversas, leads, etapas e vendas no CRM.', steps: ['Dê um nome ao número', 'Escaneie o QR Code com o WhatsApp', 'Acompanhe os dados no CRM'] }
    : { eyebrow: 'CHATBOT E AUTOMAÇÃO', title: chatbotEnabled ? 'Configure seu chatbot' : 'Chatbot e automação sob demanda', text: chatbotEnabled ? 'Seu número pode usar respostas por regras configuradas na aba Chatbot.' : 'Chatbot e automação são serviços opcionais da Otimiza AI, definidos conforme o diagnóstico da empresa.', steps: chatbotEnabled ? ['Conecte o número pela Evolution', 'Configure regras e mensagens no Chatbot', 'Acompanhe os resultados no CRM'] : ['Comece pelo CRM e pelo WhatsApp', 'Solicite o diagnóstico quando precisar automatizar', 'A equipe Otimiza AI cuida da implantação'] }
  return <>
    <section className="page-head integration-head"><div><span className="eyebrow">CONEXÕES</span><h1>Integrações</h1><p>Conecte seu WhatsApp e acompanhe cada atendimento no funil.</p></div><span className="security-status"><ShieldCheck size={16}/> Dados protegidos</span></section>
    <section className="integration-layout"><div className="integration-list">
      <button className={`integration-item ${provider === 'evolution' ? 'is-current' : ''}`} onClick={() => setProvider('evolution')} type="button"><span className="integration-logo integration-logo--whatsapp"><MessageCircleMore size={20}/></span><span><b>WhatsApp por QR Code</b><small>Evolution · conexão em poucos passos</small></span><em>Comece aqui</em><ChevronRight size={17}/></button>
      <button className={`integration-item ${provider === 'uazapi' ? 'is-current' : ''}`} onClick={() => setProvider('uazapi')} type="button"><span className="integration-logo integration-logo--otimiza"><img src={otimizaSymbol} alt=""/></span><span><b>Chatbot e automação</b><small>Serviço adicional Otimiza AI</small></span><em className="integration-item__state">{chatbotEnabled ? 'Disponível' : 'Opcional'}</em><ChevronRight size={17}/></button>
    </div><article className="connection-detail panel"><span className="eyebrow">{detail.eyebrow}</span><h2>{detail.title}</h2><p>{detail.text}</p><div className="connection-steps">{detail.steps.map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div>
      {provider === 'evolution' ? <EvolutionConnectionPanel session={session} onRequestAccess={onRequestAccess} /> : <div className="connection-started"><CheckCircle2 size={19}/><div><b>{chatbotEnabled ? 'Seu Chatbot está disponível' : 'Disponível quando sua empresa precisar'}</b><p>{chatbotEnabled ? 'Abra a aba Chatbot para conectar a instância e configurar as regras do seu número.' : 'A equipe Otimiza AI orienta a configuração depois do diagnóstico comercial.'}</p></div></div>}
      {provider === 'uazapi' && chatbotEnabled && <button className="primary-button" type="button" onClick={onOpenChatbot}>Abrir Chatbot <ArrowRight size={16}/></button>}<small className="connection-note">{provider === 'evolution' ? 'O QR Code conecta o número à sua empresa e as novas mensagens passam a alimentar o CRM.' : 'A UAZAPI só é usada para Chatbot ou Automação. Nenhuma integração com Meta é necessária nesta fase.'}</small>
    </article></section>
  </>
}

type WhatsAppConnection = Awaited<ReturnType<typeof api.whatsappConnections>>[number]

function EvolutionConnectionPanel({ session, onRequestAccess }: { session: Session | null; onRequestAccess: () => void }) {
  const [channels, setChannels] = useState<WhatsAppConnection[]>([])
  const [channelName, setChannelName] = useState('Comercial')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<'pending' | 'connected' | 'disconnected' | 'error'>('pending')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = async () => {
    if (!session) return
    const result = (await api.whatsappConnections(session)).filter((channel) => channel.provider === 'evolution')
    setChannels(result)
    if (!selectedId && result[0]) { setSelectedId(result[0].id); setStatus(result[0].status) }
  }
  useEffect(() => { void reload().catch(() => setError('Não foi possível carregar os canais.')) }, [session])
  const refreshStatus = async (channelId = selectedId) => {
    if (!session || !channelId) return
    const result = await api.evolutionStatus(session, channelId)
    setStatus(result.status)
    setChannels((current) => current.map((channel) => channel.id === channelId ? { ...channel, status: result.status } : channel))
    if (result.status === 'connected') { setQrCode(null); setQrModalOpen(false) }
  }
  useEffect(() => {
    if (!session || !selectedId) return
    void refreshStatus().catch(() => undefined)
    const timer = window.setInterval(() => { void refreshStatus().catch(() => undefined) }, 10_000)
    return () => window.clearInterval(timer)
  }, [session, selectedId])

  const showQr = async (channelId: string) => {
    if (!session) return onRequestAccess()
    setBusy(true); setError(''); setQrCode(null); setQrModalOpen(true)
    try {
      const result = await api.evolutionQr(session, channelId)
      setStatus(result.status)
      setQrCode(result.qrCode)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o QR Code.') } finally { setBusy(false) }
  }
  const createChannel = async (event: FormEvent) => {
    event.preventDefault()
    if (!session) return onRequestAccess()
    setBusy(true); setError(''); setQrCode(null)
    try {
      const result = await api.createEvolution(session, channelName)
      setSelectedId(result.channelId); setStatus(result.status)
      await reload()
      if (result.setupError) setError(result.setupError)
      else if (result.status !== 'connected') await showQr(result.channelId)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o canal.') } finally { setBusy(false) }
  }
  const retry = async () => {
    if (!session || !selectedId) return
    setBusy(true); setError('')
    try {
      const result = await api.retryEvolution(session, selectedId)
      setStatus(result.status)
      await reload()
      if (result.status !== 'connected') await showQr(selectedId)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível reconectar.') } finally { setBusy(false) }
  }
  const disconnect = async () => {
    if (!session || !selectedId) return
    setBusy(true); setError('')
    try {
      await api.disconnectEvolution(session, selectedId)
      setStatus('disconnected'); setQrCode(null); setQrModalOpen(false); setDisconnectModalOpen(false)
      setChannels((current) => current.map((channel) => channel.id === selectedId ? { ...channel, status: 'disconnected' } : channel))
      await reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível desconectar o WhatsApp.') } finally { setBusy(false) }
  }
  const selected = channels.find((channel) => channel.id === selectedId)
  return <div className="evolution-panel">
    {!session ? <button className="primary-button" type="button" onClick={onRequestAccess}>Entrar para conectar <ArrowRight size={16}/></button> : <>
      {channels.length > 0 && <div className="evolution-channels">{channels.map((channel) => <button key={channel.id} className={selectedId === channel.id ? 'is-current' : ''} type="button" onClick={() => { setSelectedId(channel.id); setStatus(channel.status); setQrCode(null); setError('') }}><span className={`evolution-indicator evolution-indicator--${channel.status}`}/><span><b>{channel.name}</b><small>{channel.status === 'connected' ? 'Conectado' : channel.status === 'error' ? 'Requer atenção' : 'Aguardando conexão'}</small></span></button>)}</div>}
      {selected && <div className="evolution-current"><b>{selected.name}</b><span>{status === 'connected' ? 'WhatsApp conectado. As novas mensagens serão registradas no CRM.' : status === 'disconnected' ? 'WhatsApp desconectado. Gere um novo QR Code para conectar novamente.' : 'Abra WhatsApp > Aparelhos conectados > Conectar aparelho e escaneie o código.'}</span><div className="evolution-actions">{status === 'error' ? <button type="button" className="toolbar-button" disabled={busy} onClick={() => void retry()}>Tentar novamente</button> : status !== 'connected' ? <button type="button" className="toolbar-button" disabled={busy} onClick={() => void showQr(selected.id)}>{busy ? 'Gerando...' : 'Mostrar QR Code'}</button> : <><span className="security-status"><CheckCircle2 size={15}/> Conectado</span><button type="button" className="toolbar-button" disabled={busy} onClick={() => void refreshStatus(selected.id)}>Atualizar status</button><button type="button" className="toolbar-button toolbar-button--danger" disabled={busy} onClick={() => setDisconnectModalOpen(true)}>Desconectar</button></>}</div></div>}
      <form className="connection-form evolution-create" onSubmit={(event) => void createChannel(event)}><label>Adicionar número<input value={channelName} onChange={(event) => setChannelName(event.target.value)} required minLength={2} placeholder="Ex.: Comercial"/></label><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Preparando...' : 'Criar conexão'} <Plus size={16}/></button></form>
      {error && <p className="form-error">{error}</p>}
      {qrModalOpen && <Modal label="QR Code do WhatsApp" onClose={() => setQrModalOpen(false)}><header className="modal__header"><div><span className="eyebrow">CONECTAR WHATSAPP</span><h2>Escaneie o QR Code</h2></div><button type="button" onClick={() => setQrModalOpen(false)} aria-label="Fechar"><X size={18}/></button></header><section className="evolution-qr-modal">{error ? <p className="form-error">{error}</p> : busy && !qrCode ? <p>Gerando QR Code…</p> : qrCode ? <img src={qrCode} alt="QR Code para conectar o WhatsApp"/> : <p>{status === 'connected' ? 'Este número já está conectado.' : 'O QR Code expirou. Gere um novo código para continuar.'}</p>}<p>Abra o WhatsApp no celular, vá em <b>Aparelhos conectados</b> e escaneie o código.</p>{status !== 'connected' && <button type="button" className="toolbar-button" disabled={busy} onClick={() => void showQr(selectedId!)}>{busy ? 'Gerando...' : error ? 'Tentar novamente' : 'Gerar novo QR Code'}</button>}</section></Modal>}
      {disconnectModalOpen && selected && <Modal label="Desconectar WhatsApp" onClose={() => setDisconnectModalOpen(false)}><header className="modal__header"><div><span className="eyebrow">DESCONECTAR NÚMERO</span><h2>Desconectar {selected.name}?</h2></div><button type="button" onClick={() => setDisconnectModalOpen(false)} aria-label="Fechar"><X size={18}/></button></header><section className="evolution-disconnect-modal"><p>O CRM deixará de receber novas mensagens deste número até que ele seja conectado novamente por QR Code.</p><div><button type="button" className="toolbar-button" disabled={busy} onClick={() => setDisconnectModalOpen(false)}>Cancelar</button><button type="button" className="primary-button primary-button--danger" disabled={busy} onClick={() => void disconnect()}>{busy ? 'Desconectando...' : 'Desconectar WhatsApp'}</button></div></section></Modal>}
    </>}
  </div>
}

function Modal({ children, onClose, label, wide = false }: { children: ReactNode; onClose: () => void; label?: string; wide?: boolean }) {
  const panel = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const node = panel.current
    if (!node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => [...node.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null)
    // Formulário: foca o primeiro campo. Diálogo informativo: foca o próprio diálogo, para o leitor de tela ler o título primeiro.
    const initial = node.querySelector<HTMLElement>('[autofocus], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])') ?? node
    initial.focus({ preventScroll: true })
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); node.focus(); return }
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.({ preventScroll: true }) }
  }, [])
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={label}><button className="modal-layer__backdrop" type="button" aria-label="Fechar" tabIndex={-1} onClick={onClose}/><section className={`modal ${wide ? 'modal--wide' : ''}`} ref={panel} tabIndex={-1}>{children}</section></div>
}

const standardSources = ['Manual', 'Meta Ads', 'Google Ads', 'Instagram', 'Indicação', 'Orgânico', 'WhatsApp']

function LeadForm({ session, onClose, onSave }: { session: Session | null; onClose: () => void; onSave: (input: { name: string; phone: string; source: string; estimatedValue?: number }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('Manual')
  const [sourceOptions, setSourceOptions] = useState(standardSources)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (session) void api.leadSources(session).then((items) => setSourceOptions([...new Set([...standardSources, ...items])])).catch(() => undefined) }, [session])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setError('')
    try { await onSave({ name, phone, source: source.trim(), estimatedValue: value ? Number(value.replace(',', '.')) : undefined }); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o lead.') } finally { setSaving(false) }
  }
  return <Modal onClose={onClose}><header className="modal__header"><div><span className="eyebrow">NOVO CONTATO</span><h2>Adicionar lead</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header><form className="form-stack" onSubmit={submit}><label>Nome<input required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do contato"/></label><label>WhatsApp<input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(85) 99999-9999"/></label><label>Origem <small>Para atribuir a uma campanha, use exatamente o nome registrado em Tráfego pago.</small><input required list="lead-source-options" maxLength={120} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Selecione ou escreva a origem"/><datalist id="lead-source-options">{sourceOptions.map((item) => <option key={item} value={item}/>)}</datalist></label><label>Valor em negociação <small>opcional</small><input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ex.: 1200"/></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving} type="submit">{saving ? 'Criando...' : 'Criar lead'} <ArrowRight size={16}/></button></form></Modal>
}

function AccessModal({ onClose, onAuthenticated }: { onClose: () => void; onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [usesAutomation, setUsesAutomation] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const session = mode === 'login' ? await api.login(email, password) : await api.register({ name, companyName, email, password, usesOtimizaAutomation: usesAutomation })
      onAuthenticated(session)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.') } finally { setSaving(false) }
  }
  return <Modal onClose={onClose}><header className="modal__header"><div><span className="eyebrow">OTIMIZA AI CRM</span><h2>{mode === 'login' ? 'Acesse sua empresa' : 'Teste o CRM por 7 dias'}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header><form className="form-stack" onSubmit={submit}>{mode === 'register' && <><label>Seu nome<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Como quer ser chamado?"/></label><label>Nome da empresa<input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Sua empresa"/></label></>}<label>E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com"/></label><label>Senha<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres"/></label>{mode === 'register' && <label className="checkbox-field"><input type="checkbox" checked={usesAutomation} onChange={(event) => setUsesAutomation(event.target.checked)}/><span>Já uso a automação da Otimiza AI</span></label>}{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving} type="submit">{saving ? 'Aguarde...' : mode === 'login' ? 'Entrar no CRM' : 'Criar teste gratuito'} <ArrowRight size={16}/></button></form><button className="modal__switch" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Ainda não tenho conta · testar por 7 dias' : 'Já tenho conta · entrar'}</button></Modal>
}

function AccessPage({ initialMode, selection, onAuthenticated, onNavigate }: { initialMode: 'login' | 'register'; selection: SignupSelection; onAuthenticated: (session: Session, isNew: boolean) => void; onNavigate: (path: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [segment, setSegment] = useState('')
  const [objective, setObjective] = useState('')
  const [usesAutomation, setUsesAutomation] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const plan = publicPlans[selection.plan]
  const price = selectedPrice(selection.plan, selection.channelLimit)

  useEffect(() => { setMode(initialMode); setError(''); setShowPassword(false) }, [initialMode])

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode)
    setError('')
    setShowPassword(false)
    onNavigate(nextMode === 'login' ? '/entrar' : signupPath(selection))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const session = mode === 'login'
        ? await api.login(email, password)
        : await api.register({ name, companyName, email, password, segment, objective, usesOtimizaAutomation: usesAutomation, plan: selection.plan, channelLimit: selection.channelLimit })
      onAuthenticated(session, mode === 'register')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível acessar sua conta.') } finally { setSaving(false) }
  }
  return (
    <main className={`access-page ${mode === 'register' ? 'access-page--register' : ''}`}>
      <div className="access-layout">
        <section className="access-brand" aria-label="Conheça o Otimiza AI CRM">
          <div className="access-brand__glow" aria-hidden="true"/>
          <div className="access-copy">
            <span className="access-pill"><span/> CRM conectado ao seu negócio</span>
            <h1>Transforme conversas em <em>resultados.</em></h1>
            <p>Organize seus leads, acompanhe cada etapa do funil e veja com clareza o faturamento que seu atendimento gera.</p>
          </div>
          <div className="access-visual" aria-hidden="true">
            <div className="access-visual__orb"/>
            <div className="access-preview">
              <div className="access-preview__head"><span><i/> Visão do seu funil</span><span className="access-preview__live">Visão integrada</span></div>
              <div className="access-preview__row"><span className="access-preview__icon access-preview__icon--violet"><UsersRound size={18}/></span><span><b>Novo lead identificado</b><small>Origem e conversa reunidas</small></span><ChevronRight size={18}/></div>
              <div className="access-preview__row"><span className="access-preview__icon access-preview__icon--mint"><CheckCircle2 size={18}/></span><span><b>Venda confirmada</b><small>Valor registrado no dashboard</small></span><ChevronRight size={18}/></div>
              <div className="access-preview__foot"><span><span className="access-preview__sparkle"><Sparkles size={14}/></span> Do primeiro contato ao resultado</span><TrendingUp size={18}/></div>
            </div>
          </div>
        </section>
        <section className="access-form-wrap" aria-label={mode === 'login' ? 'Entrar no CRM' : 'Criar conta'}>
          <div className="access-form">
            <div className="access-form__head">
              <span className="access-form__eyebrow">{mode === 'login' ? 'BEM-VINDO DE VOLTA' : 'SEU TESTE GRATUITO'}</span>
              <h2>{mode === 'login' ? <>Acesse seu<br/>CRM.</> : <>Crie sua conta<br/>na Otimiza AI.</>}</h2>
              <p>{mode === 'login' ? 'Acompanhe seus leads, conversas e resultados em um só lugar.' : 'Teste o CRM por 7 dias. Sem cartão de crédito e sem cobrança automática.'}</p>
            </div>
            {mode === 'register' && <aside className="access-plan-summary" aria-label="Escolha do plano"><span><Bot size={16}/></span><div><small>PLANO ESCOLHIDO</small><b>{plan.name} · {selection.channelLimit} número{selection.channelLimit === 1 ? '' : 's'}</b><p>{formatCents(price)}/mês após o teste</p></div><button type="button" onClick={() => onNavigate('/#planos')}>Alterar</button></aside>}
            <form className="form-stack access-form__fields" onSubmit={submit}>
              {mode === 'register' && <>
                <div className="form-inline"><label>Seu nome<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome"/></label><label>Empresa<input required autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Sua empresa"/></label></div>
                <label>Segmento<select required value={segment} onChange={(event) => setSegment(event.target.value)}><option value="">Selecione seu segmento</option><option>Serviços</option><option>Clínica e saúde</option><option>Varejo</option><option>Imobiliário</option><option>Educação</option><option>Outro</option></select></label>
                <label>Seu objetivo principal<select required value={objective} onChange={(event) => setObjective(event.target.value)}><option value="">Selecione um objetivo</option><option>Organizar os leads</option><option>Medir vendas e faturamento</option><option>Acompanhar atendimento no WhatsApp</option><option>Entender o retorno do tráfego pago</option></select></label>
              </>}
              <label>E-mail profissional<div className="access-input"><input required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com"/><Mail size={18} aria-hidden="true"/></div></label>
              <label>Senha<div className="access-input"><input required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Digite sua senha' : 'Mínimo de 8 caracteres'}/><button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
              {mode === 'register' && <label className="checkbox-field"><input type="checkbox" checked={usesAutomation} onChange={(event) => setUsesAutomation(event.target.checked)}/><span>Já uso a automação da Otimiza AI</span></label>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button access-submit" disabled={saving} type="submit">{saving ? 'Aguarde...' : mode === 'login' ? 'Entrar no CRM' : 'Começar teste gratuito'} <ArrowRight size={18}/></button>
            </form>
            <div className="access-switch">{mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'} <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Experimente por 7 dias' : 'Entrar no CRM'}</button></div>
            <p className="access-secure"><LockKeyhole size={13}/> Acesso seguro aos dados da sua empresa</p>
          </div>
        </section>
      </div>
    </main>
  )
}
function Onboarding({ account, onClose, onNavigate }: { account: { uses_automation: boolean; company_name: string }; onClose: () => void; onNavigate: (page: Page) => void }) {
  const automation = account.uses_automation
  return <Modal onClose={onClose}><section className="onboarding"><span className="onboarding__mark"><CheckCircle2 size={24}/></span><span className="eyebrow">CONTA CRIADA</span><h2>Bem-vindo, {account.company_name}.</h2><p>{automation ? 'Identificamos que sua empresa usa a automação Otimiza AI. Solicite a conexão para alinharmos sua instância e seus fluxos.' : 'Seu espaço está pronto. O próximo passo é conectar seu WhatsApp para começar a registrar conversas e leads.'}</p><button className="primary-button" type="button" onClick={() => { onNavigate('configuracoes'); onClose() }}>{automation ? 'Solicitar conexão da equipe' : 'Conectar WhatsApp'} <ArrowRight size={16}/></button><button className="modal__switch" type="button" onClick={onClose}>Explorar o CRM primeiro</button></section></Modal>
}

function TrialExpired({ onSignOut, account, salesWhatsapp }: { onSignOut: () => void; account: { plan: string; channel_limit: number; plan_price_cents: number }; salesWhatsapp: string }) {
  const whatsapp = salesHref(salesWhatsapp, `Olá! Meu teste do ${planTitle(account.plan)} terminou. Quero ativar ${account.channel_limit} número${account.channel_limit === 1 ? '' : 's'} no CRM.`)
  return <main className="trial-page"><section className="trial-card"><span className="onboarding__mark"><LockKeyhole size={24}/></span><span className="eyebrow">PERÍODO DE TESTE ENCERRADO</span><h1>Seu CRM continua seguro.</h1><p>Os dados da sua empresa foram preservados. Sua escolha registrada foi <b>{planTitle(account.plan)}</b> com <b>{account.channel_limit} número{account.channel_limit === 1 ? '' : 's'}</b>{account.plan_price_cents > 0 ? ` por ${formatCents(account.plan_price_cents)}/mês` : ''}.</p>{whatsapp ? <a className="primary-button trial-card__contact" href={whatsapp} target="_blank" rel="noreferrer">Falar com a Otimiza AI <ArrowRight size={16}/></a> : <p className="trial-card__contact-note">Entre em contato com a equipe Otimiza AI para ativar seu plano. O botão de WhatsApp comercial ainda precisa ser configurado pela equipe.</p>}<button className="modal__switch" type="button" onClick={onSignOut}>Sair da conta</button></section></main>
}

type AiInfo = Awaited<ReturnType<typeof api.opportunityAi>>
const temperatureWords: Record<string, string> = { new: 'novo', warm: 'morno', hot: 'quente' }
const describeAiChange = (applied: AiInfo['events'][number]['applied']) => [
  applied.stage && `Etapa: ${applied.stage.from} → ${applied.stage.to}`,
  applied.temperature && `Temperatura: ${temperatureWords[String(applied.temperature.to)] ?? applied.temperature.to}`,
  applied.value && `Valor: ${money(Number(applied.value.to))}`,
  applied.source && `Origem: ${applied.source.to}`,
  applied.sale && `Venda detectada de ${money(Number(applied.sale.amount))} (em revisão)`,
].filter(Boolean) as string[]

function LeadDrawer({ lead, session, onClose, onAdvance, onRegisterSale, onSourceSaved }: { lead: Lead; session: Session | null; onClose: () => void; onAdvance: () => void; onRegisterSale: () => void; onSourceSaved: (source: string) => Promise<void> }) {
  const currentIndex = stages.indexOf(lead.stage)
  const [ai, setAi] = useState<AiInfo | null>(null)
  const [editingSource, setEditingSource] = useState(false)
  const [source, setSource] = useState(lead.source)
  const [sourceOptions, setSourceOptions] = useState(standardSources)
  const [sourceError, setSourceError] = useState('')
  const [savingSource, setSavingSource] = useState(false)
  useEffect(() => { setSource(lead.source); setEditingSource(false) }, [lead.id])
  useEffect(() => { if (session) void api.leadSources(session).then((items) => setSourceOptions([...new Set([...standardSources, ...items])])).catch(() => undefined) }, [session])
  const saveSource = async (event: FormEvent) => {
    event.preventDefault()
    const next = source.trim()
    if (next.length < 2) return setSourceError('Informe uma origem válida.')
    setSavingSource(true); setSourceError('')
    try { await onSourceSaved(next); setEditingSource(false) } catch (reason) { setSourceError(reason instanceof Error ? reason.message : 'Não foi possível salvar a origem.') } finally { setSavingSource(false) }
  }
  useEffect(() => {
    setAi(null)
    if (!session || !lead.opportunityId) return
    let cancelled = false
    api.opportunityAi(session, lead.opportunityId).then((result) => { if (!cancelled) setAi(result) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [session, lead.opportunityId])
  return <aside className="drawer" aria-label={`Detalhes de ${lead.name}`}>
    <header className="drawer__header"><button onClick={onClose} type="button" aria-label="Fechar detalhes"><X size={20}/></button><span>DETALHE DO LEAD</span><button type="button" aria-label="Mais ações"><MoreHorizontal size={21}/></button></header>
    <div className="drawer__person"><Avatar initials={lead.initials}/><div><h2>{lead.name}</h2><p>{lead.phone ? `+${lead.phone.replace(/\D/g, '')}` : 'Sem telefone'}</p></div><button className="icon-button" type="button" aria-label="Abrir WhatsApp"><MessageCircleMore size={18}/></button></div>
    <div className="drawer__stage"><span>ETAPA ATUAL</span><button type="button">{lead.stage}<ChevronDown size={16}/></button></div>
    {ai?.summary && <div className="drawer__insight"><Sparkles size={18}/><div><b>Leitura da Otimiza AI</b><p>{ai.summary}</p></div></div>}
    {!!ai?.events.length && <section className="drawer__section"><h3>Por que mudou?</h3><ul className="ai-history">{ai.events.map((event) => <li key={event.id}><b>{describeAiChange(event.applied).join(' · ')}</b>{event.reason && <p>{event.reason}</p>}<small>{new Date(event.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></li>)}</ul></section>}
    <section className="drawer__section"><h3>Resumo comercial</h3><div className="detail-grid"><div><span>Valor identificado</span><strong>{lead.value ? money(lead.value) : 'Ainda não identificado'}</strong></div><div><span>Origem</span><strong>{lead.source}</strong><button className="drawer-source-edit" type="button" onClick={() => { setSource(lead.source); setEditingSource(!editingSource) }}>{editingSource ? 'Cancelar' : 'Corrigir origem'}</button></div><div><span>Responsável</span><strong>{lead.owner}</strong></div><div><span>Canal</span><strong>{lead.channel}</strong></div></div>{editingSource && <form className="drawer-source-form" onSubmit={saveSource}><label>Origem ou nome exato da campanha<input required list="drawer-source-options" maxLength={120} value={source} onChange={(event) => setSource(event.target.value)}/><datalist id="drawer-source-options">{sourceOptions.map((item) => <option key={item} value={item}/>)}</datalist></label><button className="primary-button" type="submit" disabled={savingSource}>{savingSource ? 'Salvando...' : 'Salvar origem'}</button>{sourceError && <p className="form-error">{sourceError}</p>}</form>}</section>
    <section className="drawer__section"><h3>Última mensagem</h3><div className="message-preview"><p>{lead.lastMessage}</p><small>{lead.time}</small></div></section>
    <div className="drawer__bottom">{lead.stage !== 'Ganhos' && lead.stage !== 'Perdidos' ? stages[currentIndex + 1] === 'Ganhos' ? <button className="primary-button" onClick={onRegisterSale} type="button">Confirmar venda <CircleDollarSign size={17}/></button> : <button className="primary-button" onClick={onAdvance} type="button">Mover para {stages[currentIndex + 1]} <ArrowRight size={17}/></button> : <button className="primary-button" onClick={onClose} type="button">{lead.stage === 'Ganhos' ? 'Venda confirmada' : 'Lead perdido'} <Goal size={17}/></button>}</div>
  </aside>
}

function SaleForm({ lead, onClose, onSave }: { lead: Lead; onClose: () => void; onSave: (amount: number) => Promise<void> }) {
  const [amount, setAmount] = useState(lead.value ? String(lead.value) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return setError('Informe o valor final da venda.')
    setSaving(true); setError('')
    try { await onSave(value); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a venda.') } finally { setSaving(false) }
  }
  return <Modal onClose={onClose}><header className="modal__header"><div><span className="eyebrow">VENDA CONFIRMADA</span><h2>Registrar faturamento</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header><form className="form-stack" onSubmit={submit}><div className="sale-contact"><Avatar initials={lead.initials}/><span><b>{lead.name}</b><small>Oportunidade em negociação</small></span></div><label>Valor final da venda<input required autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex.: 1890,00"/></label><p className="sale-form-note">Ao confirmar, o card vai para Ganhos e o valor entra no faturamento do dashboard.</p>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving} type="submit">{saving ? 'Registrando...' : 'Confirmar venda'} <CheckCircle2 size={16}/></button></form></Modal>
}

const temperatureLabel: Record<'new' | 'warm' | 'hot', Lead['temperature']> = { new: 'Novo', warm: 'Morno', hot: 'Quente' }
const initialsFor = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'NC'

export default function App() {
  const [route, setRoute] = useState<PublicRoute>(() => routeFromPath(window.location.pathname))
  const [salesWhatsapp, setSalesWhatsapp] = useState('')
  const [page, setPage] = useState<Page>('dashboard')
  const [channel, setChannel] = useState<Channel>('Todos os canais')
  const [leads, setLeads] = useState(initialLeads)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [focusStage, setFocusStage] = useState<Stage | null>(null)
  const [leadsSearch, setLeadsSearch] = useState('')
  const [session, setSession] = useState<Session | null>(() => {
    try { const raw = localStorage.getItem('otimiza-crm-session'); return raw ? JSON.parse(raw) as Session : null } catch { return null }
  })
  const [account, setAccount] = useState<{ name: string; company_name: string; plan: string; channel_limit: number; plan_price_cents: number; uses_automation: boolean; role: string; access_state: 'trial' | 'active' | 'expired'; trial_ends_at: string | null } | null>(null)
  const [metrics, setMetrics] = useState<{ confirmedRevenue: number; confirmedSales: number; openLeads: number; averageTicket: number; leadsThisMonth: number } | undefined>()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [showAccess, setShowAccess] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [showSaleForm, setShowSaleForm] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [chatLead, setChatLead] = useState<Lead | null>(null)
  const [stageIds, setStageIds] = useState<Record<string, string>>({})

  const navigate = (path: string, replace = false) => {
    const target = new URL(path, window.location.origin)
    const href = `${target.pathname}${target.search}${target.hash}`
    if (replace) window.history.replaceState({}, '', href)
    else window.history.pushState({}, '', href)
    setRoute(routeFromPath(target.pathname))
    if (target.hash) requestAnimationFrame(() => document.querySelector(target.hash)?.scrollIntoView({ behavior: 'smooth' }))
    else window.scrollTo({ top: 0, behavior: 'auto' })
  }

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''
    void fetch(`${apiUrl}/api/public/config`).then((response) => response.ok ? response.json() as Promise<{ salesWhatsapp?: string }> : null).then((data) => setSalesWhatsapp(String(data?.salesWhatsapp ?? '').replace(/\D/g, ''))).catch(() => undefined)
  }, [])

  useEffect(() => {
    const isLanding = route === 'landing'
    document.title = isLanding ? 'Otimiza AI CRM — transforme conversas em resultados' : route === 'signup' ? 'Criar conta — Otimiza AI CRM' : route === 'login' ? 'Entrar — Otimiza AI CRM' : 'Otimiza AI CRM'
    const setMeta = (selector: string, content: string) => {
      const element = document.querySelector(selector)
      if (element) element.setAttribute('content', content)
    }
    setMeta('meta[name="robots"]', isLanding ? 'index,follow' : 'noindex,nofollow')
    setMeta('meta[name="description"]', isLanding ? 'Otimiza AI CRM: leads, conversas, faturamento confirmado e origem dos resultados em um só lugar.' : 'Acesso ao Otimiza AI CRM.')
    setMeta('meta[property="og:title"]', isLanding ? 'Otimiza AI CRM — transforme conversas em resultados' : 'Otimiza AI CRM')
  }, [route])

  useEffect(() => {
    if (!session && route === 'app') navigate('/entrar', true)
    if (session && (route === 'login' || route === 'signup')) navigate('/app', true)
  }, [route, session])

  const loadWorkspace = async (activeSession: Session) => {
    const me = await api.me(activeSession)
    setAccount(me)
    if (me.access_state === 'expired') return
    const [dashboard, crm, salesResult, conversationsResult, notificationsResult] = await Promise.all([api.dashboard(activeSession), api.crm(activeSession), api.sales(activeSession), api.conversations(activeSession), api.notifications(activeSession)])
    const digitsOnly = (value: string) => value.replace(/\D/g, '')
    const lastByPhone = new Map(conversationsResult.map((conversation) => [digitsOnly(conversation.phone), conversation]))
    const lastByContact = new Map(conversationsResult.filter((conversation) => conversation.contact_name).map((conversation) => [conversation.contact_name!.trim().toLocaleLowerCase('pt-BR'), conversation]))
    const previewFor = (conversation?: (typeof conversationsResult)[number]) => {
      if (!conversation) return 'Sem mensagens sincronizadas ainda.'
      const kind = (conversation.last_type ?? '').toLowerCase()
      const label = kind.includes('image') ? '📷 Foto' : kind.includes('audio') ? '🎤 Áudio' : kind.includes('video') ? '🎬 Vídeo' : kind.includes('document') ? '📎 Documento' : ''
      const text = [label, conversation.last_message].filter(Boolean).join(' · ') || 'Sem mensagens sincronizadas ainda.'
      return `${conversation.last_direction === 'outbound' ? 'Você: ' : ''}${text}`
    }
    const freshLeads: Lead[] = crm.flatMap((stage) => stage.opportunities.map((opportunity) => ({
      id: opportunity.id,
      opportunityId: opportunity.id,
      stageId: stage.id,
      phone: opportunity.phone ?? undefined,
      name: opportunity.contactName ?? opportunity.title,
      initials: initialsFor(opportunity.contactName ?? opportunity.title),
      stage: stages.includes(stage.name as Stage) ? stage.name as Stage : 'Novos leads',
      channel: 'Comercial',
      source: opportunity.source || 'Não informada',
      createdAt: opportunity.createdAt,
      value: opportunity.value === null ? undefined : Number(opportunity.value),
      time: opportunity.lastActivityAt ? new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(Math.round((new Date(opportunity.lastActivityAt).getTime() - Date.now()) / 3_600_000), 'hour') : 'agora',
      lastMessage: previewFor(
        (opportunity.phone ? lastByPhone.get(digitsOnly(opportunity.phone)) : undefined)
        ?? (opportunity.contactName ? lastByContact.get(opportunity.contactName.trim().toLocaleLowerCase('pt-BR')) : undefined),
      ),
      temperature: temperatureLabel[opportunity.temperature] ?? 'Novo',
      owner: me.name,
      avatar: initialsFor(me.name),
    })))
    setStageIds(Object.fromEntries(crm.map((stage) => [stage.name, stage.id])))
    setMetrics({ confirmedRevenue: Number(dashboard.confirmed_revenue), confirmedSales: Number(dashboard.confirmed_sales), openLeads: Number(dashboard.open_leads), averageTicket: Number(dashboard.average_ticket), leadsThisMonth: Number(dashboard.leads_this_month) })
    setLeads(freshLeads)
    setSales(salesResult)
    setConversations(conversationsResult)
    setNotifications(notificationsResult)
    setSyncError('')
  }

  useEffect(() => {
    if (!session) return
    void loadWorkspace(session).catch((reason) => setSyncError(reason instanceof Error ? reason.message : 'Não foi possível sincronizar seus dados.'))
  }, [session])

  useEffect(() => {
    if (!session || page !== 'crm') return
    const refresh = () => { void loadWorkspace(session).catch(() => undefined) }
    const interval = window.setInterval(refresh, 30_000)
    let pending: number | undefined
    // Mensagem nova no WhatsApp: atualiza os cards logo, sem esperar o próximo ciclo (e sem disparar várias vezes seguidas).
    const unsubscribe = onChatEvent(() => { window.clearTimeout(pending); pending = window.setTimeout(refresh, 1500) })
    return () => { window.clearInterval(interval); window.clearTimeout(pending); unsubscribe() }
  }, [session, page])

  useEffect(() => {
    connectEvents(session)
    if (!session) return
    const refresh = () => { void api.conversations(session).then(setConversations).catch(() => undefined) }
    const unsubscribe = onChatEvent(refresh)
    const interval = window.setInterval(refresh, 60_000)
    return () => { unsubscribe(); window.clearInterval(interval) }
  }, [session])

  const unreadTotal = conversations.reduce((total, conversation) => total + (conversation.unread_count ?? 0), 0)

  const authenticateSession = (nextSession: Session, isNew = false) => {
    localStorage.setItem('otimiza-crm-session', JSON.stringify(nextSession))
    setShowOnboarding(isNew)
    setSession(nextSession)
    navigate('/app', true)
  }

  const signOut = () => {
    localStorage.removeItem('otimiza-crm-session')
    setSession(null); setAccount(null); setMetrics(undefined); setLeads(initialLeads); setSales([]); setConversations([]); setNotifications([]); setSelectedLead(null); setShowOnboarding(false)
    navigate('/entrar', true)
  }

  const addLead = () => {
    setShowLeadForm(true)
  }

  const createLead = async (input: { name: string; phone: string; source: string; estimatedValue?: number }) => {
    if (session) {
      await api.createLead(session, input)
      await loadWorkspace(session)
      setPage('crm')
      return
    }
    const newLead: Lead = { id: Date.now(), name: input.name, initials: initialsFor(input.name), stage: 'Novos leads', channel: 'Comercial', source: input.source as Lead['source'], value: input.estimatedValue, time: 'agora', lastMessage: 'Lead criado manualmente.', temperature: 'Novo', owner: 'Lara', avatar: 'LC' }
    setLeads((current) => [newLead, ...current]); setPage('crm'); setSelectedLead(newLead)
  }

  const advanceLead = () => {
    if (!selectedLead) return
    const index = stages.indexOf(selectedLead.stage)
    if (index >= stages.length - 1) return
    const updated = { ...selectedLead, stage: stages[index + 1] }
    if (session && selectedLead.opportunityId) {
      void api.updateOpportunity(session, selectedLead.opportunityId, { stageId: stageIds[updated.stage] }).then(() => loadWorkspace(session)).catch((reason) => setSyncError(reason instanceof Error ? reason.message : 'Não foi possível mover o lead.'))
    }
    setLeads((current) => current.map((lead) => lead.id === updated.id ? updated : lead))
    setSelectedLead(updated)
  }

  const openLeadChat = (lead: Lead) => {
    if (!lead.phone) return
    setChatLead(lead)
  }

  const moveLead = (leadId: Lead['id'], stage: Stage) => {
    const lead = leads.find((item) => item.id === leadId)
    if (!lead || lead.stage === stage) return
    if (stage === 'Ganhos') { setSelectedLead(lead); setShowSaleForm(true); return }
    const previousStage = lead.stage
    const apply = (value: Stage) => {
      setLeads((current) => current.map((item) => item.id === leadId ? { ...item, stage: value } : item))
      setSelectedLead((current) => current && current.id === leadId ? { ...current, stage: value } : current)
    }
    apply(stage)
    if (session && lead.opportunityId) {
      const stageId = stageIds[stage]
      if (!stageId) { apply(previousStage); setSyncError('As etapas do funil ainda estão sendo sincronizadas.'); return }
      void api.updateOpportunity(session, lead.opportunityId, { stageId }).then(() => loadWorkspace(session)).catch((reason) => { apply(previousStage); setSyncError(reason instanceof Error ? reason.message : 'Não foi possível mover o lead.') })
    }
  }

  const registerSale = async (amount: number) => {
    if (!selectedLead) return
    const updated = { ...selectedLead, stage: 'Ganhos' as Stage, value: amount, time: 'agora' }
    if (session && selectedLead.opportunityId) {
      if (!stageIds.Ganhos) throw new Error('As etapas do funil ainda estão sendo sincronizadas.')
      await Promise.all([
        api.updateOpportunity(session, selectedLead.opportunityId, { stageId: stageIds.Ganhos, estimatedValue: amount }),
        api.createSale(session, { opportunityId: selectedLead.opportunityId, amount, status: 'confirmed' }),
      ])
      await loadWorkspace(session)
    } else {
      setLeads((current) => current.map((lead) => lead.id === updated.id ? updated : lead))
    }
    setSelectedLead(updated)
  }

  const renderContent = () => {
    if (page === 'dashboard') return <Dashboard session={session!} onNavigate={setPage} onOpenLead={(lead) => { setSelectedLead(lead); setPage('crm') }} onFocusStage={(stage) => { setFocusStage(stage); setPage('crm') }} onSearchLeads={(text) => { setLeadsSearch(text); setPage('leads') }} metrics={metrics} leads={leads} sales={sales} />
    if (page === 'crm') return <Crm leads={leads} channel={channel} setChannel={setChannel} onSelectLead={setSelectedLead} onAddLead={addLead} onMoveLead={moveLead} onOpenChat={session ? openLeadChat : undefined} focusStage={focusStage} onFocusHandled={() => setFocusStage(null)} />
    if (page === 'leads') return <LeadsPage key={leadsSearch} initialSearch={leadsSearch} leads={leads} onSelectLead={setSelectedLead} onAddLead={addLead}/>
    if (page === 'conversas') return session ? <ChatPage session={session} initial={conversations} botEnabled={account?.plan === 'chatbot'} /> : <ConversationsPage conversations={conversations}/>
    if (page === 'vendas') return <SalesPage sales={sales} session={session!} onRefresh={() => loadWorkspace(session!)}/>
    if (page === 'chatbot') return <ChatbotPage session={session} account={account} onRequestAccess={() => setShowAccess(true)} onOpenIntegrations={() => setPage('configuracoes')} />
    if (page === 'configuracoes') return <Integrations session={session} account={account} onRequestAccess={() => setShowAccess(true)} onOpenChatbot={() => setPage('chatbot')} />
    if (page === 'trafego') return <TrafficPage session={session!}/>
    return <ReportsPage session={session!}/>
  }

  const selection = selectionFromLocation()
  const workspaceNavItems = account?.plan === 'chatbot'
    ? [...navItems.slice(0, 4), chatbotNavItem, ...navItems.slice(4)]
    : navItems
  if (!session && route === 'landing') return <LandingPage onNavigate={navigate} salesWhatsapp={salesWhatsapp}/>
  if (!session) return <AccessPage initialMode={route === 'signup' ? 'register' : 'login'} selection={selection} onAuthenticated={authenticateSession} onNavigate={navigate}/>
  if (route === 'landing') return <LandingPage onNavigate={navigate} salesWhatsapp={salesWhatsapp}/>
  if (account?.access_state === 'expired') return <TrialExpired onSignOut={signOut} account={account} salesWhatsapp={salesWhatsapp}/>
  if (!account) return <main className="workspace-loading"><div className="brand-mark"><img src={otimizaSymbol} alt="Otimiza AI"/></div><p>{syncError || 'Carregando o espaço da sua empresa...'}</p>{syncError && <button className="session-button" type="button" onClick={signOut}>Voltar ao acesso</button>}</main>

  return (
    <div className="app-shell">
      {mobileMenuOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}/>}
      <aside className={`sidebar${mobileMenuOpen ? ' is-mobile-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><img src={otimizaSymbol} alt="Otimiza AI" /></div><div className="brand-name"><span>otimiza <b>AI</b></span><em>CRM</em></div></div>
        <button className="workspace-switcher" type="button"><span className="workspace-initial">{initialsFor(account.company_name)}</span><span><b>{account.company_name}</b><small>{account.access_state === 'trial' ? 'Teste gratuito' : `Plano ${account.plan}`}</small></span><ChevronDown size={16}/></button>
        <nav className="navigation" aria-label="Navegação principal">{workspaceNavItems.map(({ id, label, icon: Icon, badge: fixedBadge }) => { const badge = id === 'conversas' ? (unreadTotal ? (unreadTotal > 99 ? '99+' : String(unreadTotal)) : undefined) : fixedBadge; return <button key={id} className={page === id ? 'is-active' : ''} type="button" onClick={() => { setPage(id); setMobileMenuOpen(false) }}><Icon size={19}/><span>{label}</span>{badge && <b>{badge}</b>}</button> })}</nav>
        <div className="sidebar-bottom"><button className="automation-status" type="button" onClick={() => { setPage(account.plan === 'chatbot' ? 'chatbot' : 'configuracoes'); setMobileMenuOpen(false) }}><span className="bot-orb"><Bot size={17}/></span><span><b>{account.plan === 'chatbot' ? 'Configurar chatbot' : 'Conectar WhatsApp'}</b><small>{account.plan === 'chatbot' ? 'Respostas por número' : 'Gerenciar integrações'}</small></span><ChevronRight size={16}/></button><button className={page === 'configuracoes' ? 'is-active' : ''} type="button" onClick={() => { setPage('configuracoes'); setMobileMenuOpen(false) }}><Settings2 size={19}/><span>Configurações</span></button><div className="profile"><Avatar initials={initialsFor(account.name)}/><span><b>{account.name}</b><small>{account.role === 'owner' ? 'Administrador' : account.role}</small></span><ChevronDown size={15}/></div></div>
      </aside>
      <main className="main-content"><header className="topbar"><div className="crumb"><button className="mobile-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><Menu size={20}/></button><span>Otimiza AI</span><ChevronRight size={15}/><b>{page === 'crm' ? 'CRM' : page === 'dashboard' ? 'Dashboard' : workspaceNavItems.find((item) => item.id === page)?.label ?? 'Configurações'}</b></div><div className="topbar-actions">{syncError && <span className="sync-error">{syncError}</span>}<button className="help-chip" type="button" onClick={() => setShowHelp(true)}><Sparkles size={15}/> Central de ajuda</button><button className="session-button" type="button" onClick={signOut}>Sair</button><button className="notification-button" type="button" aria-label="Notificações" onClick={() => setShowNotifications((value) => !value)}><Bell size={19}/>{notifications.length > 0 && <i/>}</button>{showNotifications && <NotificationsPanel notifications={notifications} onClose={() => setShowNotifications(false)} onNavigate={setPage}/>}</div></header><div className="content-scroll">{renderContent()}</div></main>
      {chatLead?.phone && session && page === 'crm' && <ChatDrawer session={session} name={chatLead.name} phone={chatLead.phone} botEnabled={account?.plan === 'chatbot'} onClose={() => setChatLead(null)} />}
      {selectedLead && <><button className="drawer-backdrop" onClick={() => { setSelectedLead(null); setShowSaleForm(false) }} aria-label="Fechar detalhes" type="button"/><LeadDrawer lead={selectedLead} session={session} onClose={() => { setSelectedLead(null); setShowSaleForm(false) }} onAdvance={advanceLead} onRegisterSale={() => setShowSaleForm(true)} onSourceSaved={async (source) => { if (!session || !selectedLead.opportunityId) throw new Error('Lead ainda não sincronizado.'); await api.updateOpportunity(session, selectedLead.opportunityId, { source }); setSelectedLead((lead) => lead ? { ...lead, source } : lead); await loadWorkspace(session) }}/></>}
      {showAccess && <AccessModal onClose={() => setShowAccess(false)} onAuthenticated={authenticateSession}/>} {showHelp && <HelpCenter onClose={() => setShowHelp(false)} onNavigate={setPage}/>} {showOnboarding && <Onboarding account={account} onClose={() => setShowOnboarding(false)} onNavigate={setPage}/>} {showLeadForm && <LeadForm session={session} onClose={() => setShowLeadForm(false)} onSave={createLead}/>}
      {showSaleForm && selectedLead && <SaleForm lead={selectedLead} onClose={() => setShowSaleForm(false)} onSave={registerSale}/>}
    </div>
  )
}
