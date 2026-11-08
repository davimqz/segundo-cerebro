// Bot de aprovações do Telegram (spec 006, ADR 0008). Roda no serviço bot-aprovacoes do
// infra/painel/compose.yml, com a mesma imagem do painel:
//   node servidor/dist-scripts/bot-aprovacoes.mjs
// Dois ciclos: o long polling do Telegram e a conferência do Paperclip a cada 10 segundos.
// Sem as variáveis do Paperclip ou do Telegram, ele avisa no log e fica parado (não reinicia em laço).
import { criarBot } from "../src/core/aprovacoes/bot";
import { fecharBanco } from "../src/core/db/client";
import { aprovacoesConfiguradas, telegramAprovacoes, urlDoPainel } from "../src/core/env";
import { criarClienteTelegram } from "../src/core/telegram/cliente";

const INTERVALO_PAPERCLIP_MS = 10_000;
const ESPERA_APOS_ERRO_MS = 5_000;

const parar = new AbortController();
const log = {
  info: (m: string) => console.log(`[bot-aprovacoes] ${m}`),
  erro: (m: string) => console.error(`[bot-aprovacoes] ${m}`),
};

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (parar.signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    parar.signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    log.info("parando");
    parar.abort();
  });
}

async function main() {
  const paperclip = aprovacoesConfiguradas();
  const telegram = telegramAprovacoes();
  if (!paperclip || !telegram) {
    log.erro(
      "não configurado: faltam PAPERCLIP_URL, PAPERCLIP_EMPRESA_ID, PAPERCLIP_CHAVE_BOARD, " +
        "TELEGRAM_APROVACOES_TOKEN ou TELEGRAM_APROVACOES_CHAT_ID no .env. Parado.",
    );
    await esperar(2 ** 31 - 1);
    return;
  }

  const bot = criarBot({
    paperclip,
    telegram: criarClienteTelegram({ token: telegram.token }),
    chatId: telegram.chatId,
    urlPainel: urlDoPainel(),
    log,
  });
  log.info("no ar");

  async function lacoPaperclip() {
    while (!parar.signal.aborted) {
      try {
        await bot.cicloPaperclip();
      } catch (e) {
        log.erro(`ciclo do Paperclip: ${e instanceof Error ? e.message : String(e)}`);
      }
      await esperar(INTERVALO_PAPERCLIP_MS);
    }
  }

  async function lacoTelegram() {
    while (!parar.signal.aborted) {
      try {
        await bot.cicloTelegram(25, parar.signal);
      } catch {
        // O erro já foi registrado e virou aviso; espera um pouco antes de tentar de novo.
        await esperar(ESPERA_APOS_ERRO_MS);
      }
    }
  }

  await Promise.all([lacoPaperclip(), lacoTelegram()]);
}

main()
  .catch((e) => {
    log.erro(`erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(fecharBanco);
