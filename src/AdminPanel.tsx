import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Bot, CalendarCheck, CalendarPlus, CalendarRange, Check, CircleAlert, Eye, Gift, History, Infinity as InfinityIcon, LockKeyhole, Megaphone, MessageCircleMore, Search, ShieldCheck, Timer, TrendingUp, Wallet, X } from 'lucide-react'
import { api, type AdminAccessAction, type AdminAuditRow, type AdminCompany, type AdminPayment, type AdminSubscription, type AdminSubscriptions, type AdminTeamMember, type AdminTrafficRow, type Session } from './lib/api'
import { ChatPage } from './ChatPage'
import { ChatbotPage } from './ChatbotPage'

const brlCents = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ratio = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string | null | undefined) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—'
const dayTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const errorText = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback

const planLabel = (plan: string) => ({ crm: 'CRM', chatbot: 'Chatbot', essential: 'Essencial', pro: 'Pro', automation: 'Automação' } as Record<string, string>)[plan] ?? plan
const stateLabel: Record<AdminSubscription['state'], string> = { trial: 'Em teste', trial_expired: 'Teste expirado', active: 'Ativa', overdue: 'Inadimplente', canceled: 'Cancelada', expired: 'Acesso encerrado' }
const cycleLabel: Record<AdminSubscription['cycle'], string> = { trial: 'Teste grátis', monthly: 'Mensal', annual: 'Anual', lifetime: 'Vitalício' }
const grantLabel = { monthly: 'Acesso mensal', annual: 'Acesso anual', lifetime: 'Acesso vitalício' } as const
const daysText = (days: number | null) => days === null ? '' : days === 0 ? 'termina hoje' : `${days} ${days === 1 ? 'dia' : 'dias'}`
const paymentLabel = (status: string) => ({ PENDING: 'Aguardando', RECEIVED: 'Pago', CONFIRMED: 'Confirmado', RECEIVED_IN_CASH: 'Pago', OVERDUE: 'Vencido', REFUNDED: 'Estornado', REFUND_REQUESTED: 'Estorno solicitado', CHARGEBACK_REQUESTED: 'Chargeback', AWAITING_RISK_ANALYSIS: 'Em análise', DELETED: 'Removido' } as Record<string, string>)[status] ?? status
const paymentTone = (status: string) => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(status) ? 'ok' : status === 'OVERDUE' ? 'bad' : 'wait'
const methodLabel = (type: string | null) => ({ pix: 'Pix', boleto: 'Boleto', card: 'Cartão', card_recurring: 'Cartão recorrente' } as Record<string, string>)[type ?? ''] ?? '—'
const accessAuditLabel = (action: string) => ({ 'team.role': 'Mudou o papel de alguém da equipe', 'access.trial_plus_7': 'Deu +7 dias de teste', 'access.monthly': 'Liberou acesso mensal', 'access.annual': 'Liberou acesso anual', 'access.lifetime': 'Liberou acesso vitalício', 'access.revoke': 'Revogou o acesso liberado' } as Record<string, string>)[action]
const auditLabel = (action: string) => accessAuditLabel(action) ?? (action.startsWith('subscription.cancel') ? 'Cancelou uma assinatura' : action.startsWith('PUT /api/chatbot') || action.startsWith('POST /api/chatbot') || action.startsWith('DELETE /api/chatbot') ? 'Alterou o chatbot' : action.startsWith('POST /api/traffic') ? 'Registrou uma campanha' : action.startsWith('GET /api/conversations') ? 'Leu conversas' : action)

