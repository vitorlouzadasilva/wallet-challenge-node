import { afterEach, expect, it, vi } from "vitest";

async function loadConfig(origin?: string) {
  vi.stubEnv("APP_ORIGIN", origin);
  vi.resetModules();
  return (await import("./next.config")).default;
}

afterEach(() => vi.unstubAllEnvs());

it("mantém localhost e IP local quando APP_ORIGIN não está definida", async () => {
  expect((await loadConfig()).allowedDevOrigins).toEqual(["localhost", "127.0.0.1"]);
});

it("permite o IP configurado sem incluir protocolo ou porta na lista de hosts", async () => {
  expect((await loadConfig("http://192.168.1.50:4010")).allowedDevOrigins)
    .toEqual(["localhost", "127.0.0.1", "192.168.1.50"]);
});

it("aceita domínio HTTPS e elimina hosts locais duplicados", async () => {
  expect((await loadConfig("https://Review.Example.test:8443/")).allowedDevOrigins)
    .toEqual(["localhost", "127.0.0.1", "review.example.test"]);
  expect((await loadConfig("http://127.0.0.1:4010")).allowedDevOrigins)
    .toEqual(["localhost", "127.0.0.1"]);
});

it.each([
  "", "not-a-url", "ftp://review.example.test", "http://*.example.test",
  "http://user:password@example.test", "https://example.test/wallet",
  "https://example.test/?key=secret", "https://example.test/#fragment",
])("recusa origem inválida sem repetir a configuração sensível no erro: %s", async (origin) => {
  await expect(loadConfig(origin)).rejects.toThrow(/^APP_ORIGIN deve ser/);
});
