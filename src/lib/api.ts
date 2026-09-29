const configuredBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

export type Session = {
  token: string
  companyId: string
  role?: string
}

type ApiError = { error?: string }

const request = async <T>(path: string, options: RequestInit = {}, session?: Session): Promise<T> => {
  const response = await fetch(`${configuredBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}`, 'X-Company-Id': session.companyId } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiError
    throw new Error(body.error ?? 'Não foi possível concluir esta operação.')
  }
  return response.json() as Promise<T>
}

export const api = {
  register: (input: { name: string; companyName: string; email: string; password: string; segment?: string; objective?: string; usesOtimizaAutomation?: boolean }) =>
    request<Session & { trialEndsAt: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (email: string, password: string) => request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (session: Session) => request<{ name: string; email: string; company_name: string; plan: string; trial_ends_at: string | null; role: string }>('/api/me', {}, session),
  dashboard: (session: Session) => request<{ confirmed_revenue: string; confirmed_sales: string; open_leads: string; average_ticket: string; leads_this_month: string }>('/api/dashboard', {}, session),
  crm: (session: Session) => request<Array<{ id: string; name: string; opportunities: Array<{ id: string; title: string; contactName: string | null; phone: string | null; temperature: 'new' | 'warm' | 'hot'; value: string | null; source: string | null; lastActivityAt: string | null }> }>>('/api/crm', {}, session),
  createLead: (session: Session, input: { name: string; phone: string; source: string; estimatedValue?: number }) => request<{ contactId: string; opportunityId: string; stageId: string }>('/api/leads', { method: 'POST', body: JSON.stringify(input) }, session),
  updateOpportunity: (session: Session, opportunityId: string, input: { stageId?: string; estimatedValue?: number; temperature?: 'new' | 'warm' | 'hot' }) => request(`/api/opportunities/${opportunityId}`, { method: 'PATCH', body: JSON.stringify(input) }, session),
}
