// Regras da senha, usadas no servidor, nos scripts e na tela (sem dependência nativa).

export const SENHA_MINIMO = 12;
export const SENHA_MAXIMO = 128;

/** Devolve o motivo da recusa, ou null se a senha serve. */
export function problemaNaSenha(senha: string): string | null {
  if (senha.length < SENHA_MINIMO) return `A senha precisa de pelo menos ${SENHA_MINIMO} caracteres.`;
  if (senha.length > SENHA_MAXIMO) return `A senha pode ter no máximo ${SENHA_MAXIMO} caracteres.`;
  return null;
}
