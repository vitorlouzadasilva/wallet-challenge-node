# Arquitetura da carteira Node

## Escopo atual

O projeto usa um único processo Next.js com App Router para interface e Server Actions de autenticação. A escolha reduz a operação local a uma aplicação e um MySQL. NestJS acrescentaria um serviço e um contrato de comunicação sem necessidade nesta fase. Cadastro, login, logout e dashboard estão implementados; não há movimentação financeira funcional.

Node 24 LTS atende aos requisitos declarados do Next.js, Prisma 7 e Vitest. Prisma 7 é a versão escolhida para MySQL: a documentação oficial ainda apresenta Prisma 8 como candidato a lançamento e informa que seu suporte a MySQL virá depois. As versões diretas são fixas e o lockfile registra a árvore efetiva.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/` | Páginas inicial, cadastro, login e dashboard; Server Actions para escrita. |
| `src/lib/auth/` | Validação, cadastro, autenticação, limite de tentativas e sessões. |
| `src/lib/` | Prisma Client com adapter MySQL e apresentação de centavos. |
| `prisma/schema.prisma` | Entidades, relações, tipos e índices. |
| `prisma/migrations/` | Evolução SQL versionada do banco MySQL. |
| `compose.yaml` e `Dockerfile` | Aplicação Node 24, MySQL 8.4 e phpMyAdmin isolados de outros projetos. |

As Server Actions recebem e validam entradas, chamam os casos de uso de autenticação e definem o cookie. Componentes React apresentam dados e mensagens. O Prisma Client com adapter MariaDB consulta e persiste no MySQL, sem Repository Pattern. Futuros fluxos financeiros obterão o usuário da sessão e terão seus próprios casos de uso.

## Autenticação e autorização atuais

O cadastro valida nome, e-mail normalizado e senha de 12 caracteres até 72 bytes UTF-8; bcrypt usa custo 12. `createAccount()` cria usuário e carteira de saldo `0n` dentro de `$transaction`. A unicidade do e-mail é garantida no MySQL, inclusive em concorrência, e o erro conhecido é convertido em mensagem de cadastro sem SQL. Nenhuma operação ou lançamento financeiro é criado.

O login compara hashes bcrypt e usa a mesma resposta para senha incorreta ou usuário inexistente. `login_attempts` mantém contadores atômicos em janelas de 15 minutos para identidade (5) e global (100). Um bucket por IP (20) só é usado quando um proxy confiável substitui `x-forwarded-for` e a variável `TRUSTED_PROXY_IP_HEADER` foi configurada. No Docker local direto, o cabeçalho de IP não é confiável; a proteção global serve de alternativa, com o risco de bloquear temporariamente outros usuários sob abuso.

`createSession()` gera 32 bytes aleatórios, persiste somente SHA-256 do token em `sessions` e entrega o token original apenas em cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, com validade de sete dias. `Secure` depende da origem pública configurada em `APP_ORIGIN`, pois `NODE_ENV=production` sozinho não indica HTTPS no localhost. `currentUser()` procura token válido e não expirado no banco e seleciona somente ID, nome e saldo da carteira desse usuário. O dashboard valida a sessão na própria consulta, sem depender de middleware. `revokeSession()` remove o registro e expira o cookie. As Server Actions usam POST e verificação de origem do Next.js; não há `allowedOrigins` adicional.

Os testes unitários não acessam MySQL. O comando `test:integration` exige `wallet_node_test`, aplica migrations somente ali e testa o fluxo real do serviço e das sessões. A falha de carteira no teste de rollback é uma violação de FK dentro da mesma forma de transação usada pelo cadastro; o teste não altera o banco de desenvolvimento.

## Integridade e valores monetários

Os IDs e valores em centavos são `BIGINT` no banco e `bigint` em TypeScript. `Number` só é seguro até `Number.MAX_SAFE_INTEGER` e não pode representar todo o intervalo assinado de 64 bits. Toda serialização JSON de centavos ou IDs deve usar `toString()` e toda entrada monetária futura deverá ser validada como texto antes de virar `bigint`. `formatCents()` formata por dígitos; não usa `float`, divisão por `100` convertida em `Number` nem arredondamento. Datas devem ser gravadas em UTC e apresentadas no fuso da interface.

`wallets.user_id` é único, garantindo no máximo uma carteira por usuário. A rotina futura de cadastro deverá criar usuário e carteira na mesma transação. Saldos podem ficar negativos; valores de operação precisam ser positivos. A migration acrescenta `CHECK` para `operations.amount_cents > 0` e `ledger_entries.delta_cents <> 0`, além de FKs e índices do Prisma. `reversal_of_operation_id` é único e nullable; vários registros comuns podem ter `NULL`, mas uma original só pode ser referenciada por uma reversão. FKs usam exclusão e atualização restritivas.

## Casos de uso planejados

- **Autenticação:** cadastro, login, logout, sessão no MySQL, bcrypt, limite de tentativas e dashboard individual estão implementados. Recuperação de senha ainda não faz parte do escopo.
- **Depósito e transferência:** transação SQL para operação, lançamentos e saldos. Bloqueio de carteiras por identificador crescente antes de ler o saldo; origem derivada do ator autenticado; saldo suficiente exigido para transferência.
- **Reversão:** bloquear a original, confirmar tipo/estado e autorização do iniciador, bloquear carteiras em ordem, criar lançamentos compensatórios e mudar somente o status da original. A original e seus lançamentos permanecem auditáveis. A reversão pode deixar saldo negativo.
- **Idempotência:** chave obrigatória e globalmente única por solicitação. Repetições com mesmo ator/conteúdo retornarão a operação confirmada; colisões diferentes gerarão conflito sem expor dados alheios. A restrição SQL será a garantia final sob concorrência, com recuperação apenas depois do rollback da tentativa perdedora.

Os fluxos financeiros ainda **não estão implementados**. Prisma não oferece uma API de bloqueio `FOR UPDATE` de alto nível; quando a camada financeira for criada, o SQL de bloqueio deverá ser executado dentro da mesma transação Prisma, com consultas parametrizadas e testes em conexões independentes. `CHECK`s não substituem a lógica transacional nem verificam sozinhos a coerência entre saldos e lançamentos.

## Ambiente e limites

O Compose usa o nome `wallet-node`, uma rede própria, `mysql-data` para persistência e `node-modules` para dependências Linux. Somente `127.0.0.1:3010`, `127.0.0.1:3311` e `127.0.0.1:8091` são publicados. A porta 3310 proposta inicialmente já pertencia a outro container local; a porta 8090 solicitada para o phpMyAdmin pertence a `nexus_mail_dashboard`. Esses containers não foram alterados. O phpMyAdmin usa a rede do MySQL Node e login interativo por cookie, sem volume ou senha próprios. Senhas residem no `.env` local; a imagem da aplicação não as inclui. A URL MySQL é montada pelo Compose e fornecida ao Prisma no container. Em `prisma.config.ts`, uma URL vazia permite apenas gerar a imagem sem segredo; comandos que acessam o banco exigem `DATABASE_URL` configurada.

Ainda não há reconciliação de alterações manuais no banco nem testes de concorrência. O modelo Prisma representa relações e unicidades, mas não exige que todo usuário tenha carteira quando criado fora da rotina transacional de cadastro. Chaves idempotentes usarão UUID canônico minúsculo para evitar diferenças de collation MySQL; o serviço futuro precisará comparar o conteúdo da solicitação, não apenas a chave.

Referências técnicas: [Next.js App Router](https://nextjs.org/docs/app), [Prisma ORM 7 e MySQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql), [estado do Prisma 8](https://www.prisma.io/docs/orm/release-status), [Prisma BigInt](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference) e [Node.js LTS](https://nodejs.org/en/about/previous-releases).
