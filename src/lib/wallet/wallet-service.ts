import "server-only";

import { Prisma, PrismaClient, type Operation } from "@/generated/prisma/client";
import { type FinancialActor, verifiedActorId } from "@/lib/auth/financial-actor";
import { prisma } from "@/lib/prisma";
import {
  BalanceLimitExceeded, FinancialPersistenceException, IdempotencyConflict, InvalidIdempotencyKey,
  InsufficientBalance, InvalidAmount, InvalidOperation, OperationAlreadyReversed,
  UnauthorizedOperation, WalletDomainError, WalletNotFound,
} from "./errors";

const MAX_SIGNED = (1n << 63n) - 1n;
const MIN_SIGNED = -(1n << 63n);
const MAX_UNSIGNED = (1n << 64n) - 1n;
const MAX_ATTEMPTS = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Transaction = Prisma.TransactionClient;
type LockedWallet = { id: bigint; user_id: bigint; balance_cents: bigint };
type LockedOperation = {
  id: bigint;
  initiated_by_user_id: bigint;
  type: "deposit" | "transfer" | "reversal";
  status: "completed" | "reversed";
  amount_cents: bigint;
  source_wallet_id: bigint | null;
  destination_wallet_id: bigint | null;
  reversal_of_operation_id: bigint | null;
};
type Intent =
  | { type: "deposit"; actorId: bigint; amountCents: bigint }
  | { type: "transfer"; actorId: bigint; amountCents: bigint; destinationWalletId: bigint }
  | { type: "reversal"; actorId: bigint; originalOperationId: bigint };

export type DepositRequest = { actor: FinancialActor; amountCents: bigint; idempotencyKey: string };
export type TransferRequest = DepositRequest & { destinationWalletId: bigint };
export type ReverseRequest = { actor: FinancialActor; originalOperationId: bigint; idempotencyKey: string };

/** Coordena mudanças de saldo e histórico; não conhece formulários nem respostas HTTP. */
export class WalletService {
  constructor(private readonly database: PrismaClient = prisma) {}

  /** Credita a carteira do ator e cria operação e lançamento em um único commit. */
  async deposit(request: DepositRequest): Promise<Operation> {
    const actorId = this.actorId(request.actor);
    this.validAmount(request.amountCents);
    this.validKey(request.idempotencyKey);
    const intent: Intent = { type: "deposit", actorId, amountCents: request.amountCents };

    return this.execute(intent, request.idempotencyKey, async (transaction) => {
      const walletId = await this.actorWalletId(transaction, actorId);
      const [wallet] = await this.lockWallets(transaction, [walletId]);
      if (wallet.user_id !== actorId) throw new UnauthorizedOperation();
      const previous = await this.findReplay(transaction, request.idempotencyKey, intent);
      if (previous) return previous;

      const balance = this.checkedBalance(wallet.balance_cents + request.amountCents);
      const operation = await transaction.operation.create({
        data: {
          initiatedByUserId: actorId, type: "deposit", status: "completed",
          amountCents: request.amountCents, destinationWalletId: wallet.id,
          idempotencyKey: request.idempotencyKey,
        },
      });
      await transaction.wallet.update({ where: { id: wallet.id }, data: { balanceCents: balance } });
      await transaction.ledgerEntry.create({
        data: { operationId: operation.id, walletId: wallet.id, deltaCents: request.amountCents },
      });
      return operation;
    });
  }

  /** Debita a origem do ator e credita o destino sob locks ordenados. */
  async transfer(request: TransferRequest): Promise<Operation> {
    const actorId = this.actorId(request.actor);
    this.validAmount(request.amountCents);
    this.validId(request.destinationWalletId);
    this.validKey(request.idempotencyKey);
    const intent: Intent = {
      type: "transfer", actorId, amountCents: request.amountCents,
      destinationWalletId: request.destinationWalletId,
    };

    return this.execute(intent, request.idempotencyKey, async (transaction) => {
      const sourceId = await this.actorWalletId(transaction, actorId);
      if (sourceId === request.destinationWalletId) throw new InvalidOperation();
      const wallets = await this.lockWallets(transaction, [sourceId, request.destinationWalletId]);
      const source = wallets.find((wallet) => wallet.id === sourceId)!;
      const destination = wallets.find((wallet) => wallet.id === request.destinationWalletId)!;
      if (source.user_id !== actorId || destination.user_id === actorId) throw new UnauthorizedOperation();
      const previous = await this.findReplay(transaction, request.idempotencyKey, intent);
      if (previous) return previous;

      // Reservar a chave dentro da transação; saldo insuficiente desfaz também essa inserção.
      const operation = await transaction.operation.create({
        data: {
          initiatedByUserId: actorId, type: "transfer", status: "completed",
          amountCents: request.amountCents, sourceWalletId: source.id,
          destinationWalletId: destination.id, idempotencyKey: request.idempotencyKey,
        },
      });
      if (source.balance_cents < request.amountCents) throw new InsufficientBalance();
      const sourceBalance = this.checkedBalance(source.balance_cents - request.amountCents);
      const destinationBalance = this.checkedBalance(destination.balance_cents + request.amountCents);

      await transaction.wallet.update({ where: { id: source.id }, data: { balanceCents: sourceBalance } });
      await transaction.wallet.update({ where: { id: destination.id }, data: { balanceCents: destinationBalance } });
      await transaction.ledgerEntry.createMany({ data: [
        { operationId: operation.id, walletId: source.id, deltaCents: -request.amountCents },
        { operationId: operation.id, walletId: destination.id, deltaCents: request.amountCents },
      ] });
      return operation;
    });
  }

