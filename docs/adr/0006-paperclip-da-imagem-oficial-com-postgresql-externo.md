# 0006. Paperclip da imagem oficial fixada por digest, sem CLIs, com o PostgreSQL 18 compartilhado

- Status: Aceito
- Data: 2026-11-03
- Decidido por: Davi

## Contexto
O Paperclip (MIT) é jovem e lança versões quase toda semana (spec 004). A imagem oficial instala, em `@latest`, CLIs de terceiros: o Claude Code, que é proprietário, e também Codex, Gemini CLI, Kimi e OpenCode. Isso deixa a versão sem fixar e esbarra na regra 5 (licenças). Compilar o Paperclip a partir do código (Rust, interface e servidor) passou de 7,3 GB de memória e derrubou o Docker duas vezes num ambiente de 7,6 GB. O VPS tem 8 GB e já roda PostgreSQL, Redis, painel e cloudflared. Sem `DATABASE_URL`, o Paperclip sobe um PostgreSQL embutido. O custo tem teto de R$ 100 por mês.

## Decisão
O `infra/paperclip/Dockerfile` parte da **imagem oficial da versão fixa, presa pelo digest** (`PAPERCLIP_IMAGEM`, por exemplo `ghcr.io/paperclipai/paperclip:2026.1023.0@sha256:...`). Ele copia só o aplicativo (`/app`) para uma base `node` limpa, sem as CLIs, e roda como o usuário 1000. O servidor não compila nada: baixa a imagem e monta a final. O Paperclip usa o banco `paperclip` do PostgreSQL 18 compartilhado, nunca o embutido.

## Alternativas consideradas
- **Compilar no servidor a partir da tag** (a primeira versão deste ADR): passou de 7 GB de memória e arriscaria derrubar o banco e o painel.
- **Compilar no Windows do Davi e enviar com `docker save | ssh docker load`:** manual, alguns GB por envio a cada versão, e depende da memória do PC.
- **Compilar no servidor com swap:** lento, e o OOM killer pode matar o PostgreSQL.
- **Imagem oficial como está:** mais simples, mas traz as CLIs em `@latest`, com licença proprietária.
- **PostgreSQL embutido:** sai do backup por `pg_dump`, gasta mais memória e duplica um serviço que já existe.

## Consequências
- Só entra código MIT na imagem final. O digest garante que a imagem não muda por baixo; trocar de versão é um passo manual (novo digest no `.env`).
- Confiamos no CI público do Paperclip para compilar a tag. O digest fixa exatamente o que foi revisado e testado no `scripts/teste-paperclip.sh`.
- A imagem oficial tem cerca de 2,5 GB e fica em cache no servidor (cabe nos 100 GB). Convém limpá-la depois de trocar de versão (`docker image prune`).
- O nosso Dockerfile repete o final do oficial (variáveis, `tini`, comando). A cada troca de versão, é preciso comparar com o Dockerfile oficial.
- O Paperclip só foi documentado com o PostgreSQL 17. O 18 é verificado pelo `scripts/teste-paperclip.sh`.
- O primeiro admin é criado pelo `infra/paperclip/convite-admin.sh`. A CLI oficial exige um `config.json` que a instalação por Docker não tem, então o script grava o convite direto no banco, do mesmo jeito que a CLI faz.
- **Gatilho para rever:** o projeto deixar de publicar a imagem ou o digest de uma versão; o item 6 (Hermes) precisar de uma CLI dentro do container; o projeto publicar uma imagem oficial sem as CLIs.
