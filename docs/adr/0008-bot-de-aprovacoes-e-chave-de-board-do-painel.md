# 0008. Bot de aprovações num segundo container do painel e chave de board permanente

- Status: Aceito
- Data: 2026-11-08
- Decidido por: Davi (spec 006, decisões 1A e 2A)

## Contexto
Os pedidos de aprovação vivem no Paperclip. O item 6b faz Davi decidir esses pedidos na tela Aprovações do painel e num segundo bot do Telegram, só de aprovações. Só quem tem acesso de board no Paperclip pode aprovar ou recusar. O Hermes tem só uma chave de agente e continua sem esse poder (ADR 0007). O painel precisa, então, de uma credencial de board própria, e o bot precisa de um processo que fique de pé o tempo todo: as Server Actions do Next só rodam quando alguém abre a tela. Por padrão, o Paperclip cria chaves de board que valem 30 dias.

## Decisão
- **Bot em container próprio:** um segundo serviço, `bot-aprovacoes`, no `infra/painel/compose.yml`. Ele usa a mesma imagem do painel e roda só `node servidor/dist-scripts/bot-aprovacoes.mjs`. Busca as mensagens do Telegram por **long polling** (`getUpdates`), sem webhook e sem porta publicada, e confere o Paperclip a cada ~10 segundos. O estado das mensagens fica na tabela `aprovacoes_telegram` do banco `painel`.
- **Um só caminho de decisão:** a tela e o bot chamam o mesmo `decidirAprovacao` (`painel/src/core/aprovacoes/servico.ts`). Ele trava o pedido no PostgreSQL (`pg_advisory_xact_lock`), confere o status no Paperclip, decide e grava a atividade na mesma transação. Assim, um clique no painel e um toque no Telegram ao mesmo tempo geram uma única atividade.
- **Chave de board permanente:** o painel guarda no `.env` (`PAPERCLIP_CHAVE_BOARD`) uma chave de board chamada `painel-aprovacoes`, criada **sem validade** (`expiresAt: null`). O `infra/painel/criar-chave-paperclip.sh` a cria com uma chave temporária, aprovada pelo link do Paperclip como no `configurar.sh`, e grava a chave nova no `.env` sem mostrá-la. Rodar de novo troca a chave e revoga a anterior. Se o Paperclip recusar a chave, o painel mostra um aviso.

## Alternativas consideradas
- **Bot dentro do processo do Next:** um laço iniciado no `instrumentation.ts`. Mistura o servidor web com um processo de longa duração, roda duas vezes no `next dev` e cai junto com o painel a cada atualização.
- **Webhook do Telegram:** exige uma rota pública no Cloudflare Tunnel sem o Access na frente (o Telegram não passa pelo login), com um segredo para conferir a origem. O long polling não abre nada para fora.
- **Chave de 30 dias (o padrão do Paperclip):** obriga Davi a rodar o script todo mês. Se ele esquecer, as aprovações param.
- **Login do painel no Paperclip pela sessão do Davi:** depende do cookie do navegador, que expira e não pode ficar num container.

## Consequências
- Quem tem a chave tem o poder de board no Paperclip: aprova, recusa e configura a empresa. Ela fica só no `.env` do painel (permissão 600, fora do Git) e nunca aparece em log, em `atividades` ou nas mensagens. Para revogar, use Configurações > Acesso no Paperclip ou rode o script de novo.
- O painel e o bot dependem do Paperclip para mostrar e decidir pedidos. Cada chamada tem tempo-limite de 5 segundos, para a tela Aprovações não deixar o resto do painel lento.
- A trava do pedido segura uma conexão do banco enquanto o Paperclip responde (até 3 chamadas de 5 segundos). Para um usuário só, o pool de 10 conexões basta.
- Caso raro: se o Paperclip aplicar a decisão e a gravação da atividade falhar, a atividade é gravada depois pelo bot com `origem = "paperclip"`, e a origem real se perde. A trilha continua existindo.
- O bot envia cada pedido uma vez. Se o container cair entre a reserva e o envio, o pedido é mandado de novo depois de 1 minuto. Se cair logo depois do envio, a mensagem pode chegar duas vezes: é melhor que não chegar.
- O bot lê o mesmo `.env` do painel, inclusive o `BETTER_AUTH_SECRET` e a senha do banco, porque usa o banco e a mesma imagem.
- O container do bot gasta até 256 MB de RAM.
- **Gatilho para rever:** o Paperclip passar a oferecer chaves de board com escopo menor (por exemplo, só aprovações); ou o painel ganhar outro processo de fundo, que poderia rodar junto com o bot.
