# Arquitetura da carteira Node

## Escopo atual

O projeto usa um único processo Next.js com App Router para interface e futuras rotas HTTP/Server Actions. A escolha reduz a operação local a uma aplicação e um MySQL. NestJS acrescentaria um serviço e um contrato de comunicação sem necessidade nesta fase. O código desta etapa contém somente uma página informativa, um helper monetário e o esquema Prisma; não há autenticação ou movimentação funcional.

Node 24 LTS atende aos requisitos declarados do Next.js, Prisma 7 e Vitest. Prisma 7 é a versão escolhida para MySQL: a documentação oficial ainda apresenta Prisma 8 como candidato a lançamento e informa que seu suporte a MySQL virá depois. As versões diretas são fixas e o lockfile registra a árvore efetiva.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/` | Rotas e layout do App Router; apenas a página inicial nesta etapa. |
| `src/lib/` | Funções puras de serialização/apresentação de centavos. |
| `prisma/schema.prisma` | Entidades, relações, tipos e índices. |
| `prisma/migrations/` | Evolução SQL versionada do banco MySQL. |
| `compose.yaml` e `Dockerfile` | Aplicação Node 24 e MySQL 8.4 isolados de outros projetos. |

Quando os fluxos forem autorizados, handlers/Server Actions receberão e validarão entradas, obterão o usuário da sessão e chamarão serviços de aplicação. Os serviços concentrarão regras financeiras; componentes React cuidarão apenas da apresentação. Prisma Client fará consultas e persistência, sem Repository Pattern inicial.

## Integridade e valores monetários

Os IDs e valores em centavos são `BIGINT` no banco e `bigint` em TypeScript. `Number` só é seguro até `Number.MAX_SAFE_INTEGER` e não pode representar todo o intervalo assinado de 64 bits. Toda serialização JSON de centavos ou IDs deve usar `toString()` e toda entrada monetária futura deverá ser validada como texto antes de virar `bigint`. `formatCents()` formata por dígitos; não usa `float`, divisão por `100` convertida em `Number` nem arredondamento. Datas devem ser gravadas em UTC e apresentadas no fuso da interface.

`wallets.user_id` é único, garantindo no máximo uma carteira por usuário. A rotina futura de cadastro deverá criar usuário e carteira na mesma transação. Saldos podem ficar negativos; valores de operação precisam ser positivos. A migration acrescenta `CHECK` para `operations.amount_cents > 0` e `ledger_entries.delta_cents <> 0`, além de FKs e índices do Prisma. `reversal_of_operation_id` é único e nullable; vários registros comuns podem ter `NULL`, mas uma original só pode ser referenciada por uma reversão. FKs usam exclusão e atualização restritivas.

## Casos de uso planejados

- **Autenticação:** sessão protegida no servidor, hash de senha, CSRF, limitação de tentativas e autorização baseada no usuário autenticado. O campo `password_hash` existe no esquema, mas ainda não há cadastro/login.
- **Depósito e transferência:** transação SQL para operação, lançamentos e saldos. Bloqueio de carteiras por identificador crescente antes de ler o saldo; origem derivada do ator autenticado; saldo suficiente exigido para transferência.
- **Reversão:** bloquear a original, confirmar tipo/estado e autorização do iniciador, bloquear carteiras em ordem, criar lançamentos compensatórios e mudar somente o status da original. A original e seus lançamentos permanecem auditáveis. A reversão pode deixar saldo negativo.
- **Idempotência:** chave obrigatória e globalmente única por solicitação. Repetições com mesmo ator/conteúdo retornarão a operação confirmada; colisões diferentes gerarão conflito sem expor dados alheios. A restrição SQL será a garantia final sob concorrência, com recuperação apenas depois do rollback da tentativa perdedora.

Esses fluxos ainda **não estão implementados**. Prisma não oferece uma API de bloqueio `FOR UPDATE` de alto nível; quando a camada financeira for criada, o SQL de bloqueio deverá ser executado dentro da mesma transação Prisma, com consultas parametrizadas e testes em conexões independentes. `CHECK`s não substituem a lógica transacional nem verificam sozinhos a coerência entre saldos e lançamentos.

## Ambiente e limites

O Compose usa o nome `wallet-node`, uma rede própria, `mysql-data` para persistência e `node-modules` para dependências Linux. Somente `127.0.0.1:3010` e `127.0.0.1:3311` são publicados. A porta 3310 proposta inicialmente já pertencia a outro container local; ele não foi alterado. Senhas residem no `.env` local; a imagem não as inclui. A URL MySQL é montada pelo Compose e fornecida ao Prisma no container. Em `prisma.config.ts`, uma URL vazia permite apenas gerar a imagem sem segredo; comandos que acessam o banco exigem `DATABASE_URL` configurada.

Ainda não há reconciliação de alterações manuais no banco, testes de concorrência nem autenticação. O modelo Prisma representa relações e unicidades, mas não exige que todo usuário tenha carteira antes da rotina transacional de cadastro. Chaves idempotentes usarão UUID canônico minúsculo para evitar diferenças de collation MySQL; o serviço futuro precisará comparar o conteúdo da solicitação, não apenas a chave.

Referências técnicas: [Next.js App Router](https://nextjs.org/docs/app), [Prisma ORM 7 e MySQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql), [estado do Prisma 8](https://www.prisma.io/docs/orm/release-status), [Prisma BigInt](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference) e [Node.js LTS](https://nodejs.org/en/about/previous-releases).
