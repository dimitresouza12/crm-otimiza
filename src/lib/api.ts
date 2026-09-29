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
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  register: (input: { name: string; companyName: string; email: string; password: string; segment?: string; objective?: string; usesOtimizaAutomation?: boolean }) =>
    request<Session & { trialEndsAt: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (email: string, password: string) => request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (session: Session) => request<{ name: string; email: string; company_name: string; plan: string; trial_ends_at: string | null; uses_automation: boolean; role: string }>('/api/me', {}, session),
  dashboard: (session: Session) => request<{ confirmed_revenue: string; confirmed_sales: string; open_leads: string; average_ticket: string; leads_this_month: string }>('/api/dashboard', {}, session),
  crm: (session: Session) => request<Array<{ id: string; name: string; opportunities: Array<{ id: string; title: string; contactName: string | null; phone: string | null; temperature: 'new' | 'warm' | 'hot'; value: string | null; source: string | null; lastActivityAt: string | null }> }>>('/api/crm', {}, session),
  leads: (session: Session) => request<Array<{ id: string; name: string | null; phone: string; source: string | null; last_seen_at: string; opportunity_id: string | null; title: string | null; temperature: 'new' | 'warm' | 'hot' | null; estimated_value: string | null; stage_id: string | null; stage_name: string | null }>>('/api/leads', {}, session),
  sales: (session: Session) => request<Array<{ id: string; status: 'negotiation' | 'detected' | 'confirmed' | 'lost'; amount: string; confirmed_at: string | null; created_at: string; contact_name: string | null; opportunity_title: string | null }>>('/api/sales', {}, session),
  conversations: (session: Session) => request<Array<{ id: string; status: 'open' | 'closed'; last_message_at: string | null; contact_name: string | null; phone: string; channel_name: string; last_message: string | null; last_direction: 'inbound' | 'outbound' | null; sent_at: string | null }>>('/api/conversations', {}, session),
  whatsappConnections: (session: Session) => request<Array<{ id: string; name: string; phone_number: string | null; status: 'pending' | 'connected' | 'disconnected' | 'error'; provider: 'meta_cloud' | 'uazapi' | null; phone_number_id: string | null; external_account_id: string | null; connected_at: string | null; last_event_at: string | null }>>('/api/integrations/whatsapp', {}, session),
  connectWhatsapp: (session: Session, input: { provider: 'meta_cloud' | 'uazapi'; channelName: string; phoneNumber?: string; phoneNumberId?: string; externalAccountId?: string; serverUrl?: string; accessToken?: string }) => request<{ channelId: string; connectionId: string; webhookSecret: string; webhookPath: string; webhookConfigured?: boolean; setupError?: string }>('/api/integrations/whatsapp', { method: 'POST', body: JSON.stringify(input) }, session),
  requestUazapiConnection: (session: Session) => request<{ requestedAt: string }>('/api/integrations/uazapi/request', { method: 'POST' }, session),
  createLead: (session: Session, input: { name: string; phone: string; source: string; estimatedValue?: number }) => request<{ contactId: string; opportunityId: string; stageId: string }>('/api/leads', { method: 'POST', body: JSON.stringify(input) }, session),
  updateOpportunity: (session: Session, opportunityId: string, input: { stageId?: string; estimatedValue?: number; temperature?: 'new' | 'warm' | 'hot' }) => request(`/api/opportunities/${opportunityId}`, { method: 'PATCH', body: JSON.stringify(input) }, session),
  createSale: (session: Session, input: { opportunityId?: string; contactId?: string; amount: number; status?: 'negotiation' | 'detected' | 'confirmed' | 'lost' }) => request<{ id: string; status: string; amount: string; confirmed_at: string | null }>('/api/sales', { method: 'POST', body: JSON.stringify(input) }, session),
  chatbot: (session: Session) => request<{ settings: { is_active: boolean; welcome_message: string | null; fallback_message: string | null }; channels: Array<{ id: string; name: string; phone_number: string | null; status: string }>; rules: Array<{ id: string; channel_id: string; name: string; trigger_type: 'keyword' | 'first_message'; trigger_value: string | null; response_text: string; is_active: boolean; position: number }> }>('/api/chatbot', {}, session),
  saveChatbotSettings: (session: Session, input: { isActive: boolean; welcomeMessage?: string; fallbackMessage?: string }) => request('/api/chatbot/settings', { method: 'PUT', body: JSON.stringify(input) }, session),
  createChatbotRule: (session: Session, input: { channelId: string; name: string; triggerType: 'keyword' | 'first_message'; triggerValue?: string; responseText: string }) => request('/api/chatbot/rules', { method: 'POST', body: JSON.stringify(input) }, session),
  deleteChatbotRule: (session: Session, ruleId: string) => request(`/api/chatbot/rules/${ruleId}`, { method: 'DELETE' }, session),
}
