import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
