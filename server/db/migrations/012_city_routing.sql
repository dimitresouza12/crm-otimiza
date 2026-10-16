-- Atendimento por cidade: o bot manda o link do WhatsApp da unidade da cidade que o cliente citou.
-- locations: [{ id, city, aliases[], phone, label }]; ask_city: perguntar a cidade na 1ª resposta
-- quando o cliente ainda não disse; location_message: texto do encaminhamento ({cidade} {unidade} {link}).
ALTER TABLE chatbot_settings
  ADD COLUMN IF NOT EXISTS locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ask_city boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_message text;
