# 002. Painel, núcleo

- Risco: R2 (login e sessão, migração de banco, segredos, infraestrutura)
- Origem: Build Plan, Etapa 1, item 3; App Flow ("Telas do MVP"); Backend ("Tabelas do núcleo"); Design Brief
- Status: Rascunho

## Objetivo
Criar o app do painel em `painel/` (ADR 0002) e colocá-lo no ar em `painel.asttralabs.com.br`, atrás do Cloudflare Access. Ele terá o login próprio com e-mail e senha, o menu com as 9 telas, o tema Selecta lido do banco nos modos claro e escuro, as seis tabelas do núcleo, a faixa de avisos e a tela Atividades. É a casca em que as verticais (Etapa 2) e a ponte do Hermes (item 7) vão entrar.

## Critérios de aceite
**Login e sessão**
- Quando alguém sem sessão abre qualquer tela, o sistema deve redirecionar para `/entrar`. A checagem é feita no servidor, no layout das telas, e não só no `proxy.ts`.
- Quando Davi digita e-mail e senha corretos, o sistema deve criar a sessão e abrir a tela Início. Também deve gravar `login` em `atividades`.
- Quando o e-mail não existe ou a senha está errada, o sistema deve mostrar a mesma mensagem genérica ("E-mail ou senha incorretos") e não deve criar sessão.
- Quando um mesmo IP erra o login 5 vezes em 15 minutos, o sistema deve responder 429 até a janela passar. O IP vem do cabeçalho `CF-Connecting-IP`.
- Quando alguém chama a rota de cadastro do Better Auth, o sistema deve recusar. Não existe cadastro público.
- Quando passam `SESSAO_DIAS` dias desde o login (padrão 1, sem renovação pelo uso), o sistema deve pedir a senha de novo.
- Quando Davi clica em Sair, o sistema deve apagar a sessão no banco, limpar o cookie e gravar `logout`.
- O cookie de sessão deve ter `HttpOnly`, `Secure` e `SameSite=Lax`. A senha deve ser guardada com hash argon2id.
- Quando Davi troca a senha em Configurações (pede a senha atual), o sistema deve encerrar as outras sessões e gravar `senha_trocada`.
- Quando `pnpm usuario criar` ou `pnpm usuario senha` roda no servidor, o script deve pedir a senha sem mostrá-la, exigir no mínimo 12 caracteres e criar o usuário ou trocar a senha. Na troca, deve encerrar todas as sessões.

**Menu, telas e tema**
- Quando Davi está logado, a barra lateral deve mostrar as 9 telas nos 3 grupos do App Flow (Decidir, Operar e Sistema). No celular, a barra vira menu.
- Quando abre Aprovações, Tarefas, Departamentos, CRM, Conhecimento ou Assistente, a tela deve mostrar o título e "Chega na Etapa X, item Y".
- A tela Início deve seguir o layout do mockup aprovado, com os indicadores entre colchetes e os avisos abertos de verdade.
- O nome do painel, a URL e o e-mail do primeiro usuário devem vir do `.env` ou do banco. Nada da Asttra deve ficar fixo no código.
- Quando o painel carrega, as cores, as fontes e os cantos devem vir do tema ativo da tabela `temas` (o Selecta, instalado pela seed como padrão), aplicados como variáveis CSS. Os componentes devem usar só tokens semânticos.
- Quando não há preferência salva, o modo deve seguir o sistema. Quando Davi escolhe claro, escuro ou sistema (no topo ou em Configurações), a escolha deve valer na hora, continuar depois de recarregar e não piscar o modo errado. Ela fica num cookie, por aparelho.

**Núcleo, avisos e Atividades**
- Quando as migrações rodam num banco vazio, devem ser criadas as tabelas `departamentos`, `temas`, `atividades`, `avisos`, `integracoes` e `configuracoes`, além das tabelas de login do Better Auth. A seed deve instalar os 5 departamentos e o tema Selecta.
- Quando qualquer código tenta `UPDATE` ou `DELETE` em `atividades`, o banco deve recusar com erro, por causa de um gatilho (trigger) no PostgreSQL.
- Quando existe um aviso aberto, todas as telas devem mostrar a faixa no topo, na cor do tipo (`status-warning` ou `status-danger`), com ícone e texto. Quando Davi clica em Resolver, o aviso deve sumir e a ação `aviso_resolvido` deve ser gravada.
- Quando Davi abre Atividades, o sistema deve listar os registros do mais novo para o mais antigo, 50 por página, com filtro por autor, ação e departamento.
- Quando `pnpm aviso criar` roda, o script deve criar um aviso. Ele serve para testar antes de existir a API.

