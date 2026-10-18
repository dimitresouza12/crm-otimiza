import 'dotenv/config'
import pg from 'pg'

const arg = (name) => process.argv.find((value, index) => process.argv[index - 1] === name)?.trim()
const email = arg('--email')?.toLowerCase()
const role = arg('--role')
const apply = process.argv.includes('--apply')
const roles = ['master', 'traffic', 'none']
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.includes(role ?? '')) {
  console.error('Uso: npm run account:set-admin -- --email pessoa@exemplo.com --role master|traffic|none [--apply]')
  console.error('  master  = financeiro das assinaturas + chatbot dos clientes + tráfego')
  console.error('  traffic = gestor de tráfego (sem financeiro): chatbot dos clientes + tráfego')
  console.error('  none    = remove o acesso ao painel master')
  process.exit(2)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
try {
  await client.connect()
  const { rows } = await client.query('SELECT id, name, email, platform_role FROM users WHERE lower(email) = $1', [email])
  if (rows.length !== 1) throw new Error(`Nenhuma conta com o e-mail ${email}. A pessoa precisa criar a conta no CRM antes.`)
  const user = rows[0]
  const next = role === 'none' ? null : role
  console.log(JSON.stringify({ name: user.name, email: user.email, currentRole: user.platform_role, newRole: next, action: apply ? 'apply' : 'preview' }, null, 2))
  if (!apply) {
    console.log('Prévia apenas. Repita com --apply para gravar.')
  } else {
    await client.query('UPDATE users SET platform_role = $2, updated_at = now() WHERE id = $1', [user.id, next])
    console.log(next ? `Conta agora é ${next}. A pessoa precisa sair e entrar de novo no CRM.` : 'Acesso ao painel master removido.')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao atualizar a conta.')
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
