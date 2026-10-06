const configuredBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

export type Session = {
  token: string
  companyId: string
  role?: string
}

type ApiError = { error?: string }

export type ChatSender = 'customer' | 'bot' | 'agent' | 'phone' | null
export type ChatMessage = { id: string; direction: 'inbound' | 'outbound'; message_type: string; body: string | null; sent_at: string; sent_by: ChatSender; media_mime: string | null; media_name: string | null; transcript?: string | null; has_media: boolean }

const unavailableMessage = 'O servidor está indisponível no momento. Tente novamente em instantes.'
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

// Durante uma atualização a API fica fora do ar por alguns segundos e o proxy responde HTML ou 502.
// Leituras (GET) tentam de novo sozinhas; escritas nunca repetem, para não duplicar nada.
const request = async <T>(path: string, options: RequestInit = {}, session?: Session): Promise<T> => {
  const attempts = (options.method ?? 'GET').toUpperCase() === 'GET' ? 4 : 1
  for (let attempt = 1; ; attempt++) {
    let response: Response | null = null
    try {
      response = await fetch(`${configuredBaseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.token}`, 'X-Company-Id': session.companyId } : {}),
          ...options.headers,
        },
      })
    } catch { response = null }
    const isJson = response?.headers.get('content-type')?.includes('json') ?? false
    const unavailable = !response || [502, 503, 504].includes(response.status) || (response.status !== 204 && !isJson)
    if (unavailable) {
      if (attempt < attempts) { await sleep(700 * attempt); continue }
      throw new Error(unavailableMessage)
    }
    if (!response!.ok) {
      const body = await response!.json().catch(() => ({})) as ApiError
      throw new Error(body.error ?? 'Não foi possível concluir esta operação.')
    }
    if (response!.status === 204) return undefined as T
    return response!.json() as Promise<T>
  }
}

