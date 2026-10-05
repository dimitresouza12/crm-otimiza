import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import rawBody from 'fastify-raw-body'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { config } from './config.js'
import { decryptSecret, encryptSecret } from './crypto.js'
import { pool, query, transaction } from './db.js'
import { createEvolutionInstance, evolutionConfigured, evolutionQr, evolutionSendText, evolutionState, EvolutionError, setEvolutionWebhook } from './evolution.js'
import { pickText } from './message-text.js'
import { calculatePlanPrice, isPurchasablePlan } from './pricing.js'

type Token = { userId: string; companyId: string; role: string }
type CompanyRow = { company_id: string; role: string; billing_status: 'trial' | 'active' | 'expired'; trial_ends_at: string | null }

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    redact: ['req.headers.authorization', 'req.headers["x-otimiza-webhook-secret"]', 'req.body.accessToken', 'req.body.instanceToken'],
  },
})

const currentDir = dirname(fileURLToPath(import.meta.url))
const appShell = await readFile(join(currentDir, '..', 'index.html'), 'utf8')

await app.register(helmet, { contentSecurityPolicy: config.nodeEnv === 'production' })
await app.register(cors, {
  origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
  credentials: true,
})
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
await app.register(jwt, { secret: config.jwtSecret() })
await app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true })

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)

const tokenFor = (userId: string, companyId: string, role: string) => app.jwt.sign({ userId, companyId, role } satisfies Token, { expiresIn: '7d' })

const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Sessão inválida ou expirada.' })
  }
}

const currentToken = (request: FastifyRequest) => request.user as Token

const companyScope = async (request: FastifyRequest, reply: FastifyReply, allowExpired = false) => {
  const token = currentToken(request)
  const requestedCompanyId = (request.headers['x-company-id'] as string | undefined) ?? token.companyId
  const { rows } = await query<CompanyRow>(
    `SELECT m.company_id, m.role, c.billing_status, c.trial_ends_at
     FROM memberships m JOIN companies c ON c.id = m.company_id
     WHERE m.company_id = $1 AND m.user_id = $2`,
    [requestedCompanyId, token.userId],
  )
  if (!rows[0]) {
    reply.code(403).send({ error: 'Você não tem acesso a esta empresa.' })
    return null
  }
  const membership = rows[0]
  const trialExpired = membership.billing_status === 'trial' && membership.trial_ends_at !== null && new Date(membership.trial_ends_at).getTime() <= Date.now()
  const accessState = membership.billing_status === 'active' || membership.role === 'otimiza_admin' ? 'active' : trialExpired || membership.billing_status === 'expired' ? 'expired' : 'trial'
  if (!allowExpired && accessState === 'expired') {
    reply.code(402).send({ error: 'Seu período de teste terminou. Escolha um plano para continuar usando o CRM.', code: 'TRIAL_EXPIRED' })
    return null
  }
  return { companyId: membership.company_id, role: membership.role, userId: token.userId, accessState, trialEndsAt: membership.trial_ends_at }
}

const defaultPipeline = async (companyId: string) => {
  const { rows } = await query<{ id: string }>('INSERT INTO pipelines (company_id, name, is_default) VALUES ($1, $2, true) RETURNING id', [companyId, 'Vendas'])
  const stages = [
    ['Novos leads', 1, '#7a75f4', 'open'],
    ['Qualificados', 2, '#5d9ff2', 'open'],
    ['Proposta enviada', 3, '#d29a42', 'open'],
    ['Negociação', 4, '#da7460', 'open'],
    ['Ganhos', 5, '#23a77e', 'won'],
    ['Perdidos', 6, '#949ba7', 'lost'],
  ]
  await Promise.all(stages.map(([name, position, color, kind]) => query('INSERT INTO pipeline_stages (pipeline_id, name, position, color, kind) VALUES ($1, $2, $3, $4, $5)', [rows[0].id, name, position, color, kind])))
  return rows[0].id
}

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  companyName: z.string().min(2).max(100),
  email: z.string().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100),
  segment: z.string().max(80).optional(),
  objective: z.string().max(160).optional(),
  usesOtimizaAutomation: z.boolean().optional(),
  plan: z.enum(['crm', 'chatbot']).default('crm'),
  channelLimit: z.coerce.number().int().min(1).max(5).default(1),
})

app.get('/api/public/config', async () => ({ salesWhatsapp: config.salesWhatsapp }))

app.get('/health', async () => {
  await query('SELECT 1')
  return { status: 'ok', service: 'otimiza-crm-api', timestamp: new Date().toISOString() }
})

app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
  const parsed = registerSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Confira os dados do cadastro.', details: parsed.error.flatten().fieldErrors })
  const input = parsed.data
  const planPriceCents = calculatePlanPrice(input.plan, input.channelLimit)
  if (!isPurchasablePlan(input.plan)) return reply.code(400).send({ error: 'Plano inválido.' })
  const passwordHash = await bcrypt.hash(input.password, 12)
  const companyBaseSlug = slugify(input.companyName) || 'empresa'
  try {
    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [input.email])
      if (existing.rowCount) throw new Error('EMAIL_EXISTS')
      const company = await client.query<{ id: string }>(
        `INSERT INTO companies (name, slug, plan, channel_limit, plan_price_cents, trial_ends_at, billing_status, onboarding)
         VALUES ($1, $2 || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), $3, $4, $5, now() + interval '7 days', 'trial', $6::jsonb)
         RETURNING id`,
        [input.companyName, companyBaseSlug, input.plan, input.channelLimit, planPriceCents, JSON.stringify({ segment: input.segment, objective: input.objective, usesOtimizaAutomation: input.usesOtimizaAutomation ?? false, selectedPlan: input.plan, selectedChannelLimit: input.channelLimit, presentedPriceCents: planPriceCents })],
      )
      const user = await client.query<{ id: string }>('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [input.name, input.email, passwordHash])
      await client.query('INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, $3)', [company.rows[0].id, user.rows[0].id, 'owner'])
      return { companyId: company.rows[0].id, userId: user.rows[0].id }
    })
    await defaultPipeline(result.companyId)
    return reply.code(201).send({ token: tokenFor(result.userId, result.companyId, 'owner'), companyId: result.companyId, trialEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() })
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_EXISTS') return reply.code(409).send({ error: 'Este e-mail já possui uma conta.' })
    throw error
  }
})

app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
  const parsed = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(1) }).safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Informe e-mail e senha.' })
  const { rows } = await query<{ id: string; password_hash: string; company_id: string; role: string }>(
    `SELECT u.id, u.password_hash, m.company_id, m.role FROM users u
     JOIN memberships m ON m.user_id = u.id WHERE u.email = $1 ORDER BY m.created_at ASC LIMIT 1`, [parsed.data.email],
  )
  const account = rows[0]
  if (!account || !(await bcrypt.compare(parsed.data.password, account.password_hash))) return reply.code(401).send({ error: 'E-mail ou senha incorretos.' })
  return { token: tokenFor(account.id, account.company_id, account.role), companyId: account.company_id, role: account.role }
})

app.get('/api/me', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply, true)
  if (!scope) return
  const { rows } = await query<{ name: string; email: string; company_name: string; plan: string; channel_limit: number; plan_price_cents: number; trial_ends_at: string | null; billing_status: string; uses_automation: boolean }>(
    `SELECT u.name, u.email, c.name AS company_name, c.plan, c.channel_limit, c.plan_price_cents, c.trial_ends_at, c.billing_status,
       COALESCE((c.onboarding ->> 'usesOtimizaAutomation')::boolean, false) AS uses_automation
     FROM users u JOIN companies c ON c.id = $1 WHERE u.id = $2`, [scope.companyId, scope.userId],
  )
  return { ...rows[0], role: scope.role, companyId: scope.companyId, access_state: scope.accessState }
})

app.get('/api/dashboard', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query<{ confirmed_revenue: string; confirmed_sales: string; open_leads: string; average_ticket: string; leads_this_month: string }>(
    `SELECT
       COALESCE((SELECT sum(amount) FROM sales WHERE company_id = $1 AND status = 'confirmed'), 0)::text AS confirmed_revenue,
       (SELECT count(*) FROM sales WHERE company_id = $1 AND status = 'confirmed')::text AS confirmed_sales,
       (SELECT count(*) FROM opportunities WHERE company_id = $1)::text AS open_leads,
       COALESCE((SELECT avg(amount) FROM sales WHERE company_id = $1 AND status = 'confirmed'), 0)::text AS average_ticket,
       (SELECT count(*) FROM contacts WHERE company_id = $1 AND first_seen_at >= date_trunc('month', now()))::text AS leads_this_month`, [scope.companyId],
  )
  return rows[0]
})

