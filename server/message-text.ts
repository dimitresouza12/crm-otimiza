export const pickText = (value: unknown, depth = 0): string | null => {
  if (typeof value === 'string') return value.trim() || null
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8) return null
  const input = value as Record<string, unknown>
  for (const key of ['body', 'text', 'conversation', 'caption', 'extendedTextMessage', 'ephemeralMessage', 'viewOnceMessage', 'imageMessage', 'videoMessage', 'message']) {
    const result = pickText(input[key], depth + 1)
    if (result) return result
  }
  return null
}

export const foldText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036F]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
