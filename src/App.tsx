import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CheckCircle2,
  Clock3,
  Filter,
  Goal,
  Link2,
  LayoutDashboard,
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
import otimizaSymbol from './assets/otimiza-ai-symbol.png'
import { api, type Session } from './lib/api'

type Page = 'dashboard' | 'crm' | 'leads' | 'conversas' | 'vendas' | 'trafego' | 'relatorios' | 'chatbot' | 'configuracoes'
type Stage = 'Novos leads' | 'Qualificados' | 'Proposta enviada' | 'Negociação' | 'Ganhos' | 'Perdidos'
type Channel = 'Todos os canais' | 'Comercial' | 'Unidade Aldeota' | 'Pós-venda'

type Lead = {
  id: number | string
  opportunityId?: string
  stageId?: string
  name: string
  initials: string
  stage: Stage
  channel: Exclude<Channel, 'Todos os canais'>
  source: 'Meta Ads' | 'Orgânico' | 'Indicação' | 'Google Ads'
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

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'crm', label: 'CRM', icon: Target },
  { id: 'leads', label: 'Leads', icon: UsersRound },
  { id: 'conversas', label: 'Conversas', icon: MessageCircleMore, badge: '12' },
  { id: 'vendas', label: 'Vendas', icon: CircleDollarSign },
  { id: 'trafego', label: 'Tráfego pago', icon: TrendingUp },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
]

function MetricCard({ title, value, trend, emphasis }: { title: string; value: string; trend: string; emphasis?: boolean }) {
  return (
    <article className={`metric-card ${emphasis ? 'metric-card--emphasis' : ''}`}>
      <div className="metric-card__top"><span>{title}</span><MoreHorizontal size={18} /></div>
      <strong>{value}</strong>
      <p><TrendingUp size={14} /> {trend} <span>vs. mês anterior</span></p>
    </article>
  )
}

function Avatar({ initials, small = false }: { initials: string; small?: boolean }) {
  return <span className={`avatar ${small ? 'avatar--small' : ''}`}>{initials}</span>
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return (
    <button className="lead-card" onClick={onClick} type="button">
      <div className="lead-card__top">
        <Avatar initials={lead.initials} />
        <span className={`temperature temperature--${lead.temperature.toLowerCase()}`}>{lead.temperature}</span>
      </div>
      <div className="lead-card__name-row"><strong>{lead.name}</strong><MoreHorizontal size={17} /></div>
      <p>{lead.lastMessage}</p>
      <div className="lead-card__tags"><span>{lead.source}</span><span>{lead.channel}</span></div>
      <div className="lead-card__footer">
        <span><Clock3 size={14} />{lead.time}</span>
        <span className="card-owner"><Avatar initials={lead.avatar} small />{lead.value ? money(lead.value) : 'Sem valor'}</span>
      </div>
    </button>
  )
}

function Dashboard({ onNavigate, metrics }: { onNavigate: (page: Page) => void; metrics?: { confirmedRevenue: number; confirmedSales: number; openLeads: number; averageTicket: number; leadsThisMonth: number } }) {
  const revenue = metrics?.confirmedRevenue ?? 38640
  const sales = metrics?.confirmedSales ?? 12
  const openLeads = metrics?.openLeads ?? 8
  const averageTicket = metrics?.averageTicket ?? 3220
  const leadsThisMonth = metrics?.leadsThisMonth ?? 146
  return (
    <>
      <section className="page-head">
        <div><span className="eyebrow">VISÃO GERAL · SETEMBRO</span><h1>Seu atendimento está convertendo mais.</h1><p>Veja o que gerou receita e onde sua equipe pode agir agora.</p></div>
        <button className="period-button" type="button"><span>01–30 set. 2026</span><ChevronDown size={16} /></button>
      </section>
      <section className="metric-grid">
        <MetricCard title="Receita confirmada" value={money(revenue)} trend={`${sales} venda${sales === 1 ? '' : 's'} confirmada${sales === 1 ? '' : 's'}`} emphasis />
        <MetricCard title="Em negociação" value={`${openLeads} leads`} trend="Acompanhe no funil" />
        <MetricCard title="Novos leads" value={String(leadsThisMonth)} trend="Entraram neste mês" />
        <MetricCard title="Ticket médio" value={money(averageTicket)} trend="Receita confirmada" />
      </section>
      <section className="dashboard-grid">
        <article className="revenue-panel panel">
          <div className="panel__header"><div><span className="eyebrow">RECEITA ATRIBUÍDA</span><h2>Faturamento ao longo do mês</h2></div><button className="text-button" type="button">Ver relatório <ArrowRight size={16} /></button></div>
          <div className="chart-summary"><strong>{money(revenue)}</strong><span><TrendingUp size={15} /> Atualizado</span></div>
          <div className="chart" aria-label="Gráfico de faturamento crescente">
            <div className="chart__grid" />
            <svg viewBox="0 0 680 208" preserveAspectRatio="none" role="img">
              <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#9ee8ce" stopOpacity="0.7"/><stop offset="100%" stopColor="#9ee8ce" stopOpacity="0"/></linearGradient></defs>
              <path d="M0 184 C48 174 58 145 94 151 S151 168 187 133 S235 144 273 112 S323 128 358 91 S408 110 442 80 S507 98 542 48 S588 70 625 36 S658 47 680 12 L680 208 L0 208 Z" fill="url(#chartFill)" />
              <path d="M0 184 C48 174 58 145 94 151 S151 168 187 133 S235 144 273 112 S323 128 358 91 S408 110 442 80 S507 98 542 48 S588 70 625 36 S658 47 680 12" fill="none" stroke="#157a61" strokeWidth="3" strokeLinecap="round" />
              <circle cx="625" cy="36" r="5" fill="#157a61" stroke="#fffdf7" strokeWidth="3" />
            </svg>
          </div>
          <div className="chart-axis"><span>01 set.</span><span>08 set.</span><span>15 set.</span><span>22 set.</span><span>30 set.</span></div>
        </article>
        <article className="attention-panel panel">
          <div className="panel__header"><div><span className="eyebrow">PRÓXIMA AÇÃO</span><h2>Não deixe esfriar</h2></div><span className="count-pill">12</span></div>
          <div className="attention-lead"><Avatar initials="MC" /><div><strong>Mariana Costa</strong><p>Esperando resposta há 26 min</p></div><button type="button" aria-label="Abrir conversa"><ChevronRight size={19} /></button></div>
          <div className="attention-lead"><Avatar initials="PV" /><div><strong>Paulo Viana</strong><p>Disse que fecha hoje · R$ 1.500</p></div><button type="button" aria-label="Abrir conversa"><ChevronRight size={19} /></button></div>
          <div className="attention-lead"><Avatar initials="AL" /><div><strong>André Lima</strong><p>Proposta enviada ontem</p></div><button type="button" aria-label="Abrir conversa"><ChevronRight size={19} /></button></div>
          <button className="wide-secondary" type="button" onClick={() => onNavigate('conversas')}>Abrir conversas pendentes <ArrowRight size={16} /></button>
        </article>
      </section>
      <section className="source-section panel">
        <div className="panel__header"><div><span className="eyebrow">ORIGEM DOS RESULTADOS</span><h2>O que trouxe as vendas deste mês</h2></div><button className="text-button" type="button" onClick={() => onNavigate('trafego')}>Analisar tráfego <ArrowRight size={16} /></button></div>
        <div className="source-rows">
          {[['Meta Ads', 'R$ 20.460', 53, 'meta'], ['Google Ads', 'R$ 9.480', 25, 'google'], ['Indicação', 'R$ 5.820', 15, 'referral'], ['Orgânico', 'R$ 2.880', 7, 'organic']].map(([name, value, percent, type]) => <div className="source-row" key={name as string}><span className={`source-dot source-dot--${type}`} /><strong>{name}</strong><div className="progress"><i style={{ width: `${percent}%` }} /></div><b>{value}</b><small>{percent}%</small></div>)}
        </div>
      </section>
    </>
  )
}

