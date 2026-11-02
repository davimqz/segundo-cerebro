// Cria um aviso do sistema (faixa no topo do painel). Serve para testar antes de existir a API.
//   sudo docker compose exec painel pnpm aviso criar --tipo alerta --mensagem "Teste"
// Tipos: alerta (amarelo) ou erro (vermelho).
import { criar, ehTipoDeAviso } from "../src/core/avisos/servico";
import { fecharBanco } from "../src/core/db/client";
import { argumentos } from "./terminal";

async function main() {
  const { posicionais, opcoes } = argumentos(process.argv.slice(2));
  const tipo = opcoes.tipo ?? "alerta";
  if (posicionais[0] !== "criar" || !opcoes.mensagem || !ehTipoDeAviso(tipo)) {
    console.log('Uso: pnpm aviso criar --tipo alerta|erro --mensagem "Texto do aviso" [--origem nome]');
    process.exitCode = 1;
    return;
  }
  const aviso = await criar(tipo, opcoes.mensagem, opcoes.origem || "script:aviso");
  console.log(`Aviso ${aviso.id} criado (${aviso.tipo}).`);
}

main()
  .catch((erro) => {
    console.error(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  })
  .finally(fecharBanco);
