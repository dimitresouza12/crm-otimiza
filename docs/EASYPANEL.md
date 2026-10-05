# Publicação no EasyPanel

O CRM usa um único aplicativo conectado ao PostgreSQL interno. Crie apenas o banco e um serviço de aplicação no mesmo projeto do EasyPanel.

## 1. PostgreSQL

O banco já foi criado no projeto `gestao_padariaideal` com o serviço `postgres-crm-otimiza`. Mantenha-o sem porta pública. Para uma instalação nova, crie um serviço PostgreSQL 17 com os valores abaixo.

| Variável | Valor |
| --- | --- |
| Banco | `otimiza_crm` |
| Usuário | `otimiza_crm` |
| Senha | gere uma senha longa no EasyPanel |

O banco não deve ter porta pública. A aplicação deve usar a URL interna fornecida pelo EasyPanel.

## 2. Aplicativo CRM

Crie um serviço a partir deste repositório do GitHub usando o `Dockerfile` da raiz. Ele compila o painel web, executa a API, aplica as migrações e serve tudo no mesmo domínio. Configure:

| Variável | Como preencher |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | URL interna do PostgreSQL, no formato `postgres://otimiza_crm:SENHA@HOST:5432/otimiza_crm` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `N8N_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `CRM_PUBLIC_URL` | URL pública HTTPS do CRM, por exemplo `https://crm.seudominio.com` |
| `EVOLUTION_API_URL` | URL interna ou HTTPS da Evolution instalada na VPS |
| `EVOLUTION_API_KEY` | chave global da Evolution, guardada somente no serviço CRM |
| `ALLOW_ORIGINS` | `https://crm.SEUDOMINIO.com` quando o domínio estiver ativo |
| `SALES_WHATSAPP` | Número comercial com DDI e DDD, somente dígitos, usado pelos botões de contato da landing |

O comando da imagem executa a migração do banco antes de iniciar a aplicação. Use a porta interna `3000`. Quando o subdomínio estiver apontado, associe `crm.SEUDOMINIO.com` ao serviço com HTTPS ativo.

## 3. Evolution, UAZAPI e n8n

Com `CRM_PUBLIC_URL`, `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` configurados, o cliente abre **Configurações → WhatsApp por QR Code**. O CRM cria uma instância Evolution com token próprio, configura o webhook, mostra o QR Code e acompanha o estado da conexão. Cada canal pertence a uma empresa no banco do CRM. A chave global nunca aparece no navegador.

O webhook da Evolution recebe `MESSAGES_UPSERT` e `CONNECTION_UPDATE`. As mensagens recebidas e enviadas atualizam contatos, conversas e o funil. No plano Chatbot, as regras por número também podem responder pela Evolution, se o chatbot estiver ativado. A instalação testada usa Evolution 2.3.7; nela, `/webhook/set/{instance}` exige a configuração dentro do objeto `webhook`. Os demais endpoints usados são `/instance/create`, `/instance/connect/{instance}`, `/instance/connectionState/{instance}` e `/message/sendText/{instance}`.

No plano Chatbot, o cliente pode configurar respostas por regras para cada número conectado. No plano Automação, a UAZAPI é conectada pela equipe Otimiza AI após o diagnóstico e a implantação. A API e o app Meta não são necessários para o lançamento inicial.

Os fluxos n8n enviam eventos para:

```text
POST https://crm.SEUDOMINIO.com/webhooks/n8n/{companyId}
Header: x-otimiza-n8n-secret: valor de N8N_WEBHOOK_SECRET
```

Cada evento precisa ter `eventId` único e um `event`, como `lead_created`, `qualified`, `proposal_sent`, `sale_detected`, `sale_confirmed` ou `lost`.

## Meta e publicação de conteúdo no futuro

As rotas de Meta permanecem preservadas no backend para uma fase futura. Não configure variáveis, callback ou aplicativo Meta agora. A aba de conteúdo e o agendamento de postagens também não fazem parte do lançamento inicial.

## Conferência final

Depois de publicar, acesse:

```text
https://crm.SEUDOMINIO.com/health
```

O resultado esperado é `status: ok`. Em seguida, conecte um número de teste pela Evolution e leia o QR Code.
