ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'active'
  CHECK (billing_status IN ('trial', 'active', 'expired'));

CREATE TABLE IF NOT EXISTS traffic_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source text NOT NULL,
  platform text NOT NULL DEFAULT 'Meta Ads',
  period_start date NOT NULL,
  period_end date NOT NULL,
  spend numeric(14, 2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  reported_leads integer NOT NULL DEFAULT 0 CHECK (reported_leads >= 0),
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE(company_id, source, platform, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS traffic_metrics_company_period_idx
  ON traffic_metrics(company_id, period_start DESC, period_end DESC);

CREATE INDEX IF NOT EXISTS opportunities_company_source_created_idx
  ON opportunities(company_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS sales_company_confirmed_idx
  ON sales(company_id, confirmed_at DESC) WHERE status = 'confirmed';
