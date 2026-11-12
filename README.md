# Wallet Node — carteira financeira
# Autor - Vitor Louzada da Silva

Aplicação independente do desafio Fullstack Node do Grupo Adriano Cobuccio. É possível criar uma conta, entrar, consultar o saldo da própria carteira, depositar, transferir por e-mail, consultar o extrato e solicitar reversões elegíveis.

## Stack e escolha arquitetural

- Node.js **24.22.2 LTS**, Next.js **16.4.6** com App Router, React 19 e TypeScript 5.9.
- Prisma ORM **7.10.1** com adapter MariaDB, MySQL 8.4/InnoDB, Docker Compose e Vitest 5.
- Bcrypt para senhas e sessões opacas persistidas no MySQL.
- ESLint com configuração oficial do Next.js. Versões diretas fixadas em `package.json` e árvore resolvida em `package-lock.json`.

O Next.js reúne interface e rotas de servidor no mesmo projeto. **NestJS não foi adicionado** porque acrescentaria outro processo e outra estrutura para um desafio que pode ser atendido com o App Router. As regras financeiras ficam em uma camada de casos de uso separada dos componentes de interface. A versão do Prisma usada pelo projeto está fixada no manifesto e no lockfile.

## Requisitos e inicialização

Use Docker Desktop com backend Linux e Docker Compose. As portas `3010`, `3311` e `8091` devem estar livres. Não é necessário ter Node.js instalado no Windows: a imagem oficial Node 24 executa npm e a aplicação.

No diretório `wallet-node`, crie o arquivo de ambiente local:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Antes de executar o Docker, abra `.env` e preencha `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD` com senhas fortes, distintas e exclusivas do desenvolvimento. Para a URL de conexão construída pelo Compose, use caracteres seguros para URL (letras, números, `-` e `_`). O `.env` é ignorado pelo Git. Em seguida:

```powershell
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec app npm run db:migrate
docker compose exec app npm run db:generate
```

Se já existir um `.env` local, preserve suas credenciais ao repetir a instalação. Em uma instalação nova, `prisma migrate deploy` aplica as migrations versionadas sem apagar dados. O MySQL usa volume próprio deste Compose.

Abra **http://localhost:3010**. O MySQL aceita conexões externas somente em `127.0.0.1:3311`, com o usuário de desenvolvimento configurado no `.env`. A aplicação usa `mysql:3306` na rede interna. Este Compose tem nome `wallet-node` e não utiliza containers, portas ou volumes de `wallet-php`.

### Criar conta e acessar o painel

Abra a página inicial, escolha **Criar conta** e informe nome, e-mail, senha com pelo menos 12 caracteres e confirmação. O cadastro cria o usuário e a carteira com saldo zero na mesma transação. Em seguida, o navegador recebe uma sessão e vai para `/dashboard`. Para retornar, use **Sair**; depois, entre novamente em `/login` com e-mail e senha. O dashboard mostra somente a carteira associada à sessão atual.

As páginas são `/`, `/register`, `/login` e `/dashboard`. Cadastro, login, logout e movimentações usam Server Actions do Next.js. O dashboard redireciona visitantes para `/login`.

A identidade visual Node usa azul como cor principal. A navbar compartilhada mostra **Início, Entrar e Criar conta** para visitantes e **Início, Minha carteira e Sair** após autenticação, com menu recolhível em telas pequenas. Créditos, débitos e mensagens preservam suas cores de significado financeiro.

A home segue a mesma apresentação da versão PHP: introdução “Sua carteira, com mais clareza”, ações de acesso conforme a sessão e cartão “Primeiros passos” com três etapas. O grid se organiza em duas colunas no desktop e uma em telas menores, com rodapé compartilhado.

No modo de desenvolvimento, `allowedDevOrigins` é derivada do hostname de `APP_ORIGIN`, mantendo `localhost` e `127.0.0.1`. Não há curingas nem alteração em `serverActions.allowedOrigins`. Prefira manter o mesmo endereço durante o login, pois cookies de `localhost`, IPs e domínios são distintos. Se a página abrir, mas máscaras ou menu não responderem, `docker compose exec app npm run test:dev-assets` verifica por HTTP se três scripts carregam na origem configurada e nas origens locais e se uma origem externa continua bloqueada. Esse check requer o servidor `next dev` ativo e não executa movimentações financeiras.