  /** Compensa lançamentos originais sem apagá-los e marca a operação como revertida. */
  async reverse(request: ReverseRequest): Promise<Operation> {
    const actorId = this.actorId(request.actor);
    this.validId(request.originalOperationId);
    this.validKey(request.idempotencyKey);
    const intent: Intent = { type: "reversal", actorId, originalOperationId: request.originalOperationId };

    return this.execute(intent, request.idempotencyKey, async (transaction) => {
      const original = await this.lockOriginal(transaction, request.originalOperationId);
      if (original.initiated_by_user_id !== actorId) throw new UnauthorizedOperation();
      const previous = await this.findReplay(transaction, request.idempotencyKey, intent);
      if (previous) return previous;
      if (original.type === "reversal" || original.reversal_of_operation_id !== null) throw new InvalidOperation();
      if (original.status === "reversed") throw new OperationAlreadyReversed();
      if (original.status !== "completed") throw new InvalidOperation();
      this.validAmount(original.amount_cents);

      const existingReversal = await transaction.operation.findUnique({
        where: { reversalOfOperationId: original.id }, select: { id: true },
      });
      if (existingReversal) throw new OperationAlreadyReversed();

      const originalEntries = await transaction.ledgerEntry.findMany({
        where: { operationId: original.id }, select: { walletId: true, deltaCents: true },
      });
      this.assertOriginalEntries(original, originalEntries);
      const wallets = await this.lockWallets(transaction, originalEntries.map((entry) => entry.walletId));
      const balances = wallets.map((wallet) => {
        const entry = originalEntries.find((item) => item.walletId === wallet.id)!;
        return { id: wallet.id, balanceCents: this.checkedBalance(wallet.balance_cents - entry.deltaCents) };
      });

      const reversal = await transaction.operation.create({
        data: {
          initiatedByUserId: actorId, type: "reversal", status: "completed",
          amountCents: original.amount_cents, sourceWalletId: original.source_wallet_id,
          destinationWalletId: original.destination_wallet_id,
          reversalOfOperationId: original.id, idempotencyKey: request.idempotencyKey,
        },
      });
      for (const balance of balances) {
        await transaction.wallet.update({ where: { id: balance.id }, data: { balanceCents: balance.balanceCents } });
      }
      await transaction.ledgerEntry.createMany({ data: originalEntries.map((entry) => ({
        operationId: reversal.id, walletId: entry.walletId, deltaCents: -entry.deltaCents,
      })) });
      await transaction.operation.update({ where: { id: original.id }, data: { status: "reversed" } });
      return reversal;
    });
  }

  private actorId(actor: FinancialActor): bigint {
    const id = verifiedActorId(actor);
    if (id === null) throw new UnauthorizedOperation();
    return id;
  }

  private validAmount(amount: bigint): void {
    if (typeof amount !== "bigint" || amount <= 0n || amount > MAX_SIGNED) throw new InvalidAmount();
  }

  private validId(id: bigint): void {
    if (typeof id !== "bigint" || id <= 0n || id > MAX_UNSIGNED) throw new InvalidOperation();
  }

  private validKey(key: string): void {
    if (typeof key !== "string" || !UUID_PATTERN.test(key)) throw new InvalidIdempotencyKey();
  }

  private checkedBalance(balance: bigint): bigint {
    if (balance < MIN_SIGNED || balance > MAX_SIGNED) throw new BalanceLimitExceeded();
    return balance;
  }

  private async actorWalletId(transaction: Transaction, actorId: bigint): Promise<bigint> {
    const user = await transaction.user.findUnique({
      where: { id: actorId }, select: { wallet: { select: { id: true } } },
    });
    if (!user) throw new UnauthorizedOperation();
    if (!user.wallet) throw new WalletNotFound();
    return user.wallet.id;
  }

