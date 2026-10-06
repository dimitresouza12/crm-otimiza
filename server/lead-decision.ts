import type { LeadAnalysis } from './openai.js'

export type StageInfo = { id: string; name: string; position: number; kind: 'open' | 'won' | 'lost' }
export type Current = { stage: StageInfo; temperature: string; value: number | null; source: string | null; locked: boolean }

export const minConfidence = 0.6

export type Decision = {
  stage?: StageInfo
  temperature?: 'new' | 'warm' | 'hot'
  value?: number
  source?: string
  sale?: { amount: number }
}

const genericSources = new Set(['', 'whatsapp', 'automação', 'automacao'])

// Regra pura: decide o que a IA pode aplicar. Só avança etapas, respeita ajustes manuais e nunca confirma faturamento.
export const decide = (analysis: LeadAnalysis, current: Current, stages: StageInfo[]): Decision => {
  const decision: Decision = {}
  if (analysis.confidence < minConfidence) return decision
  const open = stages.filter((stage) => stage.kind === 'open').sort((a, b) => a.position - b.position)
  const lost = stages.find((stage) => stage.kind === 'lost')
  const canChange = current.stage.kind === 'open' && !current.locked

  const dealAmount = analysis.deal === 'won' ? Number(analysis.deal_amount ?? analysis.estimated_value ?? 0) : 0
  if (analysis.deal === 'won' && dealAmount > 0) decision.sale = { amount: dealAmount }

  if (canChange) {
    const wanted = analysis.deal === 'lost' && lost
      ? lost
      : analysis.deal === 'won'
        ? open.at(-1)
        : open.find((stage) => stage.name.toLowerCase() === (analysis.stage ?? '').toLowerCase())
    if (wanted && (wanted.kind === 'lost' || wanted.position > current.stage.position)) decision.stage = wanted

    const temperature = analysis.deal === 'won' ? 'hot' : analysis.deal === 'lost' ? undefined : analysis.temperature ?? undefined
    if (temperature && temperature !== current.temperature) decision.temperature = temperature

    const value = analysis.deal === 'won' && dealAmount > 0 ? dealAmount : Number(analysis.estimated_value ?? 0)
    if (value > 0 && value !== current.value) decision.value = value

    const hint = (analysis.source_hint ?? '').trim()
    if (hint && genericSources.has((current.source ?? '').trim().toLowerCase())) decision.source = hint.slice(0, 60)
  }
  return decision
}
