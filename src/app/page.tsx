import Link from "next/link";
import { currentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await currentUser();
  return (
    <main className="shell home-page">
      <div className="hero">
        <section className="hero-copy" aria-labelledby="home-heading">
          <p className="eyebrow">SIMPLES. INDIVIDUAL. SUA.</p>
          <h1 id="home-heading">Sua carteira,<br />com mais clareza.</h1>
          <p className="home-lead">Um espaço para acompanhar o seu saldo, com uma experiência simples desde o primeiro acesso.</p>
          <div className="hero-actions">
            {user ? (
              <Link href="/dashboard" className="button button-primary">Acessar minha carteira <span aria-hidden="true">→</span></Link>
            ) : (
              <>
                <Link href="/register" className="button button-primary">Criar minha conta <span aria-hidden="true">→</span></Link>
                <Link href="/login" className="button button-outline">Já tenho uma conta</Link>
              </>
            )}
          </div>
        </section>
        <section aria-labelledby="onboarding-heading">
          <div className="onboarding-card">
            <p className="eyebrow">PRIMEIROS PASSOS</p>
            <h2 id="onboarding-heading">Tudo começa<br />com a sua conta.</h2>
            <ol className="onboarding-steps">
              <li><h3>Crie seu acesso</h3><p>Cadastre seu nome, e-mail e uma senha.</p></li>
              <li><h3>Conheça sua carteira</h3><p>Uma carteira individual é criada junto com a conta.</p></li>
              <li><h3>Acompanhe seu saldo</h3><p>Consulte o valor da sua carteira sempre que entrar.</p></li>
            </ol>
          </div>
        </section>
      </div>
    </main>
  );
}