  private async lockWallets(transaction: Transaction, ids: bigint[]): Promise<LockedWallet[]> {
    const uniqueIds = [...new Set(ids)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const wallets: LockedWallet[] = [];
    for (const id of uniqueIds) {
      // Cada SELECT usa a mesma conexão transacional e adquire lock antes de ler o saldo.
      const rows = await transaction.$queryRaw<LockedWallet[]>`
        SELECT id, user_id, balance_cents FROM wallets WHERE id = ${id} FOR UPDATE
      `;
      if (rows.length !== 1) throw new WalletNotFound();
      wallets.push(rows[0]);
    }
    return wallets;
  }

  private async lockOriginal(transaction: Transaction, id: bigint): Promise<LockedOperation> {
    const rows = await transaction.$queryRaw<LockedOperation[]>`
      SELECT id, initiated_by_user_id, type, status, amount_cents,
        source_wallet_id, destination_wallet_id, reversal_of_operation_id
      FROM operations WHERE id = ${id} FOR UPDATE
    `;
    if (rows.length !== 1) throw new InvalidOperation();
    return rows[0];
  }

  private assertOriginalEntries(original: LockedOperation, entries: { walletId: bigint; deltaCents: bigint }[]): void {
    if (original.type === "deposit") {
      if (original.source_wallet_id !== null || original.destination_wallet_id === null ||
          entries.length !== 1 || entries[0].walletId !== original.destination_wallet_id ||
          entries[0].deltaCents !== original.amount_cents) throw new InvalidOperation();
      return;
    }
    if (original.type === "transfer") {
      if (original.source_wallet_id === null || original.destination_wallet_id === null ||
          original.source_wallet_id === original.destination_wallet_id || entries.length !== 2 ||
          !entries.some((entry) => entry.walletId === original.source_wallet_id && entry.deltaCents === -original.amount_cents) ||
          !entries.some((entry) => entry.walletId === original.destination_wallet_id && entry.deltaCents === original.amount_cents)) {
        throw new InvalidOperation();
      }
      return;
    }
    throw new InvalidOperation();
  }

  private matches(operation: Operation, intent: Intent): boolean {
    if (operation.initiatedByUserId !== intent.actorId || operation.type !== intent.type) return false;
    if (intent.type === "deposit") return operation.amountCents === intent.amountCents;
    if (intent.type === "transfer") {
      return operation.amountCents === intent.amountCents && operation.destinationWalletId === intent.destinationWalletId;
    }
    return operation.reversalOfOperationId === intent.originalOperationId;
  }

  private replay(operation: Operation, intent: Intent): Operation {
    if (!this.matches(operation, intent)) throw new IdempotencyConflict();
    return operation;
  }

  private async findReplay(transaction: Transaction, key: string, intent: Intent): Promise<Operation | null> {
    const existing = await transaction.operation.findUnique({ where: { idempotencyKey: key } });
    return existing ? this.replay(existing, intent) : null;
  }

  private async execute(intent: Intent, key: string, work: (transaction: Transaction) => Promise<Operation>): Promise<Operation> {
    const previous = await this.database.operation.findUnique({ where: { idempotencyKey: key } });
    if (previous) return this.replay(previous, intent);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.database.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        // A consulta de colisão ocorre apenas depois do rollback da transação perdedora.
        if (this.isUniqueViolation(error)) {
          const winner = await this.database.operation.findUnique({ where: { idempotencyKey: key } });
          if (winner) return this.replay(winner, intent);
          if (intent.type === "reversal") {
            const reversal = await this.database.operation.findUnique({
              where: { reversalOfOperationId: intent.originalOperationId }, select: { id: true },
            });
            if (reversal) throw new OperationAlreadyReversed();
          }
          throw new FinancialPersistenceException();
        }
        if (this.isRetryable(error)) {
          if (attempt === MAX_ATTEMPTS) throw new FinancialPersistenceException();
          continue;
        }
        if (error instanceof WalletDomainError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError || this.isAdapterError(error)) {
          throw new FinancialPersistenceException();
        }
        throw error;
      }
    }
    throw new FinancialPersistenceException();
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") return true;
      if (error.code === "P2010" && ["1205", "1213"].includes(String(error.meta?.code))) return true;
    }
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; errno?: unknown; sqlState?: unknown };
    return [1205, 1213].includes(Number(candidate.errno)) ||
      ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(String(candidate.code)) ||
      candidate.sqlState === "40001";
  }

  private isAdapterError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "sqlState" in error && "errno" in error);
  }
}
