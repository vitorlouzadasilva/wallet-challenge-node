# Decisões técnicas — Wallet Node

Registro inicial para apresentação e code review. As decisões abaixo descrevem o que foi de fato escolhido nas etapas concluídas. Quando uma alternativa não foi avaliada, isso é indicado explicitamente. Este documento será refinado na revisão final.

## 1. Node.js 24 LTS

- **Contexto:** o Node local observado no início do projeto era antigo para a stack escolhida.
- **Solução:** executar Node 24.22.2 LTS na imagem Docker, com versão declarada em `.nvmrc` e `package.json`.
- **Alternativas consideradas:** usar o Node local antigo foi descartado; outras linhas LTS não foram avaliadas nesta implementação.
- **Justificativa:** um runtime fixo evita diferença entre máquinas na entrevista.
- **Consequências e limites:** a imagem deve ser atualizada conscientemente quando houver correções; compatibilidade futura permanece em validação.
- **Arquivos:** `Dockerfile`, `.nvmrc`, `package.json`.

## 2. TypeScript

- **Contexto:** IDs e centavos usam `bigint`, e os contratos financeiros devem ser explícitos.
- **Solução:** TypeScript em modo estrito, com entradas monetárias dos serviços tipadas como `bigint`.
- **Alternativas consideradas:** nenhuma nesta etapa; TypeScript foi solicitado para o desafio.
- **Justificativa:** os tipos ajudam a distinguir IDs, centavos e respostas, embora validações de runtime continuem necessárias.
- **Consequências e limites:** casts ou dados externos podem burlar o compilador; o serviço valida valores e ator em runtime.
- **Arquivos:** `tsconfig.json`, `src/lib/wallet/wallet-service.ts`.

## 3. React e Next.js App Router

- **Contexto:** o desafio é fullstack e precisa de interface e execução no servidor.
- **Solução:** React 19 e Next.js 16 com App Router; componentes de interface ficam em `src/app`.
- **Alternativas consideradas:** outros frameworks de interface não foram avaliados nesta implementação.
- **Justificativa:** a mesma aplicação acomoda páginas e Server Actions de autenticação.
- **Consequências e limites:** o serviço financeiro continua independente de React e HTTP; a interface chama o serviço pelas Server Actions.
- **Arquivos:** `src/app/`, `package.json`.

## 4. Não adicionar NestJS

- **Contexto:** NestJS foi citado como possibilidade para o desafio fullstack.
- **Solução:** manter apenas o processo Next.js.
- **Alternativas consideradas:** NestJS como backend separado foi descartado.
- **Justificativa:** exigiria outro serviço, contratos entre processos e configuração operacional sem necessidade atual.
- **Consequências e limites:** casos de uso e persistência devem continuar separados dos componentes para manter clareza arquitetural.
- **Arquivos:** `src/app/`, `src/lib/auth/`, `src/lib/wallet/`, `compose.yaml`.

## 5. Prisma ORM com adapter MariaDB

- **Contexto:** Prisma 7 requer adapter de driver para usar o Prisma Client com MySQL.
- **Solução:** `@prisma/client` e `@prisma/adapter-mariadb` na mesma versão, com uma instância do client por processo.
- **Alternativas consideradas:** SQL bruto foi considerado apenas para os locks `FOR UPDATE`, que não têm equivalente de alto nível usado aqui; substituir o ORM não foi avaliado.
- **Justificativa:** Prisma cobre relações e transações, enquanto SQL parametrizado resolve o bloqueio pontual.
- **Consequências e limites:** consultas de lock exigem revisão de SQL e testes reais; o adapter usa pool de conexões.
- **Arquivos:** `src/lib/prisma.ts`, `src/lib/wallet/wallet-service.ts`, `prisma/schema.prisma`.

## 6. MySQL 8.4 e InnoDB

- **Contexto:** saldos e histórico precisam de FKs, unicidade, transações e locks de linha.
- **Solução:** MySQL 8.4 com tabelas InnoDB e volume próprio.
- **Alternativas consideradas:** outros bancos não foram avaliados; MySQL 8.4 foi definido para o desafio.
- **Justificativa:** InnoDB fornece o comportamento transacional e de bloqueio necessário.
- **Consequências e limites:** testes financeiros usam MySQL real em `wallet_node_test`; não se extrapola a garantia para outro SGBD.
- **Arquivos:** `compose.yaml`, `prisma/migrations/`, `scripts/run-integration-tests.mjs`.