function Crm({ leads, channel, setChannel, onSelectLead, onAddLead }: { leads: Lead[]; channel: Channel; setChannel: (channel: Channel) => void; onSelectLead: (lead: Lead) => void; onAddLead: () => void }) {
  const visible = useMemo(() => channel === 'Todos os canais' ? leads : leads.filter((lead) => lead.channel === channel), [leads, channel])
  return (
    <>
      <section className="page-head crm-head">
        <div><span className="eyebrow">PIPELINE COMERCIAL</span><h1>CRM</h1><p>Acompanhe cada conversa até a venda confirmada.</p></div>
        <div className="head-actions"><label className="channel-select"><Activity size={16}/><select value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>{channels.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16}/></label><button className="primary-button" type="button" onClick={onAddLead}><Plus size={18} /> Novo lead</button></div>
      </section>
      <section className="crm-toolbar"><div className="search-box"><Search size={17} /><input placeholder="Buscar lead ou telefone" aria-label="Buscar lead ou telefone" /></div><button className="toolbar-button" type="button"><Filter size={16} /> Filtros</button><button className="toolbar-button" type="button"><Settings2 size={16} /> Etapas</button><span className="toolbar-spacer"/><span className="sync-status"><i /> WhatsApp sincronizado agora</span></section>
      <section className="kanban" aria-label="Pipeline de vendas">
        {stages.map((stage, index) => {
          const columnLeads = visible.filter((lead) => lead.stage === stage)
          const total = columnLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0)
          return <article className={`kanban-column column-${index + 1}`} key={stage}>
            <header><div><span className="column-marker"/><h2>{stage}</h2><b>{columnLeads.length}</b></div><button type="button" aria-label={`Ações de ${stage}`}><MoreHorizontal size={18}/></button></header>
            <div className="column-value">{total ? money(total) : '—'}</div>
            <div className="column-cards">{columnLeads.map((lead) => <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} />)}</div>
            <button className="add-card" type="button" onClick={onAddLead}><Plus size={16} /> Adicionar lead</button>
          </article>
        })}
      </section>
    </>
  )
}

