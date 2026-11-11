import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <main className="auth-page shell">
      <section className="auth-intro">
        <span className="eyebrow">BEM-VINDO DE VOLTA</span>
        <h1>Sua carteira, em um só lugar.</h1>
        <p>Acesse seu saldo com segurança e acompanhe a evolução desta aplicação.</p>
        <Link href="/" className="text-link">Voltar ao início</Link>
      </section>
      <section className="auth-card" aria-labelledby="login-title">
        <span className="eyebrow">ACESSO À CONTA</span>
        <h2 id="login-title">Entrar</h2>
        <p>Informe seu e-mail e sua senha para continuar.</p>
        <LoginForm />
        <p className="auth-switch">Ainda não tem uma conta? <Link href="/register">Criar conta</Link></p>
      </section>
    </main>
  );
}
