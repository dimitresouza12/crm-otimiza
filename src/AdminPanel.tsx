import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Bot, Check, CircleAlert, Eye, History, LockKeyhole, Megaphone, MessageCircleMore, Search, ShieldCheck, TrendingUp, Wallet, X } from 'lucide-react'
import { api, type AdminAuditRow, type AdminCompany, type AdminPayment, type AdminSubscription, type AdminSubscriptions, type AdminTrafficRow, type Session } from './lib/api'
import { ChatPage } from './ChatPage'
import { ChatbotPage } from './ChatbotPage'

const brlCents = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ratio = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string | null | undefined) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—'
const dayTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const errorText = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback

const planLabel = (plan: string) => ({ crm: 'CRM', chatbot: 'Chatbot', essential: 'Essencial', pro: 'Pro', automation: 'Automação' } as Record<string, string>)[plan] ?? plan
const stateLabel: Record<AdminSubscription['state'], string> = { trial: 'Em teste', trial_expired: 'Teste expirado', active: 'Ativa', overdue: 'Inadimplente', canceled: 'Cancelada' }
const cycleLabel: Record<AdminSubscription['cycle'], string> = { trial: 'Teste grátis', monthly: 'Mensal', annual: 'Anual' }
const paymentLabel = (status: string) => ({ PENDING: 'Aguardando', RECEIVED: 'Pago', CONFIRMED: 'Confirmado', RECEIVED_IN_CASH: 'Pago', OVERDUE: 'Vencido', REFUNDED: 'Estornado', REFUND_REQUESTED: 'Estorno solicitado', CHARGEBACK_REQUESTED: 'Chargeback', AWAITING_RISK_ANALYSIS: 'Em análise', DELETED: 'Removido' } as Record<string, string>)[status] ?? status
const paymentTone = (status: string) => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(status) ? 'ok' : status === 'OVERDUE' ? 'bad' : 'wait'
const methodLabel = (type: string | null) => ({ pix: 'Pix', boleto: 'Boleto', card: 'Cartão', card_recurring: 'Cartão recorrente' } as Record<string, string>)[type ?? ''] ?? '—'
const auditLabel = (action: string) => action.startsWith('subscription.cancel') ? 'Cancelou uma assinatura' : action.startsWith('PUT /api/chatbot') || action.startsWith('POST /api/chatbot') || action.startsWith('DELETE /api/chatbot') ? 'Alterou o chatbot' : action.startsWith('POST /api/traffic') ? 'Registrou uma campanha' : action.startsWith('GET /api/conversations') ? 'Leu conversas' : action

function StatusBadge({ tone, children }: { tone: 'ok' | 'bad' | 'wait' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={`adm-badge adm-badge--${tone}`}>{children}</span>
}
const stateTone = (state: AdminSubscription['state']) => state === 'active' ? 'ok' : state === 'overdue' ? 'bad' : state === 'trial' ? 'info' : 'muted'

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'bad' }) {
  return <div className={`adm-kpi ${tone === 'bad' ? 'adm-kpi--bad' : ''}`}><span>{label}</span><b>{value}</b>{hint && <small>{hint}</small>}</div>
}

function PageHead({ eyebrow, title, text, aside }: { eyebrow: string; title: string; text: string; aside?: ReactNode }) {
  return <section className="page-head adm-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{aside}</section>
}

