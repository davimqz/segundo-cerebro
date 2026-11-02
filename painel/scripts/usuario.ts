// Cria o usuário do painel ou troca a senha. Roda no servidor, dentro do container:
//   sudo docker compose exec painel pnpm usuario criar [--email voce@exemplo.com] [--nome "Seu nome"]
//   sudo docker compose exec painel pnpm usuario senha [--email voce@exemplo.com]
// A senha é pedida sem aparecer na tela (mínimo de 12 caracteres). Trocar a senha encerra todas as sessões.
import { fecharBanco } from "../src/core/db/client";
import { criarUsuario, trocarSenha } from "../src/core/auth/usuarios";
import { argumentos, encerrarEntrada, perguntar } from "./terminal";

async function pedirSenha(): Promise<string> {
  const senha = await perguntar("Senha (mínimo de 12 caracteres): ", true);
  const confirmacao = await perguntar("Repita a senha: ", true);
  if (senha !== confirmacao) throw new Error("As senhas não conferem.");
  return senha;
}

async function main() {
  const { posicionais, opcoes } = argumentos(process.argv.slice(2));
  const comando = posicionais[0];
  if (comando !== "criar" && comando !== "senha") {
    console.log("Uso: pnpm usuario criar [--email E] [--nome N]  |  pnpm usuario senha [--email E]");
    process.exitCode = 1;
    return;
  }

  const email = opcoes.email || (await perguntar("E-mail: "));
  if (comando === "criar") {
    const nome = opcoes.nome || (await perguntar("Nome: "));
    const senha = await pedirSenha();
    const u = await criarUsuario({ email, nome, senha });
    console.log(`Usuário criado: ${u.email}`);
  } else {
    const senha = await pedirSenha();
    const u = await trocarSenha({ email, senha });
    console.log(`Senha trocada para ${u.email}. Todas as sessões foram encerradas.`);
  }
}

main()
  .catch((erro) => {
    console.error(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    encerrarEntrada();
    await fecharBanco();
  });
