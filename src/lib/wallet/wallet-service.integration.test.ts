import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => cookieState.token ? { value: cookieState.token } : undefined,
    set: (_name: string, value: string) => { cookieState.token = value; },
  }),
}));

import { createAccount } from "@/lib/auth/account";
import { currentFinancialActor, type FinancialActor } from "@/lib/auth/financial-actor";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  BalanceLimitExceeded, IdempotencyConflict, InsufficientBalance, InvalidAmount, InvalidIdempotencyKey,
  InvalidOperation, OperationAlreadyReversed, UnauthorizedOperation, WalletNotFound,
} from "./errors";
import { WalletService } from "./wallet-service";

const service = new WalletService();
const key = () => randomUUID();
const maxSigned = (1n << 63n) - 1n;

type TestUser = { actor: FinancialActor; walletId: bigint; userId: bigint };

async function user(): Promise<TestUser> {
  const userId = await createAccount({
    name: "Pessoa de teste", email: `${randomUUID()}@example.test`, password: "senha-de-teste-123",
  });
  await createSession(userId);
  const actor = await currentFinancialActor();
  if (!actor) throw new Error("Sessão de teste indisponível.");
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId }, select: { id: true } });
  return { actor, walletId: wallet.id, userId };
}

async function balance(walletId: bigint): Promise<bigint> {
  return (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balanceCents;
}

async function expectLedgerMatches(walletId: bigint): Promise<void> {
  const entries = await prisma.ledgerEntry.findMany({ where: { walletId }, select: { deltaCents: true } });
  expect(await balance(walletId)).toBe(entries.reduce((total, entry) => total + entry.deltaCents, 0n));
}

function separateClient(): PrismaClient {
  const url = new URL(process.env.DATABASE_URL!);
  return new PrismaClient({ adapter: new PrismaMariaDb({
    host: url.hostname, port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: url.pathname.slice(1), connectionLimit: 1,
  }) });
}

beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (process.env.WALLET_INTEGRATION_TEST !== "1" || !url || new URL(url).pathname !== "/wallet_node_test") {
    throw new Error("Teste financeiro bloqueado fora de wallet_node_test.");
  }
});

