import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Barcode, Check, CheckCircle2, Clock3, Copy, CreditCard, ExternalLink, Info, Loader2, QrCode, Repeat, ShieldCheck } from 'lucide-react'
import { api, type BillingCheckoutResult, type BillingMethod, type Session } from './lib/api'

type Account = { name: string; email: string; plan: string; channel_limit: number; plan_price_cents: number }

const formatCents = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const paidStatuses = ['RECEIVED', 'CONFIRMED']

type Step = 'method' | 'details' | 'result'

type HolderForm = { name: string; email: string; cpfCnpj: string; phone: string; postalCode: string; addressNumber: string }
type CardForm = { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string }

const methodOptions: Array<{ id: BillingMethod; label: string; description: string; icon: typeof QrCode; recommended?: boolean }> = [
  { id: 'pix', label: 'Pix', description: 'Confirma em segundos. Um código novo todo mês, você paga quando chegar.', icon: QrCode },
  { id: 'boleto', label: 'Boleto', description: 'Confirma em até 3 dias úteis. Um boleto novo todo mês.', icon: Barcode },
  { id: 'card', label: 'Cartão (só este mês)', description: 'Cobra uma vez agora. No mês seguinte você escolhe de novo.', icon: CreditCard },
  { id: 'card_recurring', label: 'Cartão recorrente', description: 'Debita automaticamente todo mês. Você não precisa voltar aqui.', icon: Repeat, recommended: true },
]
const methodLabel: Record<BillingMethod, string> = { pix: 'Pix', boleto: 'Boleto', card: 'Cartão', card_recurring: 'Cartão recorrente' }

