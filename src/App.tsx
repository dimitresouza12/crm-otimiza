import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  Goal,
  LayoutDashboard,
  MessageCircleMore,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react'

type Page = 'dashboard' | 'crm' | 'leads' | 'conversas' | 'vendas' | 'trafego' | 'relatorios' | 'chatbot' | 'configuracoes'
type Stage = 'Novos leads' | 'Qualificados' | 'Proposta enviada' | 'Negociação' | 'Ganhos'
type Channel = 'Todos os canais' | 'Comercial' | 'Unidade Aldeota' | 'Pós-venda'

type Lead = {
  id: number
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

const stages: Stage[] = ['Novos leads', 'Qualificados', 'Proposta enviada', 'Negociação', 'Ganhos']
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

function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <>
      <section className="page-head">
        <div><span className="eyebrow">VISÃO GERAL · SETEMBRO</span><h1>Seu atendimento está convertendo mais.</h1><p>Veja o que gerou receita e onde sua equipe pode agir agora.</p></div>
        <button className="period-button" type="button"><span>01–30 set. 2026</span><ChevronDown size={16} /></button>
      </section>
      <section className="metric-grid">
        <MetricCard title="Receita confirmada" value="R$ 38.640" trend="18,2%" emphasis />
        <MetricCard title="Em negociação" value="R$ 17.920" trend="8 leads quentes" />
        <MetricCard title="Novos leads" value="146" trend="24,5%" />
        <MetricCard title="Tempo de resposta" value="3 min" trend="42% mais rápido" />
      </section>
      <section className="dashboard-grid">
        <article className="revenue-panel panel">
          <div className="panel__header"><div><span className="eyebrow">RECEITA ATRIBUÍDA</span><h2>Faturamento ao longo do mês</h2></div><button className="text-button" type="button">Ver relatório <ArrowRight size={16} /></button></div>
          <div className="chart-summary"><strong>R$ 38.640</strong><span><TrendingUp size={15} /> 18,2%</span></div>
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

function Placeholder({ icon: Icon, eyebrow, title, text }: { icon: typeof Bot; eyebrow: string; title: string; text: string }) {
  return <section className="empty-page panel"><div className="empty-page__icon"><Icon size={24}/></div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p><button className="primary-button" type="button"><Plus size={18}/> Configurar agora</button></section>
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
    <div className="drawer__bottom">{currentIndex < stages.length - 1 ? <button className="primary-button" onClick={onAdvance} type="button">Mover para {stages[currentIndex + 1]} <ArrowRight size={17}/></button> : <button className="primary-button" onClick={onClose} type="button">Venda confirmada <Goal size={17}/></button>}</div>
  </aside>
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [channel, setChannel] = useState<Channel>('Todos os canais')
  const [leads, setLeads] = useState(initialLeads)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const addLead = () => {
    const newLead: Lead = { id: Date.now(), name: 'Novo contato', initials: 'NC', stage: 'Novos leads', channel: 'Comercial', source: 'Orgânico', time: 'agora', lastMessage: 'Lead criado manualmente.', temperature: 'Novo', owner: 'Lara', avatar: 'LC' }
    setLeads((current) => [newLead, ...current])
    setPage('crm')
    setSelectedLead(newLead)
  }

  const advanceLead = () => {
    if (!selectedLead) return
    const index = stages.indexOf(selectedLead.stage)
    if (index >= stages.length - 1) return
    const updated = { ...selectedLead, stage: stages[index + 1] }
    setLeads((current) => current.map((lead) => lead.id === updated.id ? updated : lead))
    setSelectedLead(updated)
  }

  const renderContent = () => {
    if (page === 'dashboard') return <Dashboard onNavigate={setPage} />
    if (page === 'crm') return <Crm leads={leads} channel={channel} setChannel={setChannel} onSelectLead={setSelectedLead} onAddLead={addLead} />
    const copy: Record<Exclude<Page, 'dashboard' | 'crm'>, [typeof Bot, string, string, string]> = {
      leads: [UsersRound, 'BASE DE CONTATOS', 'Leads que viram relacionamento.', 'Organize dados, responsáveis e histórico de cada pessoa em um só lugar.'],
      conversas: [MessageCircleMore, 'WHATSAPP CENTRALIZADO', 'Todas as conversas, com contexto.', 'Acompanhe o atendimento em tempo real e receba alertas antes de perder uma oportunidade.'],
      vendas: [CircleDollarSign, 'RECEITA', 'Vendas confirmadas e em análise.', 'Separe valores negociados de pagamentos confirmados para acompanhar seu caixa com clareza.'],
      trafego: [TrendingUp, 'META ADS', 'Do anúncio à venda.', 'Conecte sua conta de anúncios para relacionar investimento, leads e receita atribuída.'],
      relatorios: [BarChart3, 'RESULTADOS', 'Relatórios que explicam o crescimento.', 'Compare períodos, fontes e desempenho da equipe em relatórios exportáveis.'],
      chatbot: [Bot, 'CHATBOT POR REGRAS', 'Seu atendimento, do seu jeito.', 'Crie menus, palavras-chave e ações para cada número de WhatsApp sem usar IA.'],
      configuracoes: [Settings2, 'PREFERÊNCIAS', 'Configure a operação.', 'Gerencie equipe, números conectados, campos personalizados e permissões.'],
    }
    const [icon, eyebrow, title, text] = copy[page]
    return <Placeholder icon={icon} eyebrow={eyebrow} title={title} text={text} />
  }

  return (
    <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span>o</span></div><div className="brand-name">otimiza <b>AI</b></div><button className="collapse-button" onClick={() => setCollapsed((value) => !value)} type="button" aria-label="Recolher menu"><PanelLeftClose size={18}/></button></div>
        <button className="workspace-switcher" type="button"><span className="workspace-initial">CV</span><span><b>Clínica Vitta</b><small>Plano Pro</small></span><ChevronDown size={16}/></button>
        <nav className="navigation" aria-label="Navegação principal">{navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} className={page === id ? 'is-active' : ''} type="button" onClick={() => setPage(id)}><Icon size={19}/><span>{label}</span>{badge && <b>{badge}</b>}</button>)}</nav>
        <div className="sidebar-bottom"><button className="automation-status" type="button" onClick={() => setPage('chatbot')}><span className="bot-orb"><Bot size={17}/></span><span><b>Automação ativa</b><small>1 número conectado</small></span><ChevronRight size={16}/></button><button className={page === 'configuracoes' ? 'is-active' : ''} type="button" onClick={() => setPage('configuracoes')}><Settings2 size={19}/><span>Configurações</span></button><div className="profile"><Avatar initials="DV"/><span><b>Diego Viana</b><small>Administrador</small></span><ChevronDown size={15}/></div></div>
      </aside>
      <main className="main-content"><header className="topbar"><div className="crumb"><span>Otimiza AI</span><ChevronRight size={15}/><b>{page === 'crm' ? 'CRM' : page === 'dashboard' ? 'Dashboard' : navItems.find((item) => item.id === page)?.label ?? 'Configurações'}</b></div><div className="topbar-actions"><button className="help-chip" type="button"><Sparkles size={15}/> Central de ajuda</button><button className="notification-button" type="button" aria-label="Notificações"><Bell size={19}/><i/></button></div></header><div className="content-scroll">{renderContent()}</div></main>
      {selectedLead && <><button className="drawer-backdrop" onClick={() => setSelectedLead(null)} aria-label="Fechar detalhes" type="button"/><LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} onAdvance={advanceLead}/></>}
    </div>
  )
}
