"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";
import type { RegisterState } from "@/lib/auth/form-state";

const initialState: RegisterState = { errors: {}, name: "", email: "" };

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);
  return (
    <form action={action} className="auth-form">
      <div className="form-field">
        <label htmlFor="name">Nome</label>
        <input id="name" name="name" type="text" autoComplete="name" required maxLength={120} defaultValue={state.name} aria-invalid={Boolean(state.errors.name)} />
        {state.errors.name && <p className="field-error" role="alert">{state.errors.name}</p>}
      </div>
      <div className="form-field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={255} defaultValue={state.email} aria-invalid={Boolean(state.errors.email)} />
        {state.errors.email && <p className="field-error" role="alert">{state.errors.email}</p>}
      </div>
      <div className="form-field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} aria-invalid={Boolean(state.errors.password)} />
        <p className="field-hint">Mínimo de 12 caracteres e máximo de 72 bytes.</p>
        {state.errors.password && <p className="field-error" role="alert">{state.errors.password}</p>}
      </div>
      <div className="form-field">
        <label htmlFor="confirmation">Confirmar senha</label>
        <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={12} aria-invalid={Boolean(state.errors.confirmation)} />
        {state.errors.confirmation && <p className="field-error" role="alert">{state.errors.confirmation}</p>}
      </div>
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Criando conta..." : "Criar conta"}</button>
    </form>
  );
}
