ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript text;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage_locked_until timestamptz;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_summary_at timestamptz;

CREATE TABLE IF NOT EXISTS opportunity_ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  reason text,
  confidence numeric(3, 2),
  proposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_ai_events_opportunity_idx ON opportunity_ai_events(opportunity_id, created_at DESC);