## 7. Docker Compose

- **Contexto:** a aplicação deve ser reproduzível e isolada da implementação PHP.
- **Solução:** serviços Node, MySQL e phpMyAdmin na rede `wallet-node`, com portas e volume próprios.
- **Alternativas consideradas:** execução integral no host não foi avaliada; Compose foi requisito da infraestrutura.
- **Justificativa:** reproduz as versões e mantém o banco persistente sem compartilhar volumes com o PHP.
- **Consequências e limites:** o Docker Desktop precisa estar disponível; as portas locais devem estar livres.
- **Arquivos:** `compose.yaml`, `Dockerfile`, `.env.example`.

## 8. Vitest

- **Contexto:** regras financeiras exigem testes rápidos e integração com MySQL.
- **Solução:** Vitest separa testes unitários de integração; o executor recusa o banco principal.
- **Alternativas consideradas:** nenhuma nesta etapa; Vitest foi solicitado.
- **Justificativa:** testes do serviço podem exercitar transações e conexões independentes sem envolver HTTP.
- **Consequências e limites:** cenários concorrentes cobrem disputas escolhidas, mas não provam ausência de todos os deadlocks possíveis.
- **Arquivos:** `vitest.config.ts`, `vitest.integration.config.ts`, `scripts/run-integration-tests.mjs`, `src/lib/wallet/wallet-service.integration.test.ts`.

## 9. Sessões opacas no MySQL

- **Contexto:** o navegador precisa manter login sem guardar identidade autoritativa no cliente.
- **Solução:** token aleatório em cookie e sessão persistida em `sessions`; cada acesso privado consulta expiração e usuário no banco.
- **Alternativas consideradas:** JWT no cliente foi descartado pelo requisito da etapa de autenticação.
- **Justificativa:** revogação no logout e validação por requisição ficam diretas.
- **Consequências e limites:** cada consulta protegida acessa MySQL; o serviço financeiro recebe um ator emitido após validação da sessão.
- **Arquivos:** `src/lib/auth/session.ts`, `src/lib/auth/financial-actor.ts`, `prisma/migrations/20261111_auth_sessions/migration.sql`.

## 10. bcrypt e hash do token

- **Contexto:** senhas e tokens de sessão não devem ser persistidos em claro.
- **Solução:** bcrypt custo 12 para senhas, com limite de 72 bytes; SHA-256 para o token aleatório de 32 bytes.
- **Alternativas consideradas:** persistir senha ou token em claro foi rejeitado; outros algoritmos de senha não foram avaliados porque bcrypt foi requisito.
- **Justificativa:** o banco não precisa conhecer o token original e o hash de senha tem custo deliberado.
- **Consequências e limites:** custo e política de senha devem ser reavaliados para outra infraestrutura de produção.
- **Arquivos:** `src/lib/auth/account.ts`, `src/lib/auth/validation.ts`, `src/lib/auth/session.ts`.

## 11. Cookies e segurança da sessão

- **Contexto:** o Docker local usa HTTP, mas uma publicação futura pode usar HTTPS.
- **Solução:** cookie `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` quando `APP_ORIGIN` é HTTPS; logout expira o cookie.
- **Alternativas consideradas:** `SameSite=Strict` era permitido, mas não foi adotado; marcar `Secure` apenas por `NODE_ENV` foi rejeitado porque quebraria localhost HTTP.
- **Justificativa:** o protocolo público configurado orienta o atributo `Secure`, sem confiar em cabeçalhos arbitrários.
- **Consequências e limites:** uma implantação HTTPS deve configurar `APP_ORIGIN` corretamente.
- **Arquivos:** `src/lib/auth/session.ts`, `compose.yaml`, `.env.example`.

## 12. BIGINT/bigint em centavos

- **Contexto:** `Number` não representa todo o intervalo de 64 bits com exatidão.
- **Solução:** `BIGINT` assinado no MySQL e `bigint` em TypeScript, com limites explícitos e formatação por dígitos.
- **Alternativas consideradas:** `FLOAT`, `DOUBLE` e conversões monetárias arbitrárias para `Number` foram descartados.
- **Justificativa:** saldos, lançamentos e operações preservam centavos exatos, inclusive negativos.
- **Consequências e limites:** a interface atual converte reais textuais para `bigint` e serializa IDs enviados a componentes interativos como strings decimais.
- **Arquivos:** `prisma/schema.prisma`, `src/lib/money.ts`, `src/lib/wallet/wallet-service.ts`.

