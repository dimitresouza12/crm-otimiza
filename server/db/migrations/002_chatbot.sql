CREATE TABLE IF NOT EXISTS chatbot_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  welcome_message text,
  fallback_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chatbot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES whatsapp_channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('keyword', 'first_message')),
  trigger_value text,
  response_text text NOT NULL,
  stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_rules_channel_position_idx ON chatbot_rules(channel_id, position);
