# Regra base de aprovação

Fonte da regra escrita gravada na descrição da empresa no Paperclip (spec 004). O `configurar.sh`
lê o texto entre as linhas `<!-- regra -->` e `<!-- /regra -->`. Mude aqui e rode o script de novo.

<!-- regra -->
Tudo que sai da empresa, publica, gasta dinheiro, aceita termos ou apaga dados vira um pedido `request_board_approval` e espera a decisão do Davi. Ler, pesquisar, resumir, organizar, criar tarefas internas e preparar rascunhos não precisa de aprovação.
<!-- /regra -->

## Como a regra é aplicada

- **Trava de contratação:** `requireBoardApprovalForNewAgents` ligado na empresa. Contratar um agente gera um pedido `hire_agent`.
- **Orçamento mensal da empresa em 0:** no Paperclip, 0 quer dizer **sem limite**; ele não pausa nada (decisão do Davi em 2026-11-03). A proteção de custo é não configurar nenhuma chave de modelo pago e usar só modelos gratuitos do OpenRouter.
- **Regra escrita:** o texto acima, na descrição da empresa. Os agentes a leem; o Paperclip não a impõe sozinho.
