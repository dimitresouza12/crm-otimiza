# Otimiza CRM — especificação de produto

## Objetivo

Criar um CRM SaaS da Otimiza AI para clientes acompanharem seus atendimentos de WhatsApp, leads, vendas, faturamento e resultados de tráfego pago. A marca, a infraestrutura e as integrações são da Otimiza AI; o cliente apenas entra no seu espaço privado para operar e acompanhar os dados.

O CRM atende dois cenários no mesmo produto:

1. **CRM observador:** o cliente atende normalmente pelo WhatsApp. O sistema recebe os eventos da instância, organiza conversas e leads, e analisa o processo comercial sem enviar respostas automáticas.
2. **CRM com automação:** a equipe da Otimiza AI vincula a instância e o fluxo n8n já operado pelo cliente. A automação pode qualificar, mover etapas e criar eventos comerciais no CRM.

## Pessoas e permissões

| Perfil | Acesso |
| --- | --- |
| Administrador Otimiza AI | Cria empresas, convida usuários, vincula instâncias UAZAPI, configura n8n, Meta Ads, produtos, regras e suporte. Pode ver todas as empresas. |
| Dono do cliente | Vê os dados da própria empresa, convida sua equipe, configura metas, produtos e etapas permitidas. |
| Gestor do cliente | Opera CRM, vendas, relatórios e tráfego pago da própria empresa. |
| Atendente do cliente | Vê e trabalha leads e conversas atribuídos, sem acesso a integrações ou dados de outros usuários. |
| Visualizador do cliente | Consulta dashboard e relatórios sem alterar informações. |

Nenhum usuário do cliente recebe token UAZAPI, URL de webhook, credencial n8n ou segredo da Meta.

## Navegação do cliente

1. **Dashboard** — primeira aba. Exibe receita confirmada, vendas detectadas, leads, conversão, ticket médio, meta, alertas e visão resumida do tráfego pago.
2. **CRM** — segunda aba. Quadro kanban do funil com etapas configuráveis. Cada card mostra contato, origem, última interação, valor, responsável, temperatura e próxima ação.
3. **Leads** — lista e filtros avançados, dados de contato, origem, etiquetas, responsável e histórico de mudanças.
4. **Conversas** — histórico por lead, com indicação de mensagens recebidas/enviadas e eventos do atendimento. No MVP esta aba é de consulta; envio pelo CRM será fase posterior.
5. **Vendas** — oportunidades com produto, valor estimado, valor detectado, valor confirmado, motivo de perda e evidência da conversa.
6. **Tráfego pago** — contas Meta Ads conectadas, investimento, campanhas, leads, vendas, CAC e ROAS.
7. **Relatórios** — comparativos por período, origem, campanha, produto, responsável e etapa.
8. **Configurações** — equipe, metas, produtos, serviços, regras de funil e perfil da empresa. Integrações aparecem apenas como estado de conexão.

O ambiente administrativo da Otimiza AI terá páginas próprias para Empresas, Conexões WhatsApp, Automações n8n, Contas Meta Ads, Saúde das integrações e Suporte.

## Jornada de onboarding

1. A equipe Otimiza AI cria a empresa e o primeiro usuário do cliente.
2. A equipe cria ou seleciona manualmente a instância no painel UAZAPI e realiza o pareamento com o WhatsApp Business.
3. A equipe vincula a instância à empresa no painel administrativo do CRM e configura a entrega de eventos.
4. Para clientes com automação, a equipe associa o fluxo n8n e seus eventos comerciais à mesma empresa.
5. A equipe cadastra produtos, preços, etapas do funil e regras de análise.
6. Quando o cliente autorizar, conecta sua conta Meta Ads e seleciona a conta de anúncios.
7. O cliente recebe o convite e entra diretamente em seu Dashboard.

O pareamento do WhatsApp continua exigindo a ação humana de escanear o QR code ou usar o código de pareamento. O CRM não tenta simular essa autorização.

## Fluxo de dados

### WhatsApp sem automação de atendimento

```text
WhatsApp → instância UAZAPI → receptor de eventos do CRM → fila → normalização → CRM
```

O CRM cria ou atualiza o contato pelo identificador da conversa, registra as mensagens e calcula atividade, primeira resposta, tempo sem retorno e atendimento por usuário. Só conversas individuais entram no funil padrão; grupos e canais são descartados por regra.

