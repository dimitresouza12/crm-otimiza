-- Cobrança via Asaas: assinatura ativa por empresa e histórico de cobranças.
-- Nunca guardamos número de cartão ou CVV aqui — só o token de cobrança do Asaas, cifrado.
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'asaas',
  plan text NOT NULL,
  channel_limit integer NOT NULL,
  price_cents integer NOT NULL,
  billing_type text CHECK (billing_type IN ('pix', 'boleto', 'card', 'card_recurring')),
  auto_renew boolean NOT NULL DEFAULT false,
  cycle text,
  asaas_customer_id text,
  asaas_subscription_id text,
  card_token_encrypted text,
  card_brand text,
  card_last4 text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'overdue', 'refused', 'canceled')),
  last_payment_id text,
  last_event_at timestamptz,
  next_due_date date,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_asaas_subscription_idx ON billing_subscriptions(asaas_subscription_id);

-- Histórico de cobranças (uma linha por payment do Asaas), alimentado pelo webhook.
CREATE TABLE IF NOT EXISTS billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'asaas',
  asaas_payment_id text NOT NULL,
  asaas_subscription_id text,
  billing_type text,
  value_cents integer NOT NULL,
  status text NOT NULL,
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, asaas_payment_id)
);

CREATE INDEX IF NOT EXISTS billing_payments_company_due_idx ON billing_payments(company_id, due_date DESC);
CREATE INDEX IF NOT EXISTS billing_payments_subscription_idx ON billing_payments(asaas_subscription_id);
