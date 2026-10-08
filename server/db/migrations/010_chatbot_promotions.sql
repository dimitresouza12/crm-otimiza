ALTER TABLE chatbot_settings
  ADD COLUMN IF NOT EXISTS promotion_message text,
  ADD COLUMN IF NOT EXISTS promotion_in_welcome boolean NOT NULL DEFAULT false;
