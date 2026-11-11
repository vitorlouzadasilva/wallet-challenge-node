# Wallet Node

Aplicação independente do desafio Fullstack Node do Grupo Adriano Cobuccio. É possível criar uma conta, entrar, consultar o saldo da própria carteira, depositar, transferir por e-mail, consultar o extrato e solicitar reversões elegíveis.

## Stack e escolha arquitetural

- Node.js **24.22.2 LTS**, Next.js **16.4.6** com App Router, React 19 e TypeScript 5.9.
- Prisma ORM **7.10.1** com adapter MariaDB, MySQL 8.4/InnoDB, Docker Compose e Vitest 5.
- Bcrypt para senhas e sessões opacas persistidas no MySQL.
- ESLint com configuração oficial do Next.js. Versões diretas fixadas em `package.json` e árvore resolvida em `package-lock.json`.

O Next.js reúne interface e rotas de servidor no mesmo projeto. **NestJS não foi adicionado** porque acrescentaria outro processo e outra estrutura para um desafio que pode ser atendido com o App Router. As regras financeiras ficam em uma camada de casos de uso separada dos componentes de interface. Prisma 7 foi escolhido porque a linha 8 ainda não oferece MySQL estável nesta data.

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

As páginas são `/`, `/register`, `/login` e `/dashboard`. Cadastro, login, logout e movimentações usam Server Actions do Next.js. O dashboard redireciona visitantes para `/login`.

### Movimentar a carteira

No dashboard, informe um valor como `10,50` no formulário **Depositar** para creditar sua própria carteira. Para **Transferir**, informe o e-mail de outro usuário cadastrado e o valor. O extrato mostra dez lançamentos por página, incluindo entradas, saídas e reversões. O iniciador de um depósito ou transferência concluído pode escolher **Reverter** e confirmar a solicitação; uma reversão de transferência pode deixar o destinatário com saldo negativo.

Cada novo formulário recebe um UUID no servidor. Se a validação falhar, a mesma chave permanece no formulário; repetir um envio já confirmado retorna o resultado anterior sem novo efeito. Após sucesso, o navegador retorna ao dashboard atualizado. Os campos de valor aceitam reais sem separador de milhares e até duas casas decimais, por exemplo `10`, `10,5`, `10,50` e `0,01`.

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

Valores e IDs financeiros usam `BIGINT` no MySQL e `bigint` no JavaScript. `balance_cents` e `delta_cents` são assinados, permitindo saldo negativo; `amount_cents` é positivo. `bigint` não pode ser enviado diretamente a `JSON.stringify`: componentes interativos recebem IDs como **strings decimais**. `src/lib/money.ts` converte e apresenta centavos sem ponto flutuante, com testes de limites.

Consulte [Arquitetura](docs/ARCHITECTURE.md), [Regras de negócio](docs/BUSINESS_RULES.md) e [Decisões técnicas](docs/TECHNICAL_DECISIONS.md) para os contratos atuais e os próximos passos.

## Núcleo financeiro no servidor

`src/lib/wallet/wallet-service.ts` oferece `deposit()`, `transfer()` e `reverse()`. Cada método recebe um ator criado por `currentFinancialActor()` após validação da sessão, uma chave UUID idempotente e os dados específicos: valor `bigint` em centavos, carteira de destino ou ID da operação original. A origem nunca é escolhida pelo cliente. O serviço valida saldo, autorização e limites de `BIGINT`, registra operação e lançamentos e atualiza saldos em uma transação Prisma.

O MySQL bloqueia as carteiras com `SELECT ... FOR UPDATE` em ordem crescente de ID; reversões bloqueiam primeiro a operação original. A chave única de operação impede efeitos duplicados mesmo em corridas. Reversões criam lançamentos compensatórios e preservam o histórico original. `src/app/actions/wallet.ts` valida a sessão e conecta os formulários ao serviço; `src/lib/wallet/statement.ts` consulta apenas os lançamentos da carteira autenticada.

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

`npm test` roda testes unitários sem gravar no banco. `npm run test:integration` recusa o banco de desenvolvimento, aplica migrations somente em `wallet_node_test` e executa cenários reais de autenticação e operações financeiras. Inclui disputas simultâneas com dois Prisma Clients independentes. Para preparar esse banco uma vez, abra o cliente MySQL local com `docker compose exec mysql mysql -u root -p`, informe a senha root local e execute:

```sql
CREATE DATABASE IF NOT EXISTS wallet_node_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON wallet_node_test.* TO 'wallet_node_dev'@'%';
```

Se `MYSQL_USER` for diferente de `wallet_node_dev`, substitua o nome no `GRANT`. Os testes acrescentam registros com e-mails aleatórios somente ao banco de teste; não executam reset. As migrations ficam em `prisma/migrations`; não use `migrate reset` nem remova o volume MySQL para repetir as validações.

### Segurança da sessão

As senhas usam bcrypt com custo 12 e limite de 72 bytes. O cookie contém apenas um token aleatório; o MySQL guarda seu SHA-256, usuário e expiração de sete dias. O cookie usa `HttpOnly`, `SameSite=Lax` e `Path=/`. `Secure` acompanha `APP_ORIGIN`: o HTTP local funciona com `http://localhost:3010`; ao publicar por HTTPS, configure `APP_ORIGIN` com a URL HTTPS antes de iniciar. O logout revoga a sessão no MySQL e expira o cookie.

O login limita tentativas por identidade e por um limite global persistido no banco. A chave por IP só é ativada se `TRUSTED_PROXY_IP_HEADER=x-forwarded-for` for configurado **atrás de um proxy confiável que substitui esse cabeçalho**. Na instalação local direta, cabeçalhos de IP enviados pelo cliente não são usados. As Server Actions mantêm a proteção de origem e CSRF do Next.js sem ampliar `allowedOrigins`.

## Limitações desta etapa

- Cadastro, login, dashboard, serviço financeiro, formulários e extrato estão implementados. Não há integrações bancárias reais, PIX ou recuperação de senha.
- O cadastro cria a carteira junto com o usuário na mesma transação; cadastros externos ao fluxo ainda podem criar usuários sem carteira.
- O banco aplica FKs, unicidade e restrições monetárias; o serviço aplica saldo, autorização e estados, mas escritas manuais no banco podem contornar essas regras.
- Há testes reais de concorrência para os cenários selecionados; carga elevada e todos os interleavings possíveis permanecem em validação. Não há integração bancária real.
- Sem proxy confiável, não há limite individual por IP; o limite global pode afetar outros usuários se alguém esgotá-lo. Uma implantação pública deve acrescentar proteção de borda e configurar origem/cabeçalhos confiáveis.
- A auditoria npm desta instalação apontou sete avisos moderados em dependências transitivas do ESLint; `npm audit --omit=dev` não apontou vulnerabilidades em dependências de produção. A cadeia depende de atualização compatível das ferramentas de desenvolvimento.

Esta configuração é de desenvolvimento local. Uma implantação pública exigirá gestão de segredos, TLS, políticas de acesso e observabilidade apropriadas.
