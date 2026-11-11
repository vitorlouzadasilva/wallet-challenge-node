import { spawnSync } from "node:child_process";

const developmentUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;

if (!developmentUrl || !testUrl) {
  throw new Error("DATABASE_URL e TEST_DATABASE_URL são obrigatórias para testes de integração.");
}

const development = new URL(developmentUrl);
const testing = new URL(testUrl);
if (testing.protocol !== "mysql:" || testing.pathname !== "/wallet_node_test" || testing.href === development.href || development.pathname === testing.pathname) {
  throw new Error("Testes de integração exigem o banco isolado wallet_node_test.");
}

const environment = { ...process.env, DATABASE_URL: testUrl, WALLET_INTEGRATION_TEST: "1" };

for (const args of [
  ["prisma", "migrate", "deploy"],
  ["vitest", "run", "--config", "vitest.integration.config.ts"],
]) {
  const result = spawnSync("npx", args, { env: environment, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
