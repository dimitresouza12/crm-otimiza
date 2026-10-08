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
| `CRM_PUBLIC_URL` | `https://crm.otimizai.net.br` |
| `EVOLUTION_API_URL` | URL interna ou HTTPS da Evolution instalada na VPS |
| `EVOLUTION_API_KEY` | chave global da Evolution, guardada somente no serviço CRM |
| `ALLOW_ORIGINS` | `https://crm.otimizai.net.br` |
| `SALES_WHATSAPP` | Número comercial com DDI e DDD, somente dígitos, usado pelos botões de contato da landing |
| `UPLOADS_DIR` | Pasta das fotos e áudios do chat. Em produção use `/data/uploads` com volume persistente (já previsto em `deploy/stack.yml`) |
| `BACKUP_DIR` | Use `/data/backups` em volume persistente; transfira as cópias para fora da VPS |
| `OPENAI_API_KEY` | Opcional. Chave da OpenAI para transcrever áudios e analisar leads no plano Chatbot. Sem ela, o recurso fica indisponível |
| `OPENAI_ANALYSIS_MODEL` | Opcional. Modelo da análise das conversas. Padrão `gpt-4.1-mini` |
| `OPENAI_TRANSCRIBE_MODEL` | Opcional. Modelo de transcrição de áudio. Padrão `gpt-4o-mini-transcribe` |

O comando da imagem executa a migração do banco antes de iniciar a aplicação. Use a porta interna `3000`. O domínio atual é `crm.otimizai.net.br`, com HTTPS.

## Contratação após o teste

O CRM guarda o plano, o limite de números e o valor mensal escolhido no cadastro. **Não há cobrança automática.** Após os 7 dias, os dados são preservados, mas o acesso fica suspenso. Configure `SALES_WHATSAPP` no aplicativo para que o cliente tenha um botão funcional de contratação nessa tela.

Depois de confirmar a contratação e o pagamento pelo processo comercial, execute no terminal do aplicativo:

```sh
npm run account:activate -- --email cliente@exemplo.com
npm run account:activate -- --email cliente@exemplo.com --apply
```

O primeiro comando é uma prévia; o segundo ativa a conta já existente sem apagar dados ou criar outra empresa. Confira o plano, o limite e o valor mostrados na prévia antes de aplicar. Guarde o comprovante da contratação fora do CRM. Para um novo ciclo de cobrança, a equipe precisa acompanhar a renovação manualmente.

## Cópias de segurança

Mantenha o volume persistente já usado em `UPLOADS_DIR=/data/uploads` e adicione outro volume persistente em `BACKUP_DIR=/data/backups`. Se houver arquivos em produção, não troque o ponto de montagem do volume de uploads sem migrá-los. O comando abaixo gera um dump PostgreSQL e, se existirem, os arquivos de mídia do chat. Os arquivos ficam privados para o usuário do processo.

```sh
npm run db:backup
```

Agende esse comando diariamente no EasyPanel ou na VPS, copie os diretórios gerados para um armazenamento **privado e criptografado fora da VPS** e teste uma restauração antes de receber clientes. O script prepara o backup, mas não configura agendamento nem armazenamento externo sozinho. Dentro de cada diretório, `sha256sum -c SHA256SUMS` confere a integridade. Para restaurar o banco em uma instalação vazia, use `pg_restore --no-owner --no-acl --dbname="$DATABASE_URL" database.dump`; extraia `uploads.tar.gz` em `UPLOADS_DIR`. Não coloque os backups no Git.

## Origem e investimento

Cadastre cada campanha em *Tráfego pago* com nome próprio e período sem sobreposição para a mesma origem. Ao criar o lead, escolha esse nome no campo *Origem*; leads antigos podem ser corrigidos no detalhe do card. O CRM cruza a origem e a data com vendas **confirmadas**. O investimento é informado manualmente e não é importado da Meta Ads. Origem sem campanha pode aparecer nos relatórios de leads e receita, mas não terá investimento nem ROAS confiável.

### IA (opcional, plano Chatbot)

Com `OPENAI_API_KEY` definida, a **Inteligência artificial (GPT)** do plano Chatbot funciona. Ela vem **ligada por padrão** e cada empresa pode desligá-la em *Chatbot → Configuração*. Enquanto ligada:

- áudios recebidos são transcritos e a transcrição alimenta as regras do chatbot;
- cerca de 20 segundos depois da última mensagem, o GPT lê a conversa e atualiza etapa (só avança), temperatura, valor e origem do lead;
- venda confirmada pelo cliente vira venda **detectada** (em revisão), nunca faturamento confirmado; desistência move o lead para Perdidos;
- leads movidos manualmente ficam protegidos da IA por 12 horas;
- cada decisão fica em *Por que mudou?* no detalhe do lead.

O texto das conversas é enviado à OpenAI. Informe isso aos clientes finais (LGPD). Custo por uso, cobrado pela OpenAI.

## 3. Evolution, UAZAPI e n8n

Com `CRM_PUBLIC_URL`, `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` configurados, o cliente abre **Configurações → WhatsApp por QR Code**. O CRM cria uma instância Evolution com token próprio, configura o webhook, mostra o QR Code e acompanha o estado da conexão. Cada canal pertence a uma empresa no banco do CRM. A chave global nunca aparece no navegador.

O webhook da Evolution recebe `MESSAGES_UPSERT` e `CONNECTION_UPDATE`. As mensagens recebidas e enviadas atualizam contatos, conversas e o funil. No plano Chatbot, as regras por número também podem responder pela Evolution, se o chatbot estiver ativado. A instalação testada usa Evolution 2.3.7; nela, `/webhook/set/{instance}` exige a configuração dentro do objeto `webhook`. Os demais endpoints usados são `/instance/create`, `/instance/connect/{instance}`, `/instance/connectionState/{instance}` e `/message/sendText/{instance}`.

No plano Chatbot, o cliente pode configurar respostas por regras para cada número conectado. No plano Automação, a UAZAPI é conectada pela equipe Otimiza AI após o diagnóstico e a implantação. A API e o app Meta não são necessários para o lançamento inicial.

Os fluxos n8n enviam eventos para:

```text
POST https://crm.otimizai.net.br/webhooks/n8n/{companyId}
Header: x-otimiza-n8n-secret: valor de N8N_WEBHOOK_SECRET
```

Cada evento precisa ter `eventId` único e um `event`, como `lead_created`, `qualified`, `proposal_sent`, `sale_detected`, `sale_confirmed` ou `lost`.

## Meta e publicação de conteúdo no futuro

As rotas de Meta permanecem preservadas no backend para uma fase futura. Não configure variáveis, callback ou aplicativo Meta agora. A aba de conteúdo e o agendamento de postagens também não fazem parte do lançamento inicial.

## Conferência final

Depois de publicar, acesse:

```text
https://crm.otimizai.net.br/health
```

O resultado esperado é `status: ok`. Em seguida, conecte um número de teste pela Evolution e leia o QR Code.