app.get('/api/crm', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query(
    `SELECT ps.id, ps.name, ps.position, ps.color, ps.kind,
       COALESCE(json_agg(json_build_object('id', o.id, 'title', o.title, 'contactName', c.name, 'phone', c.phone_e164, 'temperature', o.temperature, 'value', o.estimated_value, 'source', o.source, 'lastActivityAt', o.last_activity_at) ORDER BY o.last_activity_at DESC) FILTER (WHERE o.id IS NOT NULL), '[]') AS opportunities
     FROM pipelines p JOIN pipeline_stages ps ON ps.pipeline_id = p.id
     LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.company_id = $1
     LEFT JOIN contacts c ON c.id = o.contact_id
     WHERE p.company_id = $1 AND p.is_default = true
     GROUP BY ps.id ORDER BY ps.position`, [scope.companyId],
  )
  return rows
})

const leadSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  source: z.string().min(2).max(80).default('Manual'),
  title: z.string().min(2).max(160).optional(),
  estimatedValue: z.coerce.number().min(0).max(99_999_999).optional(),
  temperature: z.enum(['new', 'warm', 'hot']).default('new'),
  stageId: z.string().uuid().optional(),
})

const normalizePhone = (value: string) => value.replace(/\D/g, '')

const getDefaultPipeline = async (companyId: string) => {
  const { rows } = await query<{ id: string }>('SELECT id FROM pipelines WHERE company_id = $1 AND is_default = true LIMIT 1', [companyId])
  if (!rows[0]) throw new Error('PIPELINE_NOT_FOUND')
  return rows[0].id
}

const getStage = async (companyId: string, stageId?: string) => {
  if (stageId) {
    const { rows } = await query<{ id: string; pipeline_id: string }>(
      `SELECT ps.id, ps.pipeline_id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
       WHERE ps.id = $1 AND p.company_id = $2 LIMIT 1`, [stageId, companyId],
    )
    if (rows[0]) return rows[0]
  }
  const { rows } = await query<{ id: string; pipeline_id: string }>(
    `SELECT ps.id, ps.pipeline_id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
     WHERE p.company_id = $1 AND p.is_default = true ORDER BY ps.position ASC LIMIT 1`, [companyId],
  )
  if (!rows[0]) throw new Error('STAGE_NOT_FOUND')
  return rows[0]
}

app.get('/api/leads', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query(
    `SELECT c.id, c.name, c.phone_e164 AS phone, c.first_source AS source, c.last_seen_at,
       o.id AS opportunity_id, o.title, o.temperature, o.estimated_value, ps.id AS stage_id, ps.name AS stage_name
     FROM contacts c
     LEFT JOIN LATERAL (
       SELECT * FROM opportunities WHERE company_id = c.company_id AND contact_id = c.id ORDER BY updated_at DESC LIMIT 1
     ) o ON true
     LEFT JOIN pipeline_stages ps ON ps.id = o.stage_id
     WHERE c.company_id = $1 ORDER BY c.last_seen_at DESC`, [scope.companyId],
  )
  return rows
})

app.post('/api/leads', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'agent', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode criar leads.' })
  const parsed = leadSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Confira os dados do lead.', details: parsed.error.flatten().fieldErrors })
  const input = parsed.data
  const phone = normalizePhone(input.phone)
  if (phone.length < 8) return reply.code(400).send({ error: 'Informe um telefone válido.' })
  const result = await transaction(async (client) => {
    const stage = await getStage(scope.companyId, input.stageId)
    const contact = await client.query<{ id: string }>(
      `INSERT INTO contacts (company_id, phone_e164, name, first_source, last_source)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (company_id, phone_e164) DO UPDATE SET name = EXCLUDED.name, last_source = EXCLUDED.last_source, last_seen_at = now(), updated_at = now()
       RETURNING id`, [scope.companyId, phone, input.name, input.source],
    )
    const opportunity = await client.query<{ id: string }>(
      `INSERT INTO opportunities (company_id, pipeline_id, stage_id, contact_id, title, temperature, estimated_value, source, assigned_user_id, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) RETURNING id`,
      [scope.companyId, stage.pipeline_id, stage.id, contact.rows[0].id, input.title ?? input.name, input.temperature, input.estimatedValue ?? null, input.source, scope.userId],
    )
    await client.query(
      `INSERT INTO audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'created', 'opportunity', $3, $4::jsonb)`, [scope.companyId, scope.userId, opportunity.rows[0].id, JSON.stringify({ source: input.source })],
    )
    return { contactId: contact.rows[0].id, opportunityId: opportunity.rows[0].id, stageId: stage.id }
  })
  return reply.code(201).send(result)
})

const opportunityUpdateSchema = z.object({
  stageId: z.string().uuid().optional(),
  estimatedValue: z.coerce.number().min(0).max(99_999_999).nullable().optional(),
  temperature: z.enum(['new', 'warm', 'hot']).optional(),
  title: z.string().min(2).max(160).optional(),
})

app.patch('/api/opportunities/:opportunityId', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'agent', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode alterar oportunidades.' })
  const params = z.object({ opportunityId: z.string().uuid() }).safeParse(request.params)
  const parsed = opportunityUpdateSchema.safeParse(request.body)
  if (!params.success || !parsed.success) return reply.code(400).send({ error: 'Dados da oportunidade inválidos.' })
  const current = await query<{ id: string; pipeline_id: string }>('SELECT id, pipeline_id FROM opportunities WHERE id = $1 AND company_id = $2', [params.data.opportunityId, scope.companyId])
  if (!current.rows[0]) return reply.code(404).send({ error: 'Oportunidade não encontrada.' })
  const nextStage = parsed.data.stageId ? await getStage(scope.companyId, parsed.data.stageId) : null
  if (nextStage && nextStage.pipeline_id !== current.rows[0].pipeline_id) return reply.code(400).send({ error: 'A etapa selecionada pertence a outro funil.' })
  const { rows } = await query(
    `UPDATE opportunities SET stage_id = COALESCE($3, stage_id), estimated_value = COALESCE($4, estimated_value),
       temperature = COALESCE($5, temperature), title = COALESCE($6, title), last_activity_at = now(), updated_at = now()
     WHERE id = $1 AND company_id = $2 RETURNING id, stage_id, estimated_value, temperature, title`,
    [params.data.opportunityId, scope.companyId, nextStage?.id ?? null, parsed.data.estimatedValue ?? null, parsed.data.temperature ?? null, parsed.data.title ?? null],
  )
  await query(
    `INSERT INTO audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'updated', 'opportunity', $3, $4::jsonb)`, [scope.companyId, scope.userId, params.data.opportunityId, JSON.stringify(parsed.data)],
  )
  return rows[0]
})

const saleSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  amount: z.coerce.number().positive().max(99_999_999),
  status: z.enum(['negotiation', 'detected', 'confirmed', 'lost']).default('confirmed'),
})

app.get('/api/sales', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query(
    `SELECT s.id, s.status, s.amount, s.confirmed_at, s.created_at, s.opportunity_id, c.name AS contact_name, o.title AS opportunity_title
     FROM sales s LEFT JOIN contacts c ON c.id = s.contact_id LEFT JOIN opportunities o ON o.id = s.opportunity_id
     WHERE s.company_id = $1 ORDER BY COALESCE(s.confirmed_at, s.created_at) DESC`, [scope.companyId],
  )
  return rows
})

app.get('/api/conversations', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query(
    `SELECT cv.id, cv.status, cv.last_message_at, c.name AS contact_name, c.phone_e164 AS phone,
       wc.name AS channel_name, latest.body AS last_message, latest.direction AS last_direction, latest.sent_at
     FROM conversations cv
     JOIN contacts c ON c.id = cv.contact_id
     JOIN whatsapp_channels wc ON wc.id = cv.channel_id
     LEFT JOIN LATERAL (
       SELECT body, direction, sent_at FROM messages WHERE conversation_id = cv.id ORDER BY sent_at DESC LIMIT 1
     ) latest ON true
     WHERE cv.company_id = $1 ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC`, [scope.companyId],
  )
  return rows
})

app.get('/api/conversations/:conversationId/messages', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const params = z.object({ conversationId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'Conversa inválida.' })
  const conversation = await query<{ id: string }>('SELECT id FROM conversations WHERE id = $1 AND company_id = $2', [params.data.conversationId, scope.companyId])
  if (!conversation.rows[0]) return reply.code(404).send({ error: 'Conversa não encontrada.' })
  const { rows } = await query(
    `SELECT id, direction, message_type, body, sent_at FROM messages
     WHERE company_id = $1 AND conversation_id = $2 ORDER BY sent_at ASC LIMIT 300`, [scope.companyId, params.data.conversationId],
  )
  return rows
})

