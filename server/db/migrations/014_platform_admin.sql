-- Painel master da Otimiza: contas da equipe com acesso entre empresas.
-- 'master' vê financeiro, chatbot e tráfego; 'traffic' (gestor de tráfego) vê só chatbot e tráfego.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS platform_role text;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_role_check;
ALTER TABLE users ADD CONSTRAINT users_platform_role_check CHECK (platform_role IS NULL OR platform_role IN ('master', 'traffic'));

-- Autorização do cliente para a equipe de tráfego ler as conversas (somente leitura).
-- Preenchida quando o titular liga a opção em Configurações; NULL = sem autorização.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS traffic_access_granted_at timestamptz;

-- Trilha de auditoria de tudo que a equipe faz dentro da conta de um cliente.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_company_idx ON admin_audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_user_idx ON admin_audit_log(user_id, created_at DESC);
