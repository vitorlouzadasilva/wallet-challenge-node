export default function Home() {
  return (
    <main className="page">
      <div className="container">
        <p className="eyebrow">DESAFIO FULLSTACK NODE</p>
        <h1>Wallet Node</h1>
        <p className="lead">
          A infraestrutura e o banco da carteira estão preparados. Cadastro, autenticação e
          movimentações serão desenvolvidos nas próximas etapas.
        </p>
        <section className="panel" aria-labelledby="foundation-title">
          <h2 id="foundation-title">Base técnica</h2>
          <ul>
            <li>Next.js com App Router e TypeScript</li>
            <li>Prisma e MySQL em containers independentes</li>
            <li>Valores financeiros modelados em centavos inteiros</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
