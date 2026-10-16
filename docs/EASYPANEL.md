# PublicaÃ§Ã£o no EasyPanel

O CRM usa um Ãºnico aplicativo conectado ao PostgreSQL interno. Crie apenas o banco e um serviÃ§o de aplicaÃ§Ã£o no mesmo projeto do EasyPanel.

## 1. PostgreSQL

O banco jÃ¡ foi criado no projeto `gestao_padariaideal` com o serviÃ§o `postgres-crm-otimiza`. Mantenha-o sem porta pÃºblica. Para uma instalaÃ§Ã£o nova, crie um serviÃ§o PostgreSQL 17 com os valores abaixo.

| VariÃ¡vel | Valor |
| --- | --- |
| Banco | `otimiza_crm` |
| UsuÃ¡rio | `otimiza_crm` |
| Senha | gere uma senha longa no EasyPanel |

O banco nÃ£o deve ter porta pÃºblica. A aplicaÃ§Ã£o deve usar a URL interna fornecida pelo EasyPanel.

## 2. Aplicativo CRM

Crie um serviÃ§o a partir deste repositÃ³rio do GitHub usando o `Dockerfile` da raiz. Ele compila o painel web, executa a API, aplica as migraÃ§Ãµes e serve tudo no mesmo domÃ­nio. Configure:

| VariÃ¡vel | Como preencher |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | URL interna do PostgreSQL, no formato `postgres://otimiza_crm:SENHA@HOST:5432/otimiza_crm` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `N8N_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `CRM_PUBLIC_URL` | `https://crm.otimizai.net.br` |
| `EVOLUTION_API_URL` | URL interna ou HTTPS da Evolution instalada na VPS |
| `EVOLUTION_API_KEY` | chave global da Evolution, guardada somente no serviÃ§o CRM |
| `ALLOW_ORIGINS` | `https://crm.otimizai.net.br` |
| `SALES_WHATSAPP` | NÃºmero comercial com DDI e DDD, somente dÃ­gitos, usado pelos botÃµes de contato da landing |
| `UPLOADS_DIR` | Pasta das fotos e Ã¡udios do chat. Em produÃ§Ã£o use `/data/uploads` com volume persistente (jÃ¡ previsto em `deploy/stack.yml`) |
| `BACKUP_DIR` | Use `/data/backups` em volume persistente; transfira as cÃ³pias para fora da VPS |
| `OPENAI_API_KEY` | Opcional. Chave da OpenAI para transcrever Ã¡udios e analisar leads no plano Chatbot. Sem ela, o recurso fica indisponÃ­vel |
| `OPENAI_ANALYSIS_MODEL` | Opcional. Modelo da anÃ¡lise das conversas. PadrÃ£o `gpt-4.1-mini` |
| `OPENAI_TRANSCRIBE_MODEL` | Opcional. Modelo de transcriÃ§Ã£o de Ã¡udio. PadrÃ£o `gpt-4o-mini-transcribe` |

O comando da imagem executa a migraÃ§Ã£o do banco antes de iniciar a aplicaÃ§Ã£o. Use a porta interna `3000`. O domÃ­nio atual Ã© `crm.otimizai.net.br`, com HTTPS.

## ContrataÃ§Ã£o apÃ³s o teste

O CRM guarda o plano, o limite de nÃºmeros e o valor mensal escolhido no cadastro. **NÃ£o hÃ¡ cobranÃ§a automÃ¡tica.** ApÃ³s os 7 dias, os dados sÃ£o preservados, mas o acesso fica suspenso. Configure `SALES_WHATSAPP` no aplicativo para que o cliente tenha um botÃ£o funcional de contrataÃ§Ã£o nessa tela.

Depois de confirmar a contrataÃ§Ã£o e o pagamento pelo processo comercial, execute no terminal do aplicativo:

```sh
npm run account:activate -- --email cliente@exemplo.com
npm run account:activate -- --email cliente@exemplo.com --apply
```

O primeiro comando Ã© uma prÃ©via; o segundo ativa a conta jÃ¡ existente sem apagar dados ou criar outra empresa. Confira o plano, o limite e o valor mostrados na prÃ©via antes de aplicar. Guarde o comprovante da contrataÃ§Ã£o fora do CRM. Para um novo ciclo de cobranÃ§a, a equipe precisa acompanhar a renovaÃ§Ã£o manualmente.

## CÃ³pias de seguranÃ§a

Mantenha o volume persistente jÃ¡ usado em `UPLOADS_DIR=/data/uploads` e adicione outro volume persistente em `BACKUP_DIR=/data/backups`. Se houver arquivos em produÃ§Ã£o, nÃ£o troque o ponto de montagem do volume de uploads sem migrÃ¡-los. O comando abaixo gera um dump PostgreSQL e, se existirem, os arquivos de mÃ­dia do chat. Os arquivos ficam privados para o usuÃ¡rio do processo.

```sh
npm run db:backup
```

Agende esse comando diariamente no EasyPanel ou na VPS, copie os diretÃ³rios gerados para um armazenamento **privado e criptografado fora da VPS** e teste uma restauraÃ§Ã£o antes de receber clientes. O script prepara o backup, mas nÃ£o configura agendamento nem armazenamento externo sozinho. Dentro de cada diretÃ³rio, `sha256sum -c SHA256SUMS` confere a integridade. Para restaurar o banco em uma instalaÃ§Ã£o vazia, use `pg_restore --no-owner --no-acl --dbname="$DATABASE_URL" database.dump`; extraia `uploads.tar.gz` em `UPLOADS_DIR`. NÃ£o coloque os backups no Git.

