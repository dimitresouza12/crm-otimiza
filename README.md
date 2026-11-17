# Otimiza AI CRM

CRM para pequenas empresas que vendem pelo WhatsApp. Junta o funil de vendas, o chat com os clientes, um chatbot configurável e a cobrança da assinatura num lugar só. Está em produção em [crm.otimizai.net.br](https://crm.otimizai.net.br).

## O que tem

- Funil de vendas em Kanban, com etapa, temperatura e valor de cada lead
- Chat em tempo real, com fotos e áudios
- Conexão de 1 a 5 números de WhatsApp por conta, por QR Code, usando a Evolution API v2
- Chatbot por regras: mensagem de boas-vindas, palavras-chave, catálogo com preços, horário de atendimento, roteamento por cidade e pausa quando um atendente assume a conversa
- IA opcional (OpenAI) que transcreve áudios e atualiza etapa, temperatura e valor do lead
- Dashboard com faturamento e ROAS do tráfego pago
- Assinatura recorrente com Asaas (Pix, boleto e cartão), com webhook que ativa ou suspende a conta
- Área de afiliados e painel de administração da plataforma

## Como foi feito

- **Front:** React 19 e Vite, em TypeScript
- **API:** Fastify 5 com JWT, rate limit, Helmet e validação com Zod
- **Banco:** PostgreSQL, com 16 migrações SQL em `server/db/migrations`
- **Segurança:** tokens de WhatsApp e da Meta guardados cifrados, senhas com bcrypt e corpo bruto preservado nos webhooks para checar assinatura
- **Deploy:** Docker, nginx e uma stack para Docker Swarm em `deploy/stack.yml`. O passo a passo para o Easypanel está em `docs/EASYPANEL.md`
- **Backup:** script em `scripts/backup.sh`

## Como rodar

Precisa de Node e de um PostgreSQL. As imagens Docker do projeto usam Node 25.

```bash
npm install
cp .env.example .env     # preencha DATABASE_URL, JWT_SECRET e APP_ENCRYPTION_KEY
npm run db:migrate
npm run api:dev          # API
npm run dev              # front, em outro terminal
```

A chave de cifragem se gera com `openssl rand -base64 32`. As outras variáveis (Evolution API, Meta, OpenAI, Asaas) estão comentadas no `.env.example`.

## Testes

Os testes usam o runner nativo do Node e ficam separados por área:

```bash
npm run test:bot        # lógica do chatbot
npm run test:billing    # Asaas, cartão e documentos
npm run test:plans      # preços e limite de canais
npm run test:ai         # leitura de leads com IA
npm run test:evolution  # integração com a Evolution API
npm run test:admin
npm run test:affiliates
```

## Autor

Dimitre Souza, da [Otimiza Aí](https://otimizai.net.br).
