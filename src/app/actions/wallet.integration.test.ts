import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => cookieState.token ? { value: cookieState.token } : undefined,
    set: (_name: string, value: string) => { cookieState.token = value; },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAccount } from "@/lib/auth/account";
import { currentFinancialActor } from "@/lib/auth/financial-actor";
import { consumeFinancialAttempt } from "@/lib/auth/financial-rate-limit";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { WalletService } from "@/lib/wallet/wallet-service";
import { loadCompletedMessage, loadStatement, statementPage } from "@/lib/wallet/statement";
import { depositAction, reverseAction, transferAction, type WalletFormState } from "./wallet";

const service = new WalletService();
const key = () => randomUUID();

type TestUser = { id: bigint; walletId: bigint; email: string; token: string };

async function user(): Promise<TestUser> {
  const email = `${randomUUID()}@example.test`;
  const id = await createAccount({ name: "Pessoa", email, password: "senha-de-teste-123" });
  cookieState.token = "";
  await createSession(id);
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: id }, select: { id: true } });
  return { id, walletId: wallet.id, email, token: cookieState.token };
}

function form(idempotencyKey: string, fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("idempotencyKey", idempotencyKey);
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

async function balance(walletId: bigint): Promise<bigint> {
  return (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balanceCents;
}

async function ledgerMatches(walletId: bigint): Promise<void> {
  const entries = await prisma.ledgerEntry.findMany({ where: { walletId }, select: { deltaCents: true } });
  expect(await balance(walletId)).toBe(entries.reduce((total, entry) => total + entry.deltaCents, 0n));
}

beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (process.env.WALLET_INTEGRATION_TEST !== "1" || !url || new URL(url).pathname !== "/wallet_node_test") {
    throw new Error("Teste de ações bloqueado fora de wallet_node_test.");
  }
});

