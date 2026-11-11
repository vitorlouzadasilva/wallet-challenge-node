import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const IDENTITY_LIMIT = 5;
const IP_LIMIT = 20;
const GLOBAL_LIMIT = 100;

function keyHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function consumeLoginAttempt(email: string, trustedIp?: string): Promise<boolean> {
  const buckets = [
    { key: keyHash(`identity:${email}`), limit: IDENTITY_LIMIT },
    ...(trustedIp ? [{ key: keyHash(`ip:${trustedIp}`), limit: IP_LIMIT }] : []),
    { key: keyHash("global:login"), limit: GLOBAL_LIMIT },
  ];

  // O incremento SQL é atômico mesmo com múltiplos processos. Sem proxy confiável,
  // o bucket global substitui o de IP para evitar cabeçalhos falsificados.
  return prisma.$transaction(async (transaction) => {
    let allowed = true;

    for (const bucket of buckets) {
      await transaction.$executeRaw`
        INSERT INTO login_attempts (key_hash, attempts, window_started_at, updated_at)
        VALUES (${bucket.key}, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          attempts = IF(window_started_at < UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE, 1, attempts + 1),
          window_started_at = IF(window_started_at < UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE, UTC_TIMESTAMP(3), window_started_at),
          updated_at = UTC_TIMESTAMP(3)
      `;

      const attempt = await transaction.loginAttempt.findUniqueOrThrow({ where: { keyHash: bucket.key } });
      if (attempt.attempts > bucket.limit) {
        allowed = false;
      }
    }

    return allowed;
  });
}

export async function clearIdentityAttempts(email: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { keyHash: keyHash(`identity:${email}`) } });
}
