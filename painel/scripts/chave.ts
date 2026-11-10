// Chaves de agente das rotas /api/v1 (spec 007, ADR 0009). Roda no servidor, dentro do container:
//   sudo docker compose exec painel pnpm chave criar hermes --escopos departamentos:ler,avisos:ler
//   sudo docker compose exec painel pnpm chave listar
//   sudo docker compose exec painel pnpm chave revogar 3
//   sudo docker compose exec painel pnpm chave revogar --agente hermes [--manter-ultima]
// "criar" escreve na saída padrão só a chave (para o criar-chave-hermes.sh guardá-la); os avisos vão
// para a saída de erro. A chave aparece só essa vez: o banco guarda apenas o hash.
import { criarChave, ESCOPOS, listarChaves, revogarChave, revogarChavesDe } from "../src/core/agentes/chaves";
import { fecharBanco } from "../src/core/db/client";
import { argumentos } from "./terminal";

const USO = `Uso:
  pnpm chave criar <agente> --escopos e1,e2   (escopos: ${ESCOPOS.join(", ")})
  pnpm chave listar
  pnpm chave revogar <id>
  pnpm chave revogar --agente <agente> [--manter-ultima]`;

function data(d: Date | null): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 16) : "-";
}

async function main() {
  const lista = process.argv.slice(2);
  // --manter-ultima é uma opção sem valor: tira antes de ler as opções --nome valor.
  const manterUltima = lista.includes("--manter-ultima");
  const { posicionais, opcoes } = argumentos(lista.filter((a) => a !== "--manter-ultima"));
  const [comando, alvo] = posicionais;

  if (comando === "criar" && alvo) {
    const escopos = (opcoes.escopos ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const { id, chave } = await criarChave(alvo, escopos);
    process.stdout.write(`${chave}\n`);
    console.error(`Chave ${id} criada para ${alvo} (${escopos.join(", ")}). Ela não será mostrada de novo.`);
  } else if (comando === "listar") {
    const chaves = await listarChaves();
    if (!chaves.length) console.log("Nenhuma chave.");
    for (const c of chaves) {
      console.log(
        `${c.id}\t${c.agente}\t${c.escopos.join(",")}\tcriada ${data(c.criadaEm)}\trevogada ${data(c.revogadaEm)}`,
      );
    }
  } else if (comando === "revogar" && alvo && /^\d+$/.test(alvo)) {
    const ok = await revogarChave(Number(alvo));
    console.log(ok ? `Chave ${alvo} revogada.` : `Chave ${alvo} não existe ou já estava revogada.`);
  } else if (comando === "revogar" && !alvo && opcoes.agente) {
    const ids = await revogarChavesDe(opcoes.agente, { manterUltima });
    console.log(ids.length ? `Chaves revogadas de ${opcoes.agente}: ${ids.join(", ")}.` : "Nenhuma chave a revogar.");
  } else {
    console.error(USO);
    process.exitCode = 1;
  }
}

main()
  .catch((erro) => {
    console.error(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  })
  .finally(fecharBanco);