function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  return <p className={`adm-notice adm-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{tone === 'error' ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}<span>{children}</span></p>
}

// ───────────────────────── Assinaturas (financeiro, só master) ─────────────────────────
type Filter = 'all' | 'trial' | 'active' | 'annual' | 'overdue' | 'canceled' | 'trial_expired'
const filterDefs: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todas' }, { id: 'trial', label: 'Em teste' }, { id: 'active', label: 'Ativas' }, { id: 'annual', label: 'Anuais' },
  { id: 'overdue', label: 'Inadimplentes' }, { id: 'trial_expired', label: 'Teste expirado' }, { id: 'canceled', label: 'Canceladas' },
]
const matchesFilter = (item: AdminSubscription, filter: Filter) => filter === 'all' ? true : filter === 'annual' ? item.cycle === 'annual' && (item.state === 'active' || item.state === 'overdue') : item.state === filter

function valueCell(item: AdminSubscription) {
  if (item.state === 'canceled') return <span className="adm-muted">—</span>
  if (item.cycle === 'annual') return <><b>{brlCents(item.annualCents ?? item.monthlyCents * 12)}</b><small>por ano</small></>
  if (item.state === 'trial' || item.state === 'trial_expired') return <><b className="adm-muted">{brlCents(item.priceCents)}</b><small>por mês, após o teste</small></>
  return <><b>{brlCents(item.priceCents)}</b><small>por mês</small></>
}

function nextCell(item: AdminSubscription) {
  if (item.state === 'trial') return <><b>{item.trialDaysLeft === 0 ? 'Termina hoje' : `${item.trialDaysLeft} ${item.trialDaysLeft === 1 ? 'dia' : 'dias'}`}</b><small>teste até {day(item.trialEndsAt)}</small></>
  if (item.state === 'trial_expired') return <><b>Expirou</b><small>em {day(item.trialEndsAt)}</small></>
  if (item.state === 'canceled') return <span className="adm-muted">—</span>
  return <><b>{day(item.nextDueDate)}</b><small>{item.autoRenew ? 'renovação automática' : 'próxima cobrança'}</small></>
}

export function AdminSubscriptionsPage({ session }: { session: Session }) {
  const [data, setData] = useState<AdminSubscriptions | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [audit, setAudit] = useState<AdminAuditRow[] | null>(null)

  const load = useCallback(async () => {
    try { setData(await api.adminSubscriptions(session)); setError('') } catch (reason) { setError(errorText(reason, 'Não foi possível carregar as assinaturas.')) }
  }, [session])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.adminAudit(session).then(setAudit).catch(() => setAudit([])) }, [session])

  const counts = useMemo(() => Object.fromEntries(filterDefs.map((entry) => [entry.id, (data?.items ?? []).filter((item) => matchesFilter(item, entry.id)).length])) as Record<Filter, number>, [data])
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR')
    return (data?.items ?? []).filter((item) => matchesFilter(item, filter) && (!needle || `${item.company} ${item.ownerName ?? ''} ${item.ownerEmail ?? ''}`.toLocaleLowerCase('pt-BR').includes(needle)))
  }, [data, filter, search])
  const open = data?.items.find((item) => item.companyId === openId) ?? null

  return <>
    <PageHead eyebrow="EQUIPE OTIMIZA · FINANCEIRO" title="Assinaturas" text="Quem está em teste, quem paga, em qual plano e quando é a próxima cobrança. Planos anuais são reconhecidos pelo valor pago." />
    {error && <Notice>{error}</Notice>}
    {!data && !error && <p className="page-loading">Carregando assinaturas…</p>}
    {data && <>
      <section className="adm-kpis" aria-label="Resumo financeiro">
        <Kpi label="Receita mensal recorrente" value={brlCents(data.totals.monthlyRecurringCents)} hint={`${data.totals.active + data.totals.overdue} ${data.totals.active + data.totals.overdue === 1 ? 'assinatura paga' : 'assinaturas pagas'}`} />
        <Kpi label="Em teste grátis" value={String(data.totals.trial)} hint="ainda dentro dos 7 dias" />
        <Kpi label="Planos anuais" value={String(data.totals.annual)} hint="pagamento adiantado de 12 meses" />
        <Kpi label="Inadimplentes" value={String(data.totals.overdue)} hint={data.totals.overdue ? 'cobrar hoje' : 'nenhum no momento'} tone={data.totals.overdue ? 'bad' : undefined} />
        <Kpi label="Total já recebido" value={brlCents(data.totals.totalPaidCents)} hint={`${data.totals.companies} ${data.totals.companies === 1 ? 'empresa' : 'empresas'} no total`} />
      </section>

      <section className="panel adm-table-panel">
        <div className="adm-toolbar">
          <div className="adm-chips" role="group" aria-label="Filtrar por situação">
            {filterDefs.map((entry) => <button key={entry.id} type="button" aria-pressed={filter === entry.id} className={filter === entry.id ? 'is-on' : ''} onClick={() => setFilter(entry.id)}>{entry.label}<em>{counts[entry.id]}</em></button>)}
          </div>
          <label className="adm-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar empresa ou e-mail" aria-label="Buscar empresa ou e-mail" /></label>
        </div>
        {rows.length ? <table className="adm-table">
          <thead><tr><th scope="col">Cliente</th><th scope="col">Plano</th><th scope="col">Situação</th><th scope="col">Ciclo</th><th scope="col">Valor</th><th scope="col">Teste / próxima cobrança</th><th scope="col">Último pagamento</th></tr></thead>
          <tbody>{rows.map((item) => <tr key={item.companyId} className={openId === item.companyId ? 'is-open' : ''}>
            <td data-label="Cliente"><button type="button" className="adm-rowbtn" onClick={() => setOpenId(item.companyId)} aria-label={`Abrir detalhes de ${item.company}`}><b>{item.company}</b><small>{item.ownerEmail ?? 'sem titular'}</small></button></td>
            <td data-label="Plano"><b>{planLabel(item.plan)}</b><small>{item.channelLimit} {item.channelLimit === 1 ? 'número' : 'números'}</small></td>
            <td data-label="Situação"><StatusBadge tone={stateTone(item.state)}>{stateLabel[item.state]}</StatusBadge></td>
            <td data-label="Ciclo">{cycleLabel[item.cycle]}</td>
            <td data-label="Valor">{valueCell(item)}</td>
            <td data-label="Teste / próxima cobrança">{nextCell(item)}</td>
            <td data-label="Último pagamento">{item.lastPayment ? <><b>{item.lastPayment.valueCents !== null ? brlCents(item.lastPayment.valueCents) : '—'}</b><small><StatusBadge tone={paymentTone(item.lastPayment.status)}>{paymentLabel(item.lastPayment.status)}</StatusBadge> {day(item.lastPayment.paidAt ?? item.lastPayment.dueDate)}</small></> : <span className="adm-muted">Nenhum</span>}</td>
          </tr>)}</tbody>
        </table> : <div className="adm-empty"><Wallet size={22} /><b>{data.items.length ? 'Nenhuma assinatura neste filtro.' : 'Ainda não há clientes cadastrados.'}</b><p>{data.items.length ? 'Escolha outro filtro ou limpe a busca.' : 'Quando alguém criar uma conta, ela aparece aqui já em teste grátis.'}</p></div>}
      </section>

      <section className="panel adm-audit">
        <div className="panel__header"><div><span className="eyebrow">TRILHA DE AUDITORIA</span><h2>O que a equipe fez nas contas</h2></div><History size={18} aria-hidden="true" /></div>
        {audit === null ? <p className="page-loading">Carregando…</p> : audit.length ? <ul>{audit.slice(0, 12).map((row) => <li key={row.id}><b>{row.user_name}</b> {auditLabel(row.action)}{row.company_name && <> · {row.company_name}</>}<time>{dayTime(row.created_at)}</time></li>)}</ul> : <p className="adm-muted">Nenhuma ação registrada ainda.</p>}
      </section>
    </>}
    {open && <SubscriptionDrawer key={open.companyId} session={session} item={open} onClose={() => setOpenId(null)} onChanged={(updated) => setData((current) => current && { ...current, items: current.items.map((item) => item.companyId === updated.companyId ? updated : item) })} onReload={load} />}
  </>
}

function SubscriptionDrawer({ session, item, onClose, onChanged, onReload }: { session: Session; item: AdminSubscription; onClose: () => void; onChanged: (item: AdminSubscription) => void; onReload: () => Promise<void> }) {
  const [payments, setPayments] = useState<AdminPayment[] | null>(null)
  const [paymentsError, setPaymentsError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void api.adminPayments(session, item.companyId).then(setPayments).catch((reasonValue) => { setPayments([]); setPaymentsError(errorText(reasonValue, 'Não foi possível carregar os pagamentos.')) }) }, [session, item.companyId])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const cancel = async () => {
    setCanceling(true); setError('')
    try { onChanged(await api.adminCancel(session, item.companyId, reason)); setConfirming(false); void onReload() } catch (reasonValue) { setError(errorText(reasonValue, 'Não foi possível cancelar.')) } finally { setCanceling(false) }
  }

  return <>
    <button className="drawer-backdrop" type="button" aria-label="Fechar detalhes" onClick={onClose} />
    <aside className="drawer adm-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-drawer-title">
      <header className="adm-drawer__head">
        <div><span className="eyebrow">ASSINATURA</span><h2 id="adm-drawer-title">{item.company}</h2><p>{item.ownerName ?? 'Sem titular'} · {item.ownerEmail ?? '—'}</p></div>
        <button type="button" className="adm-iconbtn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </header>
      <div className="adm-drawer__body">
        <div className="adm-status-line"><StatusBadge tone={stateTone(item.state)}>{stateLabel[item.state]}</StatusBadge><StatusBadge tone="muted">{cycleLabel[item.cycle]}</StatusBadge></div>
        <dl className="adm-facts">
          <div><dt>Plano</dt><dd>{planLabel(item.plan)} · {item.channelLimit} {item.channelLimit === 1 ? 'número' : 'números'}</dd></div>
          <div><dt>{item.cycle === 'annual' ? 'Valor anual' : 'Valor mensal'}</dt><dd>{item.cycle === 'annual' ? `${brlCents(item.annualCents ?? item.monthlyCents * 12)} (${brlCents(item.monthlyCents)}/mês)` : brlCents(item.priceCents)}</dd></div>
          <div><dt>{item.state === 'trial' || item.state === 'trial_expired' ? 'Fim do teste' : 'Próxima cobrança'}</dt><dd>{day(item.state === 'trial' || item.state === 'trial_expired' ? item.trialEndsAt : item.nextDueDate)}</dd></div>
          <div><dt>Forma de pagamento</dt><dd>{item.card ? `${item.card.brand ?? 'Cartão'} final ${item.card.last4}` : methodLabel(item.billingType)}</dd></div>
          <div><dt>Total já pago</dt><dd>{brlCents(item.totalPaidCents)}</dd></div>
          <div><dt>Cliente desde</dt><dd>{day(item.createdAt)}</dd></div>
        </dl>

        <h3 className="adm-sub">Pagamentos</h3>
        {payments === null ? <p className="page-loading">Carregando…</p> : paymentsError ? <Notice>{paymentsError}</Notice> : payments.length ? <ul className="adm-payments">{payments.map((payment) => <li key={payment.id}>
          <div><b>{brlCents(payment.value_cents)}</b><small>{methodLabel(payment.billing_type)} · vence {day(payment.due_date)}{payment.paid_at ? ` · pago ${day(payment.paid_at)}` : ''}</small></div>
          <StatusBadge tone={paymentTone(payment.status)}>{paymentLabel(payment.status)}</StatusBadge>
        </li>)}</ul> : <p className="adm-muted">Nenhuma cobrança gerada ainda{item.state === 'trial' ? ': a conta está no teste grátis.' : '.'}</p>}

        {item.canCancel && <section className="adm-danger" aria-label="Cancelar assinatura">
          {!confirming ? <>
            <div><b>Cancelar assinatura</b><p>Encerra a cobrança recorrente e tira o acesso da empresa ao CRM.</p></div>
            <button type="button" className="adm-btn adm-btn--danger-outline" onClick={() => setConfirming(true)}>Cancelar assinatura</button>
          </> : <div className="adm-confirm">
            <p><AlertTriangle size={16} aria-hidden="true" /><span><b>Tem certeza?</b> A cobrança recorrente de <b>{item.company}</b> será encerrada agora e a empresa perde o acesso ao CRM na hora. Isso não devolve valores já pagos.</span></p>
            <label>Motivo <small>opcional, fica na auditoria</small><input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: pediu o cancelamento pelo WhatsApp" /></label>
            {error && <Notice>{error}</Notice>}
            <div className="adm-confirm__actions"><button type="button" className="adm-btn" onClick={() => { setConfirming(false); setError('') }} disabled={canceling}>Manter assinatura</button><button type="button" className="adm-btn adm-btn--danger" onClick={() => void cancel()} disabled={canceling}>{canceling ? 'Cancelando…' : 'Confirmar cancelamento'}</button></div>
          </div>}
        </section>}
        {item.state === 'canceled' && <Notice tone="info">Assinatura cancelada. A empresa não acessa mais o CRM.</Notice>}
      </div>
    </aside>
  </>
}

// ───────────────────────── Escolha de cliente (compartilhada) ─────────────────────────
function CompanyPicker({ companies, selectedId, onSelect, extra }: { companies: AdminCompany[]; selectedId: string | null; onSelect: (id: string) => void; extra?: (company: AdminCompany) => ReactNode }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR')
    return needle ? companies.filter((company) => `${company.name} ${company.owner_name ?? ''}`.toLocaleLowerCase('pt-BR').includes(needle)) : companies
  }, [companies, search])
  return <aside className="adm-picker panel" aria-label="Clientes">
    <label className="adm-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" /></label>
    <ul>{filtered.map((company) => <li key={company.id}><button type="button" aria-current={selectedId === company.id ? 'true' : undefined} className={selectedId === company.id ? 'is-on' : ''} onClick={() => onSelect(company.id)}>
      <span className="adm-picker__name"><b>{company.name}</b><small>{company.owner_name ?? 'Sem titular'} · {planLabel(company.plan)}</small></span>
      {extra ? extra(company) : <StatusBadge tone={company.bot_active ? 'ok' : 'muted'}>{company.bot_active ? 'Bot ligado' : 'Bot desligado'}</StatusBadge>}
    </button></li>)}</ul>
    {!filtered.length && <p className="adm-muted adm-picker__empty">Nenhum cliente encontrado.</p>}
  </aside>
}

function useCompanies(session: Session) {
  const [companies, setCompanies] = useState<AdminCompany[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api.adminCompanies(session).then(setCompanies).catch((reason) => { setCompanies([]); setError(errorText(reason, 'Não foi possível carregar os clientes.')) }) }, [session])
  return { companies, error }
}

// ───────────────────────── Configuração de chatbot (master e gestor de tráfego) ─────────────────────────
export function AdminChatbotPage({ session }: { session: Session }) {
  const { companies, error } = useCompanies(session)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = companies?.find((company) => company.id === selectedId) ?? null
  const scoped = useMemo(() => selectedId ? { ...session, companyId: selectedId } : null, [session, selectedId])
  const noop = useCallback(() => undefined, [])

  return <>
    <PageHead eyebrow="EQUIPE OTIMIZA · CHATBOT" title="Configuração de chatbot" text="Escolha o cliente e configure o chatbot dele por aqui: mensagens, horários, catálogo, cidades e assuntos. Tudo o que você salvar vale para a conta do cliente." />
    {error && <Notice>{error}</Notice>}
    {!companies && !error && <p className="page-loading">Carregando clientes…</p>}
    {companies && <section className="adm-split">
      <CompanyPicker companies={companies} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="adm-stage">
        {selected && scoped
          ? <>
            <div className="adm-context"><Bot size={16} aria-hidden="true" /><span>Editando o chatbot de <b>{selected.name}</b></span><StatusBadge tone={selected.bot_active ? 'ok' : 'muted'}>{selected.bot_active ? 'Ligado' : 'Desligado'}</StatusBadge><small>{selected.connected_channels} {selected.connected_channels === 1 ? 'número conectado' : 'números conectados'} · {selected.bot_rules} {selected.bot_rules === 1 ? 'assunto ativo' : 'assuntos ativos'}</small></div>
            <div className="adm-embed"><ChatbotPage key={selected.id} session={scoped} account={{ plan: 'chatbot' }} onRequestAccess={noop} onOpenIntegrations={noop} /></div>
          </>
          : <div className="adm-empty adm-empty--stage"><Bot size={26} /><b>Escolha um cliente</b><p>Selecione na lista ao lado a conta que você quer configurar.</p></div>}
      </div>
    </section>}
  </>
}

// ───────────────────────── Gestão de tráfego (master e gestor de tráfego) ─────────────────────────
const cpl = (row: { spend: number; crm_leads: number }) => row.crm_leads ? row.spend / row.crm_leads : null
const roas = (row: { spend: number; revenue: number }) => row.spend ? row.revenue / row.spend : null

export function AdminTrafficPage({ session, renderCampaigns }: { session: Session; renderCampaigns: (session: Session) => ReactNode }) {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState<AdminTrafficRow[] | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'campanhas' | 'conversas'>('campanhas')

  useEffect(() => {
    setRows(null)
    void api.adminTraffic(session, days).then((result) => { setRows(result.items); setError('') }).catch((reason) => { setRows([]); setError(errorText(reason, 'Não foi possível carregar o tráfego.')) })
  }, [session, days])

  const totals = useMemo(() => (rows ?? []).reduce((sum, row) => ({ spend: sum.spend + row.spend, leads: sum.leads + row.crm_leads, sales: sum.sales + row.confirmed_sales, revenue: sum.revenue + row.revenue }), { spend: 0, leads: 0, sales: 0, revenue: 0 }), [rows])
  const selected = rows?.find((row) => row.id === selectedId) ?? null
  const scoped = useMemo(() => selectedId ? { ...session, companyId: selectedId } : null, [session, selectedId])

  if (selected && scoped) {
    return <>
      <button type="button" className="adm-back" onClick={() => { setSelectedId(null); setTab('campanhas') }}><ArrowLeft size={16} aria-hidden="true" /> Todos os clientes</button>
      <PageHead eyebrow="EQUIPE OTIMIZA · TRÁFEGO" title={selected.name} text={`Últimos ${days} dias: ${brl(selected.spend)} investidos, ${selected.crm_leads} ${selected.crm_leads === 1 ? 'lead' : 'leads'} no CRM e ${selected.confirmed_sales} ${selected.confirmed_sales === 1 ? 'venda confirmada' : 'vendas confirmadas'}.`} />
      <div className="adm-tabs" role="tablist" aria-label="Áreas do cliente">
        <button type="button" role="tab" aria-selected={tab === 'campanhas'} className={tab === 'campanhas' ? 'is-on' : ''} onClick={() => setTab('campanhas')}><TrendingUp size={15} aria-hidden="true" /> Campanhas</button>
        <button type="button" role="tab" aria-selected={tab === 'conversas'} className={tab === 'conversas' ? 'is-on' : ''} onClick={() => setTab('conversas')}>{selected.conversations_authorized ? <MessageCircleMore size={15} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />} Conversas</button>
      </div>
      <div className="adm-embed" role="tabpanel">
        {tab === 'campanhas' && <div key={`c-${scoped.companyId}`}>{renderCampaigns(scoped)}</div>}
        {tab === 'conversas' && (selected.conversations_authorized
          ? <div className="adm-chat"><Notice tone="info">Somente leitura. O cliente autorizou o acompanhamento das conversas e cada acesso fica registrado.</Notice><ChatPage key={`m-${scoped.companyId}`} session={scoped} initial={[]} botEnabled={false} readOnly /></div>
          : <div className="adm-empty adm-empty--stage"><LockKeyhole size={26} /><b>O cliente ainda não autorizou</b><p>Para analisar as conversas, peça ao titular da conta que ligue a opção “Acesso da equipe de tráfego” em Configurações. Ele pode desligar quando quiser.</p></div>)}
      </div>
    </>
  }

  return <>
    <PageHead eyebrow="EQUIPE OTIMIZA · TRÁFEGO" title="Gestão de tráfego" text="Desempenho das campanhas de todos os clientes, a partir dos leads e das vendas que chegaram pelo tráfego."
      aside={<div className="adm-seg" role="group" aria-label="Período">{[7, 30, 90].map((value) => <button key={value} type="button" aria-pressed={days === value} className={days === value ? 'is-on' : ''} onClick={() => setDays(value)}>{value} dias</button>)}</div>} />
    {error && <Notice>{error}</Notice>}
    {!rows && !error && <p className="page-loading">Carregando desempenho…</p>}
    {rows && <>
      <section className="adm-kpis adm-kpis--4" aria-label="Resumo do tráfego">
        <Kpi label="Investimento" value={brl(totals.spend)} hint={`${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'} com campanhas`} />
        <Kpi label="Leads no CRM" value={String(totals.leads)} hint={totals.leads ? `${brl(totals.spend / totals.leads)} por lead` : 'sem leads atribuídos'} />
        <Kpi label="Vendas confirmadas" value={String(totals.sales)} hint={brl(totals.revenue) + ' em receita'} />
        <Kpi label="Retorno (ROAS)" value={totals.spend ? `${ratio(totals.revenue / totals.spend)}x` : '—'} hint="receita por real investido" />
      </section>
      <section className="panel adm-table-panel">
        {rows.length ? <table className="adm-table adm-table--traffic">
          <thead><tr><th scope="col">Cliente</th><th scope="col">Investimento</th><th scope="col">Leads no CRM</th><th scope="col">Custo por lead</th><th scope="col">Vendas</th><th scope="col">Receita</th><th scope="col">ROAS</th><th scope="col">Conversas</th></tr></thead>
          <tbody>{rows.map((row) => {
            const rowCpl = cpl(row), rowRoas = roas(row)
            return <tr key={row.id}>
              <td data-label="Cliente"><button type="button" className="adm-rowbtn" onClick={() => setSelectedId(row.id)} aria-label={`Abrir ${row.name}`}><b>{row.name}</b><small>{row.campaigns} {row.campaigns === 1 ? 'campanha' : 'campanhas'}</small></button></td>
              <td data-label="Investimento">{brl(row.spend)}</td>
              <td data-label="Leads no CRM">{row.crm_leads}<small>{row.reported_leads} informados na plataforma</small></td>
              <td data-label="Custo por lead">{rowCpl === null ? '—' : brl(rowCpl)}</td>
              <td data-label="Vendas">{row.confirmed_sales}</td>
              <td data-label="Receita">{brl(row.revenue)}</td>
              <td data-label="ROAS">{rowRoas === null ? '—' : <StatusBadge tone={rowRoas >= 2 ? 'ok' : rowRoas >= 1 ? 'wait' : row.revenue ? 'bad' : 'muted'}>{ratio(rowRoas)}x</StatusBadge>}</td>
              <td data-label="Conversas">{row.conversations_authorized ? <StatusBadge tone="ok"><Eye size={12} aria-hidden="true" /> Liberadas</StatusBadge> : <StatusBadge tone="muted"><LockKeyhole size={12} aria-hidden="true" /> Sem autorização</StatusBadge>}</td>
            </tr>
          })}</tbody>
        </table> : <div className="adm-empty"><Megaphone size={22} /><b>Nenhum cliente com campanhas nos últimos {days} dias.</b><p>Registre o investimento de um cliente em Tráfego pago para ele aparecer aqui. O cliente também pode fazer isso na conta dele.</p></div>}
      </section>
    </>}
  </>
}