function LeadsPage({ leads, onSelectLead, onAddLead }: { leads: Lead[]; onSelectLead: (lead: Lead) => void; onAddLead: () => void }) {
  const [search, setSearch] = useState('')
  const visible = leads.filter((lead) => `${lead.name} ${lead.source}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  return <><section className="page-head crm-head"><div><span className="eyebrow">BASE DE CONTATOS</span><h1>Leads</h1><p>Todos os contatos que entraram no seu processo comercial.</p></div><button className="primary-button" type="button" onClick={onAddLead}><Plus size={18}/> Novo lead</button></section><section className="list-panel panel"><div className="list-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou origem"/></div><span>{visible.length} contato{visible.length === 1 ? '' : 's'}</span></div><div className="data-list">{visible.map((lead) => <button type="button" className="data-row" onClick={() => onSelectLead(lead)} key={lead.id}><Avatar initials={lead.initials}/><span className="data-row__main"><b>{lead.name}</b><small>{lead.lastMessage}</small></span><span className="data-row__source">{lead.source}</span><span className={`temperature temperature--${lead.temperature.toLowerCase()}`}>{lead.temperature}</span><span className="data-row__value">{lead.value ? money(lead.value) : 'Sem valor'}</span><ChevronRight size={17}/></button>)}{!visible.length && <div className="empty-list"><UsersRound size={19}/><p>Nenhum lead encontrado.</p></div>}</div></section></>
}

type SaleRow = { id: string; status: 'negotiation' | 'detected' | 'confirmed' | 'lost'; amount: string; confirmed_at: string | null; created_at: string; contact_name: string | null; opportunity_title: string | null }

function SalesPage({ sales }: { sales: SaleRow[] }) {
  const totals = sales.reduce((accumulator, sale) => { if (sale.status === 'confirmed') accumulator.confirmed += Number(sale.amount); else if (sale.status === 'detected') accumulator.detected += Number(sale.amount); return accumulator }, { confirmed: 0, detected: 0 })
  const statusLabel: Record<SaleRow['status'], string> = { confirmed: 'Confirmada', detected: 'Em revisão', negotiation: 'Negociação', lost: 'Perdida' }
  return <><section className="page-head"><div><span className="eyebrow">RECEITA</span><h1>Vendas</h1><p>Separe valores negociados, detectados e confirmados.</p></div></section><section className="sales-summary"><article className="panel"><span>Receita confirmada</span><strong>{money(totals.confirmed)}</strong><small>{sales.filter((sale) => sale.status === 'confirmed').length} venda(s)</small></article><article className="panel"><span>Aguardando confirmação</span><strong>{money(totals.detected)}</strong><small>Venda detectada em conversa</small></article></section><section className="list-panel panel"><div className="list-toolbar"><b>Histórico de vendas</b><span>{sales.length} registro{sales.length === 1 ? '' : 's'}</span></div><div className="data-list">{sales.map((sale) => <div className="data-row data-row--static" key={sale.id}><span className={`sale-status sale-status--${sale.status}`}>{statusLabel[sale.status]}</span><span className="data-row__main"><b>{sale.contact_name ?? sale.opportunity_title ?? 'Venda sem contato'}</b><small>{sale.confirmed_at ? `Confirmada em ${new Date(sale.confirmed_at).toLocaleDateString('pt-BR')}` : 'Registrada no CRM'}</small></span><span className="data-row__value">{money(Number(sale.amount))}</span></div>)}{!sales.length && <div className="empty-list"><CircleDollarSign size={19}/><p>As vendas confirmadas aparecerão aqui.</p></div>}</div></section></>
}

type ConversationRow = { id: string; status: 'open' | 'closed'; last_message_at: string | null; contact_name: string | null; phone: string; channel_name: string; last_message: string | null; last_direction: 'inbound' | 'outbound' | null; sent_at: string | null }

function ConversationsPage({ conversations }: { conversations: ConversationRow[] }) {
  return <><section className="page-head"><div><span className="eyebrow">WHATSAPP CENTRALIZADO</span><h1>Conversas</h1><p>Consulte o histórico que chegou pelos números conectados.</p></div><span className="security-status"><ShieldCheck size={16}/> Somente leitura</span></section><section className="list-panel panel"><div className="list-toolbar"><b>Atendimentos recentes</b><span>{conversations.length} conversa{conversations.length === 1 ? '' : 's'}</span></div><div className="data-list">{conversations.map((conversation) => <article className="conversation-row" key={conversation.id}><Avatar initials={initialsFor(conversation.contact_name ?? conversation.phone)}/><div><b>{conversation.contact_name ?? conversation.phone}</b><p>{conversation.last_message ?? 'Nenhuma mensagem de texto disponível.'}</p><small>{conversation.channel_name} · {conversation.last_direction === 'outbound' ? 'Mensagem enviada' : 'Mensagem recebida'}</small></div><time>{conversation.sent_at ? new Date(conversation.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</time></article>)}{!conversations.length && <div className="empty-list"><MessageCircleMore size={19}/><p>Conecte um número para começar a registrar conversas.</p></div>}</div></section></>
}

function Placeholder({ icon: Icon, eyebrow, title, text }: { icon: typeof Bot; eyebrow: string; title: string; text: string }) {
  return <section className="empty-page panel"><div className="empty-page__icon"><Icon size={24}/></div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p><button className="primary-button" type="button"><Plus size={18}/> Configurar agora</button></section>
}

function Integrations({ session, account, onRequestAccess }: { session: Session | null; account: { plan: string; uses_automation: boolean } | null; onRequestAccess: () => void }) {
  const [provider, setProvider] = useState<'evolution' | 'meta' | 'uazapi' | 'ads'>('evolution')
  const [started, setStarted] = useState(false)
  const [channelName, setChannelName] = useState('Comercial')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const uazapiEnabled = Boolean(account?.uses_automation || account?.plan === 'chatbot' || account?.plan === 'automation')
  const detail = provider === 'evolution'
    ? { eyebrow: 'CONEXÃO POR QR CODE', title: 'Conecte seu WhatsApp', text: 'Use a Evolution hospedada pela Otimiza AI para acompanhar conversas e leads no CRM. As respostas automáticas só são ativadas por você no plano Chatbot.', action: 'Conectar pela Evolution', steps: ['Dê um nome ao seu canal', 'Escaneie o QR Code com o WhatsApp', 'Acompanhe conversas e leads no CRM'] }
    : provider === 'meta'
    ? { eyebrow: 'WHATSAPP BUSINESS PLATFORM', title: 'Conecte seu WhatsApp Oficial', text: 'Para acompanhar atendimento sem chatbot ou automação, conecte o número pela API Oficial da Meta.', action: 'Conectar com a Meta', steps: ['Entre na conta Meta da sua empresa', 'Escolha a conta do WhatsApp Business', 'Selecione o número que deseja acompanhar'] }
    : provider === 'uazapi'
      ? { eyebrow: 'CHATBOT E AUTOMAÇÃO OTIMIZA AI', title: uazapiEnabled ? 'Conecte seu número com a equipe' : 'Adicione chatbot ou automação', text: uazapiEnabled ? 'A equipe Otimiza AI conecta a instância UAZAPI e mantém o chatbot ou as automações sincronizados com o CRM.' : 'A UAZAPI é usada apenas quando sua empresa possui Chatbot ou Automação Otimiza AI.', action: uazapiEnabled ? 'Solicitar conexão da equipe' : 'Ver solução Chatbot e Automação', steps: uazapiEnabled ? ['Solicite a conexão do número', 'A equipe valida a instância UAZAPI', 'CRM, chatbot e automações usam o mesmo canal'] : ['Use o WhatsApp Oficial para acompanhamento', 'Ative Chatbot ou Automação quando quiser responder por regras ou fluxos', 'A equipe conecta a UAZAPI na ativação'] }
      : { eyebrow: 'ATRIBUIÇÃO DE CAMPANHAS', title: 'Conecte sua conta Meta Ads', text: 'Veja investimento, leads e vendas no mesmo relatório. A conexão é feita pela conta de anúncios da sua empresa.', action: 'Conectar conta de anúncios', steps: ['Autorize a conta de anúncios', 'Escolha as campanhas que deseja acompanhar', 'Use links rastreáveis nos seus anúncios'] }
  const requestConnection = async () => {
    if (!session) return onRequestAccess()
    if (provider !== 'uazapi' || !uazapiEnabled) return setStarted(true)
    setConnecting(true); setConnectionError('')
    try { await api.requestUazapiConnection(session); setStarted(true) } catch (reason) { setConnectionError(reason instanceof Error ? reason.message : 'Não foi possível registrar sua solicitação.') } finally { setConnecting(false) }
  }
  return <>
    <section className="page-head integration-head"><div><span className="eyebrow">CONEXÕES</span><h1>Integrações</h1><p>Conecte seus canais e acompanhe os resultados em um único lugar.</p></div><span className="security-status"><ShieldCheck size={16}/> Dados protegidos</span></section>
    <section className="integration-layout"><div className="integration-list">
      <button className={`integration-item ${provider === 'evolution' ? 'is-current' : ''}`} onClick={() => { setProvider('evolution'); setStarted(false); setConnectionError('') }} type="button"><span className="integration-logo integration-logo--whatsapp"><MessageCircleMore size={20}/></span><span><b>WhatsApp por QR Code</b><small>Evolution · conexão em poucos passos</small></span><em>Comece aqui</em><ChevronRight size={17}/></button>
      <button className={`integration-item ${provider === 'meta' ? 'is-current' : ''}`} onClick={() => { setProvider('meta'); setStarted(false); setConnectionError('') }} type="button"><span className="integration-logo integration-logo--whatsapp"><MessageCircleMore size={20}/></span><span><b>WhatsApp Oficial</b><small>Para atendimento sem automação</small></span><em>Recomendado</em><ChevronRight size={17}/></button>
      <button className={`integration-item ${provider === 'uazapi' ? 'is-current' : ''}`} onClick={() => { setProvider('uazapi'); setStarted(false); setConnectionError('') }} type="button"><span className="integration-logo integration-logo--otimiza"><img src={otimizaSymbol} alt=""/></span><span><b>Chatbot e automação</b><small>UAZAPI conectada pela equipe</small></span><em className="integration-item__state">{uazapiEnabled ? 'Disponível' : 'Opcional'}</em><ChevronRight size={17}/></button>
      <button className={`integration-item ${provider === 'ads' ? 'is-current' : ''}`} onClick={() => { setProvider('ads'); setStarted(false); setConnectionError('') }} type="button"><span className="integration-logo integration-logo--ads"><TrendingUp size={20}/></span><span><b>Meta Ads</b><small>Investimento e vendas atribuídas</small></span><ChevronRight size={17}/></button>
    </div><article className="connection-detail panel"><span className="eyebrow">{detail.eyebrow}</span><h2>{detail.title}</h2><p>{detail.text}</p><div className="connection-steps">{detail.steps.map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div>
      {provider === 'evolution' ? <EvolutionConnectionPanel session={session} onRequestAccess={onRequestAccess} /> : !started ? <button className="primary-button" type="button" disabled={connecting} onClick={() => void requestConnection()}><Link2 size={17}/>{connecting ? 'Enviando...' : detail.action}</button> : provider === 'ads' ? <div className="connection-started"><CheckCircle2 size={19}/><div><b>Integração preparada</b><p>A autorização da Meta Ads será liberada assim que o aplicativo Meta da Otimiza AI estiver configurado com o domínio do CRM.</p></div></div> : provider === 'uazapi' ? <div className="connection-started"><CheckCircle2 size={19}/><div><b>{uazapiEnabled ? 'Solicitação registrada' : 'WhatsApp Oficial recomendado'}</b><p>{uazapiEnabled ? 'Nossa equipe fará a configuração técnica da instância UAZAPI.' : 'Para acompanhar atendimentos sem chatbot ou automação, conecte seu número usando a API Oficial da Meta.'}</p></div></div> : <form className="connection-form" onSubmit={async (event) => { event.preventDefault(); if (!session) return onRequestAccess(); setConnecting(true); setConnectionError(''); try { await api.connectWhatsapp(session, { provider: 'meta_cloud', channelName, phoneNumber: phoneNumber || undefined, phoneNumberId, accessToken }); setStarted(false); setAccessToken('') } catch (reason) { setConnectionError(reason instanceof Error ? reason.message : 'Não foi possível salvar a conexão.') } finally { setConnecting(false) } }}><label>Nome do canal<input value={channelName} onChange={(event) => setChannelName(event.target.value)} required placeholder="Ex.: Comercial"/></label><label>Número do WhatsApp<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Ex.: 5585999999999"/></label><label>ID do número na Meta<input value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} required placeholder="Phone Number ID"/></label><label>Token de acesso da Meta<input value={accessToken} onChange={(event) => setAccessToken(event.target.value)} required minLength={10} type="password" placeholder="Token permanente ou de teste"/></label>{connectionError && <p className="form-error">{connectionError}</p>}<div><button className="toolbar-button" type="button" onClick={() => setStarted(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={connecting}>{connecting ? 'Salvando...' : 'Salvar conexão'}</button></div></form>}
      {connectionError && !started && <p className="form-error">{connectionError}</p>}<small className="connection-note">{provider === 'evolution' ? 'O canal usa a Evolution da Otimiza AI. O QR Code aparece apenas na sua conta.' : provider === 'meta' ? 'A API Oficial organiza conversas e dados sem ativar respostas automáticas.' : provider === 'uazapi' ? 'As credenciais e os webhooks da UAZAPI são configurados pela equipe Otimiza AI.' : 'Receita só é atribuída quando houver um lead identificado pela campanha.'}</small>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = async () => {
    if (!session) return
    const result = (await api.whatsappConnections(session)).filter((channel) => channel.provider === 'evolution')
    setChannels(result)
    if (!selectedId && result[0]) { setSelectedId(result[0].id); setStatus(result[0].status) }
  }
  useEffect(() => { void reload().catch(() => setError('Não foi possível carregar os canais.')) }, [session])
  useEffect(() => {
    if (!session || !selectedId || status === 'connected' || status === 'error') return
    const timer = window.setInterval(() => {
      void api.evolutionStatus(session, selectedId).then((result) => {
        setStatus(result.status)
        if (result.status === 'connected') { setQrCode(null); void reload() }
      }).catch(() => setError('A conexão com a Evolution está indisponível no momento.'))
    }, 5000)
    return () => window.clearInterval(timer)
  }, [session, selectedId, status])

  const showQr = async (channelId: string) => {
    if (!session) return onRequestAccess()
    setBusy(true); setError(''); setQrCode(null)
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
  const selected = channels.find((channel) => channel.id === selectedId)
  return <div className="evolution-panel">
    {!session ? <button className="primary-button" type="button" onClick={onRequestAccess}>Entrar para conectar <ArrowRight size={16}/></button> : <>
      {channels.length > 0 && <div className="evolution-channels">{channels.map((channel) => <button key={channel.id} className={selectedId === channel.id ? 'is-current' : ''} type="button" onClick={() => { setSelectedId(channel.id); setStatus(channel.status); setQrCode(null); setError('') }}><span className={`evolution-indicator evolution-indicator--${channel.status}`}/><span><b>{channel.name}</b><small>{channel.status === 'connected' ? 'Conectado' : channel.status === 'error' ? 'Requer atenção' : 'Aguardando conexão'}</small></span></button>)}</div>}
      {selected && <div className="evolution-current"><b>{selected.name}</b><span>{status === 'connected' ? 'WhatsApp conectado. As novas mensagens serão registradas no CRM.' : 'Abra WhatsApp > Aparelhos conectados > Conectar aparelho e escaneie o código.'}</span>{qrCode && status !== 'connected' && <img src={qrCode} alt="QR Code para conectar o WhatsApp"/>}<div className="evolution-actions">{status === 'error' ? <button type="button" className="toolbar-button" disabled={busy} onClick={() => void retry()}>Tentar novamente</button> : status !== 'connected' ? <button type="button" className="toolbar-button" disabled={busy} onClick={() => void showQr(selected.id)}>{busy ? 'Gerando...' : qrCode ? 'Atualizar QR Code' : 'Mostrar QR Code'}</button> : <span className="security-status"><CheckCircle2 size={15}/> Conectado</span>}</div></div>}
      <form className="connection-form evolution-create" onSubmit={(event) => void createChannel(event)}><label>Adicionar número<input value={channelName} onChange={(event) => setChannelName(event.target.value)} required minLength={2} placeholder="Ex.: Comercial"/></label><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Preparando...' : 'Criar conexão'} <Plus size={16}/></button></form>
      {error && <p className="form-error">{error}</p>}
    </>}
  </div>
}

type ChatbotData = Awaited<ReturnType<typeof api.chatbot>>

function ChatbotPage({ session, account, onRequestAccess, onOpenIntegrations }: { session: Session | null; account: { plan: string } | null; onRequestAccess: () => void; onOpenIntegrations: () => void }) {
  const [data, setData] = useState<ChatbotData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [channelName, setChannelName] = useState('Comercial')
  const [phone, setPhone] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [instance, setInstance] = useState('')
  const [token, setToken] = useState('')
  const [ruleName, setRuleName] = useState('Mensagem de boas-vindas')
  const [ruleType, setRuleType] = useState<'keyword' | 'first_message'>('first_message')
  const [keyword, setKeyword] = useState('')
  const [response, setResponse] = useState('Olá! Como posso te ajudar?')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const load = async () => {
    if (!session) return
    setLoading(true); setError('')
    try { const result = await api.chatbot(session); setData(result); setSelectedChannelId((current) => result.channels.some((channel) => channel.id === current) ? current : result.channels[0]?.id ?? '') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o chatbot.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [session])
  if (!session) return <section className="empty-page panel"><div className="empty-page__icon"><Bot size={24}/></div><span className="eyebrow">CHATBOT POR REGRAS</span><h1>Configure seu atendimento automático.</h1><p>Entre no CRM para conectar seu WhatsApp e criar regras para o chatbot.</p><button className="primary-button" type="button" onClick={onRequestAccess}>Entrar no CRM <ArrowRight size={16}/></button></section>
  if (account?.plan !== 'chatbot') return <section className="empty-page panel"><div className="empty-page__icon"><Bot size={24}/></div><span className="eyebrow">PLANO CHATBOT</span><h1>Chatbot configurável por número.</h1><p>Crie respostas por palavra chave e mensagem inicial em canais Evolution ou UAZAPI.</p><button className="primary-button" type="button" onClick={() => setError('Solicite à equipe Otimiza AI a ativação do plano Chatbot para sua empresa.')}>Ativar plano Chatbot <ArrowRight size={16}/></button>{error && <p className="form-error">{error}</p>}</section>
  const settings = data?.settings ?? { is_active: false, welcome_message: '', fallback_message: '' }
  const saveSettings = async (event: FormEvent) => {
    event.preventDefault(); if (!session || !settings) return
    setLoading(true); setError('')
    try { await api.saveChatbotSettings(session, { isActive: settings.is_active, welcomeMessage: settings.welcome_message ?? '', fallbackMessage: settings.fallback_message ?? '' }); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o chatbot.') } finally { setLoading(false) }
  }
  return <><section className="page-head chatbot-head"><div><span className="eyebrow">CHATBOT POR REGRAS</span><h1>Chatbot</h1><p>Configure respostas para cada número Evolution ou UAZAPI, sem precisar de IA.</p></div><span className={`security-status ${settings?.is_active ? '' : 'security-status--neutral'}`}><Bot size={16}/>{settings?.is_active ? 'Chatbot ativo' : 'Chatbot pausado'}</span></section>
    {!data ? <section className="panel chatbot-loading">{loading ? 'Carregando configurações...' : error}</section> : <section className="chatbot-layout">
      <article className="panel chatbot-panel chatbot-panel--settings"><div className="panel__header"><div><span className="eyebrow">NÚMERO E RESPOSTAS</span><h2>Configuração do chatbot</h2></div></div>
        {!data.channels.length && <div className="chatbot-evolution-cta"><p>Conecte seu WhatsApp por QR Code usando a Evolution da Otimiza AI.</p><button className="primary-button" type="button" onClick={onOpenIntegrations}>Conectar com QR Code <ArrowRight size={16}/></button></div>}
        {!data.channels.length ? <form className="form-stack chatbot-form" onSubmit={async (event) => { event.preventDefault(); setLoading(true); setError(''); try { const result = await api.connectWhatsapp(session, { provider: 'uazapi', channelName, phoneNumber: phone || undefined, externalAccountId: instance, serverUrl, accessToken: token }); if (result.setupError) setError(result.setupError); await load(); setToken('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível conectar a UAZAPI.') } finally { setLoading(false) } }}><p className="chatbot-intro">Conecte uma instância UAZAPI. O CRM guarda o token de forma criptografada e configura o webhook automaticamente.</p><label>Nome do canal<input value={channelName} onChange={(event) => setChannelName(event.target.value)} required placeholder="Ex.: Comercial"/></label><label>Número do WhatsApp <small>opcional</small><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="5585999999999"/></label><label>Server URL da UAZAPI<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} type="url" required placeholder="https://sua-api.exemplo.com"/></label><label>Nome da instância<input value={instance} onChange={(event) => setInstance(event.target.value)} required placeholder="Ex.: comercial-principal"/></label><label>Token da instância<input value={token} onChange={(event) => setToken(event.target.value)} minLength={10} required type="password" placeholder="Token da UAZAPI"/></label><button className="primary-button" type="submit" disabled={loading}>{loading ? 'Conectando...' : 'Conectar número UAZAPI'} <Link2 size={16}/></button></form> : <><div className="chatbot-channels">{data.channels.map((channel) => <div key={channel.id}><span className="connection-dot"/><span><b>{channel.name}</b><small>{channel.phone_number ?? 'Número em conexão'} · {channel.status}</small></span></div>)}</div><form className="form-stack chatbot-form" onSubmit={saveSettings}><label className="checkbox-field"><input type="checkbox" checked={settings.is_active} onChange={(event) => setData((current) => current ? { ...current, settings: { ...current.settings, is_active: event.target.checked } } : current)}/><span>Ativar respostas automáticas</span></label><label>Mensagem de boas-vindas<textarea value={settings.welcome_message ?? ''} onChange={(event) => setData((current) => current ? { ...current, settings: { ...current.settings, welcome_message: event.target.value } } : current)} placeholder="Olá! Escolha uma opção para continuar."/></label><label>Resposta padrão <small>quando nenhuma regra for encontrada</small><textarea value={settings.fallback_message ?? ''} onChange={(event) => setData((current) => current ? { ...current, settings: { ...current.settings, fallback_message: event.target.value } } : current)} placeholder="Não entendi. Digite MENU para ver as opções."/></label><button className="primary-button" type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar configuração'} <CheckCircle2 size={16}/></button></form></>}
      </article>
      <article className="panel chatbot-panel">
        <div className="panel__header"><div><span className="eyebrow">REGRAS DE RESPOSTA</span><h2>Mensagens automáticas</h2></div><span className="count-pill">{data.rules.length}</span></div>
        {data.channels.length ? <>
          <form className="chatbot-rule-form" onSubmit={async (event) => {
            event.preventDefault(); setLoading(true); setError('')
            try {
              await api.createChatbotRule(session, { channelId: selectedChannelId || data.channels[0].id, name: ruleName, triggerType: ruleType, triggerValue: ruleType === 'keyword' ? keyword : undefined, responseText: response })
              setKeyword(''); setResponse(''); await load()
            } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a regra.') } finally { setLoading(false) }
          }}>
            <label>Número do WhatsApp<select value={selectedChannelId || data.channels[0].id} onChange={(event) => setSelectedChannelId(event.target.value)}>{data.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} · {channel.provider === 'evolution' ? 'Evolution' : 'UAZAPI'}</option>)}</select></label>
            <label>Nome da regra<input value={ruleName} onChange={(event) => setRuleName(event.target.value)} required/></label>
            <label>Quando<select value={ruleType} onChange={(event) => setRuleType(event.target.value as 'keyword' | 'first_message')}><option value="first_message">Receber a primeira mensagem</option><option value="keyword">Encontrar uma palavra-chave</option></select></label>
            {ruleType === 'keyword' && <label>Palavra-chave<input value={keyword} onChange={(event) => setKeyword(event.target.value)} required placeholder="Ex.: preços"/></label>}
            <label>Resposta<textarea value={response} onChange={(event) => setResponse(event.target.value)} required placeholder="Mensagem que será enviada"/></label>
            <button className="primary-button" type="submit" disabled={loading}>Adicionar regra <Plus size={16}/></button>
          </form>
          <div className="chatbot-rules">{data.rules.map((rule) => <article key={rule.id}><div><span className="rule-trigger">{data.channels.find((channel) => channel.id === rule.channel_id)?.name ?? 'Número'} · {rule.trigger_type === 'keyword' ? `Palavra: ${rule.trigger_value}` : 'Primeira mensagem'}</span><b>{rule.name}</b><p>{rule.response_text}</p></div><button type="button" onClick={() => { void api.deleteChatbotRule(session, rule.id).then(load).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível remover a regra.')) }} aria-label={`Remover ${rule.name}`}><X size={16}/></button></article>)}{!data.rules.length && <p className="chatbot-empty">Crie a primeira regra para começar.</p>}</div>
        </> : <p className="chatbot-empty">Conecte um número Evolution ou UAZAPI para criar regras.</p>}
      </article>
    </section>}{error && data && <p className="form-error chatbot-error">{error}</p>}</>
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true"><button className="modal-layer__backdrop" type="button" aria-label="Fechar" onClick={onClose}/><section className="modal">{children}</section></div>
}

function LeadForm({ onClose, onSave }: { onClose: () => void; onSave: (input: { name: string; phone: string; source: string; estimatedValue?: number }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('Manual')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setError('')
    try { await onSave({ name, phone, source, estimatedValue: value ? Number(value.replace(',', '.')) : undefined }); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o lead.') } finally { setSaving(false) }
  }
  return <Modal onClose={onClose}><header className="modal__header"><div><span className="eyebrow">NOVO CONTATO</span><h2>Adicionar lead</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header><form className="form-stack" onSubmit={submit}><label>Nome<input required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do contato"/></label><label>WhatsApp<input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(85) 99999-9999"/></label><label>Origem<select value={source} onChange={(event) => setSource(event.target.value)}><option>Manual</option><option>Meta Ads</option><option>Google Ads</option><option>Indicação</option><option>Orgânico</option></select></label><label>Valor em negociação <small>opcional</small><input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ex.: 1200"/></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving} type="submit">{saving ? 'Criando...' : 'Criar lead'} <ArrowRight size={16}/></button></form></Modal>
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

function LeadDrawer({ lead, onClose, onAdvance, onRegisterSale }: { lead: Lead; onClose: () => void; onAdvance: () => void; onRegisterSale: () => void }) {
  const currentIndex = stages.indexOf(lead.stage)
  return <aside className="drawer" aria-label={`Detalhes de ${lead.name}`}>
    <header className="drawer__header"><button onClick={onClose} type="button" aria-label="Fechar detalhes"><X size={20}/></button><span>DETALHE DO LEAD</span><button type="button" aria-label="Mais ações"><MoreHorizontal size={21}/></button></header>
    <div className="drawer__person"><Avatar initials={lead.initials}/><div><h2>{lead.name}</h2><p>+55 85 9 8765-4321</p></div><button className="icon-button" type="button" aria-label="Abrir WhatsApp"><MessageCircleMore size={18}/></button></div>
    <div className="drawer__stage"><span>ETAPA ATUAL</span><button type="button">{lead.stage}<ChevronDown size={16}/></button></div>
    <div className="drawer__insight"><Sparkles size={18}/><div><b>Leitura da Otimiza AI</b><p>Lead com alta intenção. Citou preço e pediu condição de pagamento.</p></div></div>
    <section className="drawer__section"><h3>Resumo comercial</h3><div className="detail-grid"><div><span>Valor identificado</span><strong>{lead.value ? money(lead.value) : 'Ainda não identificado'}</strong></div><div><span>Origem</span><strong>{lead.source}</strong></div><div><span>Responsável</span><strong>{lead.owner}</strong></div><div><span>Canal</span><strong>{lead.channel}</strong></div></div></section>
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
  const [page, setPage] = useState<Page>('crm')
  const [channel, setChannel] = useState<Channel>('Todos os canais')
  const [leads, setLeads] = useState(initialLeads)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [session, setSession] = useState<Session | null>(() => {
    try { const raw = localStorage.getItem('otimiza-crm-session'); return raw ? JSON.parse(raw) as Session : null } catch { return null }
  })
  const [account, setAccount] = useState<{ name: string; company_name: string; plan: string; uses_automation: boolean; role: string } | null>(null)
  const [metrics, setMetrics] = useState<{ confirmedRevenue: number; confirmedSales: number; openLeads: number; averageTicket: number; leadsThisMonth: number } | undefined>()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [showAccess, setShowAccess] = useState(false)
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [showSaleForm, setShowSaleForm] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [stageIds, setStageIds] = useState<Record<string, string>>({})

  const loadWorkspace = async (activeSession: Session) => {
    const [me, dashboard, crm, salesResult, conversationsResult] = await Promise.all([api.me(activeSession), api.dashboard(activeSession), api.crm(activeSession), api.sales(activeSession), api.conversations(activeSession)])
    const freshLeads: Lead[] = crm.flatMap((stage) => stage.opportunities.map((opportunity) => ({
      id: opportunity.id,
      opportunityId: opportunity.id,
      stageId: stage.id,
      name: opportunity.contactName ?? opportunity.title,
      initials: initialsFor(opportunity.contactName ?? opportunity.title),
      stage: stages.includes(stage.name as Stage) ? stage.name as Stage : 'Novos leads',
      channel: 'Comercial',
      source: (opportunity.source as Lead['source']) || 'Orgânico',
      value: opportunity.value === null ? undefined : Number(opportunity.value),
      time: opportunity.lastActivityAt ? new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(Math.round((new Date(opportunity.lastActivityAt).getTime() - Date.now()) / 3_600_000), 'hour') : 'agora',
      lastMessage: 'Sem mensagens sincronizadas ainda.',
      temperature: temperatureLabel[opportunity.temperature] ?? 'Novo',
      owner: me.name,
      avatar: initialsFor(me.name),
    })))
    setAccount(me)
    setStageIds(Object.fromEntries(crm.map((stage) => [stage.name, stage.id])))
    setMetrics({ confirmedRevenue: Number(dashboard.confirmed_revenue), confirmedSales: Number(dashboard.confirmed_sales), openLeads: Number(dashboard.open_leads), averageTicket: Number(dashboard.average_ticket), leadsThisMonth: Number(dashboard.leads_this_month) })
    setLeads(freshLeads)
    setSales(salesResult)
    setConversations(conversationsResult)
    setSyncError('')
  }

  useEffect(() => {
    if (!session) return
    void loadWorkspace(session).catch((reason) => setSyncError(reason instanceof Error ? reason.message : 'Não foi possível sincronizar seus dados.'))
  }, [session])

  const authenticateSession = (nextSession: Session) => {
    localStorage.setItem('otimiza-crm-session', JSON.stringify(nextSession))
    setSession(nextSession)
  }

  const signOut = () => {
    localStorage.removeItem('otimiza-crm-session')
    setSession(null); setAccount(null); setMetrics(undefined); setLeads(initialLeads); setSales([]); setConversations([]); setSelectedLead(null)
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
    if (page === 'dashboard') return <Dashboard onNavigate={setPage} metrics={metrics} />
    if (page === 'crm') return <Crm leads={leads} channel={channel} setChannel={setChannel} onSelectLead={setSelectedLead} onAddLead={addLead} />
    if (page === 'leads') return <LeadsPage leads={leads} onSelectLead={setSelectedLead} onAddLead={addLead}/>
    if (page === 'conversas') return <ConversationsPage conversations={conversations}/>
    if (page === 'vendas') return <SalesPage sales={sales}/>
    if (page === 'chatbot') return <ChatbotPage session={session} account={account} onRequestAccess={() => setShowAccess(true)} onOpenIntegrations={() => setPage('configuracoes')} />
    if (page === 'configuracoes') return <Integrations session={session} account={account} onRequestAccess={() => setShowAccess(true)} />
    const copy: Record<'trafego' | 'relatorios', [typeof Bot, string, string, string]> = {
      trafego: [TrendingUp, 'META ADS', 'Do anúncio à venda.', 'Conecte sua conta de anúncios para relacionar investimento, leads e receita atribuída.'],
      relatorios: [BarChart3, 'RESULTADOS', 'Relatórios que explicam o crescimento.', 'Compare períodos, fontes e desempenho da equipe em relatórios exportáveis.'],
    }
    const [icon, eyebrow, title, text] = copy[page as 'trafego' | 'relatorios']
    return <Placeholder icon={icon} eyebrow={eyebrow} title={title} text={text} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><img src={otimizaSymbol} alt="Otimiza AI" /></div><div className="brand-name">otimiza <b>AI</b></div></div>
        <button className="workspace-switcher" type="button"><span className="workspace-initial">{initialsFor(account?.company_name ?? 'Clínica Vitta')}</span><span><b>{account?.company_name ?? 'Clínica Vitta'}</b><small>{account ? `Plano ${account.plan}` : 'Demonstração'}</small></span><ChevronDown size={16}/></button>
        <nav className="navigation" aria-label="Navegação principal">{navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} className={page === id ? 'is-active' : ''} type="button" onClick={() => setPage(id)}><Icon size={19}/><span>{label}</span>{badge && <b>{badge}</b>}</button>)}</nav>
        <div className="sidebar-bottom"><button className="automation-status" type="button" onClick={() => setPage('chatbot')}><span className="bot-orb"><Bot size={17}/></span><span><b>Automação ativa</b><small>1 número conectado</small></span><ChevronRight size={16}/></button><button className={page === 'configuracoes' ? 'is-active' : ''} type="button" onClick={() => setPage('configuracoes')}><Settings2 size={19}/><span>Configurações</span></button><div className="profile"><Avatar initials={initialsFor(account?.name ?? 'Diego Viana')}/><span><b>{account?.name ?? 'Diego Viana'}</b><small>{account?.role === 'owner' ? 'Administrador' : account?.role ?? 'Demonstração'}</small></span><ChevronDown size={15}/></div></div>
      </aside>
      <main className="main-content"><header className="topbar"><div className="crumb"><span>Otimiza AI</span><ChevronRight size={15}/><b>{page === 'crm' ? 'CRM' : page === 'dashboard' ? 'Dashboard' : navItems.find((item) => item.id === page)?.label ?? 'Configurações'}</b></div><div className="topbar-actions">{syncError && <span className="sync-error">{syncError}</span>}<button className="help-chip" type="button"><Sparkles size={15}/> Central de ajuda</button>{session ? <button className="session-button" type="button" onClick={signOut}>Sair</button> : <button className="session-button" type="button" onClick={() => setShowAccess(true)}>Entrar</button>}<button className="notification-button" type="button" aria-label="Notificações"><Bell size={19}/><i/></button></div></header><div className="content-scroll">{renderContent()}</div></main>
      {selectedLead && <><button className="drawer-backdrop" onClick={() => { setSelectedLead(null); setShowSaleForm(false) }} aria-label="Fechar detalhes" type="button"/><LeadDrawer lead={selectedLead} onClose={() => { setSelectedLead(null); setShowSaleForm(false) }} onAdvance={advanceLead} onRegisterSale={() => setShowSaleForm(true)}/></>}
      {showAccess && <AccessModal onClose={() => setShowAccess(false)} onAuthenticated={authenticateSession}/>} {showLeadForm && <LeadForm onClose={() => setShowLeadForm(false)} onSave={createLead}/>}
      {showSaleForm && selectedLead && <SaleForm lead={selectedLead} onClose={() => setShowSaleForm(false)} onSave={registerSale}/>}
    </div>
  )
}
