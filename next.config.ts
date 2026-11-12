import type { NextConfig } from "next";

// A origem pública é configurável por instalação; não permitir curingas ou dados de autenticação.
const invalidOrigin = "APP_ORIGIN deve ser uma origem HTTP(S) válida, sem credenciais, caminho, query ou curinga.";
let origin: URL;
try {
  origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3010");
} catch {
  throw new Error(invalidOrigin);
}
if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
    origin.pathname !== "/" || origin.search || origin.hash || origin.hostname.includes("*")) {
  throw new Error(invalidOrigin);
}

const nextConfig: NextConfig = {
  // Next compara hostnames: protocolo e porta ficam em APP_ORIGIN, não nesta lista.
  allowedDevOrigins: [...new Set(["localhost", "127.0.0.1", origin.hostname])],
};

export default nextConfig;
