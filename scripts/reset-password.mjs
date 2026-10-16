import 'dotenv/config'
import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'

// Uso (no servidor, com DATABASE_URL configurada):
//   npm run account:reset-password -- --list [parte do e-mail ou do nome]      lista contas (nunca mostra senhas)
//   npm run account:reset-password -- --email pessoa@exemplo.com               prévia, não altera nada
//   npm run account:reset-password -- --email pessoa@exemplo.com --apply       define uma senha nova aleatória e mostra uma única vez
//   ... --apply --password 'SenhaEscolhida1'                                   define a senha informada (8 a 100 caracteres)
const args = process.argv.slice(2)
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const apply = args.includes('--apply')
const listMode = args.includes('--list')
const email = option('--email')?.trim().toLowerCase()
const chosenPassword = option('--password')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}
if (!listMode && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
  console.error('Uso: npm run account:reset-password -- --email pessoa@exemplo.com [--apply] [--password "NovaSenha1"]')
  console.error('     npm run account:reset-password -- --list [texto]')
  process.exit(2)
}
if (chosenPassword !== undefined && (chosenPassword.length < 8 || chosenPassword.length > 100)) {
  console.error('A senha deve ter entre 8 e 100 caracteres (mesma regra do cadastro).')
  process.exit(2)
}

// Senha aleatória fácil de ditar: sem caracteres ambíguos (0/O, 1/l/I), com maiúscula, minúscula, número e símbolo.
const generatePassword = () => {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#%&*+?']
  const all = groups.join('')
  const chars = groups.map((group) => group[randomInt(group.length)])
  while (chars.length < 14) chars.push(all[randomInt(all.length)])
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
try {
  await client.connect()

  if (listMode) {
    const filter = args.filter((value, index) => index > args.indexOf('--list') && !value.startsWith('--'))[0]?.toLowerCase() ?? ''
    const { rows } = await client.query(
      `SELECT u.email, u.name, u.created_at, string_agg(c.name || ' (' || m.role || ')', ', ' ORDER BY c.name) AS empresas
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id LEFT JOIN companies c ON c.id = m.company_id
       WHERE $1 = '' OR lower(u.email) LIKE '%' || $1 || '%' OR lower(u.name) LIKE '%' || $1 || '%'
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT 50`, [filter],
    )
    if (!rows.length) console.log('Nenhuma conta encontrada.')
    for (const row of rows) console.log(`${row.email}  |  ${row.name}  |  ${row.empresas ?? 'sem empresa'}  |  criada em ${new Date(row.created_at).toLocaleDateString('pt-BR')}`)
    console.log(`\n${rows.length} conta(s)${rows.length === 50 ? ' (mostrando as 50 mais recentes; refine com um texto)' : ''}.`)
  } else {
    const { rows } = await client.query(
      `SELECT u.id, u.name, u.email, u.created_at,
              COALESCE(json_agg(json_build_object('empresa', c.name, 'papel', m.role, 'status', c.billing_status)) FILTER (WHERE c.id IS NOT NULL), '[]') AS empresas
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id LEFT JOIN companies c ON c.id = m.company_id
       WHERE lower(u.email) = $1 GROUP BY u.id`, [email],
    )
    if (rows.length !== 1) throw new Error(`Nenhuma conta com o e-mail ${email}. Use --list para procurar.`)
    const user = rows[0]
    console.log(JSON.stringify({ usuario: user.name, email: user.email, empresas: user.empresas, acao: apply ? 'redefinir senha' : 'prévia' }, null, 2))
    if (!apply) {
      console.log('Prévia apenas. Repita com --apply para definir a senha nova.')
    } else {
      const password = chosenPassword ?? generatePassword()
      const hash = await bcrypt.hash(password, 12)
      await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [user.id, hash])
      console.log('\nSenha redefinida.')
      if (chosenPassword === undefined) console.log(`Senha nova (aparece só agora, anote): ${password}`)
      console.log('Quem já estava logado continua com a sessão atual até ela expirar.')
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao consultar a conta.')
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
