-- A IA (transcrição de áudio e análise de leads) passa a vir ligada por padrão.
-- Roda uma única vez: depois que o padrão vira "true", uma escolha manual de desligar nunca mais é sobrescrita.
DO $$
DECLARE
  current_default text;
BEGIN
  SELECT column_default INTO current_default
  FROM information_schema.columns
  WHERE table_name = 'chatbot_settings' AND column_name = 'ai_enabled';
  IF current_default = 'false' THEN
    ALTER TABLE chatbot_settings ALTER COLUMN ai_enabled SET DEFAULT true;
    UPDATE chatbot_settings SET ai_enabled = true;
  END IF;
END $$;
