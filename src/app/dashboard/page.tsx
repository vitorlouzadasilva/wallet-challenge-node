import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { currentUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/money";

export default async function DashboardPage() {
  // A carteira vem da sessão verificada, nunca de um ID enviado pela requisição.
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <main className="shell dashboard">
      <div className="dashboard-top">
        <div>
          <span className="eyebrow">PAINEL DA CARTEIRA</span>
          <h1>Olá, {user.name}.</h1>
          <p>Este é o resumo da sua carteira.</p>
        </div>
        <nav aria-label="Navegação da conta" className="account-nav">
          <span aria-current="page">Minha carteira</span>
          <form action={logoutAction}><button type="submit" className="button button-outline">Sair</button></form>
        </nav>
      </div>
      <section className="balance-card" aria-labelledby="balance-title">
        <div>
          <p id="balance-title">Saldo disponível</p>
          <strong>{user.balanceCents === null ? "Indisponível" : formatCents(user.balanceCents)}</strong>
        </div>
        <span className="balance-icon" aria-hidden="true">R$</span>
      </section>
      <section className="upcoming-card" aria-labelledby="upcoming-title">
        <span className="eyebrow">PRÓXIMAS ETAPAS</span>
        <h2 id="upcoming-title">Movimentações</h2>
        <p>Depósitos, transferências, reversões e extrato aparecerão aqui quando os casos de uso financeiros forem implementados.</p>
      </section>
    </main>
  );
}