**Implantação**
- Quando `docker compose up -d` roda em `/opt/asttra/painel/`, o container deve ficar `healthy` (rota `/api/saude`), escutar só em `127.0.0.1:3000` e rodar as migrações antes de abrir.
- As respostas devem levar os cabeçalhos CSP, HSTS e `X-Content-Type-Options`. Erros para o usuário devem ser genéricos.

## Fora de escopo
- A API `/api/v1`, as chaves por agente e o MCP. Entram no item 7.
- Carregar o `tokens.json` e trocar o tema ativo pela tela. Entram no item 4. Aqui a tela Aparência mostra só o tema ativo.
- Recuperar a senha por e-mail, cadastro público, mais de um usuário pela tela, papéis e verificação em duas etapas no painel.
- Indicadores calculados, tarefas, aprovações e compromissos reais na tela Início (Etapa 2 e itens 5 a 8).
- O uso do Redis. O painel ainda não precisa dele.
- Deploy automático. A atualização é manual, por comando no servidor.

## Arquivos e interfaces
- `painel/`: Next.js com TypeScript (versões fixadas), Tailwind, shadcn/ui, Lucide, Drizzle, Better Auth e `@node-rs/argon2`. Testes com Vitest e Playwright.
- `painel/src/core/db/`: `schema.ts` (tabelas do núcleo e do login), `client.ts`, migrações em `painel/drizzle/` e `seed.ts`. A migração do gatilho de `atividades` é escrita em SQL.
- `painel/src/core/auth/`: `auth.ts` (Better Auth com `disableSignUp`, hash argon2id, limite de tentativas no banco, sessão de `SESSAO_DIAS` dias e cabeçalho de IP) e `sessao.ts` (`exigirSessao()` para layouts e ações).
- `painel/src/core/atividades/servico.ts`: `registrar({ autorTipo, autorId, acao, alvo?, departamentoId?, aprovadoPor?, detalhes? })` e `listar(filtros, pagina)`.
- `painel/src/core/avisos/servico.ts`: `abertos()`, `criar(tipo, mensagem, origem)` e `resolver(id, usuario)`. A resolução grava em `atividades`.
- `painel/src/core/temas/`: `schema.ts` (zod dos tokens: semânticos claro e escuro, tags por departamento, fontes e cantos), `css.ts` (tokens → variáveis CSS) e `servico.ts` (`temaAtivo()`).
- `painel/seed/`: `departamentos.json` e `temas/selecta.json`. São dados do modelo padrão, editáveis por cliente.
- `painel/src/app/`: `(publico)/entrar`, `(painel)/layout.tsx` (sessão, barra lateral, faixa de avisos, modo) e as 9 telas, mais `api/auth/[...all]` e `api/saude`.
- `painel/scripts/usuario.ts` e `painel/scripts/aviso.ts`: comandos de linha para o servidor.
- `painel/Dockerfile` (saída `standalone`, usuário sem root) e `painel/.env.example`, com `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PAINEL_NOME` e `SESSAO_DIAS`.
- `infra/painel/compose.yml`: build a partir de `../../painel`, rede externa `asttra` (banco em `postgres:5432`), porta `127.0.0.1:3000:3000`, `mem_limit` e healthcheck.
- `scripts/check.sh` e `.github/workflows/ci.yml`: passam a incluir lint, tipos e testes do painel.
- Docs: playbook (capítulo "Painel"), Build Plan, `CLAUDE.md` (comandos de instalar e rodar) e `05-backend-schema.md` (campos finais).

## Perguntas em aberto
- **Formato do `tokens.json` do Selecta:** o schema dos temas deve aceitar o arquivo exportado pelo design system. É preciso baixá-lo do artifact do Selecta e conferir antes de fechar o `temas/schema.ts`.
- **pnpm:** é o gerenciador de pacotes proposto. Falta confirmar.
- **Porta 3000:** falta confirmar que ela está livre no servidor. O túnel usa `network_mode: host` e alcança `localhost:3000`.