### Configurar endereço em outra máquina

Ao instalar na máquina do avaliador para uso local, os padrões `APP_PORT=3010`, `APP_BIND_ADDRESS=127.0.0.1` e `APP_ORIGIN=http://localhost:3010` já funcionam. Se a porta estiver ocupada, ajuste `APP_PORT` e a porta de `APP_ORIGIN` no `.env` local, por exemplo `APP_PORT=4010` e `APP_ORIGIN=http://localhost:4010`.

Para permitir revisão por outro computador da mesma rede, configure explicitamente a interface da máquina que executa Docker e o endereço que será usado no navegador. Exemplo, substituindo o IP pelo da sua máquina:

```dotenv
APP_BIND_ADDRESS=192.168.1.50
APP_PORT=3010
APP_ORIGIN=http://192.168.1.50:3010
```

`APP_BIND_ADDRESS` define onde a aplicação é publicada; `APP_ORIGIN` define sua URL pública, incluindo protocolo e porta, sem subdiretório, query ou credenciais. Ao usar um domínio, ele deve resolver para a máquina da aplicação. A mudança é optativa: o padrão continua restrito ao acesso local, e MySQL/phpMyAdmin continuam em loopback. O acesso em rede depende também da conectividade e do firewall do host.

Após alterar essas variáveis, recrie **somente** o serviço da aplicação para aplicar o ambiente atualizado:

```powershell
docker compose config --quiet
docker compose up -d --no-deps app
docker compose exec app npm run test:dev-assets
```

Espere o Next indicar `Ready` antes do check. `docker compose restart` sozinho não atualiza variáveis de ambiente do container. Não é necessário editar código, remover volumes nem recriar o MySQL. `APP_ORIGIN=https://...` habilita cookies `Secure` e exige acesso HTTPS real. Esta configuração prepara a revisão em desenvolvimento; uma publicação de produção usa build e `next start`, com proxy/HTTPS configurados conforme o ambiente.

### Movimentar a carteira

Os campos de depósito e transferência possuem máscara em JavaScript: digite `1050` para obter `10,50`. Ao colar, use o valor em reais (`10`, `10,5` ou `10,50`), sem símbolo ou separador de milhares. A máscara usa strings e mantém a validação monetária no servidor. Os testes da máscara fazem parte de `npm test`.

No dashboard, informe um valor como `10,50` no formulário **Depositar** para creditar sua própria carteira. Para **Transferir**, informe o e-mail de outro usuário cadastrado e o valor. O extrato mostra dez lançamentos por página, incluindo entradas, saídas e reversões. O iniciador de um depósito ou transferência concluído pode escolher **Reverter** e confirmar a solicitação; uma reversão de transferência pode deixar o destinatário com saldo negativo.

Cada novo formulário recebe um UUID no servidor. Se a validação falhar, a mesma chave permanece no formulário; repetir um envio já confirmado retorna o resultado anterior sem novo efeito. Após sucesso, o navegador retorna ao dashboard atualizado. Os campos de valor aceitam reais sem separador de milhares e até duas casas decimais, por exemplo `10`, `10,5`, `10,50` e `0,01`.

O extrato identifica o destinatário nas transferências enviadas (`Para: nome`) e o remetente nas recebidas (`De: nome`), preservando a referência da operação. O nome exibido é o atual do cadastro, não uma cópia histórica; somente lançamentos da própria carteira são consultados.

A apresentação segue as colunas **Data | Movimento | Situação | Valor | Ação**, com a referência da original nas reversões. Em telas pequenas, a tabela permite rolagem horizontal e mantém a paginação de dez lançamentos.

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

Consulte [Arquitetura](docs/ARCHITECTURE.md) e [Regras de negócio](docs/BUSINESS_RULES.md) para os contratos atuais e os próximos passos.

## Núcleo financeiro no servidor

`src/lib/wallet/wallet-service.ts` oferece `deposit()`, `transfer()` e `reverse()`. Cada método recebe um ator criado por `currentFinancialActor()` após validação da sessão, uma chave UUID idempotente e os dados específicos: valor `bigint` em centavos, carteira de destino ou ID da operação original. A origem nunca é escolhida pelo cliente. O serviço valida saldo, autorização e limites de `BIGINT`, registra operação e lançamentos e atualiza saldos em uma transação Prisma.