describe("Server Actions financeiras com MySQL isolado", () => {
  it("nega depósito sem sessão no próprio ponto de entrada", async () => {
    cookieState.token = "";
    const idempotencyKey = key();
    const before = await prisma.operation.count();
    await expect(depositAction({ key: idempotencyKey, message: "" }, form(idempotencyKey, { amount: "10" })))
      .rejects.toThrow("REDIRECT:/login");
    await expect(transferAction({ key: idempotencyKey, message: "" }, form(idempotencyKey, { amount: "1", recipientEmail: "pessoa@example.test" })))
      .rejects.toThrow("REDIRECT:/login");
    await expect(reverseAction({ key: idempotencyKey, message: "", operationId: "1" }, form(idempotencyKey, { operationId: "1" })))
      .rejects.toThrow("REDIRECT:/login");
    expect(await prisma.operation.count()).toBe(before);
  });

  it("valida depósito, preserva chave em falha e não duplica reenvio", async () => {
    const owner = await user();
    const idempotencyKey = key();
    const state: WalletFormState = { key: idempotencyKey, message: "" };
    const invalid = await depositAction(state, form(idempotencyKey, { amount: "1,234" }));
    expect(invalid.key).toBe(idempotencyKey);
    expect(invalid.message).toContain("valor positivo");
    expect(await balance(owner.walletId)).toBe(0n);
    await expect(depositAction(invalid, form(idempotencyKey, { amount: "10,50" }))).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    await expect(depositAction(invalid, form(idempotencyKey, { amount: "10,50" }))).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    expect(await balance(owner.walletId)).toBe(1050n);
    const operation = await prisma.operation.findUniqueOrThrow({ where: { idempotencyKey }, include: { ledgerEntries: true } });
    expect(await loadCompletedMessage((await currentFinancialActor())!, operation.id.toString())).toBe("Depósito registrado.");
    expect(operation.ledgerEntries).toHaveLength(1);
    expect(operation.ledgerEntries[0].deltaCents).toBe(1050n);
    await ledgerMatches(owner.walletId);
    const conflict = await depositAction(invalid, form(idempotencyKey, { amount: "11" }));
    expect(conflict.message).toContain("chave");
    expect(await balance(owner.walletId)).toBe(1050n);
  });

  it("limita ações financeiras por ator sem criar movimentações", async () => {
    const owner = await user();
    const other = await user();
    cookieState.token = owner.token;
    const before = await prisma.operation.count();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(await consumeFinancialAttempt(owner.id)).toBe(true);
    }
    const idempotencyKey = key();
    const limited = await depositAction({ key: idempotencyKey, message: "" }, form(idempotencyKey, { amount: "1" }));
    expect(limited.message).toContain("Muitas solicitações");
    expect(limited.key).toBe(idempotencyKey);
    expect(await prisma.operation.count()).toBe(before);
    expect(await balance(owner.walletId)).toBe(0n);
    expect(await consumeFinancialAttempt(other.id)).toBe(true);
  });

  it("transfere por e-mail sem aceitar origem fornecida pelo navegador", async () => {
    const sender = await user();
    const recipient = await user();
    const other = await user();
    cookieState.token = sender.token;
    const depositKey = key();
    await expect(depositAction({ key: depositKey, message: "" }, form(depositKey, { amount: "20" }))).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    const idempotencyKey = key();
    const state = { key: idempotencyKey, message: "" };
    const data = form(idempotencyKey, { amount: "10", recipientEmail: recipient.email.toUpperCase(), sourceWalletId: other.walletId.toString(), userId: other.id.toString() });
    await expect(transferAction(state, data)).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    await expect(transferAction(state, data)).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    expect(await balance(sender.walletId)).toBe(1000n);
    expect(await balance(recipient.walletId)).toBe(1000n);
    expect(await balance(other.walletId)).toBe(0n);
    const operation = await prisma.operation.findUniqueOrThrow({ where: { idempotencyKey }, include: { ledgerEntries: true } });
    cookieState.token = other.token;
    const otherActor = await currentFinancialActor();
    if (!otherActor) throw new Error("Ator terceiro indisponível.");
    expect(await loadCompletedMessage(otherActor, operation.id.toString())).toBeNull();
    cookieState.token = sender.token;
    expect(operation.sourceWalletId).toBe(sender.walletId);
    expect(operation.ledgerEntries.map((entry) => entry.deltaCents).sort((a, b) => a < b ? -1 : 1)).toEqual([-1000n, 1000n]);
    await ledgerMatches(sender.walletId);
    await ledgerMatches(recipient.walletId);
  });

  it("rejeita destinatário ausente, próprio e saldo insuficiente sem gravação parcial", async () => {
    const sender = await user();
    const recipient = await user();
    cookieState.token = sender.token;
    const before = await prisma.operation.count();
    const missingKey = key();
    expect((await transferAction({ key: missingKey, message: "" }, form(missingKey, { amount: "1", recipientEmail: `${randomUUID()}@example.test` }))).message).toBe("Destinatário indisponível.");
    const selfKey = key();
    expect((await transferAction({ key: selfKey, message: "" }, form(selfKey, { amount: "1", recipientEmail: sender.email }))).message).toBe("Destinatário indisponível.");
    const insufficientKey = key();
    expect((await transferAction({ key: insufficientKey, message: "" }, form(insufficientKey, { amount: "1", recipientEmail: recipient.email }))).message).toContain("Saldo insuficiente");
    expect(await prisma.operation.count()).toBe(before);
    expect(await balance(sender.walletId)).toBe(0n);
    expect(await balance(recipient.walletId)).toBe(0n);
  });

  it("autoriza reversão apenas do iniciador e preserva os lançamentos originais", async () => {
    const owner = await user();
    const other = await user();
    cookieState.token = owner.token;
    const depositKey = key();
    await expect(depositAction({ key: depositKey, message: "" }, form(depositKey, { amount: "1" }))).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    const original = await prisma.operation.findUniqueOrThrow({ where: { idempotencyKey: depositKey }, include: { ledgerEntries: true } });
    cookieState.token = other.token;
    const deniedKey = key();
    const denied = await reverseAction({ key: deniedKey, message: "", operationId: original.id.toString() }, form(deniedKey, { operationId: original.id.toString() }));
    expect(denied.message).toContain("indisponível");
    const missingKey = key();
    const missingId = "18446744073709551615";
    const missing = await reverseAction({ key: missingKey, message: "", operationId: missingId }, form(missingKey, { operationId: missingId }));
    expect(missing.message).toBe(denied.message);
    cookieState.token = owner.token;
    const reversalKey = key();
    const state = { key: reversalKey, message: "", operationId: original.id.toString() };
    const data = form(reversalKey, { operationId: original.id.toString() });
    await expect(reverseAction(state, data)).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    await expect(reverseAction(state, data)).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    const reversal = await prisma.operation.findUniqueOrThrow({ where: { idempotencyKey: reversalKey } });
    expect(reversal).toMatchObject({ sourceWalletId: owner.walletId, destinationWalletId: null });
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: original.id } })).status).toBe("reversed");
    expect(await prisma.ledgerEntry.findMany({ where: { operationId: original.id } })).toEqual(original.ledgerEntries);
    const secondKey = key();
    expect((await reverseAction({ key: secondKey, message: "", operationId: original.id.toString() }, form(secondKey, { operationId: original.id.toString() }))).message).toContain("revertida");
    const reversalOfReversalKey = key();
    expect((await reverseAction({ key: reversalOfReversalKey, message: "", operationId: reversal.id.toString() }, form(reversalOfReversalKey, { operationId: reversal.id.toString() }))).message).toContain("indisponível");
    expect(await balance(owner.walletId)).toBe(0n);
    await ledgerMatches(owner.walletId);
  });

  it("mostra extrato exclusivo, sinal real da reversão e paginação", async () => {
    const owner = await user();
    const recipient = await user();
    await prisma.user.update({ where: { id: owner.id }, data: { name: "Alice Origem" } });
    await prisma.user.update({ where: { id: recipient.id }, data: { name: "Bob Destino" } });
    cookieState.token = owner.token;
    const actor = await currentFinancialActor();
    if (!actor) throw new Error("Ator de teste indisponível.");
    for (let index = 0; index < 11; index += 1) {
      await service.deposit({ actor, amountCents: 1n, idempotencyKey: key() });
    }
    const transfer = await service.transfer({ actor, destinationWalletId: recipient.walletId, amountCents: 1n, idempotencyKey: key() });
    await service.reverse({ actor, originalOperationId: transfer.id, idempotencyKey: key() });
    const first = await loadStatement(actor, 1);
    const second = await loadStatement(actor, 2);
    expect(first.total).toBe(13);
    expect(first.pages).toBe(2);
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(3);
    expect([...first.items, ...second.items].find((item) => item.label === "Reversão de transferência")).toMatchObject({ credit: true, amount: "R$ 0,01", canReverse: false });
    expect([...first.items, ...second.items].find((item) => item.label === "Transferência enviada")).toMatchObject({ credit: false, amount: "-R$ 0,01", canReverse: false, counterparty: "Para: Bob Destino" });
    expect([...first.items, ...second.items].find((item) => item.label === "Depósito")?.counterparty).toBeNull();
    cookieState.token = recipient.token;
    const recipientActor = await currentFinancialActor();
    if (!recipientActor) throw new Error("Ator destinatário indisponível.");
    const received = await loadStatement(recipientActor, 1);
    expect(received.total).toBe(2);
    expect(received.items.find((item) => item.label === "Transferência recebida")).toMatchObject({ credit: true, canReverse: false, counterparty: "De: Alice Origem" });
    expect(received.items.find((item) => item.label === "Reversão de transferência")).toMatchObject({ credit: false, amount: "-R$ 0,01" });
    expect(statementPage("2")).toBe(2);
    expect(statementPage("999999999999999999")).toBe(1);
    await ledgerMatches(owner.walletId);
    await ledgerMatches(recipient.walletId);
    await user();
    const outsiderActor = await currentFinancialActor();
    if (!outsiderActor) throw new Error("Ator de teste indisponível.");
    expect((await loadStatement(outsiderActor, 1)).items).toEqual([]);
  });

  it("permite saldo negativo após reversão de transferência solicitada pela ação", async () => {
    const sender = await user();
    const recipient = await user();
    const third = await user();
    cookieState.token = sender.token;
    const depositKey = key();
    await expect(depositAction({ key: depositKey, message: "" }, form(depositKey, { amount: "1" }))).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    const transferKey = key();
    await expect(transferAction({ key: transferKey, message: "" }, form(transferKey, { amount: "1", recipientEmail: recipient.email }))).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    const original = await prisma.operation.findUniqueOrThrow({ where: { idempotencyKey: transferKey } });
    cookieState.token = recipient.token;
    const recipientActor = await currentFinancialActor();
    if (!recipientActor) throw new Error("Ator destinatário indisponível.");
    await service.transfer({ actor: recipientActor, destinationWalletId: third.walletId, amountCents: 100n, idempotencyKey: key() });
    cookieState.token = sender.token;
    const reversalKey = key();
    await expect(reverseAction({ key: reversalKey, message: "", operationId: original.id.toString() }, form(reversalKey, { operationId: original.id.toString() }))).rejects.toThrow(/REDIRECT:\/dashboard\?completed=\d+/);
    expect(await balance(recipient.walletId)).toBe(-100n);
    const reversal = await prisma.operation.findUniqueOrThrow({ where: { idempotencyKey: reversalKey } });
    expect(reversal).toMatchObject({ sourceWalletId: recipient.walletId, destinationWalletId: sender.walletId });
    await ledgerMatches(sender.walletId);
    await ledgerMatches(recipient.walletId);
    await ledgerMatches(third.walletId);
  });
});
