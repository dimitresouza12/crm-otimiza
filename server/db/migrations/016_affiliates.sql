-- Programa de afiliados: qualquer pessoa vende com um link e ganha 50% da primeira mensalidade (carência de 30 dias).
-- O afiliado é um usuário (users) sem empresa; entra por um login próprio.
CREATE TABLE IF NOT EXISTS affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  nickname text NOT NULL,
  pix_key_encrypted text,
  pix_key_type text CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS referred_by_affiliate_id uuid REFERENCES affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz;
CREATE INDEX IF NOT EXISTS companies_referred_by_idx ON companies(referred_by_affiliate_id) WHERE referred_by_affiliate_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  day date NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (affiliate_id, day)
);

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  pix_key_encrypted text NOT NULL,
  pix_key_type text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text
);
-- No máximo um pedido de saque aberto por afiliado.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_payouts_one_open ON affiliate_payouts(affiliate_id) WHERE status = 'requested';

-- Uma comissão por empresa indicada (a da primeira assinatura). 'pending' vira disponível pela data (available_at).
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  asaas_payment_id text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'paid', 'canceled', 'reversed_after_payout')),
  available_at timestamptz NOT NULL,
  payout_id uuid REFERENCES affiliate_payouts(id) ON DELETE SET NULL,
  canceled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_commissions_affiliate_idx ON affiliate_commissions(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_commissions_payment_idx ON affiliate_commissions(asaas_payment_id);

CREATE TABLE IF NOT EXISTS affiliate_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  prize text,
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  created_at timestamptz NOT NULL DEFAULT now()
);
