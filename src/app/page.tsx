import Link from "next/link";

export default function Home() {
  return (
    <main className="shell home-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">DESAFIO FULLSTACK NODE</span>
          <h1>Seu dinheiro merece clareza.</h1>
          <p>Uma carteira digital simulada, construída para mostrar saldos com precisão e evoluir com segurança a cada etapa.</p>
          <div className="hero-actions">
            <Link href="/register" className="button button-primary">Criar conta</Link>
            <Link href="/login" className="button button-outline">Já tenho conta</Link>
          </div>
        </div>
        <aside className="hero-panel" aria-label="Resumo da aplicação">
          <span className="eyebrow">SIMPLES DESDE O INÍCIO</span>
          <div className="hero-symbol" aria-hidden="true">W.</div>
          <h2>Uma conta. Uma carteira.</h2>
          <p>Cadastre-se, entre e consulte seu saldo individual em um painel reservado para você.</p>
        </aside>
      </section>
      <section className="feature-grid" aria-label="Recursos disponíveis">
        <article><span>01</span><h2>Conta protegida</h2><p>Acesso por senha e sessão segura no servidor.</p></article>
        <article><span>02</span><h2>Saldo preciso</h2><p>Valores guardados em centavos inteiros, sem arredondamentos.</p></article>
        <article><span>03</span><h2>Visão individual</h2><p>Cada pessoa visualiza apenas a própria carteira.</p></article>
      </section>
    </main>
  );
}