app.post('/api/sales', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode registrar vendas.' })
  const parsed = saleSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Dados da venda inválidos.', details: parsed.error.flatten().fieldErrors })
  const input = parsed.data
  let contactId = input.contactId ?? null
  if (input.opportunityId) {
    const { rows } = await query<{ contact_id: string }>('SELECT contact_id FROM opportunities WHERE id = $1 AND company_id = $2', [input.opportunityId, scope.companyId])
    if (!rows[0]) return reply.code(404).send({ error: 'Oportunidade não encontrada.' })
    contactId = contactId ?? rows[0].contact_id
  }
  const { rows } = await query(
    `INSERT INTO sales (company_id, opportunity_id, contact_id, status, amount, evidence, confirmed_at)
     VALUES ($1, $2, $3, $4, $5, '{"source":"manual"}'::jsonb, CASE WHEN $4 = 'confirmed' THEN now() ELSE NULL END)
     RETURNING id, status, amount, confirmed_at`, [scope.companyId, input.opportunityId ?? null, contactId, input.status, input.amount],
  )
  return reply.code(201).send(rows[0])
})

app.post('/api/sales/:saleId/confirm', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode confirmar vendas.' })
  const params = z.object({ saleId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'Venda inválida.' })
  const sale = await query<{ id: string; opportunity_id: string | null; amount: string }>(
    `UPDATE sales SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now()), updated_at = now()
     WHERE id = $1 AND company_id = $2 AND status IN ('detected', 'negotiation')
     RETURNING id, opportunity_id, amount`,
    [params.data.saleId, scope.companyId],
  )
  if (!sale.rows[0]) return reply.code(404).send({ error: 'Venda em revisão não encontrada.' })
  if (sale.rows[0].opportunity_id) {
    await query(
      `UPDATE opportunities SET stage_id = (
         SELECT ps.id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
         WHERE p.company_id = $2 AND p.is_default = true AND ps.kind = 'won' ORDER BY ps.position LIMIT 1
       ), estimated_value = $3, last_activity_at = now(), updated_at = now()
       WHERE id = $1 AND company_id = $2`,
      [sale.rows[0].opportunity_id, scope.companyId, sale.rows[0].amount],
    )
  }
  return sale.rows[0]
})

const trafficMetricSchema = z.object({
  source: z.string().trim().min(2).max(80),
  platform: z.string().trim().min(2).max(60).default('Meta Ads'),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  spend: z.coerce.number().min(0).max(99_999_999),
  reportedLeads: z.coerce.number().int().min(0).max(99_999_999).default(0),
  impressions: z.coerce.number().int().min(0).max(9_999_999_999).default(0),
  clicks: z.coerce.number().int().min(0).max(9_999_999_999).default(0),
}).refine((input) => input.periodEnd >= input.periodStart, { message: 'O fim do período deve ser posterior ao início.', path: ['periodEnd'] })

app.get('/api/traffic', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query(
    `SELECT tm.id, tm.source, tm.platform, tm.period_start, tm.period_end, tm.spend, tm.reported_leads, tm.impressions, tm.clicks,
       COALESCE((SELECT count(*) FROM opportunities o WHERE o.company_id = tm.company_id AND lower(COALESCE(o.source, '')) = lower(tm.source)
          AND o.created_at >= tm.period_start AND o.created_at < tm.period_end + 1), 0)::text AS crm_leads,
       COALESCE((SELECT count(*) FROM sales s JOIN opportunities o ON o.id = s.opportunity_id WHERE s.company_id = tm.company_id
          AND s.status = 'confirmed' AND lower(COALESCE(o.source, '')) = lower(tm.source)
          AND s.confirmed_at >= tm.period_start AND s.confirmed_at < tm.period_end + 1), 0)::text AS confirmed_sales,
       COALESCE((SELECT sum(s.amount) FROM sales s JOIN opportunities o ON o.id = s.opportunity_id WHERE s.company_id = tm.company_id
          AND s.status = 'confirmed' AND lower(COALESCE(o.source, '')) = lower(tm.source)
          AND s.confirmed_at >= tm.period_start AND s.confirmed_at < tm.period_end + 1), 0)::text AS confirmed_revenue
     FROM traffic_metrics tm WHERE tm.company_id = $1 ORDER BY tm.period_end DESC, tm.created_at DESC`,
    [scope.companyId],
  )
  return rows
})

app.post('/api/traffic', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode registrar métricas de tráfego.' })
  const parsed = trafficMetricSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Confira os dados da campanha.', details: parsed.error.flatten().fieldErrors })
  try {
    const { rows } = await query(
      `INSERT INTO traffic_metrics (company_id, source, platform, period_start, period_end, spend, reported_leads, impressions, clicks, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, source, platform, period_start, period_end, spend, reported_leads, impressions, clicks`,
      [scope.companyId, parsed.data.source, parsed.data.platform, parsed.data.periodStart, parsed.data.periodEnd, parsed.data.spend, parsed.data.reportedLeads, parsed.data.impressions, parsed.data.clicks, scope.userId],
    )
    return reply.code(201).send(rows[0])
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'Já existe uma métrica para esta origem, plataforma e período.' })
    throw error
  }
})

const reportPeriodSchema = z.object({ start: z.string().date().optional(), end: z.string().date().optional() })

app.get('/api/reports', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const parsed = reportPeriodSchema.safeParse(request.query)
  if (!parsed.success) return reply.code(400).send({ error: 'Período inválido.' })
  const end = parsed.data.end ?? new Date().toISOString().slice(0, 10)
  const start = parsed.data.start ?? `${end.slice(0, 8)}01`
  if (end < start) return reply.code(400).send({ error: 'O fim do período deve ser posterior ao início.' })
  const [totals, sources, pipeline] = await Promise.all([
    query<{ revenue: string; sales: string; leads: string; ticket: string }>(
      `SELECT COALESCE((SELECT sum(amount) FROM sales WHERE company_id = $1 AND status = 'confirmed' AND confirmed_at >= $2::date AND confirmed_at < $3::date + 1), 0)::text AS revenue,
       (SELECT count(*) FROM sales WHERE company_id = $1 AND status = 'confirmed' AND confirmed_at >= $2::date AND confirmed_at < $3::date + 1)::text AS sales,
       (SELECT count(*) FROM opportunities WHERE company_id = $1 AND created_at >= $2::date AND created_at < $3::date + 1)::text AS leads,
       COALESCE((SELECT avg(amount) FROM sales WHERE company_id = $1 AND status = 'confirmed' AND confirmed_at >= $2::date AND confirmed_at < $3::date + 1), 0)::text AS ticket`,
      [scope.companyId, start, end],
    ),
    query(
      `WITH sources AS (
         SELECT DISTINCT source FROM traffic_metrics WHERE company_id = $1 AND period_start <= $3::date AND period_end >= $2::date
         UNION
         SELECT DISTINCT COALESCE(source, 'Sem origem') FROM opportunities WHERE company_id = $1 AND created_at >= $2::date AND created_at < $3::date + 1
       )
       SELECT source,
         COALESCE((SELECT sum(spend) FROM traffic_metrics tm WHERE tm.company_id = $1 AND lower(tm.source) = lower(sources.source) AND tm.period_start <= $3::date AND tm.period_end >= $2::date), 0)::text AS spend,
         (SELECT count(*) FROM opportunities o WHERE o.company_id = $1 AND lower(COALESCE(o.source, 'Sem origem')) = lower(sources.source) AND o.created_at >= $2::date AND o.created_at < $3::date + 1)::text AS leads,
         (SELECT count(*) FROM sales sl JOIN opportunities o ON o.id = sl.opportunity_id WHERE sl.company_id = $1 AND sl.status = 'confirmed' AND lower(COALESCE(o.source, 'Sem origem')) = lower(sources.source) AND sl.confirmed_at >= $2::date AND sl.confirmed_at < $3::date + 1)::text AS sales,
         COALESCE((SELECT sum(sl.amount) FROM sales sl JOIN opportunities o ON o.id = sl.opportunity_id WHERE sl.company_id = $1 AND sl.status = 'confirmed' AND lower(COALESCE(o.source, 'Sem origem')) = lower(sources.source) AND sl.confirmed_at >= $2::date AND sl.confirmed_at < $3::date + 1), 0)::text AS revenue
       FROM sources ORDER BY revenue::numeric DESC, leads::integer DESC`,
      [scope.companyId, start, end],
    ),
    query(
      `SELECT ps.name, ps.kind, count(o.id)::text AS total FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
       LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.company_id = $1
       WHERE p.company_id = $1 AND p.is_default = true GROUP BY ps.id ORDER BY ps.position`,
      [scope.companyId],
    ),
  ])
  return { period: { start, end }, totals: totals.rows[0], sources: sources.rows, pipeline: pipeline.rows }
})

