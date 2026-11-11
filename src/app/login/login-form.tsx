"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import type { LoginState } from "@/lib/auth/form-state";

const initialState: LoginState = { message: "", email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="auth-form">
      {state.message && <p className="form-error" role="alert">{state.message}</p>}
      <div className="form-field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={255} defaultValue={state.email} />
      </div>
      <div className="form-field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