## Plano
1. **No Windows:** criar `painel/` com Next.js, TypeScript, Tailwind, shadcn/ui, ESLint, Vitest e Playwright. Ligar lint, tipos e testes no `scripts/check.sh` e no CI.
2. Escrever o schema do Drizzle, as migrações (com o gatilho de `atividades`) e a seed. Testar contra o PostgreSQL de `infra/banco`.
3. Escrever o tema: o schema zod, o `selecta.json` com os valores do Design Brief e a geração das variáveis CSS. Ligar ao layout com o cookie de modo.
4. Ligar o Better Auth (tabelas, argon2id, limite de tentativas, sessão, sem cadastro), a tela `/entrar`, o `exigirSessao()` e os scripts `usuario` e `aviso`.
5. Montar o layout com a barra lateral, a faixa de avisos e o botão de modo. Criar as 9 telas: Início pelo mockup, Atividades com a lista e Configurações com o modo, a troca de senha e o Sair.
6. Criar o `Dockerfile`, o `infra/painel/compose.yml` e a rota `/api/saude`, e testar o container localmente.
7. **No servidor:** clonar o repositório em `/opt/asttra/painel-src`, criar o `.env` com `BETTER_AUTH_SECRET` gerado por `openssl rand` e subir o compose. Depois, rodar `pnpm usuario criar` dentro do container.
8. **No navegador:** criar a rota `painel.asttralabs.com.br` → `http://localhost:3000` no tunnel `vps-asttra` e a aplicação "Painel" no Access, só com o e-mail do Davi.
9. **No Windows:** atualizar o playbook, o Build Plan, o `CLAUDE.md` e o backend-schema, criar os ADRs aprovados e abrir o PR, que só entra com a sua aprovação.

ADRs propostos (criar com `/asttra:adr` depois da sua aprovação):
- **0004:** login do painel com Better Auth e argon2id, no lugar do Auth.js ou de uma implementação própria.
- **0005:** imagem do painel construída no servidor, e não no GitHub Actions com GHCR.

**Testes previstos:**
- Unidade (Vitest):
  - tokens → variáveis CSS e validação do schema (aceita o Selecta, recusa token faltando);
  - leitura do cookie de modo;
  - mensagens de erro do login iguais para e-mail inexistente e senha errada.
- Integração (Vitest com o PostgreSQL de teste):
  - migrações e seed num banco vazio;
  - o gatilho recusa `UPDATE` e `DELETE` em `atividades`;
  - login certo, login errado, 429 depois de 5 erros e cadastro recusado;
  - expiração da sessão;
  - logout apaga a sessão;
  - `usuario senha` encerra as sessões;
  - criar e resolver aviso grava em `atividades`.
- E2E (Playwright, no CI, com o app e o banco em containers):
  - sem sessão vai para `/entrar`;
  - login abre Início, o menu tem as 9 telas e o modo escuro continua depois de recarregar;
  - o aviso criado pelo script aparece e some ao resolver;
  - Sair volta para `/entrar`.

**Comandos de verificação:** `bash scripts/check.sh` (lint, tipos, unidade e integração), `pnpm --dir painel test:e2e` e o CI verde (Gitleaks, Semgrep, Trivy e checagem).

## Verificação de ponta a ponta
No servidor:
1. `sudo docker compose ps` em `/opt/asttra/painel` mostra o `painel` como `healthy`. `ss -tlnp` mostra a porta 3000 só em `127.0.0.1`.
2. `sudo docker compose exec painel pnpm aviso criar --tipo alerta --mensagem "Teste"` termina sem erro.

No navegador (celular e computador):
3. `https://painel.asttralabs.com.br` pede primeiro o código da Cloudflare e depois o login do painel.
4. Uma senha errada mostra a mensagem genérica. A senha certa abre a Início com a faixa "Teste".
5. Resolver o aviso faz a faixa sumir. A tela Atividades mostra `login` e `aviso_resolvido`.
6. O botão troca entre claro e escuro, e a escolha continua depois de recarregar. Esse é o "Pronto quando" do Build Plan.
7. Sair volta para `/entrar`. Abrir `/atividades` direto também leva para `/entrar`.
