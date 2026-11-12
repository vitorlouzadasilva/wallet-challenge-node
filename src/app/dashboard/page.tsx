import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
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
        <nav aria-label="Navegação da conta" className="account-nav">
          <span aria-current="page">Minha carteira</span>
          <form action={logoutAction}><button type="submit" className="button button-outline">Sair</button></form>
        </nav>
      </div>
      {success && <p className="success-message" role="status">{success}</p>}
      <section className="balance-card" aria-labelledby="balance-title">
        <div>
          <p id="balance-title">Saldo disponível</p>
          <strong>{user.balanceCents === null ? "Indisponível" : formatCents(user.balanceCents)}</strong>
        </div>
        <span className="balance-icon" aria-hidden="true">R$</span>
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
          <ul className="statement-list">
            {statement.items.map((item) => (
              <li key={item.id} className="statement-item">
                <div className="statement-main">
                  <strong>{item.label}</strong>
                  {item.counterparty && <span>{item.counterparty}</span>}
                  <span>{item.date} · {item.detail}</span>
                  <small>Situação: {item.status === "reversed" ? "Revertida" : "Concluída"}</small>
                </div>
                <div className="statement-side">
                  <strong className={item.credit ? "amount-credit" : "amount-debit"}>{item.credit ? "+" : ""}{item.amount}</strong>
                  {item.canReverse && <ReverseForm operationId={item.operationId} idempotencyKey={randomUUID()} />}
                </div>
              </li>
            ))}
          </ul>
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
