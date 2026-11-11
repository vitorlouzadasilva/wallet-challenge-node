import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { walletPrisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const url = new URL(connectionString);
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL deve apontar para MySQL.");
  }

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: 5,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.walletPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.walletPrisma = prisma;
}
