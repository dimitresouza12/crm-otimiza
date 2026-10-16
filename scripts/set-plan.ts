import 'dotenv/config'
import pg from 'pg'
import { calculatePlanPrice, isPurchasablePlan } from '../server/pricing.ts'

// Uso (no servidor, com DATABASE_URL configurada):
//   npm run account:set-plan -- --email dono@empresa.com --plan chatbot --channels 1             prévia, não altera nada
//   npm run account:set-plan -- --email dono@empresa.com --plan chatbot --channels 1 --apply     grava o plano com o preço da tabela
//   ... --apply --courtesy                                                                       conta de teste/cortesia: preço 0 e acesso ativo, sem vencer
const args = process.argv.slice(2)
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const email = option('--email')?.trim().toLowerCase()
const plan = option('--plan')
const channels = Number(option('--channels') ?? 1)
const apply = args.includes('--apply')
const courtesy = args.includes('--courtesy')

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !plan || !isPurchasablePlan(plan)) {
  console.error('Uso: npm run account:set-plan -- --email dono@empresa.com --plan crm|chatbot [--channels 1-5] [--courtesy] [--apply]')
  process.exit(2)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}

let tablePrice: number
try {
  tablePrice = calculatePlanPrice(plan, channels)
} catch {
  console.error('O número de canais deve ser um inteiro de 1 a 5.')
  process.exit(2)
}
const priceCents = courtesy ? 0 : tablePrice

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
try {
  await client.connect()
  const { rows } = await client.query(
    `SELECT c.id, c.name, c.plan, c.channel_limit, c.plan_price_cents, c.billing_status, c.trial_ends_at
     FROM companies c JOIN memberships m ON m.company_id = c.id JOIN users u ON u.id = m.user_id
     WHERE lower(u.email) = $1 AND m.role = 'owner'`, [email],
  )
  if (rows.length !== 1) throw new Error(`Esperada uma única empresa do titular; encontradas ${rows.length}. Confira o e-mail.`)
  const account = rows[0]
  const next = { plan, channelLimit: channels, priceCents, ...(courtesy ? { billingStatus: 'active (cortesia)' } : {}) }
  console.log(JSON.stringify({ company: account.name, email, atual: { plan: account.plan, channelLimit: account.channel_limit, priceCents: account.plan_price_cents, billingStatus: account.billing_status }, novo: next, acao: apply ? 'gravar' : 'prévia' }, null, 2))
  if (!apply) {
    console.log('Prévia apenas. Repita com --apply para gravar.')
  } else {
    await client.query(
      `UPDATE companies SET plan = $2, channel_limit = $3, plan_price_cents = $4,
         billing_status = CASE WHEN $5::boolean THEN 'active' ELSE billing_status END, updated_at = now()
       WHERE id = $1`,
      [account.id, plan, channels, priceCents, courtesy],
    )
    console.log('Plano atualizado. Peça para a pessoa recarregar a página (F5).')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao consultar a conta.')
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