## 13. Transações financeiras

- **Contexto:** saldo, operação e lançamentos não podem divergir após falhas.
- **Solução:** cada depósito, transferência e reversão usa uma unidade `Prisma $transaction` com isolamento `ReadCommitted`.
- **Alternativas consideradas:** escritas separadas fora da transação foram rejeitadas por permitirem alterações parciais.
- **Justificativa:** erro em qualquer etapa desfaz a unidade; `ReadCommitted` permite reler a chave idempotente após esperar um lock concorrente.
- **Consequências e limites:** três tentativas são permitidas somente para deadlocks/conflitos de escrita reconhecidos; falhas inesperadas não viram sucesso.
- **Arquivos:** `src/lib/wallet/wallet-service.ts`, `src/lib/wallet/wallet-service.integration.test.ts`.

## 14. Bloqueio de linhas e concorrência

- **Contexto:** saldo lido sem lock pode estar obsoleto quando outra operação grava a mesma carteira.
- **Solução:** `SELECT ... FOR UPDATE` parametrizado na conexão da transação; carteiras são bloqueadas individualmente em ordem crescente de ID. Reversão bloqueia a operação original antes de validar seu estado.
- **Alternativas consideradas:** tratar `findUnique()` como leitura bloqueante foi rejeitado.
- **Justificativa:** a ordem reduz deadlocks e o lock protege a leitura usada no cálculo de saldo.
- **Consequências e limites:** testes com dois Prisma Clients verificam alguns interleavings reais; deadlocks raros e carga elevada permanecem em validação.
- **Arquivos:** `src/lib/wallet/wallet-service.ts`, `src/lib/wallet/wallet-service.integration.test.ts`.

## 15. Idempotência

- **Contexto:** repetição de uma requisição não pode repetir efeitos financeiros.
- **Solução:** UUID canônico minúsculo, `operations.idempotency_key` UNIQUE, comparação de ator e conteúdo; após colisão, a tentativa perdedora sofre rollback antes da consulta do vencedor.
- **Alternativas consideradas:** apenas consultar previamente a chave foi rejeitado porque duas transações podem não encontrar registro antes de escrever.
- **Justificativa:** a restrição do banco é a garantia final sob concorrência; uma chave com conteúdo diferente produz conflito genérico.
- **Consequências e limites:** os formulários atuais preservam a chave em erros e reenvios; qualquer novo cliente HTTP deverá manter a mesma regra.
- **Arquivos:** `prisma/migrations/20261110_init/migration.sql`, `src/lib/wallet/wallet-service.ts`.

## 16. Reversões compensatórias

- **Contexto:** uma correção precisa preservar o histórico auditável.
- **Solução:** nova operação `reversal` com lançamentos de sinais opostos, FK única para a original e mudança de status da original para `reversed`.
- **Alternativas consideradas:** apagar ou editar lançamentos originais foi rejeitado porque destruiria a trilha de auditoria.
- **Justificativa:** a reversão é rastreável e só o iniciador da original pode solicitá-la; o saldo resultante pode ser negativo.
- **Consequências e limites:** a interface apresenta reversão apenas para operações elegíveis, enquanto a ação e o serviço verificam a sessão e a regra final.
- **Arquivos:** `prisma/schema.prisma`, `src/lib/wallet/wallet-service.ts`, `docs/BUSINESS_RULES.md`.

## 17. Server Actions financeiras

- **Contexto:** o dashboard precisa enviar operações ao servidor sem expor Prisma ou identidade autoritativa ao navegador.
- **Solução:** ações `depositAction`, `transferAction` e `reverseAction` validam entrada, chamam `WalletService`, revalidam o dashboard e redirecionam com o ID da operação confirmada. A mensagem consulta a operação do ator autenticado.
- **Alternativas consideradas:** criar Route Handlers para esses formulários não foi necessário nesta etapa; a autenticação já usa Server Actions.
- **Justificativa:** mantém o padrão de entrada existente e separa a interface do caso de uso.
- **Consequências e limites:** ações podem ser chamadas pela rede sem usar o formulário; cada uma valida a sessão e os campos. Um limite de 30 envios financeiros por minuto e por ator usa a tabela `login_attempts`, sem nova migration. Reenvios também contam; testes diretos não equivalem a testes HTTP ponta a ponta.
- **Arquivos:** `src/app/actions/wallet.ts`, `src/lib/auth/financial-rate-limit.ts`, `src/app/dashboard/wallet-forms.tsx`.

