import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentFinancialActor } from "@/lib/auth/financial-actor";
import { currentUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/money";
import { loadCompletedMessage, loadStatement, statementPage } from "@/lib/wallet/statement";
import { DepositForm, ReverseForm, TransferForm } from "./wallet-forms";

type Props = { searchParams: Promise<{ page?: string | string[]; completed?: string | string[] }> };

export default async function DashboardPage({ searchParams }: Props) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const actor = await currentFinancialActor();
  if (!actor) redirect("/login");
  const query = await searchParams;
  const statement = await loadStatement(actor, statementPage(query.page));
  const success = await loadCompletedMessage(actor, query.completed);

  return (
    <main className="shell dashboard">
      <div className="dashboard-top">
        <div>
          <span className="eyebrow">PAINEL DA CARTEIRA</span>
          <h1>Olá, {user.name}.</h1>
          <p>Seu saldo e suas movimentações em um só lugar.</p>
        </div>
        <span className="account-badge">Conta individual</span>
      </div>
      {success && <p className="success-message" role="status">{success}</p>}
      <section className="balance-card" aria-labelledby="balance-title">
        <div className="balance-content">
          <h2 id="balance-title" className="balance-label">Saldo atual</h2>
          <p className="balance-amount">{user.balanceCents === null ? "Indisponível" : formatCents(user.balanceCents)}</p>
          <p className="balance-caption">{user.balanceCents === null ? "Não foi encontrada uma carteira vinculada à sua conta." : "Saldo disponível na sua carteira, em reais."}</p>
        </div>
        <span className="balance-decoration" aria-hidden="true" />
      </section>
      {user.balanceCents !== null && (
        <section className="wallet-actions" aria-label="Movimentar carteira">
          <article className="wallet-card" id="depositar">
            <span className="eyebrow">ENTRADA</span>
            <h2>Depositar</h2>
            <p>Adicione um valor à sua carteira.</p>
            <DepositForm idempotencyKey={randomUUID()} />
          </article>
          <article className="wallet-card" id="transferir">
            <span className="eyebrow">ENVIO</span>
            <h2>Transferir</h2>
            <p>Envie para outro usuário pelo e-mail.</p>
            <TransferForm idempotencyKey={randomUUID()} />
          </article>
        </section>
      )}
      <section className="statement-card" aria-labelledby="statement-title">
        <div className="statement-heading">
          <div><span className="eyebrow">HISTÓRICO</span><h2 id="statement-title">Extrato</h2></div>
          <span>{statement.total} movimentações</span>
        </div>
        {statement.items.length === 0 ? <p className="empty-statement">Nenhuma movimentação registrada.</p> : (
          <div className="statement-table-wrapper" role="region" aria-labelledby="statement-title" tabIndex={0}>
            <table className="statement-table" aria-label="Movimentações da sua carteira">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Movimento</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="statement-value">Valor</th>
                  <th scope="col" className="statement-action">Ação</th>
                </tr>
              </thead>
              <tbody>
                {statement.items.map((item) => (
                  <tr key={item.id}>
                    <td className="statement-date">{item.date}</td>
                    <td className="statement-movement">
                      <strong>{item.label}</strong>
                      {item.counterparty && <small>{item.counterparty}</small>}
                      <small>{item.detail}</small>
                    </td>
                    <td>
                      <span className={`statement-status ${item.status === "reversed" ? "statement-status-reversed" : "statement-status-completed"}`}>
                        {item.status === "reversed" ? "Revertida" : "Concluída"}
                      </span>
                    </td>
                    <td className={`statement-value ${item.credit ? "amount-credit" : "amount-debit"}`}>
                      {item.credit ? "+" : ""}{item.amount}
                    </td>
                    <td className="statement-action">
                      {item.canReverse
                        ? <ReverseForm operationId={item.operationId} idempotencyKey={randomUUID()} />
                        : <span className="statement-no-action">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {statement.pages > 1 && (
          <nav className="statement-pagination" aria-label="Páginas do extrato">
            {statement.page > 1 && <Link href={`/dashboard?page=${statement.page - 1}#statement-title`}>Anterior</Link>}
            <span>Página {statement.page} de {statement.pages}</span>
            {statement.page < statement.pages && <Link href={`/dashboard?page=${statement.page + 1}#statement-title`}>Próxima</Link>}
          </nav>
        )}
      </section>
    </main>
  );
}
