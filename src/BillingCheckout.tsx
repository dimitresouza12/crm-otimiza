import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Barcode, Check, CheckCircle2, Copy, CreditCard, ExternalLink, QrCode, Repeat } from 'lucide-react'
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
    setSaving(true); setError('')
    try {
      const response = await api.billingCheckout(session, {
        method,
        holder,
        card: method === 'card' || method === 'card_recurring' ? card : undefined,
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
      <span className="billing-checkout__label">Pagar agora e liberar o acesso</span>
      <div className="billing-method-grid">
        {methodOptions.map(({ id, label, description, icon: Icon, recommended }) => (
          <button key={id} type="button" className={`billing-method-card${recommended ? ' is-recommended' : ''}`} onClick={() => chooseMethod(id)}>
            {recommended && <span className="billing-method-card__badge">Recomendado</span>}
            <Icon size={20}/>
            <b>{label}</b>
            <p>{description}</p>
          </button>
        ))}
      </div>
    </div>
  }

  if (step === 'details' && method) {
    const isCard = method === 'card' || method === 'card_recurring'
    return <form className="form-stack billing-details-form" onSubmit={submit}>
      <button type="button" className="billing-back" onClick={() => setStep('method')}><ArrowLeft size={14}/> Trocar forma de pagamento</button>
      <div className="form-inline">
        <label>Nome completo ou razão social<input required value={holder.name} onChange={(event) => setHolder((value) => ({ ...value, name: event.target.value }))} placeholder="Como está no documento"/></label>
        <label>E-mail<input required type="email" value={holder.email} onChange={(event) => setHolder((value) => ({ ...value, email: event.target.value }))} placeholder="voce@empresa.com"/></label>
      </div>
      <div className="form-inline">
        <label>CPF ou CNPJ<input required minLength={11} value={holder.cpfCnpj} onChange={(event) => setHolder((value) => ({ ...value, cpfCnpj: event.target.value }))} placeholder="Somente números"/></label>
        <label>Telefone<input required minLength={10} value={holder.phone} onChange={(event) => setHolder((value) => ({ ...value, phone: event.target.value }))} placeholder="(85) 99999-9999"/></label>
      </div>
      <div className="form-inline">
        <label>CEP<input required minLength={8} value={holder.postalCode} onChange={(event) => setHolder((value) => ({ ...value, postalCode: event.target.value }))} placeholder="60000-000"/></label>
        <label>Número do endereço<input required value={holder.addressNumber} onChange={(event) => setHolder((value) => ({ ...value, addressNumber: event.target.value }))} placeholder="Ex.: 100"/></label>
      </div>
      {isCard && <>
        <label>Nome impresso no cartão<input required autoComplete="cc-name" value={card.holderName} onChange={(event) => setCard((value) => ({ ...value, holderName: event.target.value }))}/></label>
        <label>Número do cartão<input required autoComplete="cc-number" inputMode="numeric" minLength={13} maxLength={19} value={card.number} onChange={(event) => setCard((value) => ({ ...value, number: event.target.value }))} placeholder="0000 0000 0000 0000"/></label>
        <div className="form-inline billing-card-grid">
          <label>Mês<input required autoComplete="cc-exp-month" inputMode="numeric" maxLength={2} value={card.expiryMonth} onChange={(event) => setCard((value) => ({ ...value, expiryMonth: event.target.value }))} placeholder="MM"/></label>
          <label>Ano<input required autoComplete="cc-exp-year" inputMode="numeric" maxLength={4} value={card.expiryYear} onChange={(event) => setCard((value) => ({ ...value, expiryYear: event.target.value }))} placeholder="AAAA"/></label>
          <label>CVV<input required autoComplete="cc-csc" inputMode="numeric" maxLength={4} value={card.ccv} onChange={(event) => setCard((value) => ({ ...value, ccv: event.target.value }))} placeholder="123"/></label>
        </div>
      </>}
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={saving} type="submit">{saving ? 'Processando...' : isCard ? 'Confirmar pagamento' : 'Gerar cobrança'} <ArrowRight size={16}/></button>
    </form>
  }

  if (step === 'result' && result) {
    const paid = paidStatuses.includes(result.status)
    return <div className="billing-result">
      {paid
        ? <p className="billing-result__paid"><CheckCircle2 size={16}/> Pagamento confirmado! Liberando seu acesso...</p>
        : <>
          {result.pix && <div className="billing-pix">
            {result.pix.encodedImage && <img src={result.pix.encodedImage} alt="QR Code para pagamento via Pix"/>}
            <div className="billing-pix__code"><code>{result.pix.payload}</code><button type="button" onClick={() => void copy(result.pix!.payload)}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copiado' : 'Copiar código'}</button></div>
            <p>Abra o app do seu banco, escolha Pix e escaneie o código ou cole o copia e cola. A liberação é automática, em segundos.</p>
          </div>}
          {result.boleto && <div className="billing-boleto">
            {result.boleto.identificationField && <div className="billing-pix__code"><code>{result.boleto.identificationField}</code><button type="button" onClick={() => void copy(result.boleto!.identificationField!)}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copiado' : 'Copiar linha digitável'}</button></div>}
            {result.boleto.invoiceUrl && <a className="landing-outline-button" href={result.boleto.invoiceUrl} target="_blank" rel="noreferrer">Abrir boleto <ExternalLink size={14}/></a>}
            <p>O acesso libera automaticamente quando o pagamento for compensado — isso pode levar até 3 dias úteis.</p>
          </div>}
          {!result.pix && !result.boleto && <p className="billing-card-note">Cobrança de {formatCents(result.valueCents)} enviada ao seu cartão. Confirmamos automaticamente em poucos minutos — pode deixar esta tela aberta ou voltar depois.</p>}
        </>}
      {!paid && <button type="button" className="billing-back" onClick={() => { setStep('method'); setResult(null) }}><ArrowLeft size={14}/> Usar outra forma de pagamento</button>}
    </div>
  }

  return null
}
