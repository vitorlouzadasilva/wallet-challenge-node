import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // No build da imagem não há credenciais. Comandos de banco exigem DATABASE_URL no container.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