## 18. Conversão monetária textual

- **Contexto:** o formulário recebe reais como texto, enquanto o serviço aceita centavos `bigint`.
- **Solução:** `parsePositiveReais()` limita comprimento, aceita apenas dígitos e vírgula decimal e constrói `bigint` antes de verificar o limite assinado.
- **Alternativas consideradas:** `Number`, `parseFloat` e arredondamento foram rejeitados pela perda de precisão em valores grandes.
- **Justificativa:** a conversão é exata e reutiliza o módulo monetário já existente.
- **Consequências e limites:** separador de milhares e ponto decimal são rejeitados; a interface exibe `10,50` como exemplo.
- **Arquivos:** `src/lib/money.ts`, `src/lib/money.test.ts`.

## 19. Chave idempotente entre formulário e serviço

- **Contexto:** reenvios, erros de validação e retries não podem duplicar efeitos financeiros.
- **Solução:** cada formulário recebe UUID no render do servidor; `useActionState` preserva a chave quando a ação retorna erro. O serviço e a restrição UNIQUE continuam sendo a garantia final.
- **Alternativas consideradas:** desabilitar o botão sozinho foi rejeitado porque não cobre reenvio de POST nem concorrência.
- **Justificativa:** o mesmo pedido mantém a mesma identidade até ser concluído; novo dashboard recebe novas chaves.
- **Consequências e limites:** o cliente deve manter o mesmo valor e destinatário ao repetir um pedido concluído; mudar o conteúdo com a mesma chave produz conflito.
- **Arquivos:** `src/app/dashboard/wallet-forms.tsx`, `src/app/actions/wallet.ts`, `src/lib/wallet/wallet-service.ts`.

## 20. Autorização das ações

- **Contexto:** campos ocultos e botões não impedem chamadas diretas à Server Action.
- **Solução:** cada ação obtém `FinancialActor` da sessão; a origem vem do ator, a carteira do destinatário é localizada pelo e-mail e a reversão confere autoria no serviço.
- **Alternativas consideradas:** confiar no ID de usuário ou carteira enviado pelo navegador foi rejeitado.
- **Justificativa:** a autorização permanece no servidor, inclusive quando a interface é contornada.
- **Consequências e limites:** cada ação consulta a sessão no MySQL; o botão de reversão é apenas indicação visual de elegibilidade.
- **Arquivos:** `src/app/actions/wallet.ts`, `src/lib/auth/financial-actor.ts`, `src/lib/wallet/wallet-service.ts`.

## 21. Semântica dos participantes da reversão

- **Contexto:** antes desta etapa, novas reversões guardavam origem e destino da operação original embora seus lançamentos tivessem sinais opostos.
- **Solução:** novas reversões de transferência trocam origem e destino; reversão de depósito usa a carteira original como origem e destino nulo. A referência à original continua em `reversal_of_operation_id`.
- **Alternativas consideradas:** manter os participantes originais foi rejeitado porque dificulta a leitura do fluxo compensatório.
- **Justificativa:** os participantes passam a corresponder aos sinais dos lançamentos da reversão.
- **Consequências e limites:** operações já persistidas não foram reescritas. O extrato deriva crédito e débito do lançamento, de modo que ambas as convenções podem ser apresentadas corretamente.
- **Arquivos:** `src/lib/wallet/wallet-service.ts`, `src/lib/wallet/wallet-service.integration.test.ts`, `src/lib/wallet/statement.ts`.

## 22. Consulta segura do extrato

- **Contexto:** o usuário deve ver somente seus lançamentos, incluindo transferências recebidas e reversões.
- **Solução:** `loadStatement()` obtém a carteira pelo ator validado, filtra `ledger_entries.wallet_id`, carrega a operação relacionada e pagina dez linhas. O sinal vem de `delta_cents`.
- **Alternativas consideradas:** selecionar carteira por parâmetro do navegador e inferir sinal apenas pelos campos de participantes foram rejeitados.
- **Justificativa:** a consulta preserva isolamento entre usuários e interpreta corretamente reversões e registros antigos.
- **Consequências e limites:** o extrato é um histórico de lançamentos, não uma reconciliação automática de alterações manuais no banco. Os testes da consulta usam MySQL real; não há teste visual automatizado.
- **Arquivos:** `src/lib/wallet/statement.ts`, `src/app/dashboard/page.tsx`, `src/app/actions/wallet.integration.test.ts`.
