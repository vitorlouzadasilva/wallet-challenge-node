import "server-only";

import { type FinancialActor, verifiedActorId } from "@/lib/auth/financial-actor";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { UnauthorizedOperation } from "./errors";

export type StatementItem = {
  id: string;
  operationId: string;
  date: string;
  label: string;
  detail: string;
  counterparty: string | null;
  amount: string;
  credit: boolean;
  status: "completed" | "reversed";
  canReverse: boolean;
};

export type Statement = { items: StatementItem[]; page: number; pages: number; total: number };

const completionMessages = {
  deposit: "Depósito registrado.",
  transfer: "Transferência registrada.",
  reversal: "Reversão registrada.",
};

export async function loadCompletedMessage(actor: FinancialActor, value: string | string[] | undefined): Promise<string | null> {
  const userId = verifiedActorId(actor);
  if (userId === null) throw new UnauthorizedOperation();
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) return null;
  const id = BigInt(value);
  if (id > (1n << 64n) - 1n) return null;
  const operation = await prisma.operation.findFirst({ where: { id, initiatedByUserId: userId }, select: { type: true } });
  return operation ? completionMessages[operation.type] : null;
}

export function statementPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Number(value);
}

/** Consulta somente lançamentos da carteira associada ao ator da sessão. */
export async function loadStatement(actor: FinancialActor, requestedPage: number): Promise<Statement> {
  const userId = verifiedActorId(actor);
  if (userId === null) throw new UnauthorizedOperation();
  const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (!wallet) return { items: [], page: 1, pages: 1, total: 0 };

  const where = { walletId: wallet.id };
  const total = await prisma.ledgerEntry.count({ where });
  const pages = Math.max(1, Math.ceil(total / 10));
  const page = Number.isSafeInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), pages) : 1;
  const entries = await prisma.ledgerEntry.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 10,
    take: 10,
    select: {
      id: true, deltaCents: true, createdAt: true,
      operation: { select: {
        id: true, type: true, status: true, initiatedByUserId: true,
        originalOperation: { select: { type: true } },
        sourceWallet: { select: { user: { select: { name: true } } } },
        destinationWallet: { select: { user: { select: { name: true } } } },
      } },
    },
  });

  return {
    page, pages, total,
    items: entries.map((entry) => {
      const operation = entry.operation;
      const credit = entry.deltaCents > 0n;
      const label = operation.type === "deposit" ? "Depósito"
        : operation.type === "transfer" ? credit ? "Transferência recebida" : "Transferência enviada"
          : operation.originalOperation?.type === "deposit" ? "Reversão de depósito" : "Reversão de transferência";
      return {
        id: entry.id.toString(),
        operationId: operation.id.toString(),
        date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(entry.createdAt),
        label,
        detail: `Operação #${operation.id.toString()}`,
        counterparty: operation.type === "transfer"
          ? credit ? `De: ${operation.sourceWallet?.user.name ?? "Usuário indisponível"}`
            : `Para: ${operation.destinationWallet?.user.name ?? "Usuário indisponível"}`
          : null,
        amount: formatCents(entry.deltaCents),
        credit,
        status: operation.status,
        canReverse: operation.status === "completed" && operation.type !== "reversal" && operation.initiatedByUserId === userId,
      };
    }),
  };
}
