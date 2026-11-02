import type { NextConfig } from "next";

// Cabeçalhos fixos de segurança. A CSP depende de um nonce por requisição e fica no src/proxy.ts.
const cabecalhosDeSeguranca = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Imagem Docker enxuta (ADR 0005): o build gera um servidor Node autocontido.
  output: "standalone",
  poweredByHeader: false,
  // As regras do projeto ficam no CLAUDE.md da raiz; o next dev não gera AGENTS.md.
  agentRules: false,
  // O painel é todo por sessão (cada tela lê o login e o banco a cada pedido), então o
  // cacheComponents não traz ganho e obrigaria Suspense em toda leitura de sessão.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca }];
  },
};

export default nextConfig;
