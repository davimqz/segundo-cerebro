# 0007. Hermes em container próprio, sem terminal, ligado ao Paperclip pelo `hermes_gateway`

- Status: Aceito
- Data: 2026-11-04
- Decidido por: Davi

## Contexto
O Hermes Agent (MIT) é o único agente permanente (spec 005). O TRD previa o terminal do Hermes em `terminal.backend docker`, e o Paperclip oferece dois adaptadores: o `hermes_local`, que roda a CLI do Hermes dentro do container do Paperclip, e o `hermes_gateway`, que chama um Hermes já no ar pela API dele (`/v1/runs`). A imagem do Paperclip foi montada sem CLIs de propósito (ADR 0006). Dar ao Hermes acesso ao Docker para um terminal em sandbox exige montar o socket do Docker, o que equivale a dar root no servidor. Na imagem oficial (`v0.22.7`), os presets `hermes-telegram` e `hermes-api-server` vêm com terminal, arquivos, navegador e execução de código ligados.

## Decisão
- O Hermes roda em **container próprio**, a partir da imagem oficial `nousresearch/hermes-agent` **presa pelo digest** (`HERMES_IMAGEM`), só na rede `asttra`, **sem portas publicadas e sem o socket do Docker**. A imagem sobe como root só para preparar a pasta de dados e roda o Hermes como o usuário `hermes` (UID 10000), pelo s6-overlay.
- O Paperclip chama o Hermes pelo **`hermes_gateway`**, na porta **8642** (a API do Hermes, protegida por `API_SERVER_KEY`). O painel do Hermes (porta 9119) fica desligado. Como o `hermes_gateway` só aceita HTTP sem TLS no loopback, o agente usa `dangerouslyAllowInsecureRemoteHttp: true`: o tráfego não sai da rede interna `asttra`.
- **Sem terminal:** as ferramentas `terminal`, `code_execution`, `browser`, `computer_use`, `file`, `delegation`, `cronjob` e `image_gen` ficam fora, em duas camadas no `config.yaml`: a lista explícita de cada plataforma (`platform_toolsets` de `telegram` e `api_server`) e a lista global `agent.disabled_toolsets`.
- O Hermes fala com o Paperclip por um **MCP próprio e mínimo** (`infra/hermes/mcp-paperclip/`), com 3 ferramentas (listar departamentos, criar tarefa e ver tarefa) e a **chave de agente do Hermes**. O MCP oficial do Paperclip não é usado.

## Alternativas consideradas
- **`hermes_local`:** exige o Hermes e suas dependências dentro da imagem do Paperclip, desfazendo o ADR 0006, e mistura os dois processos no mesmo container.
- **`terminal.backend docker` (o TRD):** dá ao Hermes o socket do Docker, que vale root no servidor. Fica para depois, com ADR próprio, quando uma tarefa precisar (ideia "Terminal em sandbox" no Build Plan).
- **MCP oficial do Paperclip (`/mcp/paperclip`):** gratuito, mas experimental e desligado de fábrica. Entra com o login OAuth do Davi, aprovado no navegador, e dá ao Hermes os poderes do Davi (37 ferramentas, inclusive aprovações pendentes e chamadas livres à API). O acesso expira depois de 30 dias sem uso.
- **Painel do Hermes (9119) como endereço do gateway:** abre mais uma porta sem necessidade.
- **HTTPS interno entre Paperclip e Hermes:** exige certificados internos sem ganho real, porque os dois estão na mesma rede Docker do mesmo servidor.

## Consequências
- O Hermes não roda comandos, não lê nem escreve arquivos e não navega. Responde, pesquisa na web, guarda memória e cria tarefas pelo MCP. Pedidos de comando recebem um "não tenho essa ferramenta".
- A chave de agente só age como o Hermes. Ela não aprova nada: o poder de aprovar fica no painel (item 6b).
- Temos um MCP pequeno para manter. Se o Paperclip mudar a API de tarefas, o `scripts/teste-hermes.sh` acusa.
- A imagem oficial tem cerca de 1,1 GB. Trocar de versão é manual (novo digest no `.env`) e exige conferir de novo os presets de ferramentas, porque o Hermes pode ligar ferramentas novas por padrão. A lista global `agent.disabled_toolsets` reduz esse risco, mas só para nomes já conhecidos.
- O Hermes carrega `/opt/data/.env` por cima das variáveis do container. O `configurar.sh` cria esse arquivo vazio para a imagem não copiar o exemplo dela, e os segredos ficam só em `/opt/asttra/hermes/.env`.
- **Gatilho para rever:** alguma tarefa precisar de terminal ou de arquivos; o Paperclip lançar um MCP que aceite chave de agente; o `hermes_gateway` passar a exigir HTTPS sem exceção.
