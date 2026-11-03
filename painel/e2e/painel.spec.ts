import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "";
const SENHA = process.env.E2E_SENHA ?? "";

test.describe.configure({ mode: "serial" });

async function entrar(page: Page, senha = SENHA) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("sem sessão, qualquer tela vai para /entrar", async ({ page }) => {
  await page.goto("/atividades");
  await expect(page).toHaveURL(/\/entrar\?voltar=%2Fatividades$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar$/);
});

test("senha errada mostra a mensagem genérica", async ({ page }) => {
  await entrar(page, `errada-${randomUUID()}`);
  await expect(page.locator("form").getByRole("alert")).toHaveText("E-mail ou senha incorretos");
  await expect(page).toHaveURL(/\/entrar$/);
});

test("login abre a Início, o menu tem as 9 telas e o modo escuro continua depois de recarregar", async ({ page }) => {
  await entrar(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Visão geral");

  const menu = page.getByRole("navigation", { name: "Menu principal" }).last();
  await expect(menu.getByRole("link")).toHaveText([
    "Início",
    "Aprovações",
    "Tarefas",
    "Departamentos",
    "CRM",
    "Conhecimento",
    "Assistente",
    "Atividades",
    "Configurações",
  ]);

  await menu.getByRole("link", { name: "CRM" }).click();
  await expect(page.getByText("Chega na Etapa 2, item 1.")).toBeVisible();

  const html = page.locator("html");
  const fundoClaro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole("button", { name: "Usar modo escuro" }).click();
  await expect(html).toHaveAttribute("data-modo", "escuro");
  const fundoEscuro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fundoEscuro).not.toBe(fundoClaro);

  await page.reload();
  await expect(html).toHaveAttribute("data-modo", "escuro");
  await expect(page.getByRole("button", { name: "Usar modo claro" })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(fundoEscuro);

  await page.getByRole("button", { name: "Usar modo claro" }).click();
  await expect(html).toHaveAttribute("data-modo", "claro");
});

test("o aviso criado pelo script aparece e some ao resolver", async ({ page }) => {
  const mensagem = `Aviso do teste ${Date.now()}`;
  execSync(`${process.env.E2E_AVISO} --tipo alerta --mensagem "${mensagem}"`, { stdio: "inherit" });

  await entrar(page);
  const aviso = page.getByTestId("aviso").filter({ hasText: mensagem });
  await expect(aviso).toBeVisible();

  await page.goto("/atividades");
  await expect(page.getByTestId("aviso").filter({ hasText: mensagem })).toBeVisible();
  await page.getByTestId("aviso").filter({ hasText: mensagem }).getByRole("button", { name: "Resolver" }).click();
  await expect(page.getByTestId("aviso").filter({ hasText: mensagem })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("atividade").filter({ hasText: "aviso_resolvido" }).first()).toBeVisible();
  await expect(page.getByTestId("atividade").filter({ hasText: "login" }).first()).toBeVisible();
});

test("carregar e ativar um tema muda o fundo do painel, e o Selecta volta no fim", async ({ page }) => {
  const fixture = (nome: string) => path.join(__dirname, "fixtures", nome);
  const fundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await entrar(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Visão geral");
  await page.goto("/configuracoes");
  const lista = page.getByRole("list", { name: "Temas instalados" });
  const item = (nome: string) => lista.getByRole("listitem").filter({ hasText: nome });
  await expect(item("Selecta")).toContainText("Ativo");
  await expect(item("Selecta")).toContainText("Padrão");
  const fundoSelecta = await fundo();

  const envio = page.getByLabel("Carregar tema (tokens.json)");
  await envio.setInputFiles(fixture("tema-invalido.json"));
  await page.getByRole("button", { name: "Carregar tema", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Falta o token de cor obrigatório: border");
  await expect(item("Tema Inválido E2E")).toHaveCount(0);

  await envio.setInputFiles(fixture("tema-teste.json"));
  await page.getByRole("button", { name: "Carregar tema", exact: true }).click();
  await expect(page.locator("form").getByRole("status").filter({ hasText: "Tema instalado" })).toBeVisible();
  await expect(item("Teste E2E")).toBeVisible();
  await expect(item("Teste E2E")).not.toContainText("Ativo");
  expect(await fundo()).toBe(fundoSelecta);

  await item("Teste E2E").getByRole("button", { name: "Ativar" }).click();
  await expect(item("Teste E2E")).toContainText("Ativo");
  await expect.poll(fundo).toBe("rgb(255, 247, 230)");
  await page.reload();
  expect(await fundo()).toBe("rgb(255, 247, 230)");
  await page.goto("/");
  expect(await fundo()).toBe("rgb(255, 247, 230)");

  await page.goto("/atividades");
  await expect(page.getByTestId("atividade").filter({ hasText: "tema_instalado" }).first()).toBeVisible();
  await expect(page.getByTestId("atividade").filter({ hasText: "tema_ativado" }).first()).toBeVisible();

  await page.goto("/configuracoes");
  await item("Selecta").getByRole("button", { name: "Ativar" }).click();
  await expect(item("Selecta")).toContainText("Ativo");
  await expect.poll(fundo).toBe(fundoSelecta);
});

test("Sair volta para /entrar e a sessão deixa de valer", async ({ page }) => {
  await entrar(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Visão geral");
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto("/atividades");
  await expect(page).toHaveURL(/\/entrar/);
});
