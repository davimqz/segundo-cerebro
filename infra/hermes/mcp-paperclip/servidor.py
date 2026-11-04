#!/usr/bin/env python3
"""MCP mínimo do Paperclip para o Hermes (spec 005, ADR 0007).

Um MCP é uma "tomada" que dá ferramentas a um agente. Este dá só três:
  - listar_departamentos: os projetos da empresa no Paperclip (um por departamento);
  - criar_tarefa(departamento, titulo, descricao): cria a tarefa no projeto do departamento;
  - ver_tarefa(id): mostra uma tarefa (por exemplo, AST-12).

Fala MCP por stdio (JSON-RPC 2.0, uma mensagem por linha) e usa a API REST do Paperclip com a
chave de agente do Hermes, que só age como o Hermes e não aprova nada. Só biblioteca padrão do
Python, para não depender das versões de pacotes dentro da imagem do Hermes.

Variáveis de ambiente:
  PAPERCLIP_API_URL     endereço da API visto do container (ex.: http://paperclip:3100)
  PAPERCLIP_API_KEY     chave de agente do Hermes (gravada pelo configurar.sh)
  PAPERCLIP_URL_PUBLICA endereço público, para o link da tarefa (ex.: https://agentes.exemplo.com.br)
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

NOME = "paperclip"
VERSAO = "1.0.0"
PROTOCOLO_PADRAO = "2025-06-18"
TEMPO_LIMITE = 20
# Identificador de tarefa (AST-12) ou UUID: só letras, números, hífen e sublinhado.
IDENTIFICADOR = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

FERRAMENTAS = [
    {
        "name": "listar_departamentos",
        "description": "Lista os departamentos da empresa (projetos do Paperclip). "
        "Use antes de criar uma tarefa, se não souber o nome exato.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "criar_tarefa",
        "description": "Cria uma tarefa no Paperclip, no projeto do departamento indicado. "
        "Só use depois que o Davi confirmar com 'sim' o departamento, o título e a descrição.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "departamento": {"type": "string", "description": "Nome do departamento, como em listar_departamentos."},
                "titulo": {"type": "string", "description": "Título curto da tarefa."},
                "descricao": {"type": "string", "description": "Descrição da tarefa."},
            },
            "required": ["departamento", "titulo", "descricao"],
            "additionalProperties": False,
        },
    },
    {
        "name": "ver_tarefa",
        "description": "Mostra uma tarefa do Paperclip pelo identificador (por exemplo, AST-12).",
        "inputSchema": {
            "type": "object",
            "properties": {"id": {"type": "string", "description": "Identificador da tarefa, como AST-12."}},
            "required": ["id"],
            "additionalProperties": False,
        },
    },
]


class ErroPaperclip(Exception):
    """Falha ao falar com o Paperclip, com uma mensagem pronta para o Davi."""


def _normalizar(texto: str) -> str:
    """Compara nomes sem diferenciar maiúsculas nem acentos ("administracao" = "Administração")."""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


class Paperclip:
    def __init__(self, url: str, chave: str, url_publica: str = ""):
        if not url or not chave:
            raise ErroPaperclip("PAPERCLIP_API_URL ou PAPERCLIP_API_KEY não definida no .env do Hermes.")
        # Só http(s): o endereço vem do .env, nunca do modelo, e assim um valor errado não vira
        # leitura de arquivo local (file://).
        if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
            raise ErroPaperclip("PAPERCLIP_API_URL precisa começar com http:// ou https://.")
        self.url = url.rstrip("/")
        self.chave = chave
        self.url_publica = (url_publica or url).rstrip("/")
        self._empresa_id: str | None = None

    def _api(self, metodo: str, caminho: str, corpo: dict | None = None):
        dados = json.dumps(corpo).encode() if corpo is not None else None
        pedido = urllib.request.Request(
            f"{self.url}/api{caminho}",
            data=dados,
            method=metodo,
            headers={
                "authorization": f"Bearer {self.chave}",
                "accept": "application/json",
                **({"content-type": "application/json"} if dados is not None else {}),
            },
        )
        try:
            # O esquema foi conferido no __init__ (só http/https) e o caminho é montado aqui, com os
            # trechos variáveis codificados por quote(safe="").
            with urllib.request.urlopen(pedido, timeout=TEMPO_LIMITE) as resposta:  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
                return json.loads(resposta.read() or b"null")
        except urllib.error.HTTPError as erro:
            erro.close()
            if erro.code in (401, 403):
                raise ErroPaperclip(f"o Paperclip recusou a chave do Hermes (HTTP {erro.code}).") from None
            if erro.code == 404:
                raise ErroPaperclip("o Paperclip não encontrou o que foi pedido (HTTP 404).") from None
            raise ErroPaperclip(f"o Paperclip respondeu com erro (HTTP {erro.code}).") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ErroPaperclip("não consegui falar com o Paperclip (fora do ar ou sem rede).") from None

    def empresa_id(self) -> str:
        if self._empresa_id is None:
            eu = self._api("GET", "/agents/me") or {}
            empresa = eu.get("companyId")
            if not empresa:
                raise ErroPaperclip("a chave do Hermes não está ligada a nenhuma empresa no Paperclip.")
            self._empresa_id = empresa
        return self._empresa_id

    def departamentos(self) -> list[dict]:
        projetos = self._api("GET", f"/companies/{urllib.parse.quote(self.empresa_id(), safe='')}/projects") or []
        return [p for p in projetos if p.get("name") and not p.get("archivedAt")]

    def link(self, identificador: str) -> str:
        return f"{self.url_publica}/issues/{urllib.parse.quote(identificador, safe='')}"

    def criar_tarefa(self, departamento: str, titulo: str, descricao: str) -> dict:
        titulo, descricao = titulo.strip(), descricao.strip()
        if not titulo:
            raise ErroPaperclip("a tarefa precisa de um título.")
        projetos = self.departamentos()
        alvo = _normalizar(departamento)
        projeto = next((p for p in projetos if _normalizar(p["name"]) == alvo), None)
        if projeto is None:
            nomes = ", ".join(p["name"] for p in projetos) or "nenhum"
            raise ErroPaperclip(f"o departamento '{departamento}' não existe. Os departamentos são: {nomes}.")
        tarefa = self._api(
            "POST",
            f"/companies/{urllib.parse.quote(self.empresa_id(), safe='')}/issues",
            {"title": titulo, "description": descricao, "projectId": projeto["id"], "parentId": None},
        ) or {}
        identificador = tarefa.get("identifier") or tarefa.get("id")
        if not identificador:
            raise ErroPaperclip("o Paperclip não devolveu o identificador da tarefa; confira no painel do Paperclip.")
        return {
            "id": identificador,
            "titulo": tarefa.get("title", titulo),
            "departamento": projeto["name"],
            "link": self.link(identificador),
        }

    def ver_tarefa(self, identificador: str) -> dict:
        identificador = identificador.strip()
        if not IDENTIFICADOR.fullmatch(identificador):
            raise ErroPaperclip("informe o identificador da tarefa, como AST-12.")
        tarefa = self._api("GET", f"/issues/{urllib.parse.quote(identificador, safe='')}") or {}
        ident = tarefa.get("identifier") or tarefa.get("id") or identificador
        projeto = tarefa.get("project") or {}
        return {
            "id": ident,
            "titulo": tarefa.get("title"),
            "status": tarefa.get("status"),
            "departamento": projeto.get("name") if isinstance(projeto, dict) else None,
            "descricao": tarefa.get("description"),
            "link": self.link(ident),
        }


def chamar_ferramenta(paperclip: Paperclip, nome: str, argumentos: dict) -> tuple[str, bool]:
    """Executa a ferramenta. Devolve (texto, deu_erro)."""
    try:
        if nome == "listar_departamentos":
            resultado: object = [p["name"] for p in paperclip.departamentos()]
        elif nome == "criar_tarefa":
            resultado = paperclip.criar_tarefa(
                str(argumentos.get("departamento", "")),
                str(argumentos.get("titulo", "")),
                str(argumentos.get("descricao", "")),
            )
        elif nome == "ver_tarefa":
            resultado = paperclip.ver_tarefa(str(argumentos.get("id", "")))
        else:
            return f"Ferramenta desconhecida: {nome}", True
    except ErroPaperclip as erro:
        return f"Não deu certo: {erro} Nada foi criado nem alterado.", True
    return json.dumps(resultado, ensure_ascii=False), False


def tratar(mensagem: dict, obter_paperclip) -> dict | None:
    """Responde a uma mensagem JSON-RPC. Notificações (sem id) não têm resposta."""
    metodo = mensagem.get("method")
    ident = mensagem.get("id")
    parametros = mensagem.get("params") or {}
    if ident is None:
        return None

    def ok(resultado):
        return {"jsonrpc": "2.0", "id": ident, "result": resultado}

    if metodo == "initialize":
        return ok({
            "protocolVersion": parametros.get("protocolVersion") or PROTOCOLO_PADRAO,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": NOME, "version": VERSAO},
        })
    if metodo == "ping":
        return ok({})
    if metodo == "tools/list":
        return ok({"tools": FERRAMENTAS})
    if metodo == "tools/call":
        try:
            paperclip = obter_paperclip()
        except ErroPaperclip as erro:
            texto, erro_ = f"Não deu certo: {erro} Nada foi criado nem alterado.", True
        else:
            texto, erro_ = chamar_ferramenta(paperclip, parametros.get("name", ""), parametros.get("arguments") or {})
        return ok({"content": [{"type": "text", "text": texto}], "isError": erro_})
    return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": f"Método não suportado: {metodo}"}}


def main() -> None:
    cache: list[Paperclip] = []

    def obter_paperclip() -> Paperclip:
        if not cache:
            cache.append(Paperclip(
                os.environ.get("PAPERCLIP_API_URL", ""),
                os.environ.get("PAPERCLIP_API_KEY", ""),
                os.environ.get("PAPERCLIP_URL_PUBLICA", ""),
            ))
        return cache[0]

    for linha in sys.stdin:
        linha = linha.strip()
        if not linha:
            continue
        try:
            mensagem = json.loads(linha)
        except json.JSONDecodeError:
            resposta = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "JSON inválido"}}
        else:
            resposta = tratar(mensagem, obter_paperclip) if isinstance(mensagem, dict) else None
        if resposta is not None:
            sys.stdout.write(json.dumps(resposta, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