O MySQL bloqueia as carteiras com `SELECT ... FOR UPDATE` em ordem crescente de ID; reversões bloqueiam primeiro a operação original. A chave única de operação impede efeitos duplicados mesmo em corridas. Reversões criam lançamentos compensatórios e preservam o histórico original. `src/app/actions/wallet.ts` valida a sessão e conecta os formulários ao serviço; `src/lib/wallet/statement.ts` consulta apenas os lançamentos da carteira autenticada.

## Validações e testes

Para os testes de integração, prepare **uma vez** o banco separado `wallet_node_test`. Abra o cliente MySQL no container com `docker compose exec mysql mysql -u root -p`, informe a senha root definida no seu `.env` e execute:

```sql
CREATE DATABASE IF NOT EXISTS wallet_node_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON wallet_node_test.* TO 'wallet_node_dev'@'%';
```

Se `MYSQL_USER` for diferente de `wallet_node_dev`, substitua o nome no `GRANT`. Depois execute as verificações dentro do container:

```powershell
docker compose exec app npm run db:validate
docker compose exec app npx prisma migrate status
docker compose exec app npm run typecheck
docker compose exec app npm run lint
docker compose exec app npm test
docker compose exec app npm run test:integration
docker compose exec app npm run build
```

`npm test` roda testes unitários sem gravar no banco. `npm run test:integration` recusa o banco de desenvolvimento, aplica migrations somente em `wallet_node_test` e executa cenários reais de autenticação e operações financeiras. Inclui disputas simultâneas com dois Prisma Clients independentes. Os testes acrescentam registros com e-mails aleatórios somente ao banco de teste; não executam reset. As migrations ficam em `prisma/migrations`; não use `migrate reset` nem remova o volume MySQL para repetir as validações.

### Instalação isolada verificada

Em 11/11/2026, a sequência foi repetida em um clone local sem `.env` nem `node_modules` herdados. Um projeto Compose próprio, com credenciais e volumes novos, usou as portas alternativas `13010`, `13311` e `18091`, sempre em `127.0.0.1`. O Dockerfile concluiu `npm ci`; as duas migrations foram aplicadas tanto no banco novo da aplicação quanto no banco de testes isolado. Prisma Client, validação do schema, TypeScript, ESLint, 7 testes unitários, 38 testes de integração e build Next.js passaram. Home, cadastro, login e phpMyAdmin responderam com HTTP 200; o dashboard sem sessão redirecionou ao login.

Essa verificação usou a imagem base disponível no cache local e acesso ao registro de pacotes. Não é prova de reprodução bit a bit em outra máquina. Os testes de Server Actions usam MySQL real com recursos do Next.js simulados; não foi automatizado um fluxo financeiro HTTP completo no clone. A demonstração visual da aplicação principal foi validada separadamente.

### Segurança da sessão

As senhas usam bcrypt com custo 12 e limite de 72 bytes. O cookie contém apenas um token aleatório; o MySQL guarda seu SHA-256, usuário e expiração de sete dias. O cookie usa `HttpOnly`, `SameSite=Lax` e `Path=/`. `Secure` acompanha `APP_ORIGIN`: o HTTP local funciona com `http://localhost:3010`; ao publicar por HTTPS, configure `APP_ORIGIN` com a URL HTTPS antes de iniciar. O logout revoga a sessão no MySQL e expira o cookie.

O login limita tentativas por identidade e por um limite global persistido no banco. A chave por IP só é ativada se `TRUSTED_PROXY_IP_HEADER=x-forwarded-for` for configurado **atrás de um proxy confiável que substitui esse cabeçalho**. Na instalação local direta, cabeçalhos de IP enviados pelo cliente não são usados. As Server Actions mantêm a proteção de origem e CSRF do Next.js sem ampliar `allowedOrigins`.

Depósito, transferência e reversão compartilham um limite de **30 envios por minuto por usuário autenticado**, persistido no MySQL. Ao atingir o limite, aguarde um minuto e reenvie o mesmo formulário com a mesma chave. A limitação reduz o abuso das ações; a idempotência do serviço e a restrição única do banco continuam impedindo movimentos duplicados. Reenvios também contam para esse limite.

## Documentação técnica

- [Arquitetura](docs/ARCHITECTURE.md) descreve camadas, entidades, transações e integração HTTP.
- [Regras de negócio](docs/BUSINESS_RULES.md) registra o contrato financeiro implementado.
