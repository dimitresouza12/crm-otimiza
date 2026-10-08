import 'dotenv/config'
import pg from 'pg'

const email = process.argv.find((value, index) => process.argv[index - 1] === '--email')?.trim().toLowerCase()
const apply = process.argv.includes('--apply')
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run account:activate -- --email cliente@exemplo.com [--apply]')
  process.exit(2)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}

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
  console.log(JSON.stringify({ companyId: account.id, company: account.name, email, plan: account.plan, channelLimit: account.channel_limit, priceCents: account.plan_price_cents, currentStatus: account.billing_status, trialEndsAt: account.trial_ends_at, action: apply ? 'activate' : 'preview' }, null, 2))
  if (!apply) {
    console.log('Prévia apenas. Após confirmar a contratação fora do CRM, repita com --apply.')
  } else {
    const result = await client.query("UPDATE companies SET billing_status = 'active', updated_at = now() WHERE id = $1 RETURNING billing_status", [account.id])
    console.log(`Conta ativada: ${result.rows[0]?.billing_status}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao consultar a conta.')
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
