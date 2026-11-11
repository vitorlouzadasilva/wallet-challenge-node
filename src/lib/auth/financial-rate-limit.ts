import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const FINANCIAL_LIMIT = 30;

/** Limita envios financeiros por ator validado, sem depender de IP ou cabeçalhos do cliente. */
export async function consumeFinancialAttempt(userId: bigint): Promise<boolean> {
  const keyHash = createHash("sha256").update(`financial:user:${userId.toString()}`).digest("hex");

  return prisma.$transaction(async (transaction) => {
    // O incremento e a leitura ocorrem sob o bloqueio da mesma linha no MySQL.
    await transaction.$executeRaw`
      INSERT INTO login_attempts (key_hash, attempts, window_started_at, updated_at)
      VALUES (${keyHash}, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        attempts = IF(window_started_at < UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE, 1, attempts + 1),
        window_started_at = IF(window_started_at < UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE, UTC_TIMESTAMP(3), window_started_at),
        updated_at = UTC_TIMESTAMP(3)
    `;

    const attempt = await transaction.loginAttempt.findUniqueOrThrow({ where: { keyHash } });
    return attempt.attempts <= FINANCIAL_LIMIT;
  });
}
