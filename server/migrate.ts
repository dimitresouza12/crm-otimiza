import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './db.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(currentDir, 'db', 'migrations')
const migrationFiles = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()

try {
  for (const file of migrationFiles) await pool.query(await readFile(join(migrationsDir, file), 'utf8'))
  console.log('Banco de dados atualizado com sucesso.')
} finally {
  await pool.end()
}
