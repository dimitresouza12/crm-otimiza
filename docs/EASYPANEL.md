# Publicação no EasyPanel

O CRM tem dois serviços de aplicação e um banco PostgreSQL. Crie os três no mesmo projeto do EasyPanel.

## 1. PostgreSQL

Crie um serviço PostgreSQL 17 com os valores abaixo. Guarde a senha criada pelo painel.

| Variável | Valor |
| --- | --- |
| Banco | `otimiza_crm` |
| Usuário | `otimiza_crm` |
| Senha | gere uma senha longa no EasyPanel |

O banco não deve ter porta pública. A aplicação deve usar a URL interna fornecida pelo EasyPanel.

## 2. API

Crie um serviço a partir deste repositório, usando o arquivo `Dockerfile.api`. Configure:

| Variável | Como preencher |
| --- | --- |
| `NODE_ENV` | `production` |
| `API_PORT` | `3001` |
| `DATABASE_URL` | URL interna do PostgreSQL, no formato `postgres://otimiza_crm:SENHA@HOST:5432/otimiza_crm` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `META_VERIFY_TOKEN` | `openssl rand -hex 32` |
| `META_APP_ID` | ID do app Meta, quando ele for criado |
| `META_APP_SECRET` | segredo do app Meta |
| `N8N_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `ALLOW_ORIGINS` | `https://crm.SEUDOMINIO.com` |

O comando da imagem executa a migração do banco antes de iniciar a API. A API deve receber o subdomínio `api.crm.SEUDOMINIO.com`, com HTTPS ativo.

## 3. Frontend

Crie outro serviço a partir deste repositório usando `Dockerfile.web`.

Associe o domínio `crm.SEUDOMINIO.com`, com HTTPS. Quando o domínio estiver apontado, altere `ALLOW_ORIGINS` na API para o endereço exato desse CRM e faça novo deploy da API.

## 4. Meta Cloud API

No Meta for Developers, crie um aplicativo Business, adicione WhatsApp e configure:

- URL de callback: `https://api.crm.SEUDOMINIO.com/webhooks/meta`
- Token de verificação: o mesmo valor de `META_VERIFY_TOKEN`
- Campo assinado: `messages`

O endpoint valida o desafio de assinatura e valida `X-Hub-Signature-256` quando `META_APP_SECRET` estiver configurado. Para o cliente conectar o próprio número, ative o fluxo **Embedded Signup** no app Meta e informe `META_APP_ID` e `META_APP_SECRET` na API.

## 5. UAZAPI e n8n

Para cada instância UAZAPI, registre um canal no CRM. A API retorna um caminho de webhook próprio e um segredo por conexão; eles devem ser configurados no painel da instância pela equipe Otimiza AI.

Os fluxos n8n enviam eventos para:

```text
POST https://api.crm.SEUDOMINIO.com/webhooks/n8n/{companyId}
Header: x-otimiza-n8n-secret: valor de N8N_WEBHOOK_SECRET
```

Cada evento precisa ter `eventId` único e um `event`, como `lead_created`, `qualified`, `proposal_sent`, `sale_detected`, `sale_confirmed` ou `lost`.

## Conferência final

Depois de publicar, acesse:

```text
https://api.crm.SEUDOMINIO.com/health
```

O resultado esperado é `status: ok`. Só então configure o callback no app Meta e conecte um número de teste.