### WhatsApp com automação n8n

```text
WhatsApp → instância UAZAPI → n8n → automação e evento comercial → API do CRM → CRM
```

O n8n continua responsável pelas respostas e ações existentes. Ele envia eventos estruturados ao CRM, por exemplo `lead_created`, `qualified`, `proposal_sent`, `sale_detected`, `sale_confirmed` e `lost`. Isso preserva os fluxos em produção. Quando a configuração UAZAPI permitir múltiplos destinos de webhook, o CRM também pode receber uma cópia dos eventos de mensagem para manter o histórico.

Todo evento deve ser idempotente, ter um identificador externo e pertencer a uma única empresa. O receptor responde rapidamente e processa em fila, pois webhooks podem repetir ou chegar fora de ordem.

## Inteligência comercial sem responder mensagens

Após uma pausa configurável na conversa, um worker analisa o contexto e retorna um resultado estruturado: intenção, etapa sugerida, temperatura, produto, quantidade, valor, motivo de perda e confiança. O sistema aplica apenas ações permitidas pela confiança e preserva a evidência da conversa.

Estados financeiros obrigatórios:

| Estado | Definição |
| --- | --- |
| Valor em negociação | Preço citado ou proposta enviada. Não compõe faturamento. |
| Venda detectada | A conversa indica aceite, mas ainda exige validação ou pagamento. |
| Receita confirmada | Pagamento confirmado por integração, comprovante validado ou ação manual autorizada. Compõe faturamento. |

Uma edição manual feita por um usuário bloqueia a alteração automática da mesma etapa até uma nova evidência forte ou uma liberação explícita. Vendas detectadas com baixa confiança entram em fila de revisão, em vez de alterar a receita.

## Atribuição de tráfego pago

O CRM sincroniza a conta Meta Ads autorizada para trazer investimento, alcance, impressões, cliques, resultados e hierarquia de campanha/conjunto/anúncio. A sincronização é periódica e mantém valor, moeda e fuso do relatório.

Para associar uma conversa específica do WhatsApp a uma campanha, o CRM usa links rastreáveis da Otimiza AI com UTMs e código de campanha. O código é salvo antes da abertura do WhatsApp e associado ao lead quando a conversa começa. Dados de anúncios e dados de receita são mostrados separadamente até haver essa associação.

Cada lead mantém primeiro toque e último toque. Relatórios mostram investimento, leads, qualificados, vendas, faturamento confirmado, CPL, CAC e ROAS por origem e campanha.

## Modelo de dados de alto nível

- `Empresa`: tenant proprietário de todos os dados do cliente.
- `Membership`: vínculo entre usuário, empresa e papel.
- `WhatsAppConnection`: instância UAZAPI vinculada, estado da sessão, apelido e credenciais cifradas no servidor.
- `Contato`: pessoa identificada pelo número normalizado dentro da empresa.
- `Conversa` e `Mensagem`: histórico relacionado a contato e conexão.
- `Funil` e `EtapaFunil`: etapas por empresa; o funil padrão vem pronto, mas pode ser adaptado.
- `Oportunidade`: card comercial relacionado a contato, com responsável, etapa, temperatura e valores.
- `Venda`: produto, quantidade, valor, estado de confirmação, origem e evidência.
- `EventoIntegracao`: caixa de entrada idempotente para UAZAPI, n8n, Meta e pagamentos.
- `ProdutoServico`: catálogo e regras de identificação por empresa.
- `Origem` e `Atribuicao`: UTMs, campanha, conjunto, anúncio, primeiro/último toque.
- `ContaMetaAds` e `MetricaAds`: conta autorizada e métricas sincronizadas por data e nível.
- `Auditoria`: registro de alterações manuais e automáticas, ator, motivo e evidência.

Todo registro comercial tem `empresaId`. Consultas e mutações obrigatoriamente validam a associação do usuário com a empresa antes de acessar dados.

## Interface visual

A interface toma a referência fornecida como direção visual: sidebar fixa clara, cabeçalho leve, filtros compactos e kanban com cards brancos. A identidade será própria da Otimiza AI, sem reproduzir marca, textos ou ativos da referência.

