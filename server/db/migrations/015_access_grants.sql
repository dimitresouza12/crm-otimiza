-- Acesso liberado manualmente pela equipe (mensal, anual ou vitalício), sem passar pelo Asaas.
-- access_grant_kind: monthly | annual | lifetime. access_grant_until: fim do acesso (NULL no vitalício).
-- O teste grátis estendido continua em trial_ends_at; isto aqui é só para acesso concedido.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS access_grant_kind text,
  ADD COLUMN IF NOT EXISTS access_grant_until timestamptz,
  ADD COLUMN IF NOT EXISTS access_grant_note text,
  ADD COLUMN IF NOT EXISTS access_granted_at timestamptz;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_access_grant_kind_check;
ALTER TABLE companies ADD CONSTRAINT companies_access_grant_kind_check
  CHECK (access_grant_kind IS NULL OR access_grant_kind IN ('monthly', 'annual', 'lifetime'));
