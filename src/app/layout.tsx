import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import { SiteNavigation } from "./site-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wallet Node | Grupo Adriano Cobuccio",
  description: "Carteira financeira simulada do desafio Fullstack Node.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <nav className="shell header-inner" aria-label="Navegação principal">
            <Link href="/" className="brand" aria-label="Wallet Node, página inicial"><span className="brand-mark">W.</span><span>Wallet Node</span></Link>
            <SiteNavigation authenticated={user !== null} />
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <div className="shell footer-inner"><span>Wallet Node</span><span>Uma visão clara da sua carteira.</span></div>
        </footer>
      </body>
    </html>
  );
}
