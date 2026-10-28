import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, BadgeCheck, Banknote, Check, CircleAlert, Copy, Hourglass, Link2, LogOut, MessageCircle, MousePointerClick, Trophy, UserPlus, Wallet } from 'lucide-react'
import otimizaSymbol from './assets/otimiza-ai-symbol.svg'
import { api, type AffiliateAuth, type AffiliateMe, type AffiliatePayout, type AffiliatePixType, type AffiliateRankEntry, type AffiliateRanking, type AffiliateRankingData, type AffiliateReferral, type Session } from './lib/api'

const SESSION_KEY = 'otimiza-affiliate-session'
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const day = (iso: string | null | undefined) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—'
const errorText = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback

const readSession = (): Session | null => {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as Session : null } catch { return null }
}
const saveSession = (session: Session | null) => {
  try { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY) } catch { /* sem armazenamento */ }
}
const sessionFrom = (auth: AffiliateAuth): Session => ({ token: auth.token, companyId: auth.affiliateId, role: 'affiliate' })

const pixLabels: Record<AffiliatePixType, string> = { cpf: 'CPF', cnpj: 'CNPJ', phone: 'Celular', email: 'E-mail', random: 'Chave aleatória' }
const pixPlaceholders: Record<AffiliatePixType, string> = { cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', phone: '(88) 99999-9999', email: 'voce@email.com', random: 'Cole a chave aleatória' }
const stageLabel: Record<AffiliateReferral['stage'], { text: string; tone: 'ok' | 'info' | 'wait' | 'muted' }> = {
  trial: { text: 'Em teste', tone: 'info' }, trial_ended: { text: 'Teste acabou', tone: 'wait' }, subscribed: { text: 'Assinou', tone: 'ok' }, canceled: { text: 'Cancelou', tone: 'muted' },
}
const payoutLabel: Record<AffiliatePayout['status'], { text: string; tone: 'ok' | 'wait' | 'bad' }> = {
  requested: { text: 'Aguardando pagamento', tone: 'wait' }, paid: { text: 'Pago', tone: 'ok' }, rejected: { text: 'Recusado', tone: 'bad' },
}

function Brand() {
  return <span className="aff-brand"><span className="aff-brand__mark"><img src={otimizaSymbol} alt="" /></span><span>Otimiza <b>AI</b> <small>Afiliados</small></span></span>
}

function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  return <p className={`adm-notice adm-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{tone === 'error' ? <CircleAlert size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}<span>{children}</span></p>
}

function Badge({ tone, children }: { tone: 'ok' | 'bad' | 'wait' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={`adm-badge adm-badge--${tone}`}>{children}</span>
}

// ───────────────────────── Página pública: proposta + cadastro / entrada ─────────────────────────
function AffiliateLanding({ onAuthenticated, onNavigate }: { onAuthenticated: (auth: AffiliateAuth) => void; onNavigate: (path: string) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const auth = mode === 'login' ? await api.affiliateLogin(email, password) : await api.affiliateRegister({ name, email, password, nickname, acceptTerms: accepted })
      onAuthenticated(auth)
    } catch (reason) { setError(errorText(reason, 'Não foi possível continuar.')) } finally { setSaving(false) }
  }

  return <main className="aff-page">
    <header className="aff-top">
      <a className="aff-top__brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }} aria-label="Ir para o site do Otimiza AI CRM"><Brand /></a>
      <button className="aff-link-button" type="button" onClick={() => { setMode('login'); setError(''); document.getElementById('aff-form')?.scrollIntoView({ behavior: 'smooth' }) }}>Já sou afiliado</button>
    </header>

    <section className="aff-hero">
      <div className="aff-hero__copy">
        <span className="aff-pill"><i /> Programa de afiliados · grátis</span>
        <h1>Indique o Otimiza CRM e ganhe <em>R$ 89,95</em> por venda.</h1>
        <p>Qualquer pessoa pode vender. Você recebe um link, compartilha, e ganha <b>50% de uma mensalidade</b> de cada cliente que assinar pelo seu link. Sem custo, sem estoque, sem chefe.</p>
        <ul className="aff-hero__facts">
          <li><BadgeCheck size={16} aria-hidden="true" /> Painel gratuito para acompanhar cada venda</li>
          <li><BadgeCheck size={16} aria-hidden="true" /> Ranking e competições com prêmios</li>
          <li><BadgeCheck size={16} aria-hidden="true" /> Saque por Pix, direto na sua chave</li>
        </ul>
      </div>

      <form className="aff-card aff-form" id="aff-form" onSubmit={submit} aria-label={mode === 'register' ? 'Criar conta de afiliado' : 'Entrar como afiliado'}>
        <h2>{mode === 'register' ? 'Quero ser afiliado' : 'Entrar no painel'}</h2>
        <p className="aff-muted">{mode === 'register' ? 'Leva menos de um minuto. Você já recebe o seu link.' : 'Use o e-mail e a senha do seu cadastro.'}</p>
        {mode === 'register' && <>
          <label>Seu nome<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" /></label>
          <label>Apelido do ranking<small>Aparece para os outros afiliados e vira o seu link.</small><input required minLength={3} maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Ex.: joaovendas" /></label>
        </>}
        <label>E-mail<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>
        <label>Senha<input required minLength={mode === 'register' ? 8 : 1} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'Mínimo de 8 caracteres' : 'Sua senha'} /></label>
        {mode === 'register' && <label className="aff-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Li e aceito as <a href="#aff-regras">regras do programa</a>.</span></label>}
        {error && <Notice>{error}</Notice>}
        <button className="aff-button" type="submit" disabled={saving || (mode === 'register' && !accepted)}>{saving ? 'Aguarde…' : mode === 'register' ? 'Criar meu link' : 'Entrar'} <ArrowRight size={17} aria-hidden="true" /></button>
        <button className="aff-link-button aff-form__switch" type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError('') }}>{mode === 'register' ? 'Já tenho conta · entrar' : 'Ainda não sou afiliado · criar conta'}</button>
        {mode === 'register' && <p className="aff-muted aff-form__hint">Já usa o CRM? Pode usar o mesmo e-mail e senha.</p>}
      </form>
    </section>

    <section className="aff-section" aria-labelledby="aff-como">
      <h2 id="aff-como">Como funciona</h2>
      <ol className="aff-steps">
        <li><span><Link2 size={20} aria-hidden="true" /></span><b>1. Pegue o seu link</b><p>Crie a conta e copie o seu link exclusivo.</p></li>
        <li><span><MessageCircle size={20} aria-hidden="true" /></span><b>2. Compartilhe</b><p>Mande no WhatsApp, redes sociais ou para quem tem um negócio e atende pelo WhatsApp.</p></li>
        <li><span><Banknote size={20} aria-hidden="true" /></span><b>3. Receba</b><p>Quando o cliente assina, 50% de uma mensalidade vira saldo seu. Você pede o saque quando quiser.</p></li>
      </ol>
      <div className="aff-earn" aria-label="Quanto você ganha">
        <div><small>Plano Chatbot · R$ 179,90/mês</small><b>R$ 89,95</b><span>por venda</span></div>
        <div><small>Plano CRM · R$ 89,90/mês</small><b>R$ 44,95</b><span>por venda</span></div>
      </div>
    </section>

    <section className="aff-section aff-rules" id="aff-regras" aria-labelledby="aff-regras-titulo">
      <h2 id="aff-regras-titulo">Regras do programa</h2>
      <ul>
        <li>A comissão é de <b>50% de uma mensalidade</b> do plano contratado, paga <b>uma única vez</b> por cliente (na primeira assinatura). Se o cliente pagar o ano à vista, a comissão continua sendo de uma mensalidade.</li>
        <li>A comissão só nasce quando o <b>pagamento é confirmado</b> e fica <b>30 dias</b> em análise antes de virar saldo disponível. Estorno ou chargeback cancelam a comissão.</li>
        <li>O saque é pedido no painel e pago por <b>Pix</b> pela equipe da Otimiza, na chave que você cadastrar.</li>
        <li>Não vale indicar a si mesmo, nem divulgar com spam ou informação falsa. A equipe pode cancelar comissões suspeitas e bloquear a conta.</li>
        <li>Você enxerga o nome das empresas indicadas de forma parcial, nunca contatos ou conversas. O ranking mostra só o apelido.</li>
        <li>Valores recebidos podem ter obrigações fiscais; a declaração é de responsabilidade de cada afiliado.</li>
      </ul>
    </section>
    <footer className="aff-footer"><span>© {new Date().getFullYear()} Otimiza AI</span><a href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }}>Conhecer o CRM</a></footer>
  </main>
}

// ───────────────────────── Painel do afiliado ─────────────────────────
function Kpi({ label, value, hint, icon, emphasis, action }: { label: string; value: string; hint?: string; icon: ReactNode; emphasis?: boolean; action?: ReactNode }) {
  return <div className={`adm-kpi${emphasis ? ' adm-kpi--emphasis' : ''}`}><div className="adm-kpi__top"><span>{label}</span><i aria-hidden="true">{icon}</i></div><b>{value}</b>{hint && <small>{hint}</small>}{action}</div>
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch {
      const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field); field.select()
      try { document.execCommand('copy') } catch { /* sem permissão */ }
      field.remove()
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 2000)
  }
  return { copied, copy }
}

function RankList({ ranking, empty }: { ranking: AffiliateRanking; empty: string }) {
  const rows: AffiliateRankEntry[] = ranking.top
  const outside = ranking.me && !rows.some((entry) => entry.isMe) ? ranking.me : null
  if (!rows.length) return <p className="aff-muted aff-empty-text">{empty}</p>
  const line = (entry: AffiliateRankEntry) => <li key={entry.position} className={entry.isMe ? 'is-me' : ''}><span className="aff-rank__pos" aria-label={`${entry.position}º lugar`}>{entry.position}</span><b>{entry.nickname}{entry.isMe && <em>você</em>}</b><span>{entry.sales} {entry.sales === 1 ? 'venda' : 'vendas'}</span></li>
  return <>
    <ol className="aff-rank">{rows.map(line)}</ol>
    {outside && <ol className="aff-rank aff-rank--me" start={outside.position}>{line(outside)}</ol>}
    <p className="aff-muted aff-rank__foot">{ranking.me ? `Você está em ${ranking.me.position}º lugar.` : 'Faça a sua primeira venda para entrar no ranking.'}</p>
  </>
}

type PanelTab = 'indicacoes' | 'saques' | 'ranking'

function AffiliatePanel({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [me, setMe] = useState<AffiliateMe | null>(null)
  const [referrals, setReferrals] = useState<AffiliateReferral[] | null>(null)
  const [payouts, setPayouts] = useState<AffiliatePayout[] | null>(null)
  const [ranking, setRanking] = useState<AffiliateRankingData | null>(null)
  const [tab, setTab] = useState<PanelTab>('indicacoes')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pixType, setPixType] = useState<AffiliatePixType>('cpf')
  const [pixKey, setPixKey] = useState('')
  const [editingPix, setEditingPix] = useState(false)
  // O aviso da chave Pix fica junto do formulário: a página é longa e o aviso do topo sairia da tela.
  const [pixMessage, setPixMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const { copied, copy } = useCopy()

  const load = useCallback(async () => {
    try {
      const [mine, refs, pays, rank] = await Promise.all([api.affiliateMe(session), api.affiliateReferrals(session), api.affiliatePayouts(session), api.affiliateRanking(session)])
      setMe(mine); setReferrals(refs); setPayouts(pays); setRanking(rank); setError('')
    } catch (reason) {
      const text = errorText(reason, 'Não foi possível carregar o seu painel.')
      if (/token|sessão|autenticad|expirad/i.test(text)) onSignOut()
      setError(text)
    }
  }, [session, onSignOut])
  useEffect(() => { void load() }, [load])

  const savePix = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setPixMessage(null)
    try { await api.affiliateSavePix(session, pixType, pixKey); setPixKey(''); setEditingPix(false); setPixMessage({ tone: 'info', text: 'Chave Pix salva.' }); await load() } catch (reason) { setPixMessage({ tone: 'error', text: errorText(reason, 'Não foi possível salvar a chave Pix.') }) } finally { setBusy(false) }
  }
  const requestPayout = async () => {
    setBusy(true); setError(''); setNotice('')
    try { await api.affiliateRequestPayout(session); setNotice('Saque solicitado! A equipe da Otimiza vai pagar na sua chave Pix.'); setTab('saques'); await load() } catch (reason) { setError(errorText(reason, 'Não foi possível pedir o saque.')) } finally { setBusy(false) }
  }

  if (!me) return <main className="aff-page aff-page--panel"><header className="aff-top"><Brand /><button className="aff-link-button" type="button" onClick={onSignOut}>Sair</button></header>{error ? <Notice>{error}</Notice> : <p className="page-loading">Carregando o seu painel…</p>}</main>

  const { balance, funnel } = me
  const shareText = `Conheça o Otimiza AI CRM: organize seus leads e vendas do WhatsApp. Teste grátis por 7 dias: ${me.link}`
  const hasAvailable = balance.availableCents > 0
  const canWithdraw = hasAvailable && Boolean(me.pix) && !me.openPayout && me.status === 'active'
  const withdrawHint = me.status === 'blocked' ? 'Conta bloqueada. Fale com a equipe.' : me.openPayout ? 'Você já tem um saque em andamento.' : !hasAvailable ? 'Saldo liberado após 30 dias da venda.' : !me.pix ? 'Cadastre a chave Pix para sacar.' : ''

  return <main className="aff-page aff-page--panel">
    <header className="aff-top">
      <Brand />
      <div className="aff-top__who"><span>Olá, <b>{me.nickname}</b></span><button className="aff-link-button" type="button" onClick={onSignOut}><LogOut size={15} aria-hidden="true" /> Sair</button></div>
    </header>

    {me.status === 'blocked' && <Notice>Sua conta de afiliado está bloqueada. Novas vendas não geram comissão e saques estão suspensos. Fale com a equipe da Otimiza.</Notice>}
    {error && <Notice>{error}</Notice>}
    {notice && <Notice tone="info">{notice}</Notice>}

    <section className="aff-card aff-link" aria-labelledby="aff-link-titulo">
      <div><h1 id="aff-link-titulo">Seu link de afiliado</h1><p className="aff-muted">Quem criar uma conta por ele fica ligado a você por 60 dias.</p></div>
      <div className="aff-link__row">
        <input readOnly value={me.link} aria-label="Seu link de afiliado" onFocus={(event) => event.currentTarget.select()} />
        <button className="aff-button aff-button--ghost" type="button" onClick={() => void copy(me.link)}>{copied ? <><Check size={17} aria-hidden="true" /> Copiado!</> : <><Copy size={17} aria-hidden="true" /> Copiar</>}</button>
        <a className="aff-button aff-button--wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><MessageCircle size={17} aria-hidden="true" /> Compartilhar no WhatsApp</a>
      </div>
    </section>

    <section className="adm-kpis adm-kpis--4 aff-kpis" aria-label="Seus números">
      <Kpi emphasis icon={<Wallet size={16} />} label="Saldo disponível" value={brl(balance.availableCents)} hint={balance.requestedCents ? `${brl(balance.requestedCents)} em saque` : 'pronto para sacar'}
        action={<button className="aff-button aff-button--on-dark" type="button" disabled={!canWithdraw || busy} onClick={() => void requestPayout()}>{busy ? 'Aguarde…' : 'Solicitar saque'}</button>} />
      <Kpi icon={<Hourglass size={16} />} label="A liberar" value={brl(balance.pendingCents)} hint={balance.nextReleaseAt ? `próxima liberação em ${day(balance.nextReleaseAt)}` : 'nenhuma venda em análise'} />
      <Kpi icon={<BadgeCheck size={16} />} label="Já recebido" value={brl(balance.paidCents)} hint="pago por Pix" />
      <Kpi icon={<Trophy size={16} />} label="Vendas no mês" value={String(funnel.salesThisMonth)} hint={ranking?.month.me ? `${ranking.month.me.position}º no ranking` : 'entre no ranking'} />
    </section>
    {withdrawHint && !canWithdraw && <p className="aff-muted aff-hint">{withdrawHint}</p>}

    <section className="aff-card aff-funnel" aria-label="Funil de vendas">
      <div><MousePointerClick size={18} aria-hidden="true" /><b>{funnel.clicks}</b><span>cliques no link</span></div>
      <ArrowRight className="aff-funnel__arrow" size={16} aria-hidden="true" />
      <div><UserPlus size={18} aria-hidden="true" /><b>{funnel.signups}</b><span>testes criados</span></div>
      <ArrowRight className="aff-funnel__arrow" size={16} aria-hidden="true" />
      <div><BadgeCheck size={18} aria-hidden="true" /><b>{funnel.subscriptions}</b><span>assinaturas</span></div>
    </section>

    <section className="aff-card aff-tabs-card">
      <div className="adm-chips aff-tabs" role="group" aria-label="Seções do painel">
        {([['indicacoes', 'Minhas indicações'], ['saques', 'Saques e Pix'], ['ranking', 'Ranking']] as Array<[PanelTab, string]>).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === 'indicacoes' && (referrals === null ? <p className="page-loading">Carregando…</p> : referrals.length ? <div className="aff-list">
        <table className="adm-table"><thead><tr><th scope="col">Empresa</th><th scope="col">Cadastro</th><th scope="col">Situação</th><th scope="col">Comissão</th></tr></thead>
          <tbody>{referrals.map((row, index) => <tr key={index}>
            <td data-label="Empresa"><b>{row.company}</b></td>
            <td data-label="Cadastro">{day(row.referredAt)}</td>
            <td data-label="Situação"><Badge tone={stageLabel[row.stage].tone}>{stageLabel[row.stage].text}</Badge></td>
            <td data-label="Comissão">{row.commissionCents ? <><b>{brl(row.commissionCents)}</b><small>{row.commissionStatus === 'paid' ? 'paga' : row.commissionStatus === 'requested' ? 'em saque' : row.commissionStatus === 'pending' ? (row.availableAt && new Date(row.availableAt).getTime() <= Date.now() ? 'disponível' : `libera em ${day(row.availableAt)}`) : 'cancelada'}</small></> : <span className="aff-muted">—</span>}</td>
          </tr>)}</tbody></table>
      </div> : <div className="adm-empty"><Link2 size={22} aria-hidden="true" /><b>Nenhuma indicação ainda.</b><p>Compartilhe o seu link. Cada empresa que criar uma conta por ele aparece aqui, com o nome parcialmente oculto.</p></div>)}

      {tab === 'saques' && <div className="aff-saques">
        <div className="aff-pix">
          <h2>Chave Pix para receber</h2>
          {me.pix && !editingPix ? <p className="aff-pix__current"><b>{pixLabels[me.pix.type]}</b> {me.pix.masked}<button className="aff-link-button" type="button" onClick={() => setEditingPix(true)}>Trocar chave</button></p> : <form className="aff-pix__form" onSubmit={savePix}>
            <label>Tipo<select value={pixType} onChange={(event) => setPixType(event.target.value as AffiliatePixType)}>{(Object.keys(pixLabels) as AffiliatePixType[]).map((type) => <option key={type} value={type}>{pixLabels[type]}</option>)}</select></label>
            <label>Chave<input required value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder={pixPlaceholders[pixType]} autoComplete="off" /></label>
            <button className="aff-button" type="submit" disabled={busy}>Salvar chave</button>
            {me.pix && <button className="aff-link-button" type="button" onClick={() => setEditingPix(false)}>Cancelar</button>}
          </form>}
          {pixMessage && <Notice tone={pixMessage.tone}>{pixMessage.text}</Notice>}
          <p className="aff-muted">A chave é guardada com criptografia e só a equipe que paga o saque vê, no momento do pagamento.</p>
        </div>
        <h2>Histórico de saques</h2>
        {payouts === null ? <p className="page-loading">Carregando…</p> : payouts.length ? <ul className="aff-payouts">{payouts.map((payout) => <li key={payout.id}>
          <div><b>{brl(payout.amountCents)}</b><small>pedido em {day(payout.requestedAt)}{payout.resolvedAt ? ` · resolvido em ${day(payout.resolvedAt)}` : ''}</small>{payout.note && <small className="aff-payouts__note">{payout.note}</small>}</div>
          <Badge tone={payoutLabel[payout.status].tone}>{payoutLabel[payout.status].text}</Badge>
        </li>)}</ul> : <p className="aff-muted aff-empty-text">Você ainda não pediu nenhum saque.</p>}
      </div>}

      {tab === 'ranking' && (ranking === null ? <p className="page-loading">Carregando…</p> : <div className="aff-ranking">
        {ranking.campaign && <div className="aff-campaign">
          <span className="aff-pill aff-pill--gold"><Trophy size={14} aria-hidden="true" /> Competição valendo</span>
          <h2>{ranking.campaign.title}</h2>
          {ranking.campaign.prize && <p className="aff-campaign__prize">Prêmio: <b>{ranking.campaign.prize}</b></p>}
          <p className="aff-muted">De {day(ranking.campaign.startsOn)} até {day(ranking.campaign.endsOn)}</p>
          <RankList ranking={ranking.campaign} empty="Ninguém pontuou na competição ainda. Seja o primeiro!" />
        </div>}
        <h2>Ranking do mês</h2>
        <RankList ranking={ranking.month} empty="Ninguém vendeu neste mês ainda. Seja o primeiro!" />
        <p className="aff-muted aff-rank__foot">Ordenado por vendas no mês; empate pelo valor das comissões. Só aparece o apelido.</p>
      </div>)}
    </section>
  </main>
}

// ───────────────────────── Entrada: decide entre a página pública e o painel ─────────────────────────
export function AffiliateArea({ route, onNavigate }: { route: 'affiliates' | 'affiliate'; onNavigate: (path: string) => void }) {
  const [session, setSession] = useState<Session | null>(readSession)

  useEffect(() => {
    document.title = route === 'affiliate' ? 'Painel do afiliado — Otimiza AI' : 'Programa de afiliados — Otimiza AI CRM'
    document.querySelector('meta[name="robots"]')?.setAttribute('content', route === 'affiliate' ? 'noindex,nofollow' : 'index,follow')
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'Indique o Otimiza AI CRM e ganhe 50% de uma mensalidade por venda. Painel gratuito, ranking e saque por Pix.')
  }, [route])
  // O App recria onNavigate a cada render; a referência evita recarregar o painel por isso.
  const navigate = useRef(onNavigate)
  navigate.current = onNavigate
  useEffect(() => {
    if (session && route === 'affiliates') navigate.current('/afiliado')
    if (!session && route === 'affiliate') navigate.current('/afiliados')
  }, [session, route])

  const signOut = useCallback(() => { saveSession(null); setSession(null); navigate.current('/afiliados') }, [])
  const authenticated = (auth: AffiliateAuth) => { const next = sessionFrom(auth); saveSession(next); setSession(next); navigate.current('/afiliado') }

  if (session && route === 'affiliate') return <AffiliatePanel session={session} onSignOut={signOut} />
  if (!session && route === 'affiliates') return <AffiliateLanding onAuthenticated={authenticated} onNavigate={onNavigate} />
  return null
}
