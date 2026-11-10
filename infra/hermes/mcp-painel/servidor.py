#!/usr/bin/env python3
"""MCP do painel para o Hermes (spec 007, ADR 0009).

Dá ao Hermes três ferramentas, todas só de leitura:
  - departamentos: os departamentos do painel, na ordem do menu;
  - ultimas_atividades(limite): as últimas ações registradas em Atividades;
  - avisos_abertos: os avisos ainda não resolvidos.

Fala MCP por stdio (JSON-RPC 2.0, uma mensagem por linha) e usa as rotas /api/v1 do painel com a
chave de agente do Hermes. Só biblioteca padrão do Python, como o mcp-paperclip.

Variáveis de ambiente:
  PAINEL_API_URL  endereço do painel visto do container (ex.: http://painel:3000)
  PAINEL_API_KEY  chave de agente do Hermes no painel (gravada pelo criar-chave-hermes.sh)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

NOME = "painel"
VERSAO = "1.0.0"
PROTOCOLO_PADRAO = "2025-06-18"
TEMPO_LIMITE = 15
LIMITE_PADRAO = 20
LIMITE_MAXIMO = 50

SEM_ENTRADA = {"type": "object", "properties": {}, "additionalProperties": False}

FERRAMENTAS = [
    {
        "name": "departamentos",
        "description": "Lista os departamentos do painel, com as áreas de cada um. Só leitura.",
        "inputSchema": SEM_ENTRADA,
    },
    {
        "name": "ultimas_atividades",
        "description": "Mostra as últimas ações registradas no painel (quem fez, o quê, quando e em qual "
        "departamento). Use para responder 'o que aconteceu hoje?'. Só leitura.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limite": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": LIMITE_MAXIMO,
                    "description": f"Quantas atividades trazer (padrão {LIMITE_PADRAO}, máximo {LIMITE_MAXIMO}).",
                }
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "avisos_abertos",
        "description": "Lista os avisos do painel ainda não resolvidos (alertas e erros). Só leitura.",
        "inputSchema": SEM_ENTRADA,
    },
]


class ErroPainel(Exception):
    """Falha ao falar com o painel, com uma mensagem pronta para o Davi."""


class Painel:
    def __init__(self, url: str, chave: str):
        if not url or not chave:
            raise ErroPainel(
                "o MCP do painel não está configurado (falta PAINEL_API_URL ou PAINEL_API_KEY no .env do Hermes)."
            )
        # Só http(s): o endereço vem do .env, nunca do modelo, e assim não vira leitura de arquivo local.
        if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
            raise ErroPainel("PAINEL_API_URL precisa começar com http:// ou https://.")
        self.url = url.rstrip("/")
        self.chave = chave

    def _get(self, caminho: str):
        pedido = urllib.request.Request(
            f"{self.url}/api/v1{caminho}",
            method="GET",
            headers={"authorization": f"Bearer {self.chave}", "accept": "application/json"},
        )
        try:
            # O esquema foi conferido no __init__ (só http/https) e o caminho é fixo, montado aqui.
            with urllib.request.urlopen(pedido, timeout=TEMPO_LIMITE) as resposta:  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
                return json.loads(resposta.read() or b"null")
        except urllib.error.HTTPError as erro:
            erro.close()
            if erro.code in (401, 403):
                raise ErroPainel(f"o painel recusou a chave do Hermes (HTTP {erro.code}).") from None
            if erro.code == 503:
                raise ErroPainel("o painel está sem acesso ao banco agora (HTTP 503).") from None
            raise ErroPainel(f"o painel respondeu com erro (HTTP {erro.code}).") from None
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            raise ErroPainel("não consegui falar com o painel (fora do ar ou sem rede).") from None

    def departamentos(self) -> list:
        return self._get("/departamentos") or []

    def ultimas_atividades(self, limite: int = LIMITE_PADRAO) -> list:
        return self._get(f"/atividades?limite={limite}") or []

    def avisos_abertos(self) -> list:
        return self._get("/avisos") or []


def _limite(valor) -> int:
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return LIMITE_PADRAO
    return max(1, min(LIMITE_MAXIMO, n))


def chamar_ferramenta(painel: Painel, nome: str, argumentos: dict) -> tuple[str, bool]:
    """Executa a ferramenta. Devolve (texto, deu_erro)."""
    try:
        if nome == "departamentos":
            resultado: object = painel.departamentos()
        elif nome == "ultimas_atividades":
            resultado = painel.ultimas_atividades(_limite(argumentos.get("limite", LIMITE_PADRAO)))
            if not resultado:
                return "Nenhuma atividade registrada no painel.", False
        elif nome == "avisos_abertos":
            resultado = painel.avisos_abertos()
            if not resultado:
                return "Nenhum aviso aberto no painel.", False
        else:
            return f"Ferramenta desconhecida: {nome}", True
    except ErroPainel as erro:
        return f"Não deu certo: {erro}", True
    return json.dumps(resultado, ensure_ascii=False), False


def tratar(mensagem: dict, obter_painel) -> dict | None:
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
            painel = obter_painel()
        except ErroPainel as erro:
            texto, erro_ = f"Não deu certo: {erro}", True
        else:
            texto, erro_ = chamar_ferramenta(painel, parametros.get("name", ""), parametros.get("arguments") or {})
        return ok({"content": [{"type": "text", "text": texto}], "isError": erro_})
    return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": f"Método não suportado: {metodo}"}}


def main() -> None:
    cache: list[Painel] = []

    def obter_painel() -> Painel:
        if not cache:
            cache.append(Painel(os.environ.get("PAINEL_API_URL", ""), os.environ.get("PAINEL_API_KEY", "")))
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
            resposta = tratar(mensagem, obter_painel) if isinstance(mensagem, dict) else None
        if resposta is not None:
            sys.stdout.write(json.dumps(resposta, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
