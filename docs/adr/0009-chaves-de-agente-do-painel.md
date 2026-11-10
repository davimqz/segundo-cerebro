# 0009. Chaves de agente do painel

- Status: Aceito
- Data: 2026-11-10
- Decidido por: Davi (spec 007, decisões 3A de 2026-11-08 e 3A e 4A de 2026-11-10)

## Contexto
A regra 6 do `CLAUDE.md` diz que agentes nunca acessam o banco direto: usam a API `/api/v1` do painel. O item 7 abre essas rotas para o Hermes, e o n8n vem depois (item 8). O login do painel (Better Auth, ADR 0004) é para pessoas, com e-mail, senha e cookie. Um agente precisa de uma credencial própria, que limite o que ele pode fazer, possa ser trocada sem mexer nas outras e não fique legível no banco nem nos logs. O Cloudflare Access protege só o acesso de fora; na rede Docker interna, a chave é a única barreira.

## Decisão
- **Uma chave por agente, guardada só como hash:** a tabela `chaves_agentes` guarda o agente (ex.: `hermes`), o SHA-256 da chave, os escopos e a data de revogação (vazia = ativa). A chave tem o prefixo `pnl_` e 32 bytes aleatórios (base64url), e aparece uma única vez, na saída do comando que a cria.
- **Escopos fechados:** `departamentos:ler`, `atividades:ler`, `avisos:ler` e `tarefas:registrar`, conferidos por um `check` no banco. Cada rota exige um escopo: sem chave, com chave desconhecida ou revogada, ela responde 401 sem dizer o motivo; sem o escopo, responde 403.
- **Gestão só pelo comando:** `pnpm chave criar|listar|revogar`, dentro do container do painel. Criar e revogar gravam `chave_criada` e `chave_revogada` em Atividades. O `infra/painel/criar-chave-hermes.sh` cria a chave do Hermes, grava `PAINEL_API_KEY` no `.env` dele (sem mostrar a chave nem passá-la por argumento) e só então revoga as antigas.
- **O autor vem da chave:** as atividades gravadas por uma rota usam o agente da chave como autor, nunca um campo do pedido.

## Alternativas consideradas
- **Plugin de API key do Better Auth:** ligaria as chaves a um usuário humano e ao modelo de sessão do login. Escopos próprios e o autor "agente" exigiriam adaptações, e uma atualização do Better Auth poderia mudar o comportamento.
- **Uma chave única no `.env` do painel, compartilhada pelos agentes:** não diria quem fez cada ação, e trocar a chave de um agente derrubaria os outros.
- **JWT assinado:** não se revoga um token sem guardar uma lista no banco, o que acaba no mesmo lugar da tabela, só que com mais partes móveis (segredo de assinatura, validade, relógio).

## Consequências
- Fica fácil dar ao n8n uma chave própria com outros escopos, e revogar uma chave vazada sem tocar nas outras.
- Um vazamento do banco não entrega chaves utilizáveis, porque o banco guarda só o hash.
- Um escopo novo pede uma migração (o `check` do banco) e uma linha em `ESCOPOS`.
- Não há limite de chamadas por chave nem registro de "último uso". Rever se um agente externo ou um cliente passar a usar a API, ou quando houver uma tela de chaves no painel.