// ───────────────────────── Autorização do cliente (aparece em Configurações do titular) ─────────────────────────
export function TrafficAccessCard({ session, grantedAt, onChange }: { session: Session; grantedAt: string | null; onChange: (value: string | null) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const on = grantedAt !== null
  const toggle = async () => {
    setSaving(true); setError('')
    try { onChange((await api.setTrafficAccess(session, !on)).trafficAccessGrantedAt) } catch (reason) { setError(errorText(reason, 'Não foi possível salvar.')) } finally { setSaving(false) }
  }
  return <section className="panel adm-consent" aria-label="Acesso da equipe de tráfego">
    <div className="adm-consent__icon" aria-hidden="true"><Eye size={20} /></div>
    <div className="adm-consent__text">
      <span className="eyebrow">PRIVACIDADE</span>
      <h2>Acesso da equipe de tráfego às conversas</h2>
      <p>Permite que o gestor de tráfego da Otimiza leia as conversas do WhatsApp para entender a qualidade dos leads e melhorar suas campanhas. É <b>somente leitura</b>: ele não envia mensagens nem altera nada, e cada acesso fica registrado. Você pode desligar quando quiser.</p>
      {on && <small><Check size={12} aria-hidden="true" /> Liberado em {day(grantedAt)}</small>}
      {error && <Notice>{error}</Notice>}
    </div>
    <button type="button" role="switch" aria-checked={on} aria-label="Permitir que a equipe de tráfego leia as conversas" className={`adm-switch ${on ? 'is-on' : ''}`} disabled={saving} onClick={() => void toggle()}><i /></button>
  </section>
}
