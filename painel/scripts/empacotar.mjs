// Empacota os comandos de linha (migrar, usuario, aviso) e o bot de aprovações em arquivos .mjs autocontidos, para rodarem
// na imagem Docker sem TypeScript nem dependências de desenvolvimento. Usado pelo Dockerfile.
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/migrar.ts", "scripts/usuario.ts", "scripts/aviso.ts", "scripts/bot-aprovacoes.ts"],
  outdir: "dist-scripts",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // Binário nativo: vem do node_modules da saída standalone do Next.
  external: ["@node-rs/argon2", "pg-native"],
  // Dependências em CommonJS (como o pg) precisam de require dentro do ESM.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
