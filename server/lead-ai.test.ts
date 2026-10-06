import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide, type Current, type StageInfo } from './lead-decision.js'
import { parseAnalysis, type LeadAnalysis } from './openai.js'

const stages: StageInfo[] = [
  { id: 's1', name: 'Novos leads', position: 1, kind: 'open' },
  { id: 's2', name: 'Qualificados', position: 2, kind: 'open' },
  { id: 's3', name: 'Proposta enviada', position: 3, kind: 'open' },
  { id: 's4', name: 'Negociação', position: 4, kind: 'open' },
  { id: 's5', name: 'Ganhos', position: 5, kind: 'won' },
  { id: 's6', name: 'Perdidos', position: 6, kind: 'lost' },
]
const base: Current = { stage: stages[0], temperature: 'new', value: null, source: 'WhatsApp', locked: false }
const analysis = (overrides: Partial<LeadAnalysis> = {}): LeadAnalysis => ({ stage: null, temperature: null, estimated_value: null, source_hint: null, deal: 'none', deal_amount: null, summary: '', reason: '', confidence: 0.9, ...overrides })

test('qualifica o lead, define temperatura, valor e origem', () => {
  const decision = decide(analysis({ stage: 'Qualificados', temperature: 'warm', estimated_value: 60, source_hint: 'Instagram' }), base, stages)
  assert.equal(decision.stage?.name, 'Qualificados')
  assert.equal(decision.temperature, 'warm')
  assert.equal(decision.value, 60)
  assert.equal(decision.source, 'Instagram')
})

test('nunca volta o lead para uma etapa anterior', () => {
  const decision = decide(analysis({ stage: 'Novos leads' }), { ...base, stage: stages[2] }, stages)
  assert.equal(decision.stage, undefined)
})

test('ignora conclusões com pouca confiança', () => {
  assert.deepEqual(decide(analysis({ stage: 'Negociação', temperature: 'hot', confidence: 0.4 }), base, stages), {})
})

test('respeita lead movido manualmente', () => {
  const decision = decide(analysis({ stage: 'Negociação', temperature: 'hot', estimated_value: 90 }), { ...base, locked: true }, stages)
  assert.deepEqual(decision, {})
})

test('venda detectada não vai para Ganhos: cria revisão e leva à última etapa aberta', () => {
  const decision = decide(analysis({ deal: 'won', deal_amount: 150 }), base, stages)
  assert.deepEqual(decision.sale, { amount: 150 })
  assert.equal(decision.stage?.name, 'Negociação')
  assert.equal(decision.temperature, 'hot')
  assert.equal(decision.value, 150)
})

test('venda detectada ainda é registrada para revisão mesmo com lead bloqueado', () => {
  const decision = decide(analysis({ deal: 'won', deal_amount: 80 }), { ...base, locked: true }, stages)
  assert.deepEqual(decision, { sale: { amount: 80 } })
})

test('desistência move para Perdidos', () => {
  assert.equal(decide(analysis({ deal: 'lost' }), { ...base, stage: stages[2] }, stages).stage?.name, 'Perdidos')
})

test('lead já ganho ou perdido não é alterado', () => {
  assert.deepEqual(decide(analysis({ stage: 'Qualificados', temperature: 'hot', estimated_value: 10 }), { ...base, stage: stages[4] }, stages), {})
})

test('não troca uma origem já informada', () => {
  assert.equal(decide(analysis({ source_hint: 'Instagram' }), { ...base, source: 'Google Ads' }, stages).source, undefined)
})

test('valida e normaliza a resposta do GPT', () => {
  assert.equal(parseAnalysis('isto não é json'), null)
  assert.equal(parseAnalysis({ deal: 'talvez' }), null)
  const parsed = parseAnalysis(JSON.stringify({ stage: 'Qualificados', temperature: 'hot', estimated_value: '120.5', deal: 'none', summary: 'Quer um combo', reason: 'pediu preço', confidence: 0.8 }))
  assert.equal(parsed?.estimated_value, 120.5)
  assert.equal(parsed?.temperature, 'hot')
})
