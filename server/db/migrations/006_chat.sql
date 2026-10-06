ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by text CHECK (sent_by IN ('customer', 'bot', 'agent', 'phone'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_path text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_name text;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_paused_until timestamptz;

CREATE INDEX IF NOT EXISTS messages_conversation_sent_idx ON messages(conversation_id, sent_at);

UPDATE messages SET sent_by = 'customer' WHERE sent_by IS NULL AND direction = 'inbound';
UPDATE messages SET sent_by = 'bot' WHERE sent_by IS NULL AND direction = 'outbound' AND raw_payload->>'source' = 'chatbot';
