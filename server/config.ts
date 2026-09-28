import 'dotenv/config'

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`)
  return value
}

export const config = {
  port: Number(process.env.API_PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: () => required('DATABASE_URL'),
  jwtSecret: () => required('JWT_SECRET'),
  encryptionKey: () => required('APP_ENCRYPTION_KEY'),
  metaVerifyToken: process.env.META_VERIFY_TOKEN ?? '',
  allowedOrigins: (process.env.ALLOW_ORIGINS ?? 'http://localhost:5173').split(',').map((item) => item.trim()),
}
