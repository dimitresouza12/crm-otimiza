import { query, transaction } from './db.js'
import { decide, type Current, type StageInfo } from './lead-decision.js'
import { analyzeConversation, openaiConfigured } from './openai.js'

const authorLabel = (message: { direction: string; sent_by: string | null }) =>
  message.direction === 'inbound' ? 'Cliente' : message.sent_by === 'bot' ? 'Chatbot' : 'Atendente'

const mediaLabel = (type: string) => {
  const kind = type.toLowerCase()
  return kind.includes('image') ? '[foto]' : kind.includes('audio') ? '[áudio sem transcrição]' : kind.includes('video') ? '[vídeo]' : kind.includes('document') ? '[documento]' : ''
}

export const aiEnabledFor = async (companyId: string) => {
  if (!openaiConfigured()) return false
  const { rows } = await query<{ enabled: boolean }>(
    `SELECT (c.plan = 'chatbot' AND COALESCE(s.ai_enabled, false)) AS enabled
     FROM companies c LEFT JOIN chatbot_settings s ON s.company_id = c.id WHERE c.id = $1`, [companyId],
  )
  return Boolean(rows[0]?.enabled)
}

export const runAnalysis = async (conversationId: string) => {
  const conversation = (await query<{ company_id: string; contact_id: string }>('SELECT company_id, contact_id FROM conversations WHERE id = $1', [conversationId])).rows[0]
  if (!conversation || !(await aiEnabledFor(conversation.company_id))) return null
  const opportunity = (await query<{ id: string; pipeline_id: string; temperature: string; estimated_value: string | null; source: string | null; locked: boolean; stage_id: string; stage_name: string; stage_position: number; stage_kind: StageInfo['kind'] }>(
    `SELECT o.id, o.pipeline_id, o.temperature, o.estimated_value, o.source, (o.stage_locked_until IS NOT NULL AND o.stage_locked_until > now()) AS locked,
            ps.id AS stage_id, ps.name AS stage_name, ps.position AS stage_position, ps.kind AS stage_kind
     FROM opportunities o JOIN pipeline_stages ps ON ps.id = o.stage_id
     WHERE o.company_id = $1 AND o.contact_id = $2 ORDER BY o.updated_at DESC LIMIT 1`, [conversation.company_id, conversation.contact_id],
  )).rows[0]
  if (!opportunity) return null
  const stages = (await query<StageInfo>('SELECT id, name, position, kind FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY position', [opportunity.pipeline_id])).rows
  const messages = (await query<{ direction: string; sent_by: string | null; message_type: string; body: string | null; transcript: string | null }>(
    `SELECT direction, sent_by, message_type, body, transcript FROM (
       SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 30
     ) recent ORDER BY sent_at ASC`, [conversationId],
  )).rows
  const lines = messages.map((message) => {
    const text = message.transcript ? `(áudio transcrito) ${message.transcript}` : message.body ?? mediaLabel(message.message_type)
    return text ? `${authorLabel(message)}: ${text}` : ''
  }).filter(Boolean)
  if (!messages.some((message) => message.direction === 'inbound' && (message.body || message.transcript))) return null

  const current: Current = {
    stage: { id: opportunity.stage_id, name: opportunity.stage_name, position: opportunity.stage_position, kind: opportunity.stage_kind },
    temperature: opportunity.temperature,
    value: opportunity.estimated_value === null ? null : Number(opportunity.estimated_value),
    source: opportunity.source,
    locked: opportunity.locked,
  }
  const analysis = await analyzeConversation({
    stages: stages.filter((stage) => stage.kind === 'open').map((stage) => stage.name),
    current: { stage: current.stage.name, temperature: current.temperature, value: current.value, source: current.source },
    transcript: lines.join('\n'),
  })
  if (!analysis) return null

  const decision = decide(analysis, current, stages)
  const applied: Record<string, unknown> = {}
  await transaction(async (client) => {
    if (decision.stage || decision.temperature || decision.value !== undefined || decision.source) {
      await client.query(
        `UPDATE opportunities SET stage_id = COALESCE($3, stage_id), temperature = COALESCE($4, temperature), estimated_value = COALESCE($5, estimated_value),
                source = COALESCE($6, source), last_activity_at = now(), updated_at = now() WHERE id = $1 AND company_id = $2`,
        [opportunity.id, conversation.company_id, decision.stage?.id ?? null, decision.temperature ?? null, decision.value ?? null, decision.source ?? null],
      )
      if (decision.stage) applied.stage = { from: current.stage.name, to: decision.stage.name }
      if (decision.temperature) applied.temperature = { from: current.temperature, to: decision.temperature }
      if (decision.value !== undefined) applied.value = { from: current.value, to: decision.value }
      if (decision.source) applied.source = { from: current.source, to: decision.source }
    }
    if (decision.sale) {
      const existing = await client.query(`SELECT 1 FROM sales WHERE company_id = $1 AND opportunity_id = $2 AND status IN ('detected', 'negotiation', 'confirmed') LIMIT 1`, [conversation.company_id, opportunity.id])
      if (!existing.rowCount) {
        await client.query(
          `INSERT INTO sales (company_id, opportunity_id, contact_id, status, amount, evidence) VALUES ($1, $2, $3, 'detected', $4, $5::jsonb)`,
          [conversation.company_id, opportunity.id, conversation.contact_id, decision.sale.amount, JSON.stringify({ source: 'ai', conversationId, reason: analysis.reason })],
        )
        applied.sale = { amount: decision.sale.amount, status: 'detected' }
      }
    }
    await client.query('UPDATE opportunities SET ai_summary = $3, ai_summary_at = now() WHERE id = $1 AND company_id = $2', [opportunity.id, conversation.company_id, analysis.summary || null])
    if (Object.keys(applied).length) {
      await client.query(
        `INSERT INTO opportunity_ai_events (company_id, opportunity_id, conversation_id, reason, confidence, proposed, applied) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [conversation.company_id, opportunity.id, conversationId, analysis.reason || analysis.summary, analysis.confidence, JSON.stringify(analysis), JSON.stringify(applied)],
      )
    }
  })
  return { analysis, applied }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

// Espera o cliente parar de escrever antes de gastar uma chamada de IA.
export const scheduleAnalysis = (conversationId: string, onError: (error: unknown) => void) => {
  if (!openaiConfigured()) return
  clearTimeout(timers.get(conversationId))
  const delay = Number(process.env.AI_ANALYSIS_DELAY_MS ?? 20_000)
  timers.set(conversationId, setTimeout(() => {
    timers.delete(conversationId)
    void runAnalysis(conversationId).catch(onError)
  }, Number.isFinite(delay) && delay >= 0 ? delay : 20_000))
}