app.get('/api/notifications', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const [channels, leads] = await Promise.all([
    query<{ id: string; name: string; status: string; last_event_at: string | null }>(
      `SELECT c.id, c.name, c.status, wc.last_event_at FROM whatsapp_channels c LEFT JOIN whatsapp_connections wc ON wc.channel_id = c.id
       WHERE c.company_id = $1 AND (c.status IN ('disconnected', 'error') OR (c.status = 'connected' AND (wc.last_event_at IS NULL OR wc.last_event_at < now() - interval '24 hours')))` , [scope.companyId]),
    query<{ id: string; title: string; name: string | null; last_activity_at: string | null }>(
      `SELECT o.id, o.title, c.name, o.last_activity_at FROM opportunities o JOIN pipeline_stages ps ON ps.id = o.stage_id LEFT JOIN contacts c ON c.id = o.contact_id
       WHERE o.company_id = $1 AND ps.kind = 'open' AND o.last_activity_at < now() - interval '24 hours' ORDER BY o.last_activity_at ASC LIMIT 8`, [scope.companyId]),
  ])
  const notifications = [
    ...channels.rows.map((channel) => ({ id: `channel-${channel.id}`, type: 'channel', title: `${channel.name} precisa de atenção`, body: channel.status === 'connected' ? 'O número está há mais de 24 horas sem novos eventos.' : 'O canal está desconectado ou apresentou erro.', action: 'Abrir configurações' })),
    ...leads.rows.map((lead) => ({ id: `lead-${lead.id}`, type: 'lead', title: `${lead.name ?? lead.title} está sem retorno`, body: 'Este lead permanece em uma etapa aberta há mais de 24 horas.', action: 'Abrir CRM' })),
  ]
  if (scope.accessState === 'trial' && scope.trialEndsAt) {
    const days = Math.ceil((new Date(scope.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    if (days <= 2) notifications.unshift({ id: 'trial-ending', type: 'trial', title: days <= 0 ? 'Seu teste terminou' : `Seu teste termina em ${days} dia${days === 1 ? '' : 's'}`, body: 'Escolha um plano para manter seus dados e integrações ativos.', action: 'Ver planos' })
  }
  return notifications
})

const connectionSchema = z.object({
  provider: z.enum(['meta_cloud', 'uazapi']),
  channelName: z.string().min(2).max(80),
  phoneNumber: z.string().min(6).max(30).optional(),
  phoneNumberId: z.string().min(2).max(100).optional(),
  externalAccountId: z.string().max(100).optional(),
  serverUrl: z.string().url().max(300).optional(),
  accessToken: z.string().min(10).max(4096).optional(),
})

const evolutionConnectionSchema = z.object({ channelName: z.string().trim().min(2).max(80) })

const chatbotPlan = (plan: string) => plan === 'chatbot'

app.get('/api/integrations/whatsapp', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query(
    `SELECT c.id, c.name, c.phone_number, c.status, wc.provider, wc.phone_number_id, wc.external_account_id, wc.connected_at, wc.last_event_at
     FROM whatsapp_channels c LEFT JOIN whatsapp_connections wc ON wc.channel_id = c.id
     WHERE c.company_id = $1 ORDER BY c.created_at DESC`, [scope.companyId],
  )
  return rows
})

app.post('/api/integrations/whatsapp', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode alterar integrações.' })
  const parsed = connectionSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Dados da conexão inválidos.', details: parsed.error.flatten().fieldErrors })
  const input = parsed.data
  if (input.provider === 'uazapi') {
    const { rows } = await query<{ plan: string; uses_automation: boolean }>(
      `SELECT plan, COALESCE((onboarding ->> 'usesOtimizaAutomation')::boolean, false) AS uses_automation
       FROM companies WHERE id = $1`, [scope.companyId],
    )
    const access = rows[0]
    if (!access || !(chatbotPlan(access.plan) || scope.role === 'otimiza_admin')) {
      return reply.code(403).send({ error: 'A instância UAZAPI é configurada pelo cliente somente no plano Chatbot. Para Automação, a configuração é feita pela equipe Otimiza AI.' })
    }
  }
  let result: { channelId: string; connectionId: string; webhookSecret: string }
  try {
    result = await transaction(async (client) => {
      const company = await client.query<{ channel_limit: number }>('SELECT channel_limit FROM companies WHERE id = $1 FOR UPDATE', [scope.companyId])
      const channelLimit = company.rows[0]?.channel_limit ?? 1
      const count = await client.query<{ total: string }>('SELECT count(*)::text AS total FROM whatsapp_channels WHERE company_id = $1', [scope.companyId])
      if (Number(count.rows[0]?.total ?? 0) >= channelLimit) throw new Error('CHANNEL_LIMIT')
      const pipeline = await client.query<{ id: string }>('SELECT id FROM pipelines WHERE company_id = $1 AND is_default = true LIMIT 1', [scope.companyId])
      const channel = await client.query<{ id: string }>(
        `INSERT INTO whatsapp_channels (company_id, pipeline_id, name, phone_number, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`, [scope.companyId, pipeline.rows[0]?.id ?? null, input.channelName, input.phoneNumber ?? null],
      )
      const connection = await client.query<{ id: string; webhook_secret: string }>(
        `INSERT INTO whatsapp_connections (channel_id, provider, phone_number_id, external_account_id, access_token_encrypted, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id, webhook_secret`,
        [channel.rows[0].id, input.provider, input.phoneNumberId ?? null, input.externalAccountId ?? null, input.accessToken ? encryptSecret(input.accessToken) : null, JSON.stringify({ serverUrl: input.serverUrl?.replace(/\/$/, '') ?? null })],
      )
      return { channelId: channel.rows[0].id, connectionId: connection.rows[0].id, webhookSecret: connection.rows[0].webhook_secret }
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'CHANNEL_LIMIT') return reply.code(409).send({ error: 'Seu plano já atingiu o limite de números de WhatsApp.' })
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'Já existe um canal com esse nome.' })
    throw error
  }
  const webhookPath = input.provider === 'uazapi' ? `/webhooks/uazapi/${result.connectionId}` : '/webhooks/meta'
  let webhookConfigured: boolean | undefined
  let setupError: string | undefined
  if (input.provider === 'uazapi' && input.serverUrl && input.accessToken) {
    const forwardedProtocol = String(request.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim()
    const callbackUrl = `${forwardedProtocol}://${request.headers.host}${webhookPath}?secret=${result.webhookSecret}`
    try {
      const response = await fetch(`${input.serverUrl.replace(/\/$/, '')}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: input.accessToken },
        body: JSON.stringify({ enabled: true, url: callbackUrl, events: ['messages', 'messages_update', 'connection'], excludeMessages: ['wasSentByApi', 'isGroupYes'], addUrlEvents: false, addUrlTypesMessages: false }),
        signal: AbortSignal.timeout(10_000),
      })
      webhookConfigured = response.ok
      if (!response.ok) {
        setupError = 'A instância foi salva, mas a UAZAPI não aceitou o webhook. Confira a Server URL e o token.'
        await query(`UPDATE whatsapp_channels SET status = 'error', updated_at = now() WHERE id = $1`, [result.channelId])
      }
    } catch {
      webhookConfigured = false
      setupError = 'A instância foi salva, mas não foi possível alcançar a UAZAPI. Confira a Server URL e o token.'
      await query(`UPDATE whatsapp_channels SET status = 'error', updated_at = now() WHERE id = $1`, [result.channelId])
    }
  }
  return reply.code(201).send({ ...result, webhookPath, webhookConfigured, setupError })
})

const evolutionConnection = async (channelId: string, companyId: string) => {
  const { rows } = await query<{ id: string; channel_id: string; external_account_id: string; access_token_encrypted: string; webhook_secret: string; status: string }>(
    `SELECT wc.id, wc.channel_id, wc.external_account_id, wc.access_token_encrypted, wc.webhook_secret, c.status
     FROM whatsapp_connections wc JOIN whatsapp_channels c ON c.id = wc.channel_id
     WHERE c.id = $1 AND c.company_id = $2 AND wc.provider = 'evolution'`, [channelId, companyId],
  )
  return rows[0]
}

const setupEvolution = async (connection: NonNullable<Awaited<ReturnType<typeof evolutionConnection>>>, createFirst = false) => {
  const instanceToken = decryptSecret(connection.access_token_encrypted)
  if (createFirst) {
    await createEvolutionInstance(connection.external_account_id, instanceToken)
  } else {
    try {
      await evolutionState(connection.external_account_id, instanceToken)
    } catch (error) {
      if (!(error instanceof EvolutionError) || error.status !== 404) throw error
      await createEvolutionInstance(connection.external_account_id, instanceToken)
    }
  }
  const callback = `${config.crmPublicUrl}/webhooks/evolution/${connection.id}?secret=${connection.webhook_secret}`
  await setEvolutionWebhook(connection.external_account_id, instanceToken, callback)
  const state = await evolutionState(connection.external_account_id, instanceToken)
  const status = state === 'open' ? 'connected' : 'pending'
  await query(`UPDATE whatsapp_channels SET status = $1, updated_at = now() WHERE id = $2`, [status, connection.channel_id])
  return status
}

app.post('/api/integrations/evolution', { preHandler: authenticate, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode conectar canais.' })
  if (!evolutionConfigured()) return reply.code(503).send({ error: 'A Evolution ainda não foi configurada no serviço do CRM.' })
  const parsed = evolutionConnectionSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Informe o nome do canal.' })
  const instanceName = `otimiza-${scope.companyId.replace(/-/g, '').slice(0, 8)}-${randomUUID().slice(0, 8)}`
  const instanceToken = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  let created: { channelId: string; connectionId: string }
  try {
    created = await transaction(async (client) => {
      const company = await client.query<{ channel_limit: number }>('SELECT channel_limit FROM companies WHERE id = $1 FOR UPDATE', [scope.companyId])
      const limit = company.rows[0]?.channel_limit ?? 1
      const count = await client.query<{ total: string }>('SELECT count(*)::text AS total FROM whatsapp_channels WHERE company_id = $1', [scope.companyId])
      if (Number(count.rows[0]?.total ?? 0) >= limit) throw new Error('CHANNEL_LIMIT')
      const channel = await client.query<{ id: string }>(
        `INSERT INTO whatsapp_channels (company_id, pipeline_id, name, status)
         VALUES ($1, (SELECT id FROM pipelines WHERE company_id = $1 AND is_default = true LIMIT 1), $2, 'pending') RETURNING id`,
        [scope.companyId, parsed.data.channelName],
      )
      const connection = await client.query<{ id: string }>(
        `INSERT INTO whatsapp_connections (channel_id, provider, external_account_id, access_token_encrypted)
         VALUES ($1, 'evolution', $2, $3) RETURNING id`,
        [channel.rows[0].id, instanceName, encryptSecret(instanceToken)],
      )
      return { channelId: channel.rows[0].id, connectionId: connection.rows[0].id }
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'CHANNEL_LIMIT') return reply.code(409).send({ error: 'Seu plano já atingiu o limite de números de WhatsApp.' })
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'Já existe um canal com esse nome.' })
    throw error
  }
  const connection = await evolutionConnection(created.channelId, scope.companyId)
  if (!connection) throw new Error('A conexão Evolution não foi criada.')
  try {
    const status = await setupEvolution(connection, true)
    return reply.code(201).send({ ...created, status })
  } catch (error) {
    app.log.error({ error, channelId: created.channelId }, 'Falha ao configurar instância Evolution')
    await query(`UPDATE whatsapp_channels SET status = 'error', updated_at = now() WHERE id = $1`, [created.channelId])
    return reply.code(201).send({ ...created, status: 'error', setupError: 'O canal foi salvo, mas a Evolution não concluiu a conexão. Use Tentar novamente.' })
  }
})

app.post('/api/integrations/evolution/:channelId/retry', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode alterar canais.' })
  const params = z.object({ channelId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'Canal inválido.' })
  const connection = await evolutionConnection(params.data.channelId, scope.companyId)
  if (!connection) return reply.code(404).send({ error: 'Canal Evolution não encontrado.' })
  try {
    return { status: await setupEvolution(connection) }
  } catch (error) {
    app.log.error({ error, channelId: connection.channel_id }, 'Falha ao reconectar Evolution')
    await query(`UPDATE whatsapp_channels SET status = 'error', updated_at = now() WHERE id = $1`, [connection.channel_id])
    return reply.code(502).send({ error: 'A Evolution não respondeu à tentativa de conexão.' })
  }
})

app.get('/api/integrations/evolution/:channelId/status', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  const params = z.object({ channelId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'Canal inválido.' })
  const connection = await evolutionConnection(params.data.channelId, scope.companyId)
  if (!connection) return reply.code(404).send({ error: 'Canal Evolution não encontrado.' })
  try {
    const state = await evolutionState(connection.external_account_id, decryptSecret(connection.access_token_encrypted))
    const status = state === 'open' ? 'connected' : state === 'connecting' ? 'pending' : 'disconnected'
    if (status !== connection.status) await query(`UPDATE whatsapp_channels SET status = $1, updated_at = now() WHERE id = $2`, [status, connection.channel_id])
    return { status }
  } catch (error) {
    app.log.warn({ error, channelId: connection.channel_id }, 'Falha ao consultar estado Evolution')
    return reply.code(502).send({ error: 'Não foi possível consultar a Evolution agora.' })
  }
})

app.get('/api/integrations/evolution/:channelId/qr', { preHandler: authenticate, config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode conectar canais.' })
  const params = z.object({ channelId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'Canal inválido.' })
  const connection = await evolutionConnection(params.data.channelId, scope.companyId)
  if (!connection) return reply.code(404).send({ error: 'Canal Evolution não encontrado.' })
  try {
    const token = decryptSecret(connection.access_token_encrypted)
    const state = await evolutionState(connection.external_account_id, token)
    if (state === 'open') return { status: 'connected', qrCode: null }
    return { status: 'pending', qrCode: await evolutionQr(connection.external_account_id, token) }
  } catch (error) {
    app.log.warn({ error, channelId: connection.channel_id }, 'Falha ao gerar QR Evolution')
    return reply.code(502).send({ error: 'Não foi possível gerar o QR Code. Tente novamente.' })
  }
})

app.post('/api/integrations/uazapi/request', { preHandler: authenticate }, async (request, reply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return
  if (!['owner', 'manager', 'otimiza_admin'].includes(scope.role)) return reply.code(403).send({ error: 'Você não pode solicitar uma conexão.' })
  const { rows } = await query<{ plan: string; uses_automation: boolean }>(
    `SELECT plan, COALESCE((onboarding ->> 'usesOtimizaAutomation')::boolean, false) AS uses_automation
     FROM companies WHERE id = $1`, [scope.companyId],
  )
  const company = rows[0]
  if (!company || !(company.uses_automation || company.plan === 'automation')) {
    return reply.code(403).send({ error: 'Esta solicitação é exclusiva para o plano Automação da Otimiza AI.' })
  }
  const requestedAt = new Date().toISOString()
  await query(
    `UPDATE companies SET onboarding = jsonb_set(onboarding, '{uazapiConnectionRequestedAt}', to_jsonb($2::text), true), updated_at = now()
     WHERE id = $1`, [scope.companyId, requestedAt],
  )
  await query(
    `INSERT INTO audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'uazapi_connection_requested', 'company', $1, '{}'::jsonb)`, [scope.companyId, scope.userId],
  )
  return reply.code(202).send({ requestedAt })
})

const chatbotScope = async (request: FastifyRequest, reply: FastifyReply) => {
  const scope = await companyScope(request, reply)
  if (!scope) return null
  const { rows } = await query<{ plan: string }>('SELECT plan FROM companies WHERE id = $1', [scope.companyId])
  if (!rows[0] || !(chatbotPlan(rows[0].plan) || scope.role === 'otimiza_admin')) {
    reply.code(403).send({ error: 'Este recurso está disponível no plano Chatbot.' })
    return null
  }
  return scope
}

app.get('/api/chatbot', { preHandler: authenticate }, async (request, reply) => {
  const scope = await chatbotScope(request, reply)
  if (!scope) return
  const [settings, channels, rules] = await Promise.all([
    query<{ is_active: boolean; welcome_message: string | null; fallback_message: string | null }>('SELECT is_active, welcome_message, fallback_message FROM chatbot_settings WHERE company_id = $1', [scope.companyId]),
    query<{ id: string; name: string; phone_number: string | null; status: string; provider: string }>(`SELECT c.id, c.name, c.phone_number, c.status, wc.provider FROM whatsapp_channels c JOIN whatsapp_connections wc ON wc.channel_id = c.id WHERE c.company_id = $1 AND wc.provider IN ('uazapi', 'evolution') ORDER BY c.created_at DESC`, [scope.companyId]),
    query<{ id: string; channel_id: string; name: string; trigger_type: 'keyword' | 'first_message'; trigger_value: string | null; response_text: string; is_active: boolean; position: number }>('SELECT id, channel_id, name, trigger_type, trigger_value, response_text, is_active, position FROM chatbot_rules WHERE company_id = $1 ORDER BY position, created_at', [scope.companyId]),
  ])
  return { settings: settings.rows[0] ?? { is_active: false, welcome_message: '', fallback_message: '' }, channels: channels.rows, rules: rules.rows }
})

const chatbotSettingsSchema = z.object({ isActive: z.boolean(), welcomeMessage: z.string().max(2000).optional(), fallbackMessage: z.string().max(2000).optional() })
app.put('/api/chatbot/settings', { preHandler: authenticate }, async (request, reply) => {
  const scope = await chatbotScope(request, reply)
  if (!scope) return
  const parsed = chatbotSettingsSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Configuração do chatbot inválida.' })
  const input = parsed.data
  const { rows } = await query(
    `INSERT INTO chatbot_settings (company_id, is_active, welcome_message, fallback_message)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id) DO UPDATE SET is_active = EXCLUDED.is_active, welcome_message = EXCLUDED.welcome_message, fallback_message = EXCLUDED.fallback_message, updated_at = now()
     RETURNING is_active, welcome_message, fallback_message`, [scope.companyId, input.isActive, input.welcomeMessage ?? null, input.fallbackMessage ?? null],
  )
  return rows[0]
})

const chatbotRuleSchema = z.object({ channelId: z.string().uuid(), name: z.string().min(2).max(100), triggerType: z.enum(['keyword', 'first_message']), triggerValue: z.string().max(160).optional(), responseText: z.string().min(1).max(2000) })
app.post('/api/chatbot/rules', { preHandler: authenticate }, async (request, reply) => {
  const scope = await chatbotScope(request, reply)
  if (!scope) return
  const parsed = chatbotRuleSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Regra do chatbot inválida.' })
  const input = parsed.data
  const channel = await query<{ id: string }>(`SELECT c.id FROM whatsapp_channels c JOIN whatsapp_connections wc ON wc.channel_id = c.id WHERE c.id = $1 AND c.company_id = $2 AND wc.provider IN ('uazapi', 'evolution')`, [input.channelId, scope.companyId])
  if (!channel.rows[0]) return reply.code(404).send({ error: 'Número WhatsApp não encontrado.' })
  if (input.triggerType === 'keyword' && !input.triggerValue?.trim()) return reply.code(400).send({ error: 'Informe a palavra-chave da regra.' })
  const { rows } = await query(
    `INSERT INTO chatbot_rules (company_id, channel_id, name, trigger_type, trigger_value, response_text, position)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(max(position), 0) + 1 FROM chatbot_rules WHERE company_id = $1))
     RETURNING id, channel_id, name, trigger_type, trigger_value, response_text, is_active, position`, [scope.companyId, input.channelId, input.name, input.triggerType, input.triggerValue?.trim() ?? null, input.responseText],
  )
  return reply.code(201).send(rows[0])
})

app.delete('/api/chatbot/rules/:ruleId', { preHandler: authenticate }, async (request, reply) => {
  const scope = await chatbotScope(request, reply)
  if (!scope) return
  const params = z.object({ ruleId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'Regra inválida.' })
  await query('DELETE FROM chatbot_rules WHERE id = $1 AND company_id = $2', [params.data.ruleId, scope.companyId])
  return reply.code(204).send()
})

const safeEqual = (a: string, b: string) => {
  const first = Buffer.from(a)
  const second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const uazapiTimestamp = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date()
  return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
}

const ensureInboundOpportunity = async ({ companyId, channelId, contactId, title, source }: { companyId: string; channelId: string; contactId: string; title: string; source: string }) => {
  const stage = await getStage(companyId)
  await query(
    `INSERT INTO opportunities (company_id, pipeline_id, stage_id, contact_id, channel_id, title, source, last_activity_at)
     SELECT $1, $2, $3, $4, $5, $6, $7, now()
     WHERE NOT EXISTS (
       SELECT 1 FROM opportunities WHERE company_id = $1 AND contact_id = $4
     )`,
    [companyId, stage.pipeline_id, stage.id, contactId, channelId, title, source],
  )
}

const saveWhatsAppMessage = async (connection: { id: string; company_id: string; channel_id: string }, payload: Record<string, unknown>) => {
  const data = record(payload.data ?? payload.message ?? payload)
  const key = record(data.key)
  const message = record(data.message)
  const remoteCandidates = [key.remoteJid, key.remoteJidAlt, data.remoteJid, data.chatid, data.chatId, data.from, data.number]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
  const remoteId = remoteCandidates.find((value) => value.endsWith('@s.whatsapp.net') || value.endsWith('@c.us'))
    ?? remoteCandidates.find((value) => !value.endsWith('@lid')) ?? ''
  const isGroup = Boolean(data.wa_isGroup ?? data.isGroup) || remoteId.endsWith('@g.us') || remoteId.endsWith('@broadcast')
  const phone = remoteId.split('@')[0].replace(/\D/g, '')
  const externalId = String(key.id ?? data.id ?? data.messageId ?? '')
  if (!phone || phone.length < 8 || !externalId || isGroup) return false
  const fromMe = Boolean(key.fromMe ?? data.fromMe ?? data.from_me)
  const pushName = String(data.pushName ?? data.push_name ?? data.senderName ?? data.name ?? '') || null
  const body = pickText(data.text) ?? pickText(message) ?? pickText(data.content)
  const messageType = String(data.type ?? data.messageType ?? Object.keys(message)[0] ?? 'text')
  const sentAt = uazapiTimestamp(data.timestamp ?? data.messageTimestamp ?? key.timestamp)
  const contact = await query<{ id: string }>(
    `INSERT INTO contacts (company_id, phone_e164, name, first_source, last_source)
     VALUES ($1, $2, $3, 'WhatsApp', 'WhatsApp')
     ON CONFLICT (company_id, phone_e164) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), last_seen_at = now(), updated_at = now()
     RETURNING id`, [connection.company_id, phone, pushName],
  )
  if (!fromMe) await ensureInboundOpportunity({ companyId: connection.company_id, channelId: connection.channel_id, contactId: contact.rows[0].id, title: pushName ?? `Lead ${phone}`, source: 'WhatsApp' })
  const conversation = await query<{ id: string }>(
    `INSERT INTO conversations (company_id, channel_id, contact_id, external_id, last_message_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (channel_id, external_id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at, updated_at = now()
     RETURNING id`, [connection.company_id, connection.channel_id, contact.rows[0].id, remoteId, sentAt],
  )
  const insertedMessage = await query<{ id: string }>(
    `INSERT INTO messages (company_id, conversation_id, external_id, direction, message_type, body, sent_at, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (conversation_id, external_id) DO NOTHING RETURNING id`,
    [connection.company_id, conversation.rows[0].id, externalId, fromMe ? 'outbound' : 'inbound', messageType, body, sentAt, JSON.stringify(payload)],
  )
  return { inbound: !fromMe, isNew: Boolean(insertedMessage.rows[0]), body, phone, conversationId: conversation.rows[0].id }
}

const sendChatbotResponse = async (connection: { id: string; company_id: string; channel_id: string; provider: string; external_account_id?: string | null; access_token_encrypted: string | null; metadata: unknown }, incoming: { body: string | null; phone: string; conversationId: string }) => {
  const metadata = record(connection.metadata)
  const serverUrl = typeof metadata.serverUrl === 'string' ? metadata.serverUrl.replace(/\/$/, '') : ''
  if (!connection.access_token_encrypted) return
  if (connection.provider === 'uazapi' && !serverUrl) return
  if (connection.provider === 'evolution' && !connection.external_account_id) return
  const { rows: settingsRows } = await query<{ is_active: boolean; fallback_message: string | null }>('SELECT is_active, fallback_message FROM chatbot_settings WHERE company_id = $1', [connection.company_id])
  const settings = settingsRows[0]
  if (!settings?.is_active) return
  const [{ rows: countRows }, { rows: rules }] = await Promise.all([
    query<{ total: string }>(`SELECT count(*)::text AS total FROM messages WHERE conversation_id = $1 AND direction = 'inbound'`, [incoming.conversationId]),
    query<{ id: string; trigger_type: 'keyword' | 'first_message'; trigger_value: string | null; response_text: string }>(`SELECT id, trigger_type, trigger_value, response_text FROM chatbot_rules WHERE company_id = $1 AND channel_id = $2 AND is_active = true ORDER BY position, created_at`, [connection.company_id, connection.channel_id]),
  ])
  const normalizedBody = incoming.body?.toLocaleLowerCase('pt-BR') ?? ''
  const rule = rules.find((item) => item.trigger_type === 'keyword' && item.trigger_value && normalizedBody.includes(item.trigger_value.toLocaleLowerCase('pt-BR')))
    ?? (Number(countRows[0]?.total ?? 0) === 1 ? rules.find((item) => item.trigger_type === 'first_message') : undefined)
  const responseText = rule?.response_text ?? settings.fallback_message
  if (!responseText?.trim()) return
  if (connection.provider === 'evolution') {
    await evolutionSendText(connection.external_account_id!, decryptSecret(connection.access_token_encrypted), incoming.phone, responseText)
  } else {
    const response = await fetch(`${serverUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: decryptSecret(connection.access_token_encrypted) },
      body: JSON.stringify({ number: incoming.phone, text: responseText }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`UAZAPI respondeu ${response.status} ao enviar mensagem do chatbot`)
  }
  await query(
    `INSERT INTO messages (company_id, conversation_id, external_id, direction, message_type, body, sent_at, raw_payload)
     VALUES ($1, $2, $3, 'outbound', 'text', $4, now(), $5::jsonb)`,
    [connection.company_id, incoming.conversationId, `chatbot:${randomUUID()}`, responseText, JSON.stringify({ source: 'chatbot', ruleId: rule?.id ?? null })],
  )
}

const metaSignatureValid = (request: FastifyRequest) => {
  const secret = process.env.META_APP_SECRET
  if (!secret) return config.nodeEnv !== 'production'
  const received = request.headers['x-hub-signature-256']
  const raw = (request as FastifyRequest & { rawBody?: Buffer }).rawBody
  if (typeof received !== 'string' || !raw) return false
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  return safeEqual(received, expected)
}

app.get('/webhooks/meta', async (request, reply) => {
  const queryString = request.query as Record<string, string | undefined>
  if (!config.metaVerifyToken || queryString['hub.mode'] !== 'subscribe' || !queryString['hub.verify_token'] || !safeEqual(queryString['hub.verify_token'], config.metaVerifyToken)) return reply.code(403).send()
  return reply.type('text/plain').send(queryString['hub.challenge'] ?? '')
})

app.post('/webhooks/meta', { config: { rawBody: true } }, async (request, reply) => {
  if (!metaSignatureValid(request)) return reply.code(401).send({ error: 'Assinatura Meta inválida.' })
  const payload = request.body as Record<string, unknown>
  const entries = Array.isArray(payload.entry) ? payload.entry as Array<Record<string, unknown>> : []
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes as Array<Record<string, unknown>> : []
    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined
      const metadata = value?.metadata as Record<string, string> | undefined
      const phoneNumberId = metadata?.phone_number_id
      if (!phoneNumberId) continue
      const connectionResult = await query<{ id: string; company_id: string; channel_id: string }>(
        `SELECT wc.id, c.company_id, wc.channel_id FROM whatsapp_connections wc JOIN whatsapp_channels c ON c.id = wc.channel_id
         WHERE wc.provider = 'meta_cloud' AND wc.phone_number_id = $1`, [phoneNumberId],
      )
      const connection = connectionResult.rows[0]
      if (!connection) continue
      const messages = Array.isArray(value?.messages) ? value.messages as Array<Record<string, unknown>> : []
      for (const message of messages) {
        const externalId = String(message.id ?? '')
        if (!externalId) continue
        const inserted = await query<{ id: string }>(
          `INSERT INTO integration_events (company_id, connection_id, provider, external_event_id, event_type, payload)
           VALUES ($1, $2, 'meta_cloud', $3, 'message', $4::jsonb)
           ON CONFLICT (provider, external_event_id) DO NOTHING RETURNING id`, [connection.company_id, connection.id, externalId, JSON.stringify(message)],
        )
        if (!inserted.rows[0]) continue
        const contacts = Array.isArray(value?.contacts) ? value.contacts as Array<Record<string, unknown>> : []
        const contactPayload = contacts.find((contact) => String(contact.wa_id ?? '') === String(message.from ?? ''))
        const phone = String(message.from ?? '')
        const contact = await query<{ id: string }>(
          `INSERT INTO contacts (company_id, phone_e164, name, first_source, last_source)
           VALUES ($1, $2, $3, 'WhatsApp', 'WhatsApp')
           ON CONFLICT (company_id, phone_e164) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), last_seen_at = now(), updated_at = now()
           RETURNING id`, [connection.company_id, phone, String(contactPayload?.profile && (contactPayload.profile as Record<string, unknown>).name || '') || null],
        )
        await ensureInboundOpportunity({ companyId: connection.company_id, channelId: connection.channel_id, contactId: contact.rows[0].id, title: String(contactPayload?.profile && (contactPayload.profile as Record<string, unknown>).name || `Lead ${phone}`), source: 'WhatsApp' })
        const conversation = await query<{ id: string }>(
          `INSERT INTO conversations (company_id, channel_id, contact_id, external_id, last_message_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (channel_id, external_id) DO UPDATE SET last_message_at = now(), updated_at = now()
           RETURNING id`, [connection.company_id, connection.channel_id, contact.rows[0].id, phone],
        )
        const body = typeof message.text === 'object' && message.text ? String((message.text as Record<string, unknown>).body ?? '') : null
        await query(
          `INSERT INTO messages (company_id, conversation_id, external_id, direction, message_type, body, sent_at, raw_payload)
           VALUES ($1, $2, $3, 'inbound', $4, $5, to_timestamp($6), $7::jsonb)
           ON CONFLICT (conversation_id, external_id) DO NOTHING`,
          [connection.company_id, conversation.rows[0].id, externalId, String(message.type ?? 'text'), body, Number(message.timestamp ?? Math.floor(Date.now() / 1000)), JSON.stringify(message)],
        )
        await query('UPDATE whatsapp_connections SET last_event_at = now(), updated_at = now() WHERE id = $1', [connection.id])
      }
    }
  }
  return reply.code(200).send({ received: true })
})