## Origem e investimento

Cadastre cada campanha em *TrÃ¡fego pago* com nome prÃ³prio e perÃ­odo sem sobreposiÃ§Ã£o para a mesma origem. Ao criar o lead, escolha esse nome no campo *Origem*; leads antigos podem ser corrigidos no detalhe do card. O CRM cruza a origem e a data com vendas **confirmadas**. O investimento Ã© informado manualmente e nÃ£o Ã© importado da Meta Ads. Origem sem campanha pode aparecer nos relatÃ³rios de leads e receita, mas nÃ£o terÃ¡ investimento nem ROAS confiÃ¡vel.

### IA (opcional, plano Chatbot)

Com `OPENAI_API_KEY` definida, a **InteligÃªncia artificial (GPT)** do plano Chatbot funciona. Ela vem **ligada por padrÃ£o** e cada empresa pode desligÃ¡-la em *Chatbot â†’ ConfiguraÃ§Ã£o*. Enquanto ligada:

- Ã¡udios recebidos sÃ£o transcritos e a transcriÃ§Ã£o alimenta as regras do chatbot;
- cerca de 20 segundos depois da Ãºltima mensagem, o GPT lÃª a conversa e atualiza etapa (sÃ³ avanÃ§a), temperatura, valor e origem do lead;
- venda confirmada pelo cliente vira venda **detectada** (em revisÃ£o), nunca faturamento confirmado; desistÃªncia move o lead para Perdidos;
- leads movidos manualmente ficam protegidos da IA por 12 horas;
- cada decisÃ£o fica em *Por que mudou?* no detalhe do lead.

O texto das conversas Ã© enviado Ã  OpenAI. Informe isso aos clientes finais (LGPD). Custo por uso, cobrado pela OpenAI.

## 3. Evolution, UAZAPI e n8n

Com `CRM_PUBLIC_URL`, `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` configurados, o cliente abre **ConfiguraÃ§Ãµes â†’ WhatsApp por QR Code**. O CRM cria uma instÃ¢ncia Evolution com token prÃ³prio, configura o webhook, mostra o QR Code e acompanha o estado da conexÃ£o. Cada canal pertence a uma empresa no banco do CRM. A chave global nunca aparece no navegador.

O webhook da Evolution recebe `MESSAGES_UPSERT` e `CONNECTION_UPDATE`. As mensagens recebidas e enviadas atualizam contatos, conversas e o funil. No plano Chatbot, as regras por nÃºmero tambÃ©m podem responder pela Evolution, se o chatbot estiver ativado. A instalaÃ§Ã£o testada usa Evolution 2.3.7; nela, `/webhook/set/{instance}` exige a configuraÃ§Ã£o dentro do objeto `webhook`. Os demais endpoints usados sÃ£o `/instance/create`, `/instance/connect/{instance}`, `/instance/connectionState/{instance}` e `/message/sendText/{instance}`.

No plano Chatbot, o cliente pode configurar respostas por regras para cada nÃºmero conectado. No plano AutomaÃ§Ã£o, a UAZAPI Ã© conectada pela equipe Otimiza AI apÃ³s o diagnÃ³stico e a implantaÃ§Ã£o. A API e o app Meta nÃ£o sÃ£o necessÃ¡rios para o lanÃ§amento inicial.

Os fluxos n8n enviam eventos para:

```text
POST https://crm.otimizai.net.br/webhooks/n8n/{companyId}
Header: x-otimiza-n8n-secret: valor de N8N_WEBHOOK_SECRET
```

Cada evento precisa ter `eventId` Ãºnico e um `event`, como `lead_created`, `qualified`, `proposal_sent`, `sale_detected`, `sale_confirmed` ou `lost`.

## Meta e publicaÃ§Ã£o de conteÃºdo no futuro

As rotas de Meta permanecem preservadas no backend para uma fase futura. NÃ£o configure variÃ¡veis, callback ou aplicativo Meta agora. A aba de conteÃºdo e o agendamento de postagens tambÃ©m nÃ£o fazem parte do lanÃ§amento inicial.

## ConferÃªncia final

Depois de publicar, acesse:

```text
https://crm.otimizai.net.br/health
```

O resultado esperado Ã© `status: ok`. Em seguida, conecte um nÃºmero de teste pela Evolution e leia o QR Code.

## Operação: contas e senhas

O CRM ainda não tem "esqueci minha senha" por e-mail. Enquanto isso, quem administra redefine a senha pelo servidor. No EasyPanel, abra o serviço do CRM, entre no **Console** e rode (o `DATABASE_URL` já está no ambiente do serviço):

```sh
# 1. Achar a conta (lista e-mail, nome e empresa; nunca mostra senhas)
npm run account:reset-password -- --list parte-do-email-ou-nome

# 2. Prévia: confirma a conta, não altera nada
npm run account:reset-password -- --email pessoa@exemplo.com

# 3. Redefinir: gera uma senha aleatória e mostra uma única vez
npm run account:reset-password -- --email pessoa@exemplo.com --apply

# Ou definir uma senha escolhida (8 a 100 caracteres)
npm run account:reset-password -- --email pessoa@exemplo.com --apply --password 'SenhaEscolhida1'
```

Observações:

- A senha é guardada como hash bcrypt (custo 12), igual ao cadastro; ninguém consegue ler a senha antiga.
- Quem já estava logado continua com a sessão atual até ela expirar.
- Ativar uma conta depois do teste: `npm run account:activate -- --email cliente@exemplo.com --apply`.
