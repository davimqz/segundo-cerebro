# 003. Temas, parte do MVP

- Risco: R1
- Origem: Build Plan, Etapa 1, item 4; App Flow, "Aparência: editar e carregar temas" (passos 1, 2 e 5); Design Brief, "Temas editáveis no painel"
- Status: Rascunho

## Objetivo
Em Configurações › Aparência, Davi vê os temas instalados, carrega um design system no formato `tokens.json` do Selecta e escolhe qual tema fica ativo. É isso que permite trocar a identidade do painel (inclusive para um cliente) sem mexer no código. O núcleo já tem a tabela `temas`, a validação (`core/temas/schema.ts`), a geração do CSS (`core/temas/css.ts`) e a leitura do tema ativo (`core/temas/servico.ts`). Falta a parte de carregar e trocar pela tela.

**Risco R1:** a funcionalidade fica dentro do painel, atrás do login, sem migração de banco e sem integração externa. O ponto sensível é que o arquivo enviado vira CSS em todas as telas. Por isso a validação que já existe ganha testes de injeção e passa a recusar `url(`, `@` e `expression(`.

## Critérios de aceite
**Ver**
- Quando Davi abre Configurações › Aparência, o sistema deve listar todos os temas instalados com nome e data de instalação, marcar qual é o ativo e qual é o padrão, e mostrar o botão "Ativar" em cada tema que não estiver ativo.

