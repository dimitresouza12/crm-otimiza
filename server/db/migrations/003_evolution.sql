ALTER TABLE whatsapp_connections DROP CONSTRAINT IF EXISTS whatsapp_connections_provider_check;
ALTER TABLE whatsapp_connections ADD CONSTRAINT whatsapp_connections_provider_check
  CHECK (provider IN ('meta_cloud', 'uazapi', 'evolution'));

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_evolution_instance_idx
  ON whatsapp_connections (external_account_id) WHERE provider = 'evolution';
