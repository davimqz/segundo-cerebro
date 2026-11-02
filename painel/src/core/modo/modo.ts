// Modo claro, escuro ou do sistema. Fica num cookie, por aparelho, para o servidor já desenhar a
// página no modo certo (sem piscar o modo errado ao carregar).

export const COOKIE_MODO = "modo";
export const MODOS = ["sistema", "claro", "escuro"] as const;
export type Modo = (typeof MODOS)[number];

/** Lê o valor do cookie. Qualquer valor desconhecido (ou ausente) vira "sistema". */
export function lerModo(valor: string | undefined | null): Modo {
  return (MODOS as readonly string[]).includes(valor ?? "") ? (valor as Modo) : "sistema";
}

/** Cookie de um ano, legível pelo navegador (não é segredo) e restrito ao próprio site. */
export function cookieDoModo(modo: Modo): string {
  return `${COOKIE_MODO}=${modo}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}

export const ROTULO_MODO: Record<Modo, string> = {
  sistema: "Sistema",
  claro: "Claro",
  escuro: "Escuro",
};
