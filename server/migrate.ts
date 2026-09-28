import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './db.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const sql = await readFile(join(currentDir, 'db', 'migrations', '001_initial.sql'), 'utf8')

try {
  await pool.query(sql)
  console.log('Banco de dados atualizado com sucesso.')
} finally {
  await pool.end()
}
