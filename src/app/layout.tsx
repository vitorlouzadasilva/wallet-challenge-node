import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wallet Node | Grupo Adriano Cobuccio",
  description: "Carteira financeira simulada do desafio Fullstack Node.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <div className="shell header-inner">
            <Link href="/" className="brand" aria-label="Wallet Node, página inicial"><span className="brand-mark">W.</span><span>Wallet Node</span></Link>
            <span className="header-note">Grupo Adriano Cobuccio</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