app.post('/webhooks/uazapi/:connectionId', async (request, reply) => {
  const { connectionId } = request.params as { connectionId: string }
  const querySecret = (request.query as { secret?: string }).secret
  const sentSecret = request.headers['x-otimiza-webhook-secret'] ?? querySecret
  const { rows } = await query<{ id: string; company_id: string; channel_id: string; provider: string; webhook_secret: string; access_token_encrypted: string | null; metadata: unknown }>(
    `SELECT wc.id, c.company_id, wc.channel_id, wc.provider, wc.webhook_secret, wc.access_token_encrypted, wc.metadata FROM whatsapp_connections wc JOIN whatsapp_channels c ON c.id = wc.channel_id
     WHERE wc.id = $1 AND wc.provider = 'uazapi'`, [connectionId],
  )
  const connection = rows[0]
  if (!connection || typeof sentSecret !== 'string' || !safeEqual(sentSecret, connection.webhook_secret)) return reply.code(401).send({ error: 'Webhook não autorizado.' })
  const payload = request.body as Record<string, unknown>
  const externalEventId = String(payload.id ?? payload.event_id ?? createHmac('sha256', connection.webhook_secret).update(JSON.stringify(payload)).digest('hex'))
  await query(
    `INSERT INTO integration_events (company_id, connection_id, provider, external_event_id, event_type, payload)
     VALUES ($1, $2, 'uazapi', $3, $4, $5::jsonb) ON CONFLICT (provider, external_event_id) DO NOTHING`,
    [connection.company_id, connection.id, externalEventId, String(payload.event ?? 'event'), JSON.stringify(payload)],
  )
  const event = String(payload.event ?? payload.type ?? '').toLowerCase()
  if (event.includes('message') || record(payload.data ?? payload.message).key || record(payload.data ?? payload.message).message) {
    const incoming = await saveWhatsAppMessage(connection, payload)
    if (incoming && incoming.inbound && incoming.isNew) void sendChatbotResponse(connection, incoming).catch((error) => app.log.error(error, 'Não foi possível enviar resposta do chatbot'))
  }
  if (event.includes('connection')) {
    const status = String(record(payload.data).status ?? payload.status ?? '').toLowerCase()
    if (status) await query(`UPDATE whatsapp_channels SET status = $1, updated_at = now() WHERE id = $2`, [status.includes('connect') && !status.includes('disconnect') ? 'connected' : 'disconnected', connection.channel_id])
  }
  await query('UPDATE whatsapp_connections SET last_event_at = now(), updated_at = now() WHERE id = $1', [connection.id])
  return reply.code(202).send({ received: true })
})

