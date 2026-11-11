# Diretrizes do projeto Wallet Node

- Usar Node.js 24 LTS, Next.js com App Router, TypeScript estrito, Prisma 7 e MySQL 8.4.
- Manter este projeto independente de `wallet-php`: não copiar código, não consultar o `.env` do projeto PHP e não compartilhar portas ou volumes Docker.
- Separar entrada HTTP, validação, casos de uso e persistência conforme a necessidade concreta. Não adicionar NestJS, repositórios ou interfaces artificiais.
- Representar centavos e IDs `BIGINT` como `bigint` em TypeScript; serializar como strings decimais. Não converter valores monetários arbitrários para `Number`.
- Manter autenticação, autorização, transações, bloqueios e idempotência no servidor quando forem implementados. Não confiar em IDs de carteira, saldo ou iniciador vindos do cliente.
- Preservar operações e lançamentos financeiros; nunca usar exclusão em cascata para histórico.
- Escrever comentários em português apenas para regras de negócio e decisões arquiteturais relevantes. Evitar comentários que repetem o código.
- Validar com TypeScript, ESLint, Vitest, Prisma e build. Testes financeiros usam MySQL real e conexões independentes para concorrência.
- Não versionar `.env`, credenciais, `node_modules`, arquivos gerados, logs ou dados persistentes do Docker.
- Cadastro, login, logout, dashboard e serviço financeiro estão implementados. A integração web financeira foi autorizada: manter ações, formulários e extrato limitados a depósito, transferência e reversão.
- Casos financeiros recebem um ator criado da sessão no servidor, usam `bigint`, transações Prisma e locks `FOR UPDATE` na mesma conexão. Preservar idempotência e histórico de reversão.
- Não executar `docker compose down -v`, reset de migrations ou exclusão de volumes sem autorização.
- O phpMyAdmin foi autorizado nesta etapa de infraestrutura: manter imagem oficial fixada, acesso somente em loopback e login interativo, sem credenciais no Compose.
- Persistir sessões opacas e tentativas de login no MySQL. Consultas privadas devem validar a sessão no servidor; testes de integração devem usar apenas `wallet_node_test`.
- Server Actions financeiras devem validar a sessão e os campos recebidos. Manter a chave idempotente entre tentativas do mesmo formulário, derivar o extrato dos lançamentos da própria carteira e não confiar em botões como autorização.
