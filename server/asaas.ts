type Json = Record<string, unknown>

export class AsaasError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null

const settings = () => {
  const apiKey = process.env.ASAAS_API_KEY?.trim()
  const baseUrl = (process.env.ASAAS_API_URL?.trim() || 'https://api.asaas.com/v3').replace(/\/$/, '')
  if (!apiKey) throw new AsaasError(503, 'O Asaas ainda não foi configurado no servidor do CRM.')
  return { apiKey, baseUrl }
}

export const asaasConfigured = () => Boolean(process.env.ASAAS_API_KEY?.trim())

// Nunca passe dados de cartão por aqui — a tokenização mora isolada em card-checkout.ts.
const request = async (path: string, method: string, body?: Json): Promise<Json> => {
  const { apiKey, baseUrl } = settings()
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { access_token: apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new AsaasError(502, 'Não foi possível alcançar o Asaas.')
  }
  const parsed = object(await response.json().catch(() => ({})))
  if (!response.ok) {
    const firstError = Array.isArray(parsed.errors) ? object((parsed.errors as unknown[])[0]) : {}
    throw new AsaasError(response.status, text(firstError.description) ?? `O Asaas respondeu com erro ${response.status}.`)
  }
  return parsed
}

export type BillingMethod = 'pix' | 'boleto' | 'card' | 'card_recurring'
export type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD'

export const asaasBillingType = (method: BillingMethod): AsaasBillingType =>
  method === 'pix' ? 'PIX' : method === 'boleto' ? 'BOLETO' : 'CREDIT_CARD'

export const isRecurring = (method: BillingMethod) => method === 'pix' || method === 'boleto' || method === 'card_recurring'

export type BillingHolder = { name: string; email: string; cpfCnpj: string; phone: string; postalCode: string; addressNumber: string }

export const createCustomer = async (holder: BillingHolder, externalReference: string) => {
  const result = await request('/customers', 'POST', {
    name: holder.name,
    email: holder.email,
    cpfCnpj: holder.cpfCnpj.replace(/\D/g, ''),
    mobilePhone: holder.phone.replace(/\D/g, ''),
    postalCode: holder.postalCode.replace(/\D/g, ''),
    addressNumber: holder.addressNumber,
    externalReference,
  })
  const id = text(result.id)
  if (!id) throw new AsaasError(502, 'O Asaas não retornou o identificador do cliente.')
  return { id }
}

export type AsaasPayment = {
  id: string
  status: string
  invoiceUrl: string | null
  dueDate: string | null
  valueCents: number
  billingType: string | null
  subscriptionId: string | null
}

const parsePayment = (raw: Json): AsaasPayment => {
  const id = text(raw.id)
  if (!id) throw new AsaasError(502, 'O Asaas não retornou o identificador da cobrança.')
  const value = typeof raw.value === 'number' ? raw.value : Number(raw.value ?? 0)
  return {
    id,
    status: text(raw.status) ?? 'UNKNOWN',
    invoiceUrl: text(raw.invoiceUrl),
    dueDate: text(raw.dueDate),
    valueCents: Math.round(value * 100),
    billingType: text(raw.billingType),
    subscriptionId: text(raw.subscription),
  }
}

const isoDate = (date = new Date()) => date.toISOString().slice(0, 10)

export type ChargeInput = {
  customerId: string
  billingType: AsaasBillingType
  valueCents: number
  description: string
  externalReference: string
  creditCardToken?: string
}

// Cobrança avulsa (sem assinatura) — usada no cartão não recorrente.
export const createPayment = async (input: ChargeInput) => parsePayment(await request('/payments', 'POST', {
  customer: input.customerId,
  billingType: input.billingType,
  value: input.valueCents / 100,
  dueDate: isoDate(),
  description: input.description,
  externalReference: input.externalReference,
  ...(input.creditCardToken ? { creditCardToken: input.creditCardToken } : {}),
}))

export type AsaasSubscription = { id: string; status: string }

// Assinatura mensal — usada em pix, boleto e cartão recorrente. O Asaas gera a cobrança do mês sozinho.
export const createSubscription = async (input: ChargeInput) => {
  const result = await request('/subscriptions', 'POST', {
    customer: input.customerId,
    billingType: input.billingType,
    cycle: 'MONTHLY',
    value: input.valueCents / 100,
    nextDueDate: isoDate(),
    description: input.description,
    externalReference: input.externalReference,
    ...(input.creditCardToken ? { creditCardToken: input.creditCardToken } : {}),
  })
  const id = text(result.id)
  if (!id) throw new AsaasError(502, 'O Asaas não retornou o identificador da assinatura.')
  return { id, status: text(result.status) ?? 'UNKNOWN' } satisfies AsaasSubscription
}

export const cancelSubscription = (subscriptionId: string) => request(`/subscriptions/${encodeURIComponent(subscriptionId)}`, 'DELETE')

// Troca o cartão de uma assinatura existente (cartão recusado, vencido, ou cliente trocou de banco).
export const updateSubscriptionCard = (subscriptionId: string, creditCardToken: string) =>
  request(`/subscriptions/${encodeURIComponent(subscriptionId)}`, 'PUT', { creditCardToken })

// A primeira cobrança de uma assinatura nasce de forma assíncrona no Asaas; buscamos pra devolver o QR/linha digitável já na mesma tela.
export const firstPaymentFor = async (subscriptionId: string) => {
  const result = await request(`/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=1`, 'GET')
  const list = Array.isArray(result.data) ? result.data as Json[] : []
  if (!list[0]) throw new AsaasError(502, 'O Asaas ainda não gerou a primeira cobrança desta assinatura. Tente novamente em alguns segundos.')
  return parsePayment(list[0])
}

export const fetchPayment = async (paymentId: string) => parsePayment(await request(`/payments/${encodeURIComponent(paymentId)}`, 'GET'))

export type PixQrCode = { payload: string; encodedImage: string | null; expirationDate: string | null }

export const pixQrCode = async (paymentId: string): Promise<PixQrCode> => {
  const result = await request(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, 'GET')
  const payload = text(result.payload)
  if (!payload) throw new AsaasError(502, 'O Asaas não retornou o código PIX desta cobrança.')
  const rawImage = text(result.encodedImage)
  const encodedImage = rawImage ? (rawImage.startsWith('data:image/') ? rawImage : `data:image/png;base64,${rawImage}`) : null
  return { payload, encodedImage, expirationDate: text(result.expirationDate) }
}

export const boletoIdentificationField = async (paymentId: string) => {
  const result = await request(`/payments/${encodeURIComponent(paymentId)}/identificationField`, 'GET')
  return text(result.identificationField)
}

export type BillingEffect = 'activate' | 'suspend' | 'refused' | 'ignore'

const activateEvents = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const suspendEvents = new Set(['PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_REVERSED'])
const refusedEvents = new Set(['PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'])

// Função pura: decide o efeito de um evento de webhook do Asaas no acesso do cliente. Sem I/O, fácil de testar exaustivamente.
export const billingEffectFor = (eventType: string): BillingEffect => {
  if (activateEvents.has(eventType)) return 'activate'
  if (suspendEvents.has(eventType)) return 'suspend'
  if (refusedEvents.has(eventType)) return 'refused'
  return 'ignore'
}
