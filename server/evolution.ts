import QRCode from 'qrcode'

type Json = Record<string, unknown>

export class EvolutionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}

const settings = () => {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, '')
  const globalKey = process.env.EVOLUTION_API_KEY?.trim()
  if (!baseUrl || !globalKey) throw new EvolutionError(503, 'A Evolution ainda não foi configurada no servidor do CRM.')
  const url = new URL(baseUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new EvolutionError(503, 'A URL da Evolution é inválida.')
  return { baseUrl, globalKey }
}

const request = async (path: string, key: string, method = 'GET', body?: Json): Promise<Json> => {
  const { baseUrl } = settings()
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { apikey: key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new EvolutionError(502, 'Não foi possível alcançar a Evolution. Confira o serviço na VPS.')
  }
  if (!response.ok) throw new EvolutionError(response.status, `A Evolution respondeu com erro ${response.status}.`)
  return object(await response.json().catch(() => ({})))
}

export const evolutionConfigured = () => {
  try {
    settings()
    return new URL(process.env.CRM_PUBLIC_URL ?? '').protocol === 'https:'
  } catch { return false }
}

export const createEvolutionInstance = (instanceName: string, instanceToken: string) =>
  request('/instance/create', settings().globalKey, 'POST', {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    token: instanceToken,
    qrcode: true,
  })

export const setEvolutionWebhook = (instanceName: string, instanceToken: string, callbackUrl: string) =>
  request(`/webhook/set/${encodeURIComponent(instanceName)}`, instanceToken, 'POST', {
    enabled: true,
    url: callbackUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
  })

export const evolutionState = async (instanceName: string, instanceToken: string) => {
  const result = await request(`/instance/connectionState/${encodeURIComponent(instanceName)}`, instanceToken)
  return String(object(result.instance).state ?? result.state ?? 'unknown').toLowerCase()
}

export const evolutionQr = async (instanceName: string, instanceToken: string) => {
  const result = await request(`/instance/connect/${encodeURIComponent(instanceName)}`, instanceToken)
  const nested = object(result.qrcode)
  const base64 = typeof result.base64 === 'string' ? result.base64 : typeof nested.base64 === 'string' ? nested.base64 : null
  if (base64) return base64.startsWith('data:image/') ? base64 : `data:image/png;base64,${base64}`
  const code = typeof result.code === 'string' ? result.code : typeof nested.code === 'string' ? nested.code : null
  if (!code) throw new EvolutionError(502, 'A Evolution não retornou um QR Code. Tente novamente em alguns segundos.')
  return QRCode.toDataURL(code, { margin: 1, width: 320 })
}

export const evolutionSendText = (instanceName: string, instanceToken: string, number: string, text: string) =>
  request(`/message/sendText/${encodeURIComponent(instanceName)}`, instanceToken, 'POST', { number, text })