// Máscaras só para facilitar a digitação; o que vai ao servidor são os dígitos.
const digitsOf = (value: string) => value.replace(/\D/g, '')
const maskCpfCnpj = (value: string) => {
  const digits = digitsOf(value).slice(0, 14)
  if (digits.length <= 11) return digits.replace(/^(\d{1,3})(\d{1,3})?(\d{1,3})?(\d{1,2})?/, (_, a: string, b?: string, c?: string, d?: string) => [a, b, c].filter(Boolean).join('.') + (d ? `-${d}` : ''))
  return digits.replace(/^(\d{1,2})(\d{1,3})?(\d{1,3})?(\d{1,4})?(\d{1,2})?/, (_, a: string, b?: string, c?: string, d?: string, e?: string) => a + (b ? `.${b}` : '') + (c ? `.${c}` : '') + (d ? `/${d}` : '') + (e ? `-${e}` : ''))
}
const maskPhone = (value: string) => {
  const digits = digitsOf(value).slice(0, 11)
  if (digits.length <= 2) return digits ? `(${digits}` : ''
  const middle = digits.length > 10 ? 5 : 4
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 2 + middle)}${digits.length > 2 + middle ? `-${digits.slice(2 + middle)}` : ''}`
}
const maskCep = (value: string) => { const digits = digitsOf(value).slice(0, 8); return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits }
const maskCard = (value: string) => digitsOf(value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim()

const formatUntil = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function BillingCheckout({ session, account, onActivated }: { session: Session; account: Account; onActivated: () => void }) {
  const [step, setStep] = useState<Step>('method')
  const [method, setMethod] = useState<BillingMethod | null>(null)
  const [holder, setHolder] = useState<HolderForm>({ name: account.name, email: account.email, cpfCnpj: '', phone: '', postalCode: '', addressNumber: '' })
  const [card, setCard] = useState<CardForm>({ holderName: account.name, number: '', expiryMonth: '', expiryYear: '', ccv: '' })
  const [result, setResult] = useState<BillingCheckoutResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const current = await api.billingCurrent(session)
        if (cancelled) return
        if (current.payment && paidStatuses.includes(current.payment.status)) { onActivated(); return }
        if (current.subscription?.last_payment_id && current.payment) {
          setResult({ method: current.subscription.billing_type ?? 'pix', paymentId: current.subscription.last_payment_id, status: current.payment.status, dueDate: current.payment.due_date, valueCents: current.payment.value_cents, pix: current.pix, boleto: current.boleto })
          setStep('result')
        }
      } catch { /* sem cobrança em aberto ainda: segue no seletor de método */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (step !== 'result' || !result || paidStatuses.includes(result.status)) return
    const check = async () => {
      try {
        const current = await api.billingCurrent(session)
        if (current.payment && paidStatuses.includes(current.payment.status)) { onActivated(); return }
        if (current.payment) setResult((previous) => previous ? { ...previous, status: current.payment!.status, pix: current.pix ?? previous.pix, boleto: current.boleto ?? previous.boleto } : previous)
      } catch { /* tenta de novo no próximo ciclo */ }
    }
    const interval = window.setInterval(() => void check(), 5_000)
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, result?.paymentId])

  const chooseMethod = (value: BillingMethod) => { setMethod(value); setError(''); setStep('details') }

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 2_000) } catch { /* clipboard indisponível: o texto já está selecionável na tela */ }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!method) return
    const isCard = method === 'card' || method === 'card_recurring'
    if (isCard && digitsOf(card.number).length < 13) { setError('Confira o número do cartão.'); return }
    setSaving(true); setError('')
    try {
      const response = await api.billingCheckout(session, {
        method,
        // CEP e número só são enviados no cartão: o Asaas exige para validar o titular; no Pix e no boleto nem pedimos.
        holder: { ...holder, cpfCnpj: digitsOf(holder.cpfCnpj), phone: digitsOf(holder.phone), postalCode: isCard ? digitsOf(holder.postalCode) : '', addressNumber: isCard ? holder.addressNumber.trim() : '' },
        card: isCard ? { ...card, number: digitsOf(card.number), expiryMonth: card.expiryMonth.padStart(2, '0') } : undefined,
      })
      setResult(response)
      setStep('result')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível processar o pagamento.')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'method') {
    return <div className="billing-checkout">
      <span className="billing-checkout__label">Como você prefere pagar?</span>
      <p className="billing-checkout__hint">O acesso volta assim que o pagamento é confirmado. Você pode trocar de forma de pagamento quando quiser.</p>
      <div className="billing-method-grid">
        {methodOptions.map(({ id, label, description, icon: Icon, recommended }) => (
          <button key={id} type="button" className={`billing-method-card${recommended ? ' is-recommended' : ''}`} onClick={() => chooseMethod(id)}>
            {recommended && <span className="billing-method-card__badge">Recomendado</span>}
            <span className="billing-method-card__icon"><Icon size={20}/></span>
            <b>{label}</b>
            <p>{description}</p>
          </button>
        ))}
      </div>
    </div>
  }

  if (step === 'details' && method) {
    const isCard = method === 'card' || method === 'card_recurring'
    const MethodIcon = methodOptions.find((option) => option.id === method)?.icon ?? QrCode
    return <form className="billing-details-form" onSubmit={submit}>
      <div className="billing-details-head">
        <button type="button" className="billing-back" onClick={() => setStep('method')}><ArrowLeft size={15}/> Trocar forma de pagamento</button>
        <span className="billing-method-chip"><MethodIcon size={14}/> {methodLabel[method]}</span>
      </div>
      <div className="billing-section">
        <p className="billing-section__title">Quem vai pagar</p>
        <div className="form-inline">
          <label>Nome completo ou razão social<input required autoComplete="name" value={holder.name} onChange={(event) => setHolder((value) => ({ ...value, name: event.target.value }))} placeholder="Como está no documento"/></label>
          <label>E-mail<input required type="email" autoComplete="email" value={holder.email} onChange={(event) => setHolder((value) => ({ ...value, email: event.target.value }))} placeholder="voce@empresa.com"/></label>
        </div>
        <div className="form-inline">
          <label>CPF ou CNPJ<input required inputMode="numeric" value={holder.cpfCnpj} onChange={(event) => setHolder((value) => ({ ...value, cpfCnpj: maskCpfCnpj(event.target.value) }))} placeholder="000.000.000-00"/></label>
          <label>Telefone<input required inputMode="tel" autoComplete="tel" value={holder.phone} onChange={(event) => setHolder((value) => ({ ...value, phone: maskPhone(event.target.value) }))} placeholder="(85) 99999-9999"/></label>
        </div>
        {isCard && <div className="form-inline">
          <label>CEP do titular<input required autoComplete="postal-code" inputMode="numeric" value={holder.postalCode} onChange={(event) => setHolder((value) => ({ ...value, postalCode: maskCep(event.target.value) }))} placeholder="60000-000"/></label>
          <label>Número do endereço<input required autoComplete="off" value={holder.addressNumber} onChange={(event) => setHolder((value) => ({ ...value, addressNumber: event.target.value }))} placeholder="Ex.: 100"/></label>
        </div>}
      </div>
      {isCard && <div className="billing-section">
        <p className="billing-section__title">Dados do cartão</p>
        <label>Nome impresso no cartão<input required autoComplete="cc-name" value={card.holderName} onChange={(event) => setCard((value) => ({ ...value, holderName: event.target.value }))}/></label>
        <label>Número do cartão<input required autoComplete="cc-number" inputMode="numeric" value={card.number} onChange={(event) => setCard((value) => ({ ...value, number: maskCard(event.target.value) }))} placeholder="0000 0000 0000 0000"/></label>
        <div className="form-inline billing-card-grid">
          <label>Mês<input required autoComplete="cc-exp-month" inputMode="numeric" maxLength={2} value={card.expiryMonth} onChange={(event) => setCard((value) => ({ ...value, expiryMonth: digitsOf(event.target.value) }))} placeholder="MM"/></label>
          <label>Ano<input required autoComplete="cc-exp-year" inputMode="numeric" maxLength={4} value={card.expiryYear} onChange={(event) => setCard((value) => ({ ...value, expiryYear: digitsOf(event.target.value) }))} placeholder="AAAA"/></label>
          <label>CVV<input required autoComplete="cc-csc" inputMode="numeric" maxLength={4} value={card.ccv} onChange={(event) => setCard((value) => ({ ...value, ccv: digitsOf(event.target.value) }))} placeholder="123"/></label>
        </div>
        <p className="billing-secure-note"><ShieldCheck size={16}/> Os dados do cartão vão direto para o Asaas, nosso processador de pagamentos. O CRM não guarda o número nem o CVV.</p>
      </div>}
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={saving} type="submit">{saving ? 'Processando...' : isCard ? `Pagar ${formatCents(account.plan_price_cents)}` : method === 'pix' ? 'Gerar Pix' : 'Gerar boleto'} <ArrowRight size={16}/></button>
    </form>
  }

  if (step === 'result' && result) {
    const paid = paidStatuses.includes(result.status)
    const pixUntil = formatUntil(result.pix?.expirationDate)
    const dueDate = result.dueDate ? new Date(`${result.dueDate}T12:00:00`).toLocaleDateString('pt-BR') : null
    return <div className="billing-result">
      {paid
        ? <p className="billing-result__paid" role="status"><CheckCircle2 size={18}/> Pagamento confirmado! Liberando seu acesso...</p>
        : <>
          {result.pix && <div className="pay-card">
            <div className="pay-card__head">
              <span className="pay-card__method"><QrCode size={18}/> Pagar com Pix</span>
              <span className="pay-card__value">{formatCents(result.valueCents)}</span>
              <span className="pay-status" role="status"><i/> Aguardando pagamento</span>
            </div>
            <div className={`pay-card__body${result.pix.encodedImage ? '' : ' pay-card__body--single'}`}>
              {result.pix.encodedImage && <div className="pay-qr"><img src={result.pix.encodedImage} alt="QR Code para pagamento via Pix"/></div>}
              <ol className="pay-steps">
                <li>Abra o app do seu banco e entre na área Pix.</li>
                <li>Escaneie o QR Code ou use o Pix copia e cola abaixo.</li>
                <li>Confirme o pagamento. A liberação do CRM é automática, em segundos.</li>
              </ol>
            </div>
            <div className="pay-copy">
              <span className="pay-copy__label">Pix copia e cola</span>
              <div className="pay-copy__row">
                <div className="pay-copy__code" tabIndex={0} aria-label="Código Pix copia e cola">{result.pix.payload}</div>
                <button type="button" className={`pay-copy__button${copied ? ' is-done' : ''}`} onClick={() => void copy(result.pix!.payload)}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copiado!' : 'Copiar código'}</button>
              </div>
            </div>
            <div className="pay-card__foot">
              <span><Clock3 size={14}/> {pixUntil ? `Código válido até ${pixUntil}` : 'Código válido por tempo limitado'}</span>
              <span><Loader2 size={14} className="pay-spin"/> Verificando o pagamento automaticamente</span>
            </div>
          </div>}
          {result.boleto && <div className="pay-card">
            <div className="pay-card__head">
              <span className="pay-card__method"><Barcode size={18}/> Pagar com boleto</span>
              <span className="pay-card__value">{formatCents(result.valueCents)}</span>
              <span className="pay-status" role="status"><i/> Aguardando pagamento</span>
            </div>
            <div className="pay-card__body pay-card__body--single">
              <ol className="pay-steps">
                <li>Copie a linha digitável abaixo ou abra o boleto para imprimir.</li>
                <li>Pague no app do seu banco ou em uma agência.</li>
                <li>O acesso libera sozinho quando o pagamento for compensado, o que pode levar até 3 dias úteis.</li>
              </ol>
            </div>
            {result.boleto.identificationField && <div className="pay-copy">
              <span className="pay-copy__label">Linha digitável</span>
              <div className="pay-copy__row">
                <div className="pay-copy__code" tabIndex={0} aria-label="Linha digitável do boleto">{result.boleto.identificationField}</div>
                <button type="button" className={`pay-copy__button${copied ? ' is-done' : ''}`} onClick={() => void copy(result.boleto!.identificationField!)}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copiado!' : 'Copiar'}</button>
              </div>
            </div>}
            {result.boleto.invoiceUrl && <a className="pay-link" href={result.boleto.invoiceUrl} target="_blank" rel="noreferrer">Abrir boleto <ExternalLink size={15}/></a>}
            <div className="pay-card__foot">
              <span><Clock3 size={14}/> {dueDate ? `Vence em ${dueDate}` : 'Confira o vencimento no boleto'}</span>
              <span><Loader2 size={14} className="pay-spin"/> Verificando o pagamento automaticamente</span>
            </div>
          </div>}
          {!result.pix && !result.boleto && <p className="billing-card-note"><Info size={18}/> <span>Cobrança de <b>{formatCents(result.valueCents)}</b> enviada ao seu cartão. Confirmamos automaticamente em poucos minutos. Pode deixar esta tela aberta ou voltar depois.</span></p>}
        </>}
      {!paid && <button type="button" className="billing-back" onClick={() => { setStep('method'); setResult(null) }}><ArrowLeft size={15}/> Usar outra forma de pagamento</button>}
    </div>
  }

  return null
}
