import { z } from 'zod'

export class OpenAIError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

export const openaiConfigured = () => Boolean(process.env.OPENAI_API_KEY?.trim())

const baseUrl = () => (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')

const authorized = async (path: string, init: RequestInit, timeoutMs: number) => {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new OpenAIError(503, 'A chave da OpenAI não foi configurada no servidor.')
  let response: Response
  try {
    response = await fetch(`${baseUrl()}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new OpenAIError(502, 'Não foi possível alcançar a OpenAI.')
  }
  if (!response.ok) throw new OpenAIError(response.status, `A OpenAI respondeu com erro ${response.status}.`)
  return response
}

export const transcribeAudio = async (audio: Buffer, mimeType: string, fileName: string) => {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType.split(';')[0] || 'audio/ogg' }), fileName)
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe')
  form.append('language', 'pt')
  form.append('response_format', 'json')
  const response = await authorized('/audio/transcriptions', { method: 'POST', body: form }, 60_000)
  const body = await response.json().catch(() => ({})) as { text?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  return text || null
}

export const temperatures = ['new', 'warm', 'hot'] as const
export const dealStatuses = ['none', 'won', 'lost'] as const

const analysisSchema = z.object({
  stage: z.string().max(80).nullable().optional(),
  temperature: z.enum(temperatures).nullable().optional(),
  estimated_value: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  source_hint: z.string().max(80).nullable().optional(),
  deal: z.enum(dealStatuses).default('none'),
  deal_amount: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  summary: z.string().max(600).default(''),
  reason: z.string().max(600).default(''),
  confidence: z.coerce.number().min(0).max(1).default(0),
})
export type LeadAnalysis = z.infer<typeof analysisSchema>

export const parseAnalysis = (raw: unknown): LeadAnalysis | null => {
  let value = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { return null }
  }
  const parsed = analysisSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

const responseFormat = (stages: string[]) => ({
  type: 'json_schema',
  json_schema: {
    name: 'lead_analysis',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['stage', 'temperature', 'estimated_value', 'source_hint', 'deal', 'deal_amount', 'summary', 'reason', 'confidence'],
      properties: {
        stage: { type: ['string', 'null'], enum: [...stages, null] },
        temperature: { type: ['string', 'null'], enum: [...temperatures, null] },
        estimated_value: { type: ['number', 'null'] },
        source_hint: { type: ['string', 'null'] },
        deal: { type: 'string', enum: [...dealStatuses] },
        deal_amount: { type: ['number', 'null'] },
        summary: { type: 'string' },
        reason: { type: 'string' },
        confidence: { type: 'number' },
      },
    },
  },
})

export type AnalysisInput = {
  stages: string[]
  current: { stage: string; temperature: string; value: number | null; source: string | null }
  catalog?: Array<{ name: string; price: number | null }>
  transcript: string
}

export const analyzeConversation = async (input: AnalysisInput) => {
  const system = [
    'Você analisa conversas de WhatsApp entre uma empresa brasileira e um cliente para organizar um CRM de vendas.',
    'Responda apenas o JSON pedido, em português. Use somente o que está escrito na conversa; nunca invente valores.',
    `Etapas abertas do funil, da primeira à última: ${input.stages.join(' > ')}.`,
    'stage: a etapa aberta que melhor descreve o momento atual do cliente, ou null se não houver informação.',
    'temperature: new (sem interesse claro), warm (interessado) ou hot (pronto para comprar).',
    'estimated_value: valor total em reais que o cliente demonstrou querer comprar, só se estiver claro; senão null.',
    'source_hint: de onde o cliente diz ter vindo (ex.: Instagram, indicação, Google), só se ele disser; senão null.',
    'deal: "won" somente se o cliente confirmou que vai pagar ou já pagou; "lost" somente se desistiu ou recusou de vez; senão "none". deal_amount: valor da venda em reais quando deal for won.',
    'summary: resumo de uma frase do que o cliente quer. reason: por que você chegou a essas conclusões. confidence: de 0 a 1.',
  ].join('\n')
  const user = [
    `Situação atual no CRM: etapa "${input.current.stage}", temperatura ${input.current.temperature}, valor ${input.current.value ?? 'não informado'}, origem ${input.current.source ?? 'não informada'}.`,
    input.catalog?.length ? `Tabela de preços da empresa (use para estimar o valor quando o cliente citar um item): ${input.catalog.map((item) => `${item.name}${item.price === null ? '' : ` R$ ${item.price}`}`).join('; ')}.` : '',
    'Conversa (mais recente por último):',
    input.transcript,
  ].filter(Boolean).join('\n\n')
  const response = await authorized('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_ANALYSIS_MODEL?.trim() || 'gpt-4.1-mini',
      temperature: 0,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: responseFormat(input.stages),
    }),
  }, 45_000)
  const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }> }
  return parseAnalysis(body.choices?.[0]?.message?.content)
}
