// Mensagens mostradas na tela de login. São genéricas de propósito: não dizem se o e-mail existe.

export const MENSAGEM_CREDENCIAIS = "E-mail ou senha incorretos";
export const MENSAGEM_LIMITE = "Muitas tentativas. Espere 15 minutos e tente de novo.";
export const MENSAGEM_FALHA = "Não foi possível entrar agora. Tente de novo em instantes.";

/** Traduz a resposta do servidor (status HTTP) na mensagem da tela. */
export function mensagemDoLogin(status: number | undefined): string {
  if (status === 429) return MENSAGEM_LIMITE;
  if (status === 400 || status === 401 || status === 403) return MENSAGEM_CREDENCIAIS;
  return MENSAGEM_FALHA;
}
