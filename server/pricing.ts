export const purchasablePlans = ['crm', 'chatbot'] as const
export type PurchasablePlan = typeof purchasablePlans[number]

export const planPricing: Record<PurchasablePlan, { baseCents: number; additionalChannelCents: number; channelLimit: { min: number; max: number } }> = {
  crm: { baseCents: 8_990, additionalChannelCents: 2_990, channelLimit: { min: 1, max: 5 } },
  chatbot: { baseCents: 17_990, additionalChannelCents: 3_990, channelLimit: { min: 1, max: 5 } },
}

export const isPurchasablePlan = (value: string): value is PurchasablePlan => purchasablePlans.includes(value as PurchasablePlan)

export const calculatePlanPrice = (plan: PurchasablePlan, channelLimit: number) => {
  const pricing = planPricing[plan]
  if (!Number.isInteger(channelLimit) || channelLimit < pricing.channelLimit.min || channelLimit > pricing.channelLimit.max) {
    throw new Error('CHANNEL_LIMIT_INVALID')
  }
  return pricing.baseCents + (channelLimit - 1) * pricing.additionalChannelCents
}

