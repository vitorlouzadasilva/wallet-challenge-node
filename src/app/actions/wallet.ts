"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentFinancialActor } from "@/lib/auth/financial-actor";
import { consumeFinancialAttempt } from "@/lib/auth/financial-rate-limit";
import { normalizeEmail, validEmail } from "@/lib/auth/validation";
import { parsePositiveReais } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { InvalidOperation, UnauthorizedOperation, WalletDomainError } from "@/lib/wallet/errors";
import { WalletService } from "@/lib/wallet/wallet-service";

export type WalletFormState = {
  key: string;
  message: string;
  amount?: string;
  recipientEmail?: string;
  operationId?: string;
};

const service = new WalletService();
const financialLimitMessage = "Muitas solicitações financeiras. Aguarde um minuto e tente novamente.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function sameFormKey(state: WalletFormState, formData: FormData): boolean {
  return state.key === field(formData, "idempotencyKey");
}

function formError(state: WalletFormState, error: unknown): WalletFormState {
  if (error instanceof WalletDomainError) return { ...state, message: error.message };
  // Erros inesperados seguem para o mecanismo de diagnóstico do Next.js.
  throw error;
}

export async function depositAction(state: WalletFormState, formData: FormData): Promise<WalletFormState> {
  const actor = await currentFinancialActor();
  if (!actor) redirect("/login");
  const next = { ...state, amount: field(formData, "amount"), message: "" };
  if (!(await consumeFinancialAttempt(actor.userId))) return { ...next, message: financialLimitMessage };
  if (!sameFormKey(state, formData)) return { ...next, message: "Formulário inválido. Atualize a página." };
  const amountCents = parsePositiveReais(next.amount);
  if (amountCents === null) return { ...next, message: "Informe um valor positivo em reais, como 10,50." };

  let operationId: bigint;
  try {
    operationId = (await service.deposit({ actor, amountCents, idempotencyKey: state.key })).id;
  } catch (error) {
    return formError(next, error);
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?completed=${operationId.toString()}`);
}

export async function transferAction(state: WalletFormState, formData: FormData): Promise<WalletFormState> {
  const actor = await currentFinancialActor();
  if (!actor) redirect("/login");
  const next = {
    ...state, amount: field(formData, "amount"),
    recipientEmail: field(formData, "recipientEmail"), message: "",
  };
  if (!(await consumeFinancialAttempt(actor.userId))) return { ...next, message: financialLimitMessage };
  if (!sameFormKey(state, formData)) return { ...next, message: "Formulário inválido. Atualize a página." };
  const amountCents = parsePositiveReais(next.amount);
  if (amountCents === null) return { ...next, message: "Informe um valor positivo em reais, como 10,50." };
  const email = normalizeEmail(next.recipientEmail);
  if (!validEmail(email)) return { ...next, message: "Informe um e-mail válido." };

  // O cliente fornece apenas e-mail; a carteira de origem vem do ator validado.
  const recipient = await prisma.user.findUnique({ where: { email }, select: { id: true, wallet: { select: { id: true } } } });
  if (!recipient?.wallet || recipient.id === actor.userId) {
    return { ...next, message: "Destinatário indisponível." };
  }

  let operationId: bigint;
  try {
    operationId = (await service.transfer({ actor, amountCents, destinationWalletId: recipient.wallet.id, idempotencyKey: state.key })).id;
  } catch (error) {
    return formError(next, error);
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?completed=${operationId.toString()}`);
}

export async function reverseAction(state: WalletFormState, formData: FormData): Promise<WalletFormState> {
  const actor = await currentFinancialActor();
  if (!actor) redirect("/login");
  const operationId = field(formData, "operationId");
  const next = { ...state, message: "" };
  if (!(await consumeFinancialAttempt(actor.userId))) return { ...next, message: financialLimitMessage };
  if (!sameFormKey(state, formData) || operationId !== state.operationId) {
    return { ...next, message: "Formulário inválido. Atualize a página." };
  }
  if (!/^[1-9]\d{0,19}$/.test(operationId) || BigInt(operationId) > (1n << 64n) - 1n) {
    return { ...next, message: "Operação inválida." };
  }

  let completedId: bigint;
  try {
    completedId = (await service.reverse({ actor, originalOperationId: BigInt(operationId), idempotencyKey: state.key })).id;
  } catch (error) {
    // Resposta igual para ID inexistente e operação de terceiro, sem revelar sua existência.
    if (error instanceof InvalidOperation || error instanceof UnauthorizedOperation) {
      return { ...next, message: "Operação indisponível." };
    }
    return formError(next, error);
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?completed=${completedId.toString()}`);
}
