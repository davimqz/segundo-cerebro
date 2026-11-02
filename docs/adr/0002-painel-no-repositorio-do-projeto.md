# 0002. Painel no repositório do projeto, na pasta `painel/`

- Status: Aceito
- Data: 2026-11-02
- Decidido por: Davi

## Contexto
A Etapa 1, item 1, previa um repositório para o painel e outro para a base de conhecimento. O painel é uma ferramenta interna da Asttra. A replicação para clientes vai partir do playbook, montando uma cópia nova para cada um, e não da cópia direta deste repositório.

## Decisão
- O código do painel fica neste repositório (`segundo-cerebro`), na pasta `painel/`, ao lado dos docs.
- A base de conhecimento fica em repositório próprio e privado: `davimqz/asttra-conhecimento`.
- Nada específico da Asttra (nome, domínio, e-mails, departamentos) fica fixo no código: vem de `.env` ou do banco.

## Alternativas consideradas
- Repositório próprio para o painel (`asttra-painel`): isola o produto, mas separa docs e código, duplica CI, Gitleaks e Dependabot, e deixa o agente com metade do contexto.

## Consequências
- Docs, specs e código mudam no mesmo commit, e o revisor compara o PR com a spec no mesmo lugar.
- Se for preciso entregar só o código, a pasta `painel/` sai para outro repositório com o histórico (`git subtree split`).
- Os docs precisam deixar claro o que é do produto e o que é específico da Asttra.
