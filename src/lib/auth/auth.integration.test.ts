import { randomUUID, createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { beforeAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({ token: "", options: {} as Record<string, unknown> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => cookieState.token ? { value: cookieState.token } : undefined,
    set: (_name: string, value: string, options: Record<string, unknown>) => { cookieState.token = value; cookieState.options = options; },
  }),
}));

import { prisma } from "@/lib/prisma";
import { createAccount, DuplicateEmailError } from "./account";
import { authenticate } from "./login";
import { consumeLoginAttempt } from "./rate-limit";
import { createSession, currentUser, revokeSession } from "./session";
import { validateRegistration } from "./validation";

const password = "senha-segura-123";
const uniqueEmail = () => `${randomUUID()}@example.test`;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (process.env.WALLET_INTEGRATION_TEST !== "1" || !url || new URL(url).pathname !== "/wallet_node_test") {
    throw new Error("Teste bloqueado fora de wallet_node_test.");
  }

  // O limite global persiste entre execuções; reiniciá-lo apenas no banco isolado evita interferência nos testes.
  await prisma.loginAttempt.deleteMany({
    where: { keyHash: createHash("sha256").update("global:login").digest("hex") },
  });
});

describe("autenticação com MySQL isolado", () => {
  it("cadastra usuário e carteira zero, guarda hash e não cria operação financeira", async () => {
    const email = uniqueEmail();
    const id = await createAccount({ name: "Ana", email, password });
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: { wallet: true, initiatedOperations: true } });
    expect(user.wallet?.balanceCents).toBe(0n);
    expect(user.initiatedOperations).toHaveLength(0);
    expect(user.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect(typeof id).toBe("bigint");
  });

  it("rejeita e-mail duplicado por restrição do banco", async () => {
    const email = uniqueEmail();
    await createAccount({ name: "Primeira", email, password });
    await expect(createAccount({ name: "Segunda", email, password })).rejects.toBeInstanceOf(DuplicateEmailError);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("desfaz usuário quando a inclusão da carteira falha na transação", async () => {
    const email = uniqueEmail();
    await expect(prisma.$transaction(async (transaction) => {
      await transaction.user.create({ data: { name: "Rollback", email, passwordHash: "hash-somente-para-teste" } });
      await transaction.wallet.create({ data: { userId: 0n, balanceCents: 0n } });
    })).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("autentica com senha válida e responde genericamente a senha errada ou usuário inexistente", async () => {
    const email = uniqueEmail();
    const id = await createAccount({ name: "Login", email, password });
    expect(await authenticate(email.toUpperCase(), password)).toEqual({ userId: id });
    expect(await authenticate(email, "senha-incorreta")).toEqual({ error: "invalid" });
    expect(await authenticate(uniqueEmail(), "senha-incorreta")).toEqual({ error: "invalid" });
  });

  it("limita repetidas tentativas de login para a mesma identidade", async () => {
    const email = uniqueEmail();
    for (let index = 0; index < 5; index += 1) {
      expect(await authenticate(email, "senha-incorreta")).toEqual({ error: "invalid" });
    }
    expect(await authenticate(email, "senha-incorreta")).toEqual({ error: "limited" });
  });

  it("limita tentativas de identidades distintas quando o IP vem de proxy confiável", async () => {
    const seed = randomUUID().replaceAll("-", "");
    const ip = `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}::1`;
    for (let index = 0; index < 20; index += 1) {
      expect(await consumeLoginAttempt(uniqueEmail(), ip)).toBe(true);
    }
    expect(await consumeLoginAttempt(uniqueEmail(), ip)).toBe(false);
  });

  it("persiste apenas hash do token e invalida sessões expiradas e revogadas", async () => {
    const id = await createAccount({ name: "Sessão", email: uniqueEmail(), password });
    await createSession(id);
    const token = cookieState.token;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(cookieState.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await prisma.session.findUniqueOrThrow({ where: { tokenHash } });
    expect(session.tokenHash).not.toBe(token);
    expect((await currentUser())?.id).toBe(id);
    expect(await currentUser()).not.toHaveProperty("passwordHash");
    await prisma.session.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await currentUser()).toBeNull();
    await createSession(id);
    const renewedHash = createHash("sha256").update(cookieState.token).digest("hex");
    await revokeSession();
    expect(cookieState.token).toBe("");
    expect(await prisma.session.findUnique({ where: { tokenHash: renewedHash } })).toBeNull();
  });

  it("isola o saldo pela sessão autenticada, sem aceitar identidade do navegador", async () => {
    const first = await createAccount({ name: "Primeiro", email: uniqueEmail(), password });
    const second = await createAccount({ name: "Segundo", email: uniqueEmail(), password });
    await prisma.wallet.update({ where: { userId: second }, data: { balanceCents: 12345n } });
    await createSession(first);
    expect(await currentUser()).toMatchObject({ id: first, balanceCents: 0n });
    await createSession(second);
    expect(await currentUser()).toMatchObject({ id: second, balanceCents: 12345n });
  });

  it("mantém inválidos os dados de cadastro obrigatórios", () => {
    expect(validateRegistration({ name: "", email: "", password: "", confirmation: "" }).data).toBeUndefined();
  });
});
