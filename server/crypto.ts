import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { config } from './config.js'

const key = () => {
  const value = Buffer.from(config.encryptionKey(), 'base64')
  if (value.length !== 32) throw new Error('APP_ENCRYPTION_KEY deve conter 32 bytes codificados em base64')
  return value
}

export const encryptSecret = (plainText: string) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export const decryptSecret = (value: string) => {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Segredo cifrado inválido')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8')
}
