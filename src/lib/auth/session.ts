import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "wallet_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function secureCookie(): boolean {
  // A origem configurada descreve o protocolo público; NODE_ENV não indica HTTPS.
  return new URL(process.env.APP_ORIGIN ?? "http://localhost:3010").protocol === "https:";
}

export async function createSession(userId: bigint): Promise<void> {
  const cookieStore = await cookies();
  const previous = cookieStore.get(COOKIE_NAME)?.value;
  if (previous && /^[a-f0-9]{64}$/.test(previous)) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(previous) } });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookie(),
    maxAge: SESSION_SECONDS,
  });
}

export async function currentUser(): Promise<{
  id: bigint;
  name: string;
  balanceCents: bigint | null;
} | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
    select: { user: { select: { id: true, name: true, wallet: { select: { balanceCents: true } } } } },
  });

  return session ? {
    id: session.user.id,
    name: session.user.name,
    balanceCents: session.user.wallet?.balanceCents ?? null,
  } : null;
}

export async function revokeSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookie(),
    maxAge: 0,
  });
}
