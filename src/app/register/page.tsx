import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <main className="auth-page shell">
      <section className="auth-intro">
        <span className="eyebrow">COMECE POR AQUI</span>
        <h1>Uma carteira para acompanhar o que importa.</h1>
        <p>Crie sua conta para conhecer o painel da carteira. As movimentações financeiras serão disponibilizadas em uma próxima etapa.</p>
        <Link href="/" className="text-link">Voltar ao início</Link>
      </section>
      <section className="auth-card" aria-labelledby="register-title">
        <span className="eyebrow">NOVA CONTA</span>
        <h2 id="register-title">Criar conta</h2>
        <p>Seus dados ficam associados a uma carteira individual.</p>
        <RegisterForm />
        <p className="auth-switch">Já tem uma conta? <Link href="/login">Entrar</Link></p>
      </section>
    </main>
  );
}
