-- Configuração simples do chatbot
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS off_hours_message text;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{"enabled":false,"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS bot_mode text NOT NULL DEFAULT 'always';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS catalog jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS price_replies_enabled boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chatbot_settings_bot_mode_check') THEN
    ALTER TABLE chatbot_settings ADD CONSTRAINT chatbot_settings_bot_mode_check CHECK (bot_mode IN ('always', 'outside_hours'));
  END IF;
END $$;

-- As respostas por assunto valem para a empresa toda, então podem ser criadas antes de conectar um número
ALTER TABLE chatbot_rules ALTER COLUMN channel_id DROP NOT NULL;

-- Conversas: mensagens não lidas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'agent_read_at') THEN
    ALTER TABLE conversations ADD COLUMN agent_read_at timestamptz;
    UPDATE conversations SET agent_read_at = now();
  END IF;
END $$;

-- Mensagens: status de entrega e mensagem respondida
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_external_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_text text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_from text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_delivery_status_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_delivery_status_check CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed'));
  END IF;
END $$;

UPDATE messages SET delivery_status = 'sent' WHERE direction = 'outbound' AND delivery_status IS NULL;
