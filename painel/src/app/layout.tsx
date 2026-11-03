import type { Metadata } from "next";
import { Geist, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { nomeDoPainel } from "@/core/env";
import { COOKIE_MODO, lerModo } from "@/core/modo/modo";
import { temaParaCss } from "@/core/temas/css";
import { temaAtivo } from "@/core/temas/servico";
import "./globals.css";

// Fontes servidas pelo próprio painel. O tema decide onde cada uma entra (src/core/temas/css.ts).
const geist = Geist({ variable: "--fonte-geist", subsets: ["latin"], weight: ["400", "500"] });
const plexMono = IBM_Plex_Mono({ variable: "--fonte-plex-mono", subsets: ["latin"], weight: ["500"] });

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: { default: nomeDoPainel(), template: `%s · ${nomeDoPainel()}` }, robots: { index: false } };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [loja, { tema }] = await Promise.all([cookies(), temaAtivo()]);
  const modo = lerModo(loja.get(COOKIE_MODO)?.value);

  return (
    <html lang="pt-BR" data-modo={modo} className={`${geist.variable} ${plexMono.variable}`}>
      <head>
        {/* Seguro: o schema do tema recusa valores com < > { } ; barra invertida, url(, @ ou expression(. */}
        <style id="tema" dangerouslySetInnerHTML={{ __html: temaParaCss(tema) }} />
      </head>
      <body className="min-h-dvh bg-surface text-text">{children}</body>
    </html>
  );
}
