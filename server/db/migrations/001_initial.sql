CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'pro' CHECK (plan IN ('essential', 'pro', 'chatbot', 'automation')),
  trial_ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Fortaleza',
  onboarding jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('otimiza_admin', 'owner', 'manager', 'agent', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE TABLE IF NOT EXISTS pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL,
  color text NOT NULL DEFAULT '#716cff',
  kind text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
  UNIQUE(pipeline_id, position)
);

CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'disconnected', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL UNIQUE REFERENCES whatsapp_channels(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta_cloud', 'uazapi')),
  external_account_id text,
  phone_number_id text,
  access_token_encrypted text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, phone_number_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  name text,
  first_source text,
  last_source text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, phone_e164)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES whatsapp_channels(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  external_id text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, external_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL DEFAULT 'text',
  body text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, external_id)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES whatsapp_channels(id) ON DELETE SET NULL,
  title text NOT NULL,
  temperature text NOT NULL DEFAULT 'new' CHECK (temperature IN ('new', 'warm', 'hot')),
  estimated_value numeric(14, 2),
  source text,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(14, 2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('negotiation', 'detected', 'confirmed', 'lost')),
  amount numeric(14, 2) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_ads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,
  name text NOT NULL,
  access_token_encrypted text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_account_id)
);

CREATE TABLE IF NOT EXISTS campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  meta_ads_account_id uuid NOT NULL REFERENCES meta_ads_accounts(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  campaign_id text,
  campaign_name text,
  ad_set_id text,
  ad_id text,
  spend numeric(14, 2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(meta_ads_account_id, metric_date, campaign_id, ad_set_id, ad_id)
);

CREATE TABLE IF NOT EXISTS integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  UNIQUE(provider, external_event_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_company_last_seen_idx ON contacts(company_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_company_stage_idx ON opportunities(company_id, stage_id);
CREATE INDEX IF NOT EXISTS messages_conversation_sent_idx ON messages(conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS sales_company_status_idx ON sales(company_id, status, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS integration_events_unprocessed_idx ON integration_events(processed_at) WHERE processed_at IS NULL;
