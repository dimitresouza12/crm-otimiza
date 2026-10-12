-- Pedidos do cliente que precisam de uma pessoa: reunião/demonstração (ou um horário combinado)
-- e "preciso de um atendente". Aparecem no lead para o usuário do CRM revisar e decidir.
CREATE TABLE IF NOT EXISTS lead_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('meeting', 'handoff')),
  customer_text text,
  requested_when text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- No máximo um pedido pendente de cada tipo por conversa: mensagens novas atualizam o mesmo pedido.
CREATE UNIQUE INDEX IF NOT EXISTS lead_requests_one_pending ON lead_requests (conversation_id, kind) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS lead_requests_opportunity ON lead_requests (opportunity_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS lead_requests_company_pending ON lead_requests (company_id, updated_at DESC) WHERE status = 'pending';

ALTER TABLE chatbot_settings
  ADD COLUMN IF NOT EXISTS handoff_on_fallback boolean NOT NULL DEFAULT false;
