import { AsaasError, type BillingHolder } from './asaas.js'

type Json = Record<string, unknown>

const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null

const settings = () => {
  const apiKey = process.env.ASAAS_API_KEY?.trim()
  const baseUrl = (process.env.ASAAS_API_URL?.trim() || 'https://api.asaas.com/v3').replace(/\/$/, '')
  if (!apiKey) throw new AsaasError(503, 'O Asaas ainda não foi configurado no servidor do CRM.')
  return { apiKey, baseUrl }
}

export type CardInput = { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string }
export type TokenizedCard = { token: string; brand: string | null; last4: string }

/**
 * Único ponto do sistema que enxerga número de cartão e CVV.
 * Nunca logar, persistir ou incluir `card` em qualquer erro lançado daqui — apenas o token devolvido pelo Asaas sai deste módulo.
 */
export const tokenizeCard = async (customerId: string, card: CardInput, holder: BillingHolder, remoteIp: string): Promise<TokenizedCard> => {
  const { apiKey, baseUrl } = settings()
  const digitsOnly = card.number.replace(/\D/g, '')
  const fallbackLast4 = digitsOnly.slice(-4)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/creditCard/tokenizeCreditCard`, {
      method: 'POST',
      headers: { access_token: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: customerId,
        creditCard: {
          holderName: card.holderName,
          number: digitsOnly,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        creditCardHolderInfo: {
          name: holder.name,
          email: holder.email,
          cpfCnpj: holder.cpfCnpj.replace(/\D/g, ''),
          postalCode: holder.postalCode.replace(/\D/g, ''),
          addressNumber: holder.addressNumber,
          phone: holder.phone.replace(/\D/g, ''),
        },
        remoteIp,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new AsaasError(502, 'Não foi possível alcançar o Asaas para validar o cartão.')
  }
  const parsed = object(await response.json().catch(() => ({})))
  if (!response.ok) {
    const firstError = Array.isArray(parsed.errors) ? object((parsed.errors as unknown[])[0]) : {}
    throw new AsaasError(response.status, text(firstError.description) ?? 'Não foi possível validar o cartão. Confira os dados e tente novamente.')
  }
  const token = text(parsed.creditCardToken)
  if (!token) throw new AsaasError(502, 'O Asaas não retornou o token do cartão.')
  return { token, brand: text(parsed.creditCardBrand), last4: text(parsed.creditCardNumber) ?? fallbackLast4 }
}
