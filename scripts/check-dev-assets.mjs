import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const base = new URL(process.env.DEV_HTTP_BASE_URL ?? "http://127.0.0.1:3000");
const publicOrigin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3010");
let homepage;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    homepage = await fetch(base, { signal: AbortSignal.timeout(1000) });
    break;
  } catch {
    if (attempt === 19) throw new Error("Servidor next dev indisponível para verificar os scripts.");
    await delay(250);
  }
}
assert.ok(homepage);
assert.equal(homepage.status, 200, "A home deve responder antes de verificar seus scripts.");
const html = await homepage.text();
const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^\"]+)"/g)]
  .map((match) => match[1]).filter((path) => path.startsWith("/_next/static/chunks/")))].slice(0, 3);
assert.ok(scripts.length > 0, "Nenhum script Next encontrado na resposta HTML.");

// Exercita o servidor real: HTML disponível não garante que os scripts de hidratação possam carregar.
const permittedOrigins = new Set([publicOrigin.origin]);
for (const hostname of ["localhost", "127.0.0.1"]) {
  const localOrigin = new URL(publicOrigin);
  localOrigin.hostname = hostname;
  permittedOrigins.add(localOrigin.origin);
}
const rejectedOrigin = `http://not-approved-${randomUUID()}.invalid`;
for (const path of scripts) {
  for (const origin of [...permittedOrigins, rejectedOrigin]) {
    const expected = origin === rejectedOrigin ? 403 : 200;
    const response = await fetch(new URL(path, base), {
      headers: { Origin: origin, Referer: `${origin}/dashboard` },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, expected, `Origem ${new URL(origin).hostname}: status inesperado para ${path}`);
    if (expected === 200) assert.match(response.headers.get("content-type") ?? "", /javascript/);
    await response.body?.cancel();
  }
}
console.log(`${scripts.length} scripts verificados: APP_ORIGIN e origens locais acessíveis; origem externa bloqueada.`);
