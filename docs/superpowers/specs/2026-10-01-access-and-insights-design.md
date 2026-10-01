# Otimiza CRM — acesso comercial e módulos de resultado

## Objetivo

Preparar o CRM para uso por clientes reais sem expor a demonstração como se fosse uma conta ativa. A entrega adiciona uma entrada pública própria, protege os dados operacionais por sessão e conclui as telas de Tráfego pago, Relatórios, Central de ajuda e Notificações.

A aba Conteúdo e a publicação no Instagram não fazem parte desta entrega.

## Decisão de produto

O endereço do CRM abre na tela de acesso enquanto não houver uma sessão válida. O visitante pode entrar em uma conta existente ou criar uma avaliação de sete dias. Depois do acesso, ele entra no Dashboard da própria empresa.

A demonstração visual não fica disponível no ambiente publicado. Ela pode permanecer somente no desenvolvimento local, ativada explicitamente por configuração, para não criar dados falsos para clientes.

## Fluxo de acesso

1. A tela pública apresenta a marca Otimiza AI CRM, uma síntese de valor e os botões **Entrar** e **Começar teste grátis**.
2. O cadastro coleta nome, empresa, e-mail, senha, segmento, objetivo e se já usa automação Otimiza AI.
3. A API cria empresa, usuário proprietário, vínculo de acesso, funil padrão e teste de sete dias.
4. Após o primeiro acesso, um onboarding curto direciona o cliente: quem já usa automação vê o pedido de contato com a Otimiza; os demais são levados à conexão do WhatsApp por QR Code.
5. A sessão é mantida no navegador. Ao sair, a aplicação retorna à tela de acesso e remove os dados locais da sessão.
6. Se a avaliação venceu e a empresa não possui plano ativo, a aplicação mostra uma tela de plano e bloqueia as páginas operacionais. Usuários `otimiza_admin` mantêm acesso.

Esta entrega inclui a interface e a regra de expiração. Cobrança, recuperação de senha por e-mail, confirmação de e-mail e convite de equipe ficam para uma fase posterior, pois exigem provedor transacional e integração de pagamento.

## Navegação autenticada

| Aba | Resultado mostrado | Dados nesta entrega |
| --- | --- | --- |
| Dashboard | Receita confirmada, vendas, leads e ticket médio | Dados existentes de vendas e oportunidades |
| CRM | Kanban comercial | Dados existentes de oportunidades |
| Leads | Lista de leads | Dados existentes de contatos e oportunidades |
| Conversas | Histórico e última mensagem | Dados existentes de conversas e mensagens |
| Vendas | Vendas confirmadas e pendentes | Dados existentes de vendas |
| Tráfego pago | Origem, investimento, leads, vendas, receita, CPL, CAC e ROAS | Métricas preenchidas pelo cliente, com estado preparado para futura sincronização Meta Ads |
| Relatórios | Comparativos por período, origem e funil | Cálculos a partir de leads, vendas e métricas de tráfego |
| Central de ajuda | Guias de início, WhatsApp, funil e atendimento | Conteúdo local do produto e atalhos internos |
| Notificações | Alertas operacionais | Alertas calculados de canal desconectado, leads sem retorno e teste perto do fim |

## Tráfego pago

O objetivo da primeira versão é o cliente ver a relação entre origem, investimento e receita antes de conectar qualquer conta de anúncios. Ele cadastra uma fonte/campanha com nome, plataforma, período, investimento e volume de leads. A origem da oportunidade é usada para relacionar vendas confirmadas à campanha.

Indicadores:

- Investimento: total informado no período.
- Leads: oportunidades com a origem da campanha.
- Vendas: vendas confirmadas das oportunidades atribuídas.
- Receita: soma de vendas confirmadas atribuídas.
- CPL: investimento dividido por leads.
- CAC: investimento dividido por vendas confirmadas.
- ROAS: receita dividida por investimento.

Caso a origem ainda não possua vendas, CAC e ROAS aparecem como indisponíveis, sem inventar valor. Uma integração Meta Ads futura grava métricas na mesma estrutura, substituindo o preenchimento manual por sincronização.

## Relatórios

Relatórios usam os dados reais do CRM por empresa e filtro de período. A página possui seletor de período, resumo comercial, distribuição do funil, origens que geram receita e tabela com métricas por origem.

Os números de receita consideram apenas vendas com status `confirmed`. Valores em negociação e vendas detectadas não entram em faturamento. A primeira versão mostra os relatórios em tela e permite impressão pelo navegador; exportação CSV/PDF fica posterior.

## Central de ajuda e notificações

A Central de ajuda abre um painel com passos de conexão por Evolution, explicação de cada etapa do funil, como confirmar uma venda e como cadastrar uma origem de tráfego. Não depende de IA nem de atendimento externo.

Notificações são geradas no carregamento dos dados da empresa:

- WhatsApp conectado há mais de 24 horas sem evento recente ou em estado desconectado.
- Lead aberto sem atividade por mais de 24 horas.
- Avaliação vencendo nos próximos dois dias ou vencida.

Os alertas são apenas informativos nesta versão e podem ser dispensados na interface; não haverá envio de e-mail ou WhatsApp.

## Arquitetura e dados

- A API já possui `users`, `companies`, `memberships`, `sales`, `opportunities`, `whatsapp_channels` e `whatsapp_connections`. As consultas de acesso continuam filtradas pelo `companyId` da sessão.
- Uma nova tabela de métricas de tráfego registra empresa, origem, plataforma, período, investimento e dados de mídia informados. Ela possui unicidade por empresa, origem e período.
- Novos endpoints autenticados listam/criam métricas de tráfego, fornecem o relatório consolidado e retornam notificações.
- O frontend não usa dados de demonstração para contas autenticadas. A nova tela pública é isolada das páginas do painel.
- A verificação de plano é aplicada no backend a cada rota autenticada e no frontend para explicar o bloqueio ao cliente.

## Tratamento de falhas

- Falha ao carregar dados mostra um erro na página correspondente, preservando o restante do painel.
- Investimento inválido, período incompleto ou campanha duplicada retorna mensagem clara e não cria métrica parcial.
- Métricas sem leads ou vendas não causam divisão por zero.
- Token ausente, inválido ou empresa sem vínculo retorna acesso negado. O navegador remove a sessão inválida e volta ao login.

## Verificação

1. Sem sessão, abrir o CRM mostra a tela pública de acesso.
2. Cadastro cria uma empresa isolada, inicia o teste de sete dias e redireciona ao Dashboard.
3. Após sair, as páginas operacionais deixam de mostrar dados da empresa anterior.
4. Uma empresa não visualiza métricas, vendas ou leads de outra empresa.
5. Ao cadastrar investimento e origem, Tráfego pago calcula CPL, CAC e ROAS a partir de leads e vendas confirmadas.
6. Relatórios não incluem venda não confirmada na receita.
7. Um canal desconectado, um lead parado ou teste próximo do fim aparece em Notificações.
