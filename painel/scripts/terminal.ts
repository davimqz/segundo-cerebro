// Utilitários dos comandos de linha: argumentos --nome valor e perguntas no terminal.
import { createInterface } from "node:readline";

export function argumentos(lista: string[]): { posicionais: string[]; opcoes: Record<string, string> } {
  const posicionais: string[] = [];
  const opcoes: Record<string, string> = {};
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const [chave, valor] = a.slice(2).split("=", 2);
      if (valor !== undefined) opcoes[chave] = valor;
      else opcoes[chave] = lista[++i] ?? "";
    } else {
      posicionais.push(a);
    }
  }
  return { posicionais, opcoes };
}

// Sem terminal (entrada por pipe, como nos testes), as respostas são lidas linha a linha da entrada.
let linhas: AsyncIterator<string> | undefined;

async function proximaLinha(): Promise<string> {
  linhas ??= createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
  const r = await linhas.next();
  return r.done ? "" : r.value;
}

/** Pergunta e devolve a resposta. Com `oculto`, o que é digitado não aparece na tela. */
export async function perguntar(texto: string, oculto = false): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(texto + "\n");
    return proximaLinha();
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      const saida = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      saida._writeToOutput = (s: string) => {
        // Mostra só a pergunta; esconde os caracteres digitados.
        if (s.startsWith(texto)) saida.output.write(texto);
      };
    }
    rl.question(texto, (resposta) => {
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(resposta);
    });
  });
}

export function encerrarEntrada() {
  process.stdin.destroy();
}
