const onlyDigits = (value: string) => value.replace(/\D/g, '')

const checkDigit = (base: string, weights: number[]) => {
  const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

export const isValidCpf = (value: string) => {
  const digits = onlyDigits(value)
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  const base = digits.slice(0, 9)
  const firstDigit = checkDigit(base, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const secondDigit = checkDigit(base + firstDigit, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return digits === `${base}${firstDigit}${secondDigit}`
}

export const isValidCnpj = (value: string) => {
  const digits = onlyDigits(value)
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false
  const base = digits.slice(0, 12)
  const firstDigit = checkDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const secondDigit = checkDigit(base + firstDigit, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return digits === `${base}${firstDigit}${secondDigit}`
}

export const isValidCpfCnpj = (value: string) => {
  const digits = onlyDigits(value)
  return digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false
}
