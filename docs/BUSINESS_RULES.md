# Regras de negócio planejadas

Este documento define o comportamento esperado da carteira simulada. **Cadastro, autenticação e consulta individual do saldo estão implementados**; os casos de uso financeiros virão depois.

1. **Conta e carteira:** cada usuário cadastrado pela aplicação recebe uma carteira individual, criada na mesma transação. O banco impede carteiras duplicadas.
2. **Centavos inteiros:** valores financeiros usam `BIGINT` assinado e `bigint` em TypeScript. Entradas decimais serão convertidas a partir de texto, sem ponto flutuante.
3. **Depósito:** exige valor positivo e credita somente a carteira do usuário autenticado. Deve somar ao saldo atual, inclusive quando negativo.
4. **Transferência:** exige origem e destino diferentes, destinatário existente e saldo suficiente na origem no instante da escrita. A origem virá da sessão, nunca de um campo confiável do cliente.
5. **Atomicidade:** operação, lançamentos e saldos serão confirmados em uma transação SQL; falha em qualquer passo desfaz tudo.
6. **Histórico:** cada operação confirmada gera lançamentos auditáveis. Débitos são negativos; créditos, positivos. Registros financeiros não serão apagados para simular correções.
7. **Reversão:** depósitos e transferências concluídos poderão ser revertidos apenas pelo seu iniciador autorizado. Uma nova operação compensará os lançamentos originais, que permanecerão intactos; o status original passará a `reversed`.
8. **Reversão única:** uma operação original poderá ter no máximo uma reversão; uma reversão não poderá ser revertida. A FK única nullable apoia essa regra.
9. **Saldo negativo em reversões:** uma reversão autorizada poderá deixar a carteira debitada negativa. Transferências comuns continuarão exigindo saldo suficiente.
10. **Idempotência:** cada solicitação financeira receberá chave única. Repetir a mesma chave, ator e dados não poderá repetir efeitos; reutilizar chave com conteúdo diferente deverá gerar conflito seguro.
11. **Autorização:** usuários consultarão apenas o próprio saldo/extrato. Destinatários não poderão reverter transferências que não iniciaram. IDs, valores e participantes de uma reversão serão recuperados no servidor.
12. **Limites:** valores e resultados precisam respeitar o intervalo de `BIGINT` assinado. O banco verifica valor positivo da operação e delta não nulo; o serviço futuro verificará saldo, participantes, estados e consistência de lançamentos.

Para implementar essas regras, os serviços futuros usarão transações Prisma, bloqueios de linha quando necessários e testes de integração no MySQL. A interface e as rotas financeiras não fazem parte da infraestrutura inicial.
