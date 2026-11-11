# Arquitetura da carteira Node

## Escopo atual

O projeto usa um único processo Next.js com App Router para interface e Server Actions. A escolha reduz a operação local a uma aplicação e um MySQL. NestJS acrescentaria um serviço e um contrato de comunicação sem necessidade nesta fase. Cadastro, login, logout, dashboard, ações financeiras e extrato estão implementados.

Node 24 LTS atende aos requisitos declarados do Next.js, Prisma 7 e Vitest. Prisma 7 é a versão escolhida para MySQL: a documentação oficial ainda apresenta Prisma 8 como candidato a lançamento e informa que seu suporte a MySQL virá depois. As versões diretas são fixas e o lockfile registra a árvore efetiva.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/` | Páginas, formulários e Server Actions para autenticação e movimentações. |
| `src/lib/auth/` | Validação, cadastro, autenticação, limite de tentativas e sessões. |
| `src/lib/wallet/` | Casos de uso financeiros, extrato, erros de domínio e testes reais no MySQL. |
| `src/lib/` | Prisma Client com adapter MySQL e apresentação de centavos. |
| `prisma/schema.prisma` | Entidades, relações, tipos e índices. |
| `prisma/migrations/` | Evolução SQL versionada do banco MySQL. |
| `compose.yaml` e `Dockerfile` | Aplicação Node 24, MySQL 8.4 e phpMyAdmin isolados de outros projetos. |

As Server Actions recebem e validam entradas, enquanto componentes React apresentam dados e mensagens. O Prisma Client com adapter MariaDB consulta e persiste no MySQL, sem Repository Pattern. `WalletService` concentra os casos financeiros sem depender de React ou HTTP. Cada ação financeira obtém `FinancialActor` da sessão validada; objetos com IDs enviados pelo cliente não passam pela verificação do ator.

## Autenticação e autorização atuais

O cadastro valida nome, e-mail normalizado e senha de 12 caracteres até 72 bytes UTF-8; bcrypt usa custo 12. `createAccount()` cria usuário e carteira de saldo `0n` dentro de `$transaction`. A unicidade do e-mail é garantida no MySQL, inclusive em concorrência, e o erro conhecido é convertido em mensagem de cadastro sem SQL. Nenhuma operação ou lançamento financeiro é criado.

O login compara hashes bcrypt e usa a mesma resposta para senha incorreta ou usuário inexistente. `login_attempts` mantém contadores atômicos em janelas de 15 minutos para identidade (5) e global (100). Um bucket por IP (20) só é usado quando um proxy confiável substitui `x-forwarded-for` e a variável `TRUSTED_PROXY_IP_HEADER` foi configurada. No Docker local direto, o cabeçalho de IP não é confiável; a proteção global serve de alternativa, com o risco de bloquear temporariamente outros usuários sob abuso.

`createSession()` gera 32 bytes aleatórios, persiste somente SHA-256 do token em `sessions` e entrega o token original apenas em cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, com validade de sete dias. `Secure` depende da origem pública configurada em `APP_ORIGIN`, pois `NODE_ENV=production` sozinho não indica HTTPS no localhost. `currentUser()` procura token válido e não expirado no banco e seleciona somente ID, nome e saldo da carteira desse usuário. O dashboard valida a sessão na própria consulta, sem depender de middleware. `revokeSession()` remove o registro e expira o cookie. As Server Actions usam POST e verificação de origem do Next.js; não há `allowedOrigins` adicional.

Os testes unitários não acessam MySQL. O comando `test:integration` exige `wallet_node_test`, aplica migrations somente ali e testa o fluxo real do serviço e das sessões. A falha de carteira no teste de rollback é uma violação de FK dentro da mesma forma de transação usada pelo cadastro; o teste não altera o banco de desenvolvimento.

## Integridade e valores monetários

Os IDs e valores em centavos são `BIGINT` no banco e `bigint` em TypeScript. `Number` só é seguro até `Number.MAX_SAFE_INTEGER` e não pode representar todo o intervalo assinado de 64 bits. IDs passados a Client Components usam `toString()`. `parsePositiveReais()` limita comprimento e formato antes de construir `bigint`, e `formatCents()` formata por dígitos; ambos dispensam ponto flutuante. Datas são gravadas em UTC e apresentadas no fuso `America/Sao_Paulo` no extrato.

`wallets.user_id` é único, garantindo no máximo uma carteira por usuário. A rotina de cadastro cria usuário e carteira na mesma transação. Saldos podem ficar negativos; valores de operação precisam ser positivos. A migration acrescenta `CHECK` para `operations.amount_cents > 0` e `ledger_entries.delta_cents <> 0`, além de FKs e índices do Prisma. `reversal_of_operation_id` é único e nullable; vários registros comuns podem ter `NULL`, mas uma original só pode ser referenciada por uma reversão. FKs usam exclusão e atualização restritivas.

## Casos de uso financeiros

- **Autenticação:** cadastro, login, logout, sessão no MySQL, bcrypt, limite de tentativas e dashboard individual estão implementados. Recuperação de senha ainda não faz parte do escopo.
- **Depósito e transferência:** `WalletService` recebe centavos `bigint` e um `FinancialActor` gerado após validação da sessão. Uma transação `ReadCommitted` grava operação, lançamentos e saldos. `SELECT ... FOR UPDATE` bloqueia carteiras individualmente em ordem crescente de ID antes de ler os saldos. Transferência valida saldo após os locks.
- **Reversão:** o serviço bloqueia a original antes de conferir autoria, tipo e status; lê participantes e lançamentos no banco; bloqueia as carteiras em ordem e cria lançamentos compensatórios. A original e seus lançamentos permanecem auditáveis. A reversão pode deixar saldo negativo.
- **Idempotência:** a chave UUID canônica minúscula é obrigatória e globalmente única. Repetições com mesmo ator e conteúdo retornam a operação existente, mesmo que a original já esteja revertida. Colisões diferentes geram conflito sem expor dados alheios. A restrição SQL é a garantia final sob concorrência; a tentativa perdedora consulta o vencedor apenas depois do rollback.

O serviço usa `$queryRaw` parametrizado na mesma transação Prisma para os locks `FOR UPDATE`. Erros reconhecidos de deadlock/conflito de escrita permitem até três tentativas da unidade transacional completa; violação de unicidade é tratada depois do rollback. Erros de domínio têm mensagens seguras, e erros inesperados não são convertidos em sucesso. Os testes de concorrência usam Prisma Clients e conexões independentes para transferências, idempotência e reversões. Eles cobrem disputas concretas, sem provar todos os cenários possíveis. `CHECK`s não substituem a lógica transacional nem verificam sozinhos a coerência entre saldos e lançamentos.

## Integração web e extrato

`src/app/actions/wallet.ts` valida a sessão em cada chamada e recebe somente valor textual, e-mail de destinatário, ID da operação a reverter e chave idempotente. A origem e o ator vêm do servidor. O e-mail é normalizado, a carteira do destinatário é buscada no banco e o serviço mantém a validação final. Falhas de domínio retornam mensagens seguras; erros inesperados seguem para o mecanismo de diagnóstico do Next.js. Após sucesso, a ação revalida `/dashboard` e redireciona fora do bloco `try/catch`. A mensagem de conclusão é mostrada somente quando o ID da URL corresponde a uma operação do ator autenticado.

O formulário recebe um UUID novo no render do servidor. `useActionState` preserva chave e entradas quando há falha; um novo dashboard após sucesso recebe novas chaves. O banco continua garantindo unicidade e replay. A confirmação visual de reversão melhora a experiência, mas a autorização é sempre conferida pelo serviço.

`loadStatement()` obtém a carteira pelo ator validado e filtra `ledger_entries.wallet_id`. A consulta carrega operações e tipo da original em relações, com dez itens por página. O sinal e o texto monetário vêm de `delta_cents`, inclusive para reversões anteriores à convenção atual. Novas reversões de transferência invertem origem e destino; na reversão de depósito, a carteira creditada originalmente passa a ser origem e o destino fica nulo. Nenhum registro antigo é reescrito.

## Ambiente e limites

O Compose usa o nome `wallet-node`, uma rede própria, `mysql-data` para persistência e `node-modules` para dependências Linux. Somente `127.0.0.1:3010`, `127.0.0.1:3311` e `127.0.0.1:8091` são publicados. A porta 3310 proposta inicialmente já pertencia a outro container local; a porta 8090 solicitada para o phpMyAdmin pertence a `nexus_mail_dashboard`. Esses containers não foram alterados. O phpMyAdmin usa a rede do MySQL Node e login interativo por cookie, sem volume ou senha próprios. Senhas residem no `.env` local; a imagem da aplicação não as inclui. A URL MySQL é montada pelo Compose e fornecida ao Prisma no container. Em `prisma.config.ts`, uma URL vazia permite apenas gerar a imagem sem segredo; comandos que acessam o banco exigem `DATABASE_URL` configurada.

Ainda não há reconciliação de alterações manuais no banco nem entrada HTTP financeira. O modelo Prisma representa relações e unicidades, mas não exige que todo usuário tenha carteira quando criado fora da rotina transacional de cadastro. As chaves idempotentes exigem UUID canônico minúsculo para evitar diferenças de collation MySQL; o serviço compara ator e conteúdo, não apenas a chave. Os limites de retry e timeout merecem nova medição sob carga real. Consulte [Decisões técnicas](TECHNICAL_DECISIONS.md) para o histórico das escolhas.

Referências técnicas: [Next.js App Router](https://nextjs.org/docs/app), [Prisma ORM 7 e MySQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql), [estado do Prisma 8](https://www.prisma.io/docs/orm/release-status), [Prisma BigInt](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference) e [Node.js LTS](https://nodejs.org/en/about/previous-releases).