describe("WalletService com MySQL isolado", () => {
  it("deposita na carteira do ator e registra um lançamento positivo", async () => {
    const owner = await user();
    const operation = await service.deposit({ actor: owner.actor, amountCents: 105n, idempotencyKey: key() });
    expect(operation).toMatchObject({ type: "deposit", status: "completed", amountCents: 105n, destinationWalletId: owner.walletId });
    expect(await balance(owner.walletId)).toBe(105n);
    expect(await prisma.ledgerEntry.findMany({ where: { operationId: operation.id } })).toMatchObject([
      { walletId: owner.walletId, deltaCents: 105n },
    ]);
    await expectLedgerMatches(owner.walletId);
  });

  it("rejeita zero, negativo, fração e valor maior que BIGINT assinado", async () => {
    const owner = await user();
    for (const amountCents of [0n, -1n, maxSigned + 1n, 1.5 as unknown as bigint]) {
      await expect(service.deposit({ actor: owner.actor, amountCents, idempotencyKey: key() })).rejects.toBeInstanceOf(InvalidAmount);
    }
    expect(await balance(owner.walletId)).toBe(0n);
  });

  it("exige chave UUID canônica minúscula", async () => {
    const owner = await user();
    await expect(service.deposit({ actor: owner.actor, amountCents: 1n, idempotencyKey: key().toUpperCase() })).rejects.toBeInstanceOf(InvalidIdempotencyKey);
    expect(await balance(owner.walletId)).toBe(0n);
  });

  it("credita uma carteira que está negativa após reversão autorizada", async () => {
    const sender = await user();
    const recipient = await user();
    const deposited = await service.deposit({ actor: sender.actor, amountCents: 100n, idempotencyKey: key() });
    await service.transfer({ actor: sender.actor, destinationWalletId: recipient.walletId, amountCents: 100n, idempotencyKey: key() });
    await service.reverse({ actor: sender.actor, originalOperationId: deposited.id, idempotencyKey: key() });
    expect(await balance(sender.walletId)).toBe(-100n);
    await service.deposit({ actor: sender.actor, amountCents: 25n, idempotencyKey: key() });
    expect(await balance(sender.walletId)).toBe(-75n);
    await expectLedgerMatches(sender.walletId);
  });

  it("repete depósito com mesma chave uma única vez e rejeita conteúdo diferente", async () => {
    const owner = await user();
    const idempotencyKey = key();
    const request = { actor: owner.actor, amountCents: 50n, idempotencyKey };
    const first = await service.deposit(request);
    expect((await service.deposit(request)).id).toBe(first.id);
    await expect(service.deposit({ ...request, amountCents: 51n })).rejects.toBeInstanceOf(IdempotencyConflict);
    const other = await user();
    await expect(service.deposit({ actor: other.actor, amountCents: 50n, idempotencyKey })).rejects.toBeInstanceOf(IdempotencyConflict);
    expect(await balance(owner.walletId)).toBe(50n);
    expect(await prisma.ledgerEntry.count({ where: { operationId: first.id } })).toBe(1);
  });

  it("transfere com débito, crédito e soma de saldos preservada", async () => {
    const sender = await user();
    const recipient = await user();
    await service.deposit({ actor: sender.actor, amountCents: 300n, idempotencyKey: key() });
    const operation = await service.transfer({ actor: sender.actor, destinationWalletId: recipient.walletId, amountCents: 120n, idempotencyKey: key() });
    expect(operation).toMatchObject({ type: "transfer", sourceWalletId: sender.walletId, destinationWalletId: recipient.walletId });
    expect(await balance(sender.walletId)).toBe(180n);
    expect(await balance(recipient.walletId)).toBe(120n);
    const entries = await prisma.ledgerEntry.findMany({ where: { operationId: operation.id }, orderBy: { walletId: "asc" } });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((total, entry) => total + entry.deltaCents, 0n)).toBe(0n);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ walletId: sender.walletId, deltaCents: -120n }),
      expect.objectContaining({ walletId: recipient.walletId, deltaCents: 120n }),
    ]));
    await expectLedgerMatches(sender.walletId);
    await expectLedgerMatches(recipient.walletId);
  });

  it("rejeita destino inexistente e transferência para a própria carteira", async () => {
    const sender = await user();
    await expect(service.transfer({ actor: sender.actor, destinationWalletId: sender.walletId, amountCents: 1n, idempotencyKey: key() })).rejects.toBeInstanceOf(InvalidOperation);
    await expect(service.transfer({ actor: sender.actor, destinationWalletId: maxSigned, amountCents: 1n, idempotencyKey: key() })).rejects.toBeInstanceOf(WalletNotFound);
  });

  it("desfaz a operação inserida quando o saldo é insuficiente", async () => {
    const sender = await user();
    const recipient = await user();
    const idempotencyKey = key();
    await expect(service.transfer({ actor: sender.actor, destinationWalletId: recipient.walletId, amountCents: 1n, idempotencyKey })).rejects.toBeInstanceOf(InsufficientBalance);
    expect(await prisma.operation.findUnique({ where: { idempotencyKey } })).toBeNull();
    expect(await balance(sender.walletId)).toBe(0n);
    expect(await balance(recipient.walletId)).toBe(0n);
  });

  it("repete transferência com mesma chave sem duplicar lançamentos", async () => {
    const sender = await user();
    const recipient = await user();
    await service.deposit({ actor: sender.actor, amountCents: 100n, idempotencyKey: key() });
    const request = { actor: sender.actor, destinationWalletId: recipient.walletId, amountCents: 80n, idempotencyKey: key() };
    const first = await service.transfer(request);
    expect((await service.transfer(request)).id).toBe(first.id);
    expect(await prisma.ledgerEntry.count({ where: { operationId: first.id } })).toBe(2);
    expect(await balance(sender.walletId)).toBe(20n);
    expect(await balance(recipient.walletId)).toBe(80n);
  });

  it("trata reutilização de chave com outro destinatário como conflito", async () => {
    const sender = await user();
    const firstRecipient = await user();
    const secondRecipient = await user();
    await service.deposit({ actor: sender.actor, amountCents: 100n, idempotencyKey: key() });
    const idempotencyKey = key();
    await service.transfer({ actor: sender.actor, destinationWalletId: firstRecipient.walletId, amountCents: 20n, idempotencyKey });
    await expect(service.transfer({ actor: sender.actor, destinationWalletId: secondRecipient.walletId, amountCents: 20n, idempotencyKey })).rejects.toBeInstanceOf(IdempotencyConflict);
    expect(await balance(firstRecipient.walletId)).toBe(20n);
    expect(await balance(secondRecipient.walletId)).toBe(0n);
  });

  it("reverte depósito, preserva histórico e impede segunda reversão", async () => {
    const owner = await user();
    const depositKey = key();
    const deposited = await service.deposit({ actor: owner.actor, amountCents: 90n, idempotencyKey: depositKey });
    const reversalKey = key();
    const request = { actor: owner.actor, originalOperationId: deposited.id, idempotencyKey: reversalKey };
    const reversed = await service.reverse(request);
    expect((await service.reverse(request)).id).toBe(reversed.id);
    expect(await balance(owner.walletId)).toBe(0n);
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: deposited.id } })).status).toBe("reversed");
    expect(await prisma.ledgerEntry.findMany({ where: { operationId: deposited.id } })).toMatchObject([{ deltaCents: 90n }]);
    expect(await prisma.ledgerEntry.findMany({ where: { operationId: reversed.id } })).toMatchObject([{ deltaCents: -90n }]);
    expect((await service.deposit({ actor: owner.actor, amountCents: 90n, idempotencyKey: depositKey })).status).toBe("reversed");
    await expect(service.reverse({ ...request, idempotencyKey: key() })).rejects.toBeInstanceOf(OperationAlreadyReversed);
    await expect(service.reverse({ actor: owner.actor, originalOperationId: reversed.id, idempotencyKey: key() })).rejects.toBeInstanceOf(InvalidOperation);
    await expectLedgerMatches(owner.walletId);
  });

  it("reverte transferência e permite saldo negativo no destinatário", async () => {
    const sender = await user();
    const recipient = await user();
    const third = await user();
    await service.deposit({ actor: sender.actor, amountCents: 100n, idempotencyKey: key() });
    const transfer = await service.transfer({ actor: sender.actor, destinationWalletId: recipient.walletId, amountCents: 100n, idempotencyKey: key() });
    await service.transfer({ actor: recipient.actor, destinationWalletId: third.walletId, amountCents: 100n, idempotencyKey: key() });
    const originalEntries = await prisma.ledgerEntry.findMany({ where: { operationId: transfer.id }, orderBy: { walletId: "asc" } });
    const reversal = await service.reverse({ actor: sender.actor, originalOperationId: transfer.id, idempotencyKey: key() });
    const compensating = await prisma.ledgerEntry.findMany({ where: { operationId: reversal.id } });
    expect(compensating).toHaveLength(2);
    for (const original of originalEntries) {
      expect(compensating).toEqual(expect.arrayContaining([expect.objectContaining({ walletId: original.walletId, deltaCents: -original.deltaCents })]));
    }
    expect(await prisma.ledgerEntry.findMany({ where: { operationId: transfer.id }, orderBy: { walletId: "asc" } })).toEqual(originalEntries);
    expect(await balance(sender.walletId)).toBe(100n);
    expect(await balance(recipient.walletId)).toBe(-100n);
    expect(await balance(third.walletId)).toBe(100n);
    await expectLedgerMatches(sender.walletId);
    await expectLedgerMatches(recipient.walletId);
    await expectLedgerMatches(third.walletId);
  });

  it("impede reversão por outro usuário e referência inexistente", async () => {
    const owner = await user();
    const other = await user();
    const operation = await service.deposit({ actor: owner.actor, amountCents: 10n, idempotencyKey: key() });
    await expect(service.reverse({ actor: other.actor, originalOperationId: operation.id, idempotencyKey: key() })).rejects.toBeInstanceOf(UnauthorizedOperation);
    await expect(service.reverse({ actor: owner.actor, originalOperationId: maxSigned, idempotencyKey: key() })).rejects.toBeInstanceOf(InvalidOperation);
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } })).status).toBe("completed");
  });

  it("recusa reversão quando o histórico original está incompleto", async () => {
    const owner = await user();
    const original = await prisma.operation.create({ data: {
      initiatedByUserId: owner.userId, type: "deposit", status: "completed", amountCents: 10n,
      destinationWalletId: owner.walletId, idempotencyKey: key(),
    } });
    await expect(service.reverse({ actor: owner.actor, originalOperationId: original.id, idempotencyKey: key() })).rejects.toBeInstanceOf(InvalidOperation);
    expect(await prisma.operation.count({ where: { reversalOfOperationId: original.id } })).toBe(0);
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: original.id } })).status).toBe("completed");
  });

  it("não reutiliza uma chave de reversão para outra operação", async () => {
    const owner = await user();
    const first = await service.deposit({ actor: owner.actor, amountCents: 10n, idempotencyKey: key() });
    const second = await service.deposit({ actor: owner.actor, amountCents: 20n, idempotencyKey: key() });
    const idempotencyKey = key();
    await service.reverse({ actor: owner.actor, originalOperationId: first.id, idempotencyKey });
    await expect(service.reverse({ actor: owner.actor, originalOperationId: second.id, idempotencyKey })).rejects.toBeInstanceOf(IdempotencyConflict);
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("completed");
    await expectLedgerMatches(owner.walletId);
  });

  it("bloqueia overflow e faz rollback antes de qualquer lançamento", async () => {
    const owner = await user();
    await prisma.wallet.update({ where: { id: owner.walletId }, data: { balanceCents: maxSigned } });
    const depositKey = key();
    await expect(service.deposit({ actor: owner.actor, amountCents: 1n, idempotencyKey: depositKey })).rejects.toBeInstanceOf(BalanceLimitExceeded);
    expect(await prisma.operation.findUnique({ where: { idempotencyKey: depositKey } })).toBeNull();
    const sender = await user();
    await service.deposit({ actor: sender.actor, amountCents: 1n, idempotencyKey: key() });
    const transferKey = key();
    await expect(service.transfer({ actor: sender.actor, destinationWalletId: owner.walletId, amountCents: 1n, idempotencyKey: transferKey })).rejects.toBeInstanceOf(BalanceLimitExceeded);
    expect(await prisma.operation.findUnique({ where: { idempotencyKey: transferKey } })).toBeNull();
    expect(await balance(sender.walletId)).toBe(1n);
  });

  it("recusa objetos de ator fabricados fora da sessão", async () => {
    await expect(service.deposit({ actor: { userId: 1n } as FinancialActor, amountCents: 1n, idempotencyKey: key() })).rejects.toBeInstanceOf(UnauthorizedOperation);
  });

  it("serializa transferências simultâneas da mesma origem em conexões independentes", async () => {
    const sender = await user();
    const firstRecipient = await user();
    const secondRecipient = await user();
    await service.deposit({ actor: sender.actor, amountCents: 100n, idempotencyKey: key() });
    const firstClient = separateClient();
    const secondClient = separateClient();
    try {
      const outcomes = await Promise.allSettled([
        new WalletService(firstClient).transfer({ actor: sender.actor, destinationWalletId: firstRecipient.walletId, amountCents: 80n, idempotencyKey: key() }),
        new WalletService(secondClient).transfer({ actor: sender.actor, destinationWalletId: secondRecipient.walletId, amountCents: 80n, idempotencyKey: key() }),
      ]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.any(InsufficientBalance) });
      expect(await balance(sender.walletId)).toBe(20n);
      expect((await balance(firstRecipient.walletId)) + (await balance(secondRecipient.walletId))).toBe(80n);
      await expectLedgerMatches(sender.walletId);
      await expectLedgerMatches(firstRecipient.walletId);
      await expectLedgerMatches(secondRecipient.walletId);
    } finally {
      await firstClient.$disconnect();
      await secondClient.$disconnect();
    }
  });

  it("aceita duas solicitações simultâneas com a mesma chave sem crédito duplicado", async () => {
    const owner = await user();
    const firstClient = separateClient();
    const secondClient = separateClient();
    try {
      const request = { actor: owner.actor, amountCents: 17n, idempotencyKey: key() };
      const [first, second] = await Promise.all([
        new WalletService(firstClient).deposit(request), new WalletService(secondClient).deposit(request),
      ]);
      expect(first.id).toBe(second.id);
      expect(await balance(owner.walletId)).toBe(17n);
      expect(await prisma.ledgerEntry.count({ where: { operationId: first.id } })).toBe(1);
    } finally {
      await firstClient.$disconnect();
      await secondClient.$disconnect();
    }
  });

  it("não duplica uma transferência simultânea com a mesma chave", async () => {
    const sender = await user();
    const recipient = await user();
    await service.deposit({ actor: sender.actor, amountCents: 100n, idempotencyKey: key() });
    const firstClient = separateClient();
    const secondClient = separateClient();
    try {
      const request = { actor: sender.actor, destinationWalletId: recipient.walletId, amountCents: 60n, idempotencyKey: key() };
      const [first, second] = await Promise.all([
        new WalletService(firstClient).transfer(request), new WalletService(secondClient).transfer(request),
      ]);
      expect(first.id).toBe(second.id);
      expect(await balance(sender.walletId)).toBe(40n);
      expect(await balance(recipient.walletId)).toBe(60n);
      expect(await prisma.ledgerEntry.count({ where: { operationId: first.id } })).toBe(2);
    } finally {
      await firstClient.$disconnect();
      await secondClient.$disconnect();
    }
  });

  it("permite apenas uma reversão simultânea da mesma original", async () => {
    const owner = await user();
    const original = await service.deposit({ actor: owner.actor, amountCents: 40n, idempotencyKey: key() });
    const firstClient = separateClient();
    const secondClient = separateClient();
    try {
      const outcomes = await Promise.allSettled([
        new WalletService(firstClient).reverse({ actor: owner.actor, originalOperationId: original.id, idempotencyKey: key() }),
        new WalletService(secondClient).reverse({ actor: owner.actor, originalOperationId: original.id, idempotencyKey: key() }),
      ]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.any(OperationAlreadyReversed) });
      expect(await prisma.operation.count({ where: { reversalOfOperationId: original.id } })).toBe(1);
      expect(await balance(owner.walletId)).toBe(0n);
      await expectLedgerMatches(owner.walletId);
    } finally {
      await firstClient.$disconnect();
      await secondClient.$disconnect();
    }
  });
});