O kanban prioriza leitura operacional: cartões com faixa colorida por etapa, temperatura discreta, valor, origem, última interação e responsável. O Dashboard começa pelos números comerciais e pelos alertas acionáveis, não por gráficos decorativos.

## Segurança e privacidade

- Tokens UAZAPI, n8n e Meta são cifrados em repouso, usados apenas pelo backend e removidos de logs.
- Webhooks autenticam a conexão e validam empresa antes de processar dados.
- Conteúdo de mensagem é acessível somente à empresa correspondente e fica sujeito a política de retenção configurável.
- A aplicação registra alterações de etapa, valor e confirmação de receita com data, ator e origem.

## Planos comerciais

O produto é vendido pela Otimiza AI em reais, por empresa e não por usuário. Cada plano inclui uma franquia de capacidade; números de WhatsApp, usuários, análises e configurações acima do limite são adicionais.

| Plano | Preço mensal | Escopo |
| --- | ---: | --- |
| Otimiza CRM Essencial | R$ 89,90 | Dashboard, CRM, leads, conversas, vendas, 1 WhatsApp, até 2 usuários e até 1.000 análises de conversa. |
| Otimiza CRM Pro | R$ 119,90 | Tudo do Essencial, até 5 usuários, até 5.000 análises, produtos, metas, relatórios completos, Meta Ads e atribuição de campanhas. |
| Otimiza CRM Chatbot | R$ 179,90 | Tudo do Pro e chatbot visual por regras: menus, palavras-chave, horário, coleta de dados, etiquetas e movimentação de funil. |
| Otimiza Automação | A partir de R$ 249,90 | Tudo do Chatbot e automação n8n padronizada da Otimiza AI, com configuração operacional da equipe. Fluxos customizados são orçados separadamente. |

O cliente recebe sete dias de teste do plano Pro. O prazo começa quando o WhatsApp estiver conectado ou, no plano com automação, quando a Otimiza AI concluir a ativação. Durante o onboarding são coletados segmento, objetivo principal e o uso atual da automação Otimiza AI.

Custos de mensagens cobrados pela Meta, quando existirem, não fazem parte da mensalidade. A conexão assistida de WhatsApp e a configuração customizada de chatbot podem ser cobradas como serviço de implantação.
- O onboarding exige que cada empresa mantenha base legal e avisos adequados para o tratamento de dados de seus contatos.

## Tratamento de falhas

- A desconexão da instância aparece no Dashboard e na central administrativa, sem apagar dados históricos.
- Eventos duplicados são ignorados pelo identificador externo; eventos atrasados não sobrescrevem atualizações mais novas.
- Uma falha de sincronização Meta Ads mostra a última atualização bem-sucedida e permite nova tentativa.
- A análise por IA nunca impede a gravação de mensagens nem o funcionamento do funil manual.

## Entrega em fases

### Fase 1 — CRM observador

Multiempresa, login, Dashboard, kanban CRM, leads, histórico de conversas, conexão UAZAPI feita pela Otimiza AI, produtos, vendas manuais e indicadores básicos.

### Fase 2 — Inteligência comercial

Análise de conversas, etapas sugeridas, temperatura, detecção de valor, vendas pendentes de confirmação, alertas de leads parados e auditoria.

### Fase 3 — Automações e tráfego pago

Eventos n8n por empresa, atribuição de automação, conexão Meta Ads, links rastreáveis e relatórios de CAC/ROAS.

### Fase 4 — Operação avançada

Inbox com envio pelo CRM, metas, tarefas, relatórios agendados, integrações de pagamento e pesquisa de satisfação.

## Verificação de entrega

- Um usuário cliente nunca visualiza dados de outra empresa, nem alterando URL ou requisição.
- Um evento duplicado não cria contato, mensagem, oportunidade ou venda duplicados.
- Uma nova conversa individual cria ou atualiza o contato correto e aparece no CRM.
- Uma venda detectada não soma no faturamento até ser confirmada.
- Uma venda confirmada aparece no Dashboard e no relatório da campanha atribuída.
- Uma campanha Meta Ads sem conversas atribuídas apresenta investimento e métricas de mídia, sem atribuir receita indevidamente.
- Uma instância desconectada gera alerta sem afetar o acesso aos dados históricos.