**Carregar**
- Quando Davi envia um `tokens.json` válido com um nome novo, o sistema deve gravar o tema na tabela `temas` como inativo (não ativa sozinho), mostrar "Tema instalado" e gravar `tema_instalado` em `atividades`, com o nome do tema em `alvo`.
- Quando o arquivo não é JSON, passa de 256 KB ou falha na validação, o sistema não deve gravar nada e deve mostrar a lista de erros devolvida por `validarTema` (por exemplo, "Falta o token de cor obrigatório: border").
- Quando já existe um tema com o mesmo `name` (sem diferenciar maiúsculas e minúsculas, ignorando espaços nas pontas), o sistema deve recusar com "Já existe um tema com esse nome" e não gravar nada.
- Quando o arquivo válido não tem algum token opcional, o sistema deve instalar e avisar quais faltam e que eles vão usar a cor de texto secundário. São opcionais o `title-muted` e um `tag-<slug>` para cada departamento da tabela `departamentos`; os slugs vêm do banco, não do código.
- Quando um valor tenta fechar a regra CSS ou carregar algo de fora (`;`, `{`, `}`, `<`, `>`, `\`, `url(`, `@`, `expression(`), a validação deve recusar o arquivo.

**Ativar**
- Quando Davi clica em "Ativar" num tema, o sistema deve, numa única transação, desativar o anterior, ativar o escolhido e gravar `tema_ativado` em `atividades`, com o nome em `alvo` e o tema anterior em `detalhes`. As cores, as fontes e os cantos do painel devem mudar no próximo carregamento, sem rebuild.
- Quando o tema escolhido não existe mais ou está inválido no banco, o sistema não deve mudar o tema ativo e deve mostrar o erro.
- Quando qualquer ação de tema é chamada sem sessão, o sistema deve recusar. A própria ação confere a sessão; não confia na tela.

## Fora de escopo
- O editor com prévia, a checagem de contraste e a exportação (passos 3, 4 e 6 do App Flow). Ficam para a fase seguinte.
- Remover tema, baixar o `tokens.json` e um comando de recuperação no servidor. Davi optou por deixá-los fora deste item.
- Trocar o tema padrão. O Selecta continua sendo o padrão e o tema de reserva.
- Substituir ou renomear um tema já instalado.
- A rota `/api/v1` "consultar tema ativo". Ela entra com a API, no item 7.
- Índice único no nome do tema. Exigiria migração (R2); a checagem fica no código, dentro da transação, o que basta com um único usuário.

## Arquivos e interfaces
- `painel/src/core/temas/schema.ts`: endurecer `LIVRE` e `COR` (recusar `url(`, `@` e `expression(`). Nova `tokensOpcionaisFaltando(tema, slugs): string[]`.
- `painel/src/core/temas/servico.ts`: novas funções `listarTemas()`, `instalarTema(arquivo: string, usuario)` e `ativarTema(id, usuario)`. Elas devolvem `{ ok: true, avisos?: string[] } | { ok: false, erros: string[] }`. A validação, o nome repetido, a gravação e o registro em `atividades` acontecem todos dentro da transação (usa `registrar(…, tx)`).
- `painel/src/app/(painel)/configuracoes/temas-acoes.ts` (novo, `"use server"`): `carregarTema(formData)` e `ativarTemaAcao(formData)`. As duas chamam `exigirSessao()`, recusam arquivo acima de 256 KB antes de ler e chamam `revalidatePath("/", "layout")` quando dá certo.
- `painel/src/app/(painel)/configuracoes/temas.tsx` (novo, cliente): a lista de temas com o botão "Ativar" e o formulário de envio (`<input type="file" accept=".json,application/json">`), que mostra erros e avisos com `role="alert"`/`role="status"`.
- `painel/src/app/(painel)/configuracoes/page.tsx`: a seção Aparência passa a usar a lista e o formulário e perde o texto "chega na Etapa 1, item 4".
- `painel/e2e/fixtures/tema-teste.json` e `tema-invalido.json` (novos): um tema válido com cores bem diferentes do Selecta e um sem `border`.
- Sem migração: a tabela `temas` e os índices "só um ativo" e "só um padrão" já existem.

## Perguntas em aberto
- Nenhuma. Davi confirmou: carregar só instala; nome repetido é recusado; tokens opcionais faltando geram um aviso; remover, baixar e recuperação ficam fora.
- Risco registrado: se Davi ativar um tema ilegível (por exemplo, texto da mesma cor do fundo), voltar pela tela pode ficar difícil. Sem o comando de recuperação, a saída é um `UPDATE` manual no banco pelo túnel do DBeaver. Pode virar item em "Ideias" no Build Plan.

## Plano
1. **Validação:** endurecer as expressões do `schema.ts` e criar `tokensOpcionaisFaltando`. Testes de unidade antes, com os casos de injeção.
2. **Serviço:** `listarTemas`, `instalarTema` e `ativarTema` em `servico.ts`, com transação e `registrar(…, tx)`. Testes de integração.
3. **Ações:** `temas-acoes.ts`, com sessão, limite de tamanho e `revalidatePath`.
4. **Tela:** `temas.tsx` e a mudança em `page.tsx`, usando os componentes que já existem (`Button`, `Input`, `Label`) e só tokens semânticos.
5. **E2E e fixtures:** os dois arquivos de teste e o caso de ponta a ponta.
6. **Docs:** marcar o item 4 no Build Plan e atualizar o "Próximo passo" no `CLAUDE.md` depois do teste "Pronto quando" no servidor.

**Testes previstos:**
- Unidade (`schema.test.ts`, `css.test.ts`): recusa de `url(`, `@import`, `expression(`, `}`, `</style>` e `\` em cores, fontes e sombras; aceite do `selecta.json`; `tokensOpcionaisFaltando` com e sem tags, usando slugs passados no teste.
- Integração (`banco.int.test.ts` ou novo `temas.int.test.ts`, com PostgreSQL descartável): instalar grava um tema inativo e uma linha `tema_instalado`; nome repetido (com outra caixa e espaços) é recusado sem gravar nada; arquivo inválido não grava nada; ativar troca o ativo numa só transação e grava `tema_ativado`; ativar um id inexistente não muda nada; `temaAtivo()` devolve o tema novo depois de ativar.
- E2E (`painel.spec.ts`): carregar `tema-invalido.json` mostra "Falta o token de cor obrigatório: border"; carregar `tema-teste.json` mostra "Tema instalado" e o tema aparece na lista como inativo; "Ativar" muda a cor de fundo do `<body>` (lida com `getComputedStyle`), e ela continua depois de recarregar; Atividades lista `tema_instalado` e `tema_ativado`; no fim, o teste reativa o Selecta.

**Comandos de verificação:**
- `scripts/check.sh` (lint, tipos, formatação, unidade e integração com docker)
- `scripts/teste-e2e.sh`

## Verificação de ponta a ponta
No painel em produção (`painel.asttralabs.com.br`), depois de implantar:
1. Em Configurações › Aparência, a lista mostra "Selecta", marcado como ativo e padrão.
2. Carregar uma cópia do `selecta.json` com outro `name` e `surface` claro trocado (por exemplo, `#fff7e6`): aparece "Tema instalado", e o tema entra na lista como inativo.
3. Clicar em "Ativar": o fundo do painel muda para a cor nova, em todas as telas e depois de recarregar.
4. Atividades mostra `tema_instalado` e `tema_ativado`.
5. Clicar em "Ativar" no Selecta: o painel volta ao visual original.

Isso cumpre o "Pronto quando" do Build Plan: um `tokens.json` carregado muda as cores do painel.
