import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import rawBody from 'fastify-raw-body'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { config } from './config.js'
import { encryptSecret } from './crypto.js'
import { pool, query, transaction } from './db.js'

type Token = { userId: string; companyId: string; role: string }
type CompanyRow = { company_id: string; role: string }

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    redact: ['req.headers.authorization', 'req.headers["x-otimiza-webhook-secret"]', 'req.body.accessToken', 'req.body.instanceToken'],
  },
})

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

const companyScope = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = currentToken(request)
  const requestedCompanyId = (request.headers['x-company-id'] as string | undefined) ?? token.companyId
  const { rows } = await query<CompanyRow>('SELECT company_id, role FROM memberships WHERE company_id = $1 AND user_id = $2', [requestedCompanyId, token.userId])
  if (!rows[0]) {
    reply.code(403).send({ error: 'Você não tem acesso a esta empresa.' })
    return null
  }
  return { companyId: rows[0].company_id, role: rows[0].role, userId: token.userId }
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
})

app.get('/health', async () => {
  await query('SELECT 1')
  return { status: 'ok', service: 'otimiza-crm-api', timestamp: new Date().toISOString() }
})

app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
  const parsed = registerSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'Confira os dados do cadastro.', details: parsed.error.flatten().fieldErrors })
  const input = parsed.data
  const passwordHash = await bcrypt.hash(input.password, 12)
  const companyBaseSlug = slugify(input.companyName) || 'empresa'
  try {
    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [input.email])
      if (existing.rowCount) throw new Error('EMAIL_EXISTS')
      const company = await client.query<{ id: string }>(
        `INSERT INTO companies (name, slug, trial_ends_at, onboarding)
         VALUES ($1, $2 || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), now() + interval '7 days', $3::jsonb)
         RETURNING id`,
        [input.companyName, companyBaseSlug, JSON.stringify({ segment: input.segment, objective: input.objective, usesOtimizaAutomation: input.usesOtimizaAutomation ?? false })],
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
  const scope = await companyScope(request, reply)
  if (!scope) return
  const { rows } = await query<{ name: string; email: string; company_name: string; plan: string; trial_ends_at: string | null }>(
    `SELECT u.name, u.email, c.name AS company_name, c.plan, c.trial_ends_at
     FROM users u JOIN companies c ON c.id = $1 WHERE u.id = $2`, [scope.companyId, scope.userId],
  )
  return { ...rows[0], role: scope.role, companyId: scope.companyId }
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

const connectionSchema = z.object({
  provider: z.enum(['meta_cloud', 'uazapi']),
  channelName: z.string().min(2).max(80),
  phoneNumber: z.string().min(6).max(30).optional(),
  phoneNumberId: z.string().min(2).max(100).optional(),
  externalAccountId: z.string().max(100).optional(),
  accessToken: z.string().min(10).max(4096).optional(),
})

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
  const result = await transaction(async (client) => {
    const pipeline = await client.query<{ id: string }>('SELECT id FROM pipelines WHERE company_id = $1 AND is_default = true LIMIT 1', [scope.companyId])
    const channel = await client.query<{ id: string }>(
      `INSERT INTO whatsapp_channels (company_id, pipeline_id, name, phone_number, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`, [scope.companyId, pipeline.rows[0]?.id ?? null, input.channelName, input.phoneNumber ?? null],
    )
    const connection = await client.query<{ id: string; webhook_secret: string }>(
      `INSERT INTO whatsapp_connections (channel_id, provider, phone_number_id, external_account_id, access_token_encrypted)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, webhook_secret`,
      [channel.rows[0].id, input.provider, input.phoneNumberId ?? null, input.externalAccountId ?? null, input.accessToken ? encryptSecret(input.accessToken) : null],
    )
    return { channelId: channel.rows[0].id, connectionId: connection.rows[0].id, webhookSecret: connection.rows[0].webhook_secret }
  })
  return reply.code(201).send({ ...result, webhookPath: input.provider === 'uazapi' ? `/webhooks/uazapi/${result.connectionId}` : '/webhooks/meta' })
})

const safeEqual = (a: string, b: string) => {
  const first = Buffer.from(a)
  const second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
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
  const sentSecret = request.headers['x-otimiza-webhook-secret']
  const { rows } = await query<{ id: string; company_id: string; webhook_secret: string }>(
    `SELECT wc.id, c.company_id, wc.webhook_secret FROM whatsapp_connections wc JOIN whatsapp_channels c ON c.id = wc.channel_id
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
  await query('UPDATE whatsapp_connections SET last_event_at = now(), updated_at = now() WHERE id = $1', [connection.id])
  return reply.code(202).send({ received: true })
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
      const opportunity = await query<{ id: string }>(
        `INSERT INTO opportunities (company_id, pipeline_id, stage_id, contact_id, title, temperature, estimated_value, source, last_activity_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
        [companyId, pipeline.rows[0].id, stage.rows[0].id, contactId, String(opportunityInput.title ?? contactInput?.name ?? 'Nova oportunidade'), String(opportunityInput.temperature ?? 'new'), Number(opportunityInput.value ?? 0) || null, String(opportunityInput.source ?? 'Automação')],
      )
      opportunityId = opportunity.rows[0].id
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
