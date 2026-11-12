"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";

export function SiteNavigation({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="nav-toggle" aria-controls="primary-navigation" aria-expanded={open}
        aria-label={open ? "Fechar navegação" : "Abrir navegação"} onClick={() => setOpen(!open)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div id="primary-navigation" className="site-navigation" data-open={open}>
        <ul className="nav-links">
          <li><Link href="/" className="nav-link" aria-current={pathname === "/" ? "page" : undefined} onClick={() => setOpen(false)}>Início</Link></li>
          {authenticated ? (
            <>
              <li><Link href="/dashboard" className="nav-link" aria-current={pathname === "/dashboard" ? "page" : undefined} onClick={() => setOpen(false)}>Minha carteira</Link></li>
              <li><form action={logoutAction}><button type="submit" className="button button-outline nav-button" onClick={() => setOpen(false)}>Sair</button></form></li>
            </>
          ) : (
            <>
              <li><Link href="/login" className="nav-link" aria-current={pathname === "/login" ? "page" : undefined} onClick={() => setOpen(false)}>Entrar</Link></li>
              <li><Link href="/register" className="button button-primary nav-button" aria-current={pathname === "/register" ? "page" : undefined} onClick={() => setOpen(false)}>Criar conta</Link></li>
            </>
          )}
        </ul>
      </div>
    </>
  );
}
