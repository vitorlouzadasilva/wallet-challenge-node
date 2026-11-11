import "server-only";

import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { clearIdentityAttempts, consumeLoginAttempt } from "./rate-limit";
import { normalizeEmail, validLoginInput } from "./validation";

const dummyHashPromise = bcrypt.hash("conta-inexistente-apenas-para-comparacao", 12);

export type LoginResult = { userId: bigint } | { error: "invalid" | "limited" };

export async function authenticate(emailInput: string, password: string, trustedIp?: string): Promise<LoginResult> {
  const email = normalizeEmail(emailInput).slice(0, 255);
  if (!(await consumeLoginAttempt(email, trustedIp))) {
    return { error: "limited" };
  }

  if (!validLoginInput(email, password)) {
    return { error: "invalid" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? await dummyHashPromise);

  if (!user || !matches) {
    return { error: "invalid" };
  }

  await clearIdentityAttempts(email);
  return { userId: user.id };
}
