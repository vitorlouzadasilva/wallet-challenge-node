# Wallet Node

Base independente do desafio Fullstack Node do Grupo Adriano Cobuccio. Esta primeira etapa entrega a infraestrutura Next.js/Prisma/MySQL e o esquema da carteira. A página inicial confirma que a aplicação está no ar; cadastro, autenticação e movimentações financeiras ainda não foram implementados.

## Stack e escolha arquitetural

- Node.js **24.22.2 LTS**, Next.js **16.4.6** com App Router, React 19 e TypeScript 5.9.
- Prisma ORM **7.10.1**, MySQL 8.4/InnoDB, Docker Compose e Vitest 5.
- ESLint com configuração oficial do Next.js. Versões diretas fixadas em `package.json` e árvore resolvida em `package-lock.json`.

O Next.js reúne interface e futuras rotas de servidor no mesmo projeto. **NestJS não foi adicionado** porque acrescentaria outro processo e outra estrutura para um desafio que pode ser atendido com o App Router. As regras financeiras futuras ainda terão uma camada de casos de uso separada dos componentes de interface. Prisma 7 foi escolhido porque a linha 8 ainda não oferece MySQL estável nesta data.

## Requisitos e inicialização

Use Docker Desktop com backend Linux e Docker Compose. As portas `3010` e `3311` devem estar livres. Não é necessário ter Node.js instalado no Windows: a imagem oficial Node 24 executa npm e a aplicação.

No diretório `wallet-node`, crie o ambiente local e preencha `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD` com senhas fortes, distintas e exclusivas do desenvolvimento. Para a URL de conexão construída pelo Compose, use caracteres seguros para URL (letras, números, `-` e `_`). O `.env` é ignorado pelo Git.

```powershell
Copy-Item .env.example .env
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec app npm run db:migrate
docker compose exec app npm run db:generate
```

O arquivo `.env` local preparado nesta máquina já contém senhas próprias; preserve-o se for reutilizar esta instalação. Em uma instalação nova, `prisma migrate deploy` aplica as migrations versionadas sem apagar dados. O MySQL usa volume próprio deste Compose.

Abra **http://localhost:3010**. O MySQL aceita conexões externas somente em `127.0.0.1:3311`, com o usuário de desenvolvimento configurado no `.env`. A aplicação usa `mysql:3306` na rede interna. Este Compose tem nome `wallet-node` e não utiliza containers, portas ou volumes de `wallet-php`.

## Modelagem

`prisma/schema.prisma` define `users`, `wallets`, `operations` e `ledger_entries`. Uma carteira possui `user_id` único; cada operação guarda tipo, situação, valor positivo, participantes, chave idempotente única e referência opcional e única à operação revertida. Lançamentos registram deltas positivos ou negativos e têm unicidade por operação/carteira. FKs restritivas impedem cascatas sobre histórico financeiro.

Valores e IDs financeiros usam `BIGINT` no MySQL e `bigint` no JavaScript. `balance_cents` e `delta_cents` são assinados, permitindo saldo negativo; `amount_cents` é positivo. `bigint` não pode ser enviado diretamente a `JSON.stringify`: a API futura deverá converter os valores para **strings decimais**, e a interface os formatará sem ponto flutuante. `src/lib/money.ts` já oferece funções puras de serialização e apresentação, com testes de limites.

Consulte [Arquitetura](docs/ARCHITECTURE.md) e [Regras de negócio](docs/BUSINESS_RULES.md) para o desenho planejado de autenticação, transações, reversões e idempotência.

## Validações e testes

Execute os comandos dentro do container:

```powershell
docker compose exec app npm run db:validate
docker compose exec app npx prisma migrate status
docker compose exec app npm run typecheck
docker compose exec app npm run lint
docker compose exec app npm test
docker compose exec app npm run build
```

O Vitest cobre a representação monetária. Esta etapa ainda não possui testes de operações financeiras, pois essas operações não existem. As migrations ficam em `prisma/migrations`; não use `migrate reset` nem remova o volume MySQL para repetir as validações.

## Limitações desta etapa

- A página inicial é informativa; cadastro, login, dashboard financeiro, depósitos, transferências e reversões virão depois.
- O esquema garante no máximo uma carteira por usuário. A criação obrigatória da carteira junto ao usuário dependerá de uma transação na futura rotina de cadastro.
- O banco aplica FKs, unicidade e restrições monetárias; regras de saldo, autorização e estado ainda dependem dos casos de uso futuros.
- Não há teste de concorrência nem integração bancária real nesta etapa.
- A auditoria npm desta instalação apontou sete avisos moderados em dependências transitivas do ESLint; `npm audit --omit=dev` não apontou vulnerabilidades em dependências de produção. A cadeia depende de atualização compatível das ferramentas de desenvolvimento.

Esta configuração é de desenvolvimento local. Uma implantação pública exigirá gestão de segredos, TLS, políticas de acesso e observabilidade apropriadas.