app.post('/webhooks/evolution/:connectionId', { config: { logLevel: 'warn' } }, async (request, reply) => {
  const params = z.object({ connectionId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'Conexão inválida.' })
  const sentSecret = request.headers['x-otimiza-webhook-secret'] ?? (request.query as { secret?: string }).secret
  const { rows } = await query<{ id: string; company_id: string; channel_id: string; provider: string; external_account_id: string; webhook_secret: string; access_token_encrypted: string | null; metadata: unknown }>(
    `SELECT wc.id, c.company_id, wc.channel_id, wc.provider, wc.external_account_id, wc.webhook_secret, wc.access_token_encrypted, wc.metadata
     FROM whatsapp_connections wc JOIN whatsapp_channels c ON c.id = wc.channel_id
     WHERE wc.id = $1 AND wc.provider = 'evolution'`, [params.data.connectionId],
  )
  const connection = rows[0]
  if (!connection || typeof sentSecret !== 'string' || !safeEqual(sentSecret, connection.webhook_secret)) return reply.code(401).send({ error: 'Webhook não autorizado.' })
  const payload = record(request.body)
  if (payload.instance !== connection.external_account_id) return reply.code(403).send({ error: 'Instância inválida.' })
  const event = String(payload.event ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const data = record(payload.data)
  const messageId = String(record(data.key).id ?? data.id ?? '')
  const externalEventId = `${connection.id}:${event}:${messageId || createHmac('sha256', connection.webhook_secret).update(JSON.stringify(payload)).digest('hex')}`
  const inserted = await query<{ id: string }>(
    `INSERT INTO integration_events (company_id, connection_id, provider, external_event_id, event_type, payload)
     VALUES ($1, $2, 'evolution', $3, $4, $5::jsonb)
     ON CONFLICT (provider, external_event_id) DO UPDATE SET received_at = now() RETURNING id`,
    [connection.company_id, connection.id, externalEventId, event, JSON.stringify(payload)],
  )
  try {
    if (event === 'messagesupsert') {
      const incoming = await saveWhatsAppMessage(connection, payload)
      if (incoming && incoming.inbound && incoming.isNew) {
        void sendChatbotResponse(connection, incoming).catch((error) => app.log.error({ error, connectionId: connection.id }, 'Falha no chatbot Evolution'))
      }
    } else if (event === 'connectionupdate') {
      const state = String(data.state ?? data.status ?? '').toLowerCase()
      const status = state === 'open' || state === 'connected' ? 'connected' : state === 'connecting' ? 'pending' : 'disconnected'
      await query(`UPDATE whatsapp_channels SET status = $1, updated_at = now() WHERE id = $2`, [status, connection.channel_id])
      if (status === 'connected') await query('UPDATE whatsapp_connections SET connected_at = COALESCE(connected_at, now()) WHERE id = $1', [connection.id])
    }
    await query('UPDATE integration_events SET processed_at = now(), error = NULL WHERE id = $1', [inserted.rows[0].id])
    await query('UPDATE whatsapp_connections SET last_event_at = now(), updated_at = now() WHERE id = $1', [connection.id])
    return reply.code(200).send({ received: true })
  } catch (error) {
    app.log.error({ error, connectionId: connection.id }, 'Falha ao processar evento Evolution')
    await query('UPDATE integration_events SET error = $2 WHERE id = $1', [inserted.rows[0].id, error instanceof Error ? error.message.slice(0, 300) : 'Erro inesperado'])
    return reply.code(500).send({ error: 'Não foi possível processar o evento.' })
  }
})

app.post('/webhooks/n8n/:companyId', async (request, reply) => {
  const { companyId } = request.params as { companyId: string }
  const configuredSecret = process.env.N8N_WEBHOOK_SECRET
  const sentSecret = request.headers['x-otimiza-n8n-secret']
  if (!configuredSecret || typeof sentSecret !== 'string' || !safeEqual(sentSecret, configuredSecret)) return reply.code(401).send({ error: 'Webhook não autorizado.' })
  const payload = request.body as Record<string, unknown>
  const externalEventId = String(payload.eventId ?? payload.event_id ?? '')
  const eventType = String(payload.event ?? '')
  if (!externalEventId || !eventType) return reply.code(400).send({ error: 'eventId e event são obrigatórios.' })
  const inserted = await query<{ id: string }>(
    `INSERT INTO integration_events (company_id, provider, external_event_id, event_type, payload)
     VALUES ($1, 'n8n', $2, $3, $4::jsonb) ON CONFLICT (provider, external_event_id) DO NOTHING RETURNING id`,
    [companyId, externalEventId, eventType, JSON.stringify(payload)],
  )
  if (!inserted.rows[0]) return reply.code(202).send({ received: true, duplicate: true })

  const contactInput = payload.contact as Record<string, unknown> | undefined
  const opportunityInput = payload.opportunity as Record<string, unknown> | undefined
  const saleInput = payload.sale as Record<string, unknown> | undefined
  const phone = String(contactInput?.phone ?? '').replace(/\D/g, '')
  let contactId: string | undefined
  let opportunityId: string | undefined
  if (phone) {
    const contact = await query<{ id: string }>(
      `INSERT INTO contacts (company_id, phone_e164, name, first_source, last_source)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (company_id, phone_e164) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), last_source = EXCLUDED.last_source, last_seen_at = now(), updated_at = now()
       RETURNING id`, [companyId, phone, String(contactInput?.name ?? '') || null, String(opportunityInput?.source ?? 'Automação')],
    )
    contactId = contact.rows[0].id
  }
  if (contactId && opportunityInput && ['lead_created', 'qualified', 'proposal_sent', 'sale_detected', 'sale_confirmed', 'lost'].includes(eventType)) {
    const pipeline = await query<{ id: string }>('SELECT id FROM pipelines WHERE company_id = $1 AND is_default = true LIMIT 1', [companyId])
    const suggestedStages: Record<string, string> = { lead_created: 'Novos leads', qualified: 'Qualificados', proposal_sent: 'Proposta enviada', sale_detected: 'Negociação', sale_confirmed: 'Ganhos', lost: 'Perdidos' }
    const stage = await query<{ id: string }>(
      `SELECT ps.id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
       WHERE p.id = $1 AND lower(ps.name) = lower($2) LIMIT 1`, [pipeline.rows[0].id, String(opportunityInput.stage ?? suggestedStages[eventType])],
    )
    if (stage.rows[0]) {
      const existing = await query<{ id: string }>(
        `SELECT id FROM opportunities WHERE company_id = $1 AND contact_id = $2
         ORDER BY updated_at DESC LIMIT 1`, [companyId, contactId],
      )
      if (existing.rows[0]) {
        const opportunity = await query<{ id: string }>(
          `UPDATE opportunities
           SET stage_id = $3, title = COALESCE($4, title), temperature = COALESCE($5, temperature),
               estimated_value = COALESCE($6, estimated_value), source = COALESCE($7, source),
               last_activity_at = now(), updated_at = now()
           WHERE id = $1 AND company_id = $2 RETURNING id`,
          [existing.rows[0].id, companyId, stage.rows[0].id, opportunityInput.title ? String(opportunityInput.title) : null, opportunityInput.temperature ? String(opportunityInput.temperature) : null, Number(opportunityInput.value ?? 0) || null, opportunityInput.source ? String(opportunityInput.source) : null],
        )
        opportunityId = opportunity.rows[0].id
      } else {
        const opportunity = await query<{ id: string }>(
          `INSERT INTO opportunities (company_id, pipeline_id, stage_id, contact_id, title, temperature, estimated_value, source, last_activity_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
          [companyId, pipeline.rows[0].id, stage.rows[0].id, contactId, String(opportunityInput.title ?? contactInput?.name ?? 'Nova oportunidade'), String(opportunityInput.temperature ?? 'new'), Number(opportunityInput.value ?? 0) || null, String(opportunityInput.source ?? 'Automação')],
        )
        opportunityId = opportunity.rows[0].id
      }
    }
  }
  if (saleInput && contactId && ['sale_detected', 'sale_confirmed'].includes(eventType)) {
    const amount = Number(saleInput.amount ?? opportunityInput?.value ?? 0)
    if (amount > 0) await query(
      `INSERT INTO sales (company_id, opportunity_id, contact_id, status, amount, evidence, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, CASE WHEN $4 = 'confirmed' THEN now() ELSE NULL END)`,
      [companyId, opportunityId ?? null, contactId, eventType === 'sale_confirmed' ? 'confirmed' : 'detected', amount, JSON.stringify({ source: 'n8n', eventId: externalEventId })],
    )
  }
  await query('UPDATE integration_events SET processed_at = now() WHERE id = $1', [inserted.rows[0].id])
  return reply.code(202).send({ received: true, eventId: inserted.rows[0].id })
})

app.get('/*', async (request, reply) => {
  const path = request.url.split('?')[0]
  const privateRoute = ['/entrar', '/cadastro', '/app'].includes(path)
  const shell = privateRoute ? appShell.replace('name=\"robots\" content=\"index,follow\"', 'name=\"robots\" content=\"noindex,nofollow\"') : appShell
  return reply.type('text/html; charset=utf-8').send(shell)
})

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  if (!reply.sent) reply.code(500).send({ error: 'Não foi possível concluir esta operação.' })
})

const close = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)

await app.listen({ port: config.port, host: '0.0.0.0' })
