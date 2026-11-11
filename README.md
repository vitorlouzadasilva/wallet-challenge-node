# Wallet Node

Aplicação independente do desafio Fullstack Node do Grupo Adriano Cobuccio. É possível criar uma conta, entrar, consultar o saldo inicial da própria carteira e sair. Depósitos, transferências, reversões e extrato ainda não estão disponíveis.

## Stack e escolha arquitetural

- Node.js **24.22.2 LTS**, Next.js **16.4.6** com App Router, React 19 e TypeScript 5.9.
- Prisma ORM **7.10.1** com adapter MariaDB, MySQL 8.4/InnoDB, Docker Compose e Vitest 5.
- Bcrypt para senhas e sessões opacas persistidas no MySQL.
- ESLint com configuração oficial do Next.js. Versões diretas fixadas em `package.json` e árvore resolvida em `package-lock.json`.

O Next.js reúne interface e futuras rotas de servidor no mesmo projeto. **NestJS não foi adicionado** porque acrescentaria outro processo e outra estrutura para um desafio que pode ser atendido com o App Router. As regras financeiras futuras ainda terão uma camada de casos de uso separada dos componentes de interface. Prisma 7 foi escolhido porque a linha 8 ainda não oferece MySQL estável nesta data.

## Requisitos e inicialização

Use Docker Desktop com backend Linux e Docker Compose. As portas `3010`, `3311` e `8091` devem estar livres. Não é necessário ter Node.js instalado no Windows: a imagem oficial Node 24 executa npm e a aplicação.

No diretório `wallet-node`, crie o ambiente local e preencha `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD` com senhas fortes, distintas e exclusivas do desenvolvimento. Para a URL de conexão construída pelo Compose, use caracteres seguros para URL (letras, números, `-` e `_`). O `.env` é ignorado pelo Git.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec app npm run db:migrate
docker compose exec app npm run db:generate
```

O arquivo `.env` local preparado nesta máquina já contém senhas próprias; preserve-o se for reutilizar esta instalação. Em uma instalação nova, `prisma migrate deploy` aplica as migrations versionadas sem apagar dados. O MySQL usa volume próprio deste Compose.

Abra **http://localhost:3010**. O MySQL aceita conexões externas somente em `127.0.0.1:3311`, com o usuário de desenvolvimento configurado no `.env`. A aplicação usa `mysql:3306` na rede interna. Este Compose tem nome `wallet-node` e não utiliza containers, portas ou volumes de `wallet-php`.

### Criar conta e acessar o painel

Abra a página inicial, escolha **Criar conta** e informe nome, e-mail, senha com pelo menos 12 caracteres e confirmação. O cadastro cria o usuário e a carteira com saldo zero na mesma transação. Em seguida, o navegador recebe uma sessão e vai para `/dashboard`. Para retornar, use **Sair**; depois, entre novamente em `/login` com e-mail e senha. O dashboard mostra somente a carteira associada à sessão atual.

As páginas são `/`, `/register`, `/login` e `/dashboard`. As ações de cadastro, login e logout usam Server Actions do Next.js. O dashboard redireciona visitantes para `/login`.

### Inspecionar o banco com phpMyAdmin

O phpMyAdmin está disponível em **http://localhost:8091**, somente no próprio computador. A porta 8090 prevista inicialmente já é usada por `nexus_mail_dashboard`; a alternativa 8091 evita alterar esse container. O phpMyAdmin acessa apenas o serviço `mysql:3306` da rede deste projeto e usa autenticação interativa por cookie. Entre com o usuário de desenvolvimento `MYSQL_USER` e a senha `MYSQL_PASSWORD` do seu `.env` local; não há login automático. Selecione `wallet_node_challenge` no menu lateral para inspecionar `users`, `wallets`, `operations` e `ledger_entries`. Este banco é exclusivamente de desenvolvimento.

Para iniciar ou parar apenas o phpMyAdmin, com o MySQL já saudável:

```powershell
docker compose up -d phpmyadmin
docker compose stop phpmyadmin
docker compose start phpmyadmin
```

Para iniciar todos os serviços em uma instalação nova, use `docker compose up -d --build --wait`, conforme acima. Para parar os serviços deste projeto sem remover o banco, use `docker compose stop`.

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
docker compose exec app npm run test:integration
docker compose exec app npm run build
```

`npm test` roda testes unitários sem gravar no banco. `npm run test:integration` recusa o banco de desenvolvimento, aplica migrations somente em `wallet_node_test` e executa cenários reais de cadastro, login, sessões, limite de tentativas e isolamento. Para preparar esse banco uma vez, abra o cliente MySQL local com `docker compose exec mysql mysql -u root -p`, informe a senha root local e execute:

```sql
CREATE DATABASE IF NOT EXISTS wallet_node_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON wallet_node_test.* TO 'wallet_node_dev'@'%';
```

Se `MYSQL_USER` for diferente de `wallet_node_dev`, substitua o nome no `GRANT`. Os testes acrescentam registros com e-mails aleatórios somente ao banco de teste; não executam reset. As migrations ficam em `prisma/migrations`; não use `migrate reset` nem remova o volume MySQL para repetir as validações.

### Segurança da sessão

As senhas usam bcrypt com custo 12 e limite de 72 bytes. O cookie contém apenas um token aleatório; o MySQL guarda seu SHA-256, usuário e expiração de sete dias. O cookie usa `HttpOnly`, `SameSite=Lax` e `Path=/`. `Secure` acompanha `APP_ORIGIN`: o HTTP local funciona com `http://localhost:3010`; ao publicar por HTTPS, configure `APP_ORIGIN` com a URL HTTPS antes de iniciar. O logout revoga a sessão no MySQL e expira o cookie.

O login limita tentativas por identidade e por um limite global persistido no banco. A chave por IP só é ativada se `TRUSTED_PROXY_IP_HEADER=x-forwarded-for` for configurado **atrás de um proxy confiável que substitui esse cabeçalho**. Na instalação local direta, cabeçalhos de IP enviados pelo cliente não são usados. As Server Actions mantêm a proteção de origem e CSRF do Next.js sem ampliar `allowedOrigins`.

## Limitações desta etapa

- O cadastro, o login e a consulta de saldo estão implementados; depósitos, transferências, reversões e extrato virão depois.
- O cadastro cria a carteira junto com o usuário na mesma transação; cadastros externos ao fluxo ainda podem criar usuários sem carteira.
- O banco aplica FKs, unicidade e restrições monetárias; regras de saldo, autorização e estado ainda dependem dos casos de uso futuros.
- Não há teste de concorrência nem integração bancária real nesta etapa.
- Sem proxy confiável, não há limite individual por IP; o limite global pode afetar outros usuários se alguém esgotá-lo. Uma implantação pública deve acrescentar proteção de borda e configurar origem/cabeçalhos confiáveis.
- A auditoria npm desta instalação apontou sete avisos moderados em dependências transitivas do ESLint; `npm audit --omit=dev` não apontou vulnerabilidades em dependências de produção. A cadeia depende de atualização compatível das ferramentas de desenvolvimento.

Esta configuração é de desenvolvimento local. Uma implantação pública exigirá gestão de segredos, TLS, políticas de acesso e observabilidade apropriadas.
