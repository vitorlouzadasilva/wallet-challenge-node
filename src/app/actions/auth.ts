"use server";

import { isIP } from "node:net";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAccount, DuplicateEmailError } from "@/lib/auth/account";
import { authenticate } from "@/lib/auth/login";
import { createSession, revokeSession } from "@/lib/auth/session";
import { validateRegistration } from "@/lib/auth/validation";
import type { LoginState, RegisterState } from "@/lib/auth/form-state";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function registerAction(_state: RegisterState, formData: FormData): Promise<RegisterState> {
  const input = {
    name: field(formData, "name"), email: field(formData, "email"),
    password: field(formData, "password"), confirmation: field(formData, "confirmation"),
  };
  const validation = validateRegistration(input);
  const state = { errors: validation.errors, name: input.name, email: input.email };
  if (!validation.data) return state;

  let userId: bigint;
  try {
    userId = await createAccount(validation.data);
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return { ...state, errors: { email: "Este e-mail já está cadastrado." } };
    }
    throw error;
  }

  await createSession(userId);
  redirect("/dashboard");
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = field(formData, "email");
  let trustedIp: string | undefined;
  // Somente um proxy configurado para substituir o cabeçalho pode informar o IP real.
  if (process.env.TRUSTED_PROXY_IP_HEADER === "x-forwarded-for") {
    const candidate = (await headers()).get("x-forwarded-for")?.split(",")[0].trim();
    if (candidate && isIP(candidate)) trustedIp = candidate;
  }
  const result = await authenticate(email, field(formData, "password"), trustedIp);
  if ("error" in result) {
    return {
      email,
      message: result.error === "limited"
        ? "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente."
        : "E-mail ou senha inválidos.",
    };
  }

  await createSession(result.userId);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await revokeSession();
  redirect("/");
}