export const api = {
  register: (input: { name: string; companyName: string; email: string; password: string; segment?: string; objective?: string; usesOtimizaAutomation?: boolean; plan?: 'crm' | 'chatbot'; channelLimit?: number }) =>
    request<Session & { trialEndsAt: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (email: string, password: string) => request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (session: Session) => request<{ name: string; email: string; company_name: string; plan: string; channel_limit: number; plan_price_cents: number; trial_ends_at: string | null; billing_status: 'trial' | 'active' | 'expired'; uses_automation: boolean; role: string; access_state: 'trial' | 'active' | 'expired' }>('/api/me', {}, session),
  dashboard: (session: Session) => request<{ confirmed_revenue: string; confirmed_sales: string; open_leads: string; average_ticket: string; leads_this_month: string }>('/api/dashboard', {}, session),
  crm: (session: Session) => request<Array<{ id: string; name: string; opportunities: Array<{ id: string; title: string; contactName: string | null; phone: string | null; temperature: 'new' | 'warm' | 'hot'; value: string | null; source: string | null; lastActivityAt: string | null }> }>>('/api/crm', {}, session),
  leads: (session: Session) => request<Array<{ id: string; name: string | null; phone: string; source: string | null; last_seen_at: string; opportunity_id: string | null; title: string | null; temperature: 'new' | 'warm' | 'hot' | null; estimated_value: string | null; stage_id: string | null; stage_name: string | null }>>('/api/leads', {}, session),
  sales: (session: Session) => request<Array<{ id: string; status: 'negotiation' | 'detected' | 'confirmed' | 'lost'; amount: string; confirmed_at: string | null; created_at: string; opportunity_id: string | null; contact_name: string | null; opportunity_title: string | null }>>('/api/sales', {}, session),
  conversations: (session: Session) => request<Array<{ id: string; status: 'open' | 'closed'; last_message_at: string | null; contact_name: string | null; phone: string; channel_name: string; last_message: string | null; last_direction: 'inbound' | 'outbound' | null; sent_at: string | null; bot_paused?: boolean; last_type?: string | null; last_sent_by?: ChatSender }>>('/api/conversations', {}, session),
  conversationMessages: (session: Session, conversationId: string) => request<{ botPaused: boolean; messages: ChatMessage[] }>(`/api/conversations/${conversationId}/messages`, {}, session),
  sendChatText: (session: Session, conversationId: string, text: string) => request<ChatMessage>(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }, session),
  sendChatMedia: (session: Session, conversationId: string, input: { kind: 'image' | 'audio' | 'document'; mimeType: string; fileName?: string; data: string; caption?: string }) => request<ChatMessage>(`/api/conversations/${conversationId}/media`, { method: 'POST', body: JSON.stringify(input) }, session),
  setConversationBot: (session: Session, conversationId: string, paused: boolean) => request<{ botPaused: boolean }>(`/api/conversations/${conversationId}/bot`, { method: 'PUT', body: JSON.stringify({ paused }) }, session),
  chatMedia: async (session: Session, messageId: string): Promise<Blob> => {
    const response = await fetch(`${configuredBaseUrl}/api/messages/${messageId}/media`, { headers: { Authorization: `Bearer ${session.token}`, 'X-Company-Id': session.companyId } })
    if (!response.ok) throw new Error('Não foi possível carregar o arquivo.')
    return response.blob()
  },
  whatsappConnections: (session: Session) => request<Array<{ id: string; name: string; phone_number: string | null; status: 'pending' | 'connected' | 'disconnected' | 'error'; provider: 'meta_cloud' | 'uazapi' | 'evolution' | null; phone_number_id: string | null; external_account_id: string | null; connected_at: string | null; last_event_at: string | null }>>('/api/integrations/whatsapp', {}, session),
  createEvolution: (session: Session, channelName: string) => request<{ channelId: string; connectionId: string; status: 'pending' | 'connected' | 'error'; setupError?: string }>('/api/integrations/evolution', { method: 'POST', body: JSON.stringify({ channelName }) }, session),
  evolutionStatus: (session: Session, channelId: string) => request<{ status: 'pending' | 'connected' | 'disconnected' | 'error' }>(`/api/integrations/evolution/${channelId}/status`, {}, session),
  evolutionQr: (session: Session, channelId: string) => request<{ status: 'pending' | 'connected'; qrCode: string | null }>(`/api/integrations/evolution/${channelId}/qr`, {}, session),
  retryEvolution: (session: Session, channelId: string) => request<{ status: 'pending' | 'connected' }>(`/api/integrations/evolution/${channelId}/retry`, { method: 'POST' }, session),
  connectWhatsapp: (session: Session, input: { provider: 'meta_cloud' | 'uazapi'; channelName: string; phoneNumber?: string; phoneNumberId?: string; externalAccountId?: string; serverUrl?: string; accessToken?: string }) => request<{ channelId: string; connectionId: string; webhookSecret: string; webhookPath: string; webhookConfigured?: boolean; setupError?: string }>('/api/integrations/whatsapp', { method: 'POST', body: JSON.stringify(input) }, session),
  requestUazapiConnection: (session: Session) => request<{ requestedAt: string }>('/api/integrations/uazapi/request', { method: 'POST' }, session),
  createLead: (session: Session, input: { name: string; phone: string; source: string; estimatedValue?: number }) => request<{ contactId: string; opportunityId: string; stageId: string }>('/api/leads', { method: 'POST', body: JSON.stringify(input) }, session),
  updateOpportunity: (session: Session, opportunityId: string, input: { stageId?: string; estimatedValue?: number; temperature?: 'new' | 'warm' | 'hot' }) => request(`/api/opportunities/${opportunityId}`, { method: 'PATCH', body: JSON.stringify(input) }, session),
  createSale: (session: Session, input: { opportunityId?: string; contactId?: string; amount: number; status?: 'negotiation' | 'detected' | 'confirmed' | 'lost' }) => request<{ id: string; status: string; amount: string; confirmed_at: string | null }>('/api/sales', { method: 'POST', body: JSON.stringify(input) }, session),
  confirmSale: (session: Session, saleId: string) => request<{ id: string; opportunity_id: string | null; amount: string }>(`/api/sales/${saleId}/confirm`, { method: 'POST' }, session),
  traffic: (session: Session) => request<Array<{ id: string; source: string; platform: string; period_start: string; period_end: string; spend: string; reported_leads: string; impressions: string; clicks: string; crm_leads: string; confirmed_sales: string; confirmed_revenue: string }>>('/api/traffic', {}, session),
  createTraffic: (session: Session, input: { source: string; platform: string; periodStart: string; periodEnd: string; spend: number; reportedLeads: number; impressions?: number; clicks?: number }) => request('/api/traffic', { method: 'POST', body: JSON.stringify(input) }, session),
  reports: (session: Session, start?: string, end?: string) => request<{ period: { start: string; end: string }; totals: { revenue: string; sales: string; leads: string; ticket: string }; sources: Array<{ source: string; spend: string; leads: string; sales: string; revenue: string }>; pipeline: Array<{ name: string; kind: 'open' | 'won' | 'lost'; total: string }> }>(`/api/reports${start && end ? `?start=${start}&end=${end}` : ''}`, {}, session),
  notifications: (session: Session) => request<Array<{ id: string; type: 'channel' | 'lead' | 'trial'; title: string; body: string; action: string }>>('/api/notifications', {}, session),
  chatbot: (session: Session) => request<{ settings: { is_active: boolean; welcome_message: string | null; fallback_message: string | null; ai_enabled: boolean }; aiAvailable: boolean; channels: Array<{ id: string; name: string; phone_number: string | null; status: string; provider: 'uazapi' | 'evolution' }>; rules: Array<{ id: string; channel_id: string; name: string; trigger_type: 'keyword' | 'first_message'; trigger_value: string | null; response_text: string; is_active: boolean; position: number }> }>('/api/chatbot', {}, session),
  saveChatbotSettings: (session: Session, input: { isActive: boolean; welcomeMessage?: string; fallbackMessage?: string; aiEnabled?: boolean }) => request('/api/chatbot/settings', { method: 'PUT', body: JSON.stringify(input) }, session),
  createChatbotRule: (session: Session, input: { channelId: string; name: string; triggerType: 'keyword' | 'first_message'; triggerValue?: string; responseText: string }) => request('/api/chatbot/rules', { method: 'POST', body: JSON.stringify(input) }, session),
  opportunityAi: (session: Session, opportunityId: string) => request<{ summary: string | null; summaryAt: string | null; events: Array<{ id: string; reason: string | null; confidence: string | null; applied: Record<string, { from?: string | number | null; to?: string | number; amount?: number; status?: string }>; created_at: string }> }>(`/api/opportunities/${opportunityId}/ai`, {}, session),
  deleteChatbotRule: (session: Session, ruleId: string) => request(`/api/chatbot/rules/${ruleId}`, { method: 'DELETE' }, session),
}
