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

function Integrations() {
  const [provider, setProvider] = useState<'meta' | 'uazapi' | 'ads'>('meta')
  const [started, setStarted] = useState(false)
  const detail = {
    meta: {
      eyebrow: 'WHATSAPP BUSINESS PLATFORM',
      title: 'Conecte seu WhatsApp Oficial',
      text: 'Você autoriza a conexão na sua própria conta Meta. O CRM acompanha conversas, leads e vendas sem responder por conta própria.',
      action: 'Conectar com a Meta',
      steps: ['Entre na conta Meta da sua empresa', 'Escolha a conta do WhatsApp Business', 'Selecione o número que deseja acompanhar'],
    },
    uazapi: {
      eyebrow: 'AUTOMAÇÃO OTIMIZA AI',
      title: 'Vincule a automação da Otimiza',
      text: 'Nossa equipe associa a instância já configurada à sua empresa. Seus fluxos n8n continuam funcionando e passam a atualizar o CRM.',
      action: 'Solicitar conexão',
      steps: ['Informe qual número usa na automação', 'Nossa equipe valida a instância', 'O canal aparece no CRM com o histórico sincronizado'],
    },
    ads: {
      eyebrow: 'ATRIBUIÇÃO DE CAMPANHAS',
      title: 'Conecte sua conta Meta Ads',
      text: 'Veja investimento, leads e vendas no mesmo relatório. A conexão é feita pela conta de anúncios da sua empresa.',
      action: 'Conectar conta de anúncios',
      steps: ['Autorize a conta de anúncios', 'Escolha as campanhas que deseja acompanhar', 'Use links rastreáveis nos seus anúncios'],
    },
  }[provider]
  return <>
    <section className="page-head integration-head"><div><span className="eyebrow">CONEXÕES</span><h1>Integrações</h1><p>Conecte seus canais e acompanhe os resultados em um único lugar.</p></div><span className="security-status"><ShieldCheck size={16}/> Dados protegidos</span></section>
    <section className="integration-layout">
      <div className="integration-list">
        <button className={`integration-item ${provider === 'meta' ? 'is-current' : ''}`} onClick={() => { setProvider('meta'); setStarted(false) }} type="button"><span className="integration-logo integration-logo--whatsapp"><MessageCircleMore size={20}/></span><span><b>WhatsApp Oficial</b><small>Conecte seu próprio número</small></span><em>Recomendado</em><ChevronRight size={17}/></button>
        <button className={`integration-item ${provider === 'uazapi' ? 'is-current' : ''}`} onClick={() => { setProvider('uazapi'); setStarted(false) }} type="button"><span className="integration-logo integration-logo--otimiza"><img src={otimizaSymbol} alt=""/></span><span><b>Automação Otimiza</b><small>Instância configurada pela equipe</small></span><em className="integration-item__state">1 ativo</em><ChevronRight size={17}/></button>
        <button className={`integration-item ${provider === 'ads' ? 'is-current' : ''}`} onClick={() => { setProvider('ads'); setStarted(false) }} type="button"><span className="integration-logo integration-logo--ads"><TrendingUp size={20}/></span><span><b>Meta Ads</b><small>Investimento e vendas atribuídas</small></span><ChevronRight size={17}/></button>
      </div>
      <article className="connection-detail panel">
        <span className="eyebrow">{detail.eyebrow}</span><h2>{detail.title}</h2><p>{detail.text}</p>
        <div className="connection-steps">{detail.steps.map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div>
        {!started ? <button className="primary-button" type="button" onClick={() => setStarted(true)}><Link2 size={17}/>{detail.action}</button> : <div className="connection-started"><CheckCircle2 size={19}/><div><b>Próximo passo preparado</b><p>{provider === 'uazapi' ? 'Sua solicitação será enviada para a equipe Otimiza AI assim que o CRM estiver publicado.' : 'Ao publicar o CRM e configurar o app Meta, este botão abre a autorização segura da sua conta.'}</p></div></div>}
        <small className="connection-note">{provider === 'meta' ? 'O CRM recebe eventos e organiza os dados. Nenhuma resposta automática é ativada nesta conexão.' : provider === 'uazapi' ? 'A equipe Otimiza AI mantém as credenciais técnicas protegidas no servidor.' : 'Receita só é atribuída quando houver um lead identificado pela campanha.'}</small>
      </article>
    </section>
  </>
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

function LeadDrawer({ lead, onClose, onAdvance }: { lead: Lead; onClose: () => void; onAdvance: () => void }) {
  const currentIndex = stages.indexOf(lead.stage)
  return <aside className="drawer" aria-label={`Detalhes de ${lead.name}`}>
    <header className="drawer__header"><button onClick={onClose} type="button" aria-label="Fechar detalhes"><X size={20}/></button><span>DETALHE DO LEAD</span><button type="button" aria-label="Mais ações"><MoreHorizontal size={21}/></button></header>
    <div className="drawer__person"><Avatar initials={lead.initials}/><div><h2>{lead.name}</h2><p>+55 85 9 8765-4321</p></div><button className="icon-button" type="button" aria-label="Abrir WhatsApp"><MessageCircleMore size={18}/></button></div>
    <div className="drawer__stage"><span>ETAPA ATUAL</span><button type="button">{lead.stage}<ChevronDown size={16}/></button></div>
    <div className="drawer__insight"><Sparkles size={18}/><div><b>Leitura da Otimiza AI</b><p>Lead com alta intenção. Citou preço e pediu condição de pagamento.</p></div></div>
    <section className="drawer__section"><h3>Resumo comercial</h3><div className="detail-grid"><div><span>Valor identificado</span><strong>{lead.value ? money(lead.value) : 'Ainda não identificado'}</strong></div><div><span>Origem</span><strong>{lead.source}</strong></div><div><span>Responsável</span><strong>{lead.owner}</strong></div><div><span>Canal</span><strong>{lead.channel}</strong></div></div></section>
    <section className="drawer__section"><h3>Última mensagem</h3><div className="message-preview"><p>{lead.lastMessage}</p><small>{lead.time}</small></div></section>
    <div className="drawer__bottom">{lead.stage !== 'Ganhos' && lead.stage !== 'Perdidos' ? <button className="primary-button" onClick={onAdvance} type="button">Mover para {stages[currentIndex + 1]} <ArrowRight size={17}/></button> : <button className="primary-button" onClick={onClose} type="button">{lead.stage === 'Ganhos' ? 'Venda confirmada' : 'Lead perdido'} <Goal size={17}/></button>}</div>
  </aside>
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
  const [account, setAccount] = useState<{ name: string; company_name: string; plan: string; role: string } | null>(null)
  const [metrics, setMetrics] = useState<{ confirmedRevenue: number; confirmedSales: number; openLeads: number; averageTicket: number; leadsThisMonth: number } | undefined>()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [showAccess, setShowAccess] = useState(false)
  const [showLeadForm, setShowLeadForm] = useState(false)
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

  const renderContent = () => {
    if (page === 'dashboard') return <Dashboard onNavigate={setPage} metrics={metrics} />
    if (page === 'crm') return <Crm leads={leads} channel={channel} setChannel={setChannel} onSelectLead={setSelectedLead} onAddLead={addLead} />
    if (page === 'leads') return <LeadsPage leads={leads} onSelectLead={setSelectedLead} onAddLead={addLead}/>
    if (page === 'conversas') return <ConversationsPage conversations={conversations}/>
    if (page === 'vendas') return <SalesPage sales={sales}/>
    if (page === 'configuracoes') return <Integrations />
    const copy: Record<'trafego' | 'relatorios' | 'chatbot', [typeof Bot, string, string, string]> = {
      trafego: [TrendingUp, 'META ADS', 'Do anúncio à venda.', 'Conecte sua conta de anúncios para relacionar investimento, leads e receita atribuída.'],
      relatorios: [BarChart3, 'RESULTADOS', 'Relatórios que explicam o crescimento.', 'Compare períodos, fontes e desempenho da equipe em relatórios exportáveis.'],
      chatbot: [Bot, 'CHATBOT POR REGRAS', 'Seu atendimento, do seu jeito.', 'Crie menus, palavras-chave e ações para cada número de WhatsApp sem usar IA.'],
    }
    const [icon, eyebrow, title, text] = copy[page]
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
      {selectedLead && <><button className="drawer-backdrop" onClick={() => setSelectedLead(null)} aria-label="Fechar detalhes" type="button"/><LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} onAdvance={advanceLead}/></>}
      {showAccess && <AccessModal onClose={() => setShowAccess(false)} onAuthenticated={authenticateSession}/>} {showLeadForm && <LeadForm onClose={() => setShowLeadForm(false)} onSave={createLead}/>}
    </div>
  )
}