function StatusBadge({ tone, children }: { tone: 'ok' | 'bad' | 'wait' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={`adm-badge adm-badge--${tone}`}>{children}</span>
}
const stateTone = (state: AdminSubscription['state']) => state === 'active' ? 'ok' : state === 'overdue' ? 'bad' : state === 'trial' ? 'info' : state === 'expired' ? 'wait' : 'muted'

// Cartão de número no mesmo estilo dos cartões do Dashboard: ícone, rótulo, valor grande e uma linha de contexto.
function Kpi({ label, value, hint, tone, icon, emphasis }: { label: string; value: string; hint?: string; tone?: 'bad'; icon?: ReactNode; emphasis?: boolean }) {
  return <div className={`adm-kpi${tone === 'bad' ? ' adm-kpi--bad' : ''}${emphasis ? ' adm-kpi--emphasis' : ''}`}><div className="adm-kpi__top"><span>{label}</span>{icon && <i aria-hidden="true">{icon}</i>}</div><b>{value}</b>{hint && <small>{hint}</small>}</div>
}

function PageHead({ eyebrow, title, text, aside }: { eyebrow: string; title: string; text: string; aside?: ReactNode }) {
  return <section className="page-head adm-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{aside}</section>
}

function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  return <p className={`adm-notice adm-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{tone === 'error' ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}<span>{children}</span></p>
}

// ───────────────────────── Assinaturas (financeiro, só master) ─────────────────────────
type Filter = 'all' | 'trial' | 'active' | 'annual' | 'granted' | 'overdue' | 'canceled' | 'trial_expired'
const filterDefs: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todas' }, { id: 'trial', label: 'Em teste' }, { id: 'active', label: 'Ativas' }, { id: 'annual', label: 'Anuais' }, { id: 'granted', label: 'Liberadas' },
  { id: 'overdue', label: 'Inadimplentes' }, { id: 'trial_expired', label: 'Teste expirado' }, { id: 'canceled', label: 'Canceladas' },
]
const matchesFilter = (item: AdminSubscription, filter: Filter) => filter === 'all' ? true : filter === 'granted' ? item.granted : filter === 'annual' ? item.cycle === 'annual' && !item.granted && (item.state === 'active' || item.state === 'overdue') : item.state === filter

function valueCell(item: AdminSubscription) {
  if (item.granted) return <><b>{item.grant?.kind === 'lifetime' ? 'Vitalício' : 'Cortesia'}</b><small>sem cobrança</small></>
  if (item.state === 'canceled') return <span className="adm-muted">—</span>
  if (item.cycle === 'annual') return <><b>{brlCents(item.annualCents ?? item.monthlyCents * 12)}</b><small>por ano</small></>
  if (item.state === 'trial' || item.state === 'trial_expired') return <><b className="adm-muted">{brlCents(item.priceCents)}</b><small>por mês, após o teste</small></>
  return <><b>{brlCents(item.priceCents)}</b><small>por mês</small></>
}

function nextCell(item: AdminSubscription) {
  if (item.grant) {
    if (item.grant.kind === 'lifetime') return <><b>Sem prazo</b><small>acesso vitalício</small></>
    return item.grant.active ? <><b>Até {day(item.grant.until)}</b><small>{daysText(item.grant.daysLeft)}</small></> : <><b>Encerrou</b><small>em {day(item.grant.until)}</small></>
  }
  if (item.state === 'trial') return <><b>{item.trialDaysLeft === 0 ? 'Termina hoje' : `${item.trialDaysLeft} ${item.trialDaysLeft === 1 ? 'dia' : 'dias'}`}</b><small>teste até {day(item.trialEndsAt)}</small><span className="adm-meter" aria-hidden="true"><i style={{ width: `${Math.max(6, Math.min(100, (((item.trialDaysLeft ?? 0) + 1) / 14) * 100))}%` }} /></span></>
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
        <Kpi emphasis icon={<TrendingUp size={16} />} label="Receita mensal recorrente" value={brlCents(data.totals.monthlyRecurringCents)} hint={`${data.totals.active + data.totals.overdue - data.totals.granted} ${data.totals.active + data.totals.overdue - data.totals.granted === 1 ? 'assinatura paga' : 'assinaturas pagas'}`} />
        <Kpi icon={<Timer size={16} />} label="Em teste grátis" value={String(data.totals.trial)} hint={data.totals.trialExpired ? `${data.totals.trialExpired} com teste expirado` : 'ainda dentro do prazo'} />
        <Kpi icon={<Gift size={16} />} label="Acesso liberado" value={String(data.totals.granted)} hint={data.totals.lifetime ? `${data.totals.lifetime} ${data.totals.lifetime === 1 ? 'vitalício' : 'vitalícios'}` : 'cortesias e parcerias'} />
        <Kpi icon={<CalendarRange size={16} />} label="Planos anuais" value={String(data.totals.annual)} hint="pagamento adiantado de 12 meses" />
        <Kpi icon={<AlertTriangle size={16} />} label="Inadimplentes" value={String(data.totals.overdue)} hint={data.totals.overdue ? 'cobrar hoje' : 'nenhum no momento'} tone={data.totals.overdue ? 'bad' : undefined} />
        <Kpi icon={<Wallet size={16} />} label="Total já recebido" value={brlCents(data.totals.totalPaidCents)} hint={`${data.totals.companies} ${data.totals.companies === 1 ? 'empresa' : 'empresas'} no total`} />
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

// ───────────────────────── Liberar acesso à mão (mensal, anual, vitalício, +7 dias de teste) ─────────────────────────
const accessOptions: Array<{ action: Exclude<AdminAccessAction, 'revoke'>; label: string; text: string; done: string; icon: ReactNode }> = [
  { action: 'trial_plus_7', label: '+7 dias de teste', text: 'Estende o teste grátis em 7 dias.', done: 'Mais 7 dias de teste liberados.', icon: <CalendarPlus size={18} /> },
  { action: 'monthly', label: 'Acesso mensal', text: 'Libera por 1 mês, sem cobrança.', done: 'Acesso mensal liberado.', icon: <CalendarCheck size={18} /> },
  { action: 'annual', label: 'Acesso anual', text: 'Libera por 12 meses, sem cobrança.', done: 'Acesso anual liberado.', icon: <CalendarRange size={18} /> },
  { action: 'lifetime', label: 'Acesso vitalício', text: 'Sem data para acabar.', done: 'Acesso vitalício liberado.', icon: <InfinityIcon size={18} /> },
]

function AccessPanel({ session, item, onChanged, onReload }: { session: Session; item: AdminSubscription; onChanged: (item: AdminSubscription) => void; onReload: () => Promise<void> }) {
  const [pending, setPending] = useState<AdminAccessAction | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const blocked = item.hasPaidSubscription
  const lifetime = item.grant?.kind === 'lifetime'
  const option = accessOptions.find((entry) => entry.action === pending)

  const apply = async () => {
    if (!pending) return
    setSaving(true); setError(''); setDone('')
    try {
      onChanged(await api.adminAccess(session, item.companyId, pending, note))
      setDone(pending === 'revoke' ? 'Acesso revogado.' : option?.done ?? 'Pronto.')
      setPending(null); setNote(''); void onReload()
    } catch (reason) { setError(errorText(reason, 'Não foi possível liberar o acesso.')) } finally { setSaving(false) }
  }

  return <section className="adm-access" aria-label="Liberar acesso">
    <div className="adm-access__head"><div><h3>Liberar acesso</h3><p>Dê mais tempo de teste ou libere o acesso sem cobrança. Tudo fica registrado na auditoria.</p></div></div>
    {item.grant && <p className={`adm-access__now adm-access__now--${item.grant.active ? 'on' : 'off'}`}><Gift size={15} aria-hidden="true" /><span><b>{grantLabel[item.grant.kind]}</b>{item.grant.kind === 'lifetime' ? ' · sem data para acabar' : item.grant.active ? ` · até ${day(item.grant.until)} (${daysText(item.grant.daysLeft)})` : ` · encerrou em ${day(item.grant.until)}`}{item.grant.note ? <em> “{item.grant.note}”</em> : null}</span></p>}
    {blocked && <Notice tone="info">Esta empresa tem uma assinatura paga ativa. Para liberar acesso à mão, cancele a assinatura antes.</Notice>}
    <div className="adm-access__grid" role="group" aria-label="Tipo de acesso">
      {accessOptions.map((entry) => <button key={entry.action} type="button" className={`adm-access__opt${pending === entry.action ? ' is-on' : ''}`} aria-pressed={pending === entry.action} disabled={blocked || lifetime} onClick={() => { setPending(entry.action); setError(''); setDone('') }}>
        <i aria-hidden="true">{entry.icon}</i><b>{entry.label}</b><small>{entry.text}</small>
      </button>)}
    </div>
    {item.grant && <button type="button" className="adm-btn adm-btn--danger-outline adm-access__revoke" disabled={blocked} onClick={() => { setPending('revoke'); setError(''); setDone('') }}>Revogar acesso liberado</button>}
    {pending && <div className="adm-access__confirm">
      <p><AlertTriangle size={16} aria-hidden="true" /><span>{pending === 'revoke'
        ? <>Vai <b>encerrar o acesso</b> de <b>{item.company}</b> agora. O teste e a assinatura não voltam sozinhos.</>
        : pending === 'trial_plus_7'
          ? <>Vai somar <b>7 dias</b> ao teste de <b>{item.company}</b>{item.state === 'trial_expired' ? ', que volta a ter acesso a partir de agora' : ''}.</>
          : pending === 'lifetime'
            ? <>Vai liberar o acesso <b>vitalício</b> de <b>{item.company}</b>, sem cobrança e sem data para acabar.</>
            : <>Vai liberar <b>{pending === 'monthly' ? '1 mês' : '12 meses'}</b> de acesso para <b>{item.company}</b>, sem cobrança{item.grant?.active && item.grant.kind !== 'lifetime' ? ' (soma ao que ainda resta)' : ''}.</>}</span></p>
      <label>Anotação <small>opcional, fica na auditoria</small><input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: parceria com a agência, cortesia do mês" /></label>
      {error && <Notice>{error}</Notice>}
      <div className="adm-confirm__actions"><button type="button" className="adm-btn" onClick={() => { setPending(null); setError('') }} disabled={saving}>Voltar</button><button type="button" className={`adm-btn ${pending === 'revoke' ? 'adm-btn--danger' : 'adm-btn--primary'}`} onClick={() => void apply()} disabled={saving}>{saving ? 'Salvando…' : pending === 'revoke' ? 'Confirmar revogação' : 'Confirmar'}</button></div>
    </div>}
    {!pending && error && <Notice>{error}</Notice>}
    {done && <Notice tone="info">{done}</Notice>}
  </section>
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
          {item.grant
            ? <div><dt>Acesso liberado</dt><dd>{grantLabel[item.grant.kind]}{item.grant.kind === 'lifetime' ? '' : ` · ${item.grant.active ? 'até' : 'encerrou em'} ${day(item.grant.until)}`}</dd></div>
            : <div><dt>{item.state === 'trial' || item.state === 'trial_expired' ? 'Fim do teste' : 'Próxima cobrança'}</dt><dd>{day(item.state === 'trial' || item.state === 'trial_expired' ? item.trialEndsAt : item.nextDueDate)}</dd></div>}
          <div><dt>Forma de pagamento</dt><dd>{item.card ? `${item.card.brand ?? 'Cartão'} final ${item.card.last4}` : methodLabel(item.billingType)}</dd></div>
          <div><dt>Total já pago</dt><dd>{brlCents(item.totalPaidCents)}</dd></div>
          <div><dt>Cliente desde</dt><dd>{day(item.createdAt)}</dd></div>
        </dl>

        <AccessPanel session={session} item={item} onChanged={onChanged} onReload={onReload} />

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

// ───────────────────────── Equipe: quem é administrador e quem é gestor de tráfego (só master) ─────────────────────────
const roleLabel = { master: 'Administrador', traffic: 'Gestor de tráfego' } as const
const roleTone = (role: 'master' | 'traffic' | null) => role === 'master' ? 'info' : role === 'traffic' ? 'ok' : 'muted'
const roleChoices: Array<{ role: 'master' | 'traffic'; title: string; text: string; icon: ReactNode }> = [
  { role: 'master', title: 'Administrador', text: 'Vê o financeiro das assinaturas, libera acessos, cancela planos, configura o chatbot e a gestão de tráfego dos clientes. Também gerencia esta equipe.', icon: <ShieldCheck size={18} /> },
  { role: 'traffic', title: 'Gestor de tráfego', text: 'Vê só o chatbot dos clientes e a gestão de tráfego. Não vê valores de assinatura, não libera acesso e não gerencia a equipe. As conversas só abrem se o cliente autorizar.', icon: <Megaphone size={18} /> },
]

export function AdminTeamPage({ session }: { session: Session }) {
  const [members, setMembers] = useState<AdminTeamMember[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<AdminTeamMember[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [pending, setPending] = useState<{ person: AdminTeamMember; role: 'master' | 'traffic' | 'none' } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try { setMembers(await api.adminTeam(session)); setError('') } catch (reason) { setMembers([]); setError(errorText(reason, 'Não foi possível carregar a equipe.')) }
  }, [session])
  useEffect(() => { void load() }, [load])

  const search = async () => {
    if (query.trim().length < 3) { setError('Digite pelo menos 3 letras do nome ou do e-mail.'); return }
    setSearching(true); setError(''); setNotice('')
    try { setHits(await api.adminTeamSearch(session, query.trim())) } catch (reason) { setHits([]); setError(errorText(reason, 'Não foi possível buscar.')) } finally { setSearching(false) }
  }

  const confirm = async () => {
    if (!pending) return
    setSaving(true); setError('')
    try {
      await api.adminSetRole(session, pending.person.userId, pending.role)
      setNotice(pending.role === 'none' ? `${pending.person.name} saiu da equipe.` : `${pending.person.name} agora é ${roleLabel[pending.role].toLowerCase()}. A pessoa precisa sair e entrar de novo no CRM.`)
      setPending(null); setHits(null); setQuery(''); await load()
    } catch (reason) { setError(errorText(reason, 'Não foi possível salvar.')) } finally { setSaving(false) }
  }

  const masters = (members ?? []).filter((member) => member.role === 'master').length
  const traffic = (members ?? []).filter((member) => member.role === 'traffic').length
  const answer = (person: AdminTeamMember, role: 'master' | 'traffic' | 'none') => { setPending({ person, role }); setError(''); setNotice('') }

  return <>
    <PageHead eyebrow="EQUIPE OTIMIZA · ACESSOS" title="Equipe" text="Defina quem é administrador e quem é gestor de tráfego. A pessoa precisa ter criado uma conta no CRM antes." />
    {error && <Notice>{error}</Notice>}
    {notice && <Notice tone="info">{notice}</Notice>}
    {!members && !error && <p className="page-loading">Carregando equipe…</p>}
    {members && <>
      <section className="adm-roles" aria-label="Diferença entre os papéis">
        {roleChoices.map((choice) => <article key={choice.role} className="adm-role-card"><i aria-hidden="true">{choice.icon}</i><div><b>{choice.title} <em>{choice.role === 'master' ? masters : traffic}</em></b><p>{choice.text}</p></div></article>)}
      </section>

      <section className="panel adm-table-panel">
        {members.length ? <table className="adm-table adm-table--team">
          <thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col">Conta de cliente</th><th scope="col"><span className="adm-sr">Ações</span></th></tr></thead>
          <tbody>{members.map((member) => <tr key={member.userId}>
            <td data-label="Pessoa"><b>{member.name}</b><small>{member.email}</small></td>
            <td data-label="Papel"><StatusBadge tone={roleTone(member.role)}>{member.role ? roleLabel[member.role] : 'Sem papel'}</StatusBadge></td>
            <td data-label="Conta de cliente">{member.companyName ? <>{member.companyName}<small>fora das listas de clientes</small></> : <span className="adm-muted">—</span>}</td>
            <td data-label="Ações" className="adm-team__actions">
              {member.role === 'master' ? <button type="button" className="adm-btn" onClick={() => answer(member, 'traffic')}>Tornar gestor de tráfego</button> : <button type="button" className="adm-btn" onClick={() => answer(member, 'master')}>Tornar administrador</button>}
              <button type="button" className="adm-btn adm-btn--danger-outline" onClick={() => answer(member, 'none')}>Remover da equipe</button>
            </td>
          </tr>)}</tbody>
        </table> : <div className="adm-empty"><ShieldCheck size={22} /><b>Ninguém na equipe ainda.</b></div>}
      </section>

      <section className="panel adm-team-add">
        <div className="panel__header"><div><span className="eyebrow">ADICIONAR PESSOA</span><h2>Dar um papel a quem já tem conta</h2></div></div>
        <form className="adm-team-add__form" onSubmit={(event) => { event.preventDefault(); void search() }}>
          <label className="adm-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou e-mail da pessoa" aria-label="Nome ou e-mail da pessoa" /></label>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={searching}>{searching ? 'Buscando…' : 'Buscar'}</button>
        </form>
        {hits && (hits.length
          ? <ul className="adm-team-hits">{hits.map((hit) => <li key={hit.userId}>
            <div><b>{hit.name}</b><small>{hit.email}{hit.companyName ? ` · ${hit.companyName}` : ''}</small></div>
            {hit.role ? <StatusBadge tone={roleTone(hit.role)}>{roleLabel[hit.role]}</StatusBadge> : <div className="adm-team-hits__actions"><button type="button" className="adm-btn" onClick={() => answer(hit, 'traffic')}>Gestor de tráfego</button><button type="button" className="adm-btn adm-btn--primary" onClick={() => answer(hit, 'master')}>Administrador</button></div>}
          </li>)}</ul>
          : <p className="adm-muted">Ninguém encontrado. A pessoa precisa criar a conta no CRM primeiro.</p>)}
      </section>
    </>}

    {pending && <>
      <button className="drawer-backdrop" type="button" aria-label="Fechar" onClick={() => !saving && setPending(null)} />
      <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="adm-team-title">
        <h2 id="adm-team-title">{pending.role === 'none' ? 'Remover da equipe?' : `Tornar ${roleLabel[pending.role].toLowerCase()}?`}</h2>
        <p><b>{pending.person.name}</b> · {pending.person.email}</p>
        <p className="adm-modal__text"><AlertTriangle size={16} aria-hidden="true" /><span>{pending.role === 'none'
          ? <>A pessoa perde na hora o acesso ao painel da equipe. A conta de cliente dela volta a aparecer nas listas.</>
          : <>{pending.role === 'master' ? 'Ela passa a ver o financeiro, liberar acessos e gerenciar a equipe.' : 'Ela passa a ver só o chatbot e a gestão de tráfego dos clientes.'}{pending.person.companyName ? <> A conta de cliente dela (<b>{pending.person.companyName}</b>) deixa de aparecer nas listas de clientes e nos totais.</> : null} Ela precisa sair e entrar de novo no CRM.</>}</span></p>
        <div className="adm-confirm__actions"><button type="button" className="adm-btn" onClick={() => setPending(null)} disabled={saving}>Voltar</button><button type="button" className={`adm-btn ${pending.role === 'none' ? 'adm-btn--danger' : 'adm-btn--primary'}`} onClick={() => void confirm()} disabled={saving}>{saving ? 'Salvando…' : 'Confirmar'}</button></div>
      </div>
    </>}
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
