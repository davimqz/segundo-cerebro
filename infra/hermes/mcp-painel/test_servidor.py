"""Testes de unidade do MCP do painel, contra um painel falso (spec 007).

Rodar: python3 -m unittest discover -s infra/hermes/mcp-painel -v
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import servidor  # noqa: E402

CHAVE = "pnl_chave-de-teste"
DEPARTAMENTOS = [{"slug": "crescimento", "nome": "Crescimento", "areas": ["Comercial"]}]
ATIVIDADES = [
    {"quando": "2026-11-10T10:00:00Z", "autor": "hermes", "acao": "tarefa_criada", "alvo": "paperclip:AST-1",
     "departamento": "Crescimento"},
]


class PainelFalso(BaseHTTPRequestHandler):
    caminhos: list[str] = []
    avisos: list[dict] = []
    status_forcado: int | None = None

    def log_message(self, *args):  # silencia o log do http.server
        pass

    def _responder(self, status: int, corpo=None):
        dados = json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self):
        PainelFalso.caminhos.append(self.path)
        if PainelFalso.status_forcado:
            self._responder(PainelFalso.status_forcado, {"erro": "indisponivel"})
        elif self.headers.get("authorization") != f"Bearer {CHAVE}":
            self._responder(401, {"erro": "nao_autorizado"})
        elif self.path == "/api/v1/departamentos":
            self._responder(200, DEPARTAMENTOS)
        elif self.path.startswith("/api/v1/atividades"):
            self._responder(200, ATIVIDADES)
        elif self.path == "/api/v1/avisos":
            self._responder(200, PainelFalso.avisos)
        else:
            self._responder(404, {"erro": "nao_encontrado"})


class TesteMcpPainel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), PainelFalso)
        cls.url = f"http://127.0.0.1:{cls.http.server_address[1]}"
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def setUp(self):
        PainelFalso.caminhos = []
        PainelFalso.avisos = []
        PainelFalso.status_forcado = None
        self.painel = servidor.Painel(self.url + "/", CHAVE)

    def chamar(self, nome, argumentos=None, painel=None):
        return servidor.chamar_ferramenta(painel or self.painel, nome, argumentos or {})

    def test_tres_ferramentas_de_leitura(self):
        self.assertEqual([f["name"] for f in servidor.FERRAMENTAS],
                         ["departamentos", "ultimas_atividades", "avisos_abertos"])

    def test_departamentos(self):
        texto, erro = self.chamar("departamentos")
        self.assertFalse(erro, texto)
        self.assertEqual(json.loads(texto), DEPARTAMENTOS)

    def test_ultimas_atividades_com_limite(self):
        texto, erro = self.chamar("ultimas_atividades", {"limite": 5})
        self.assertFalse(erro, texto)
        self.assertEqual(json.loads(texto)[0]["acao"], "tarefa_criada")
        self.assertEqual(PainelFalso.caminhos, ["/api/v1/atividades?limite=5"])

    def test_limite_padrao_e_maximo(self):
        self.chamar("ultimas_atividades")
        self.chamar("ultimas_atividades", {"limite": 999})
        self.chamar("ultimas_atividades", {"limite": "x"})
        self.assertEqual(PainelFalso.caminhos, ["/api/v1/atividades?limite=20", "/api/v1/atividades?limite=50",
                                                "/api/v1/atividades?limite=20"])

    def test_avisos_abertos(self):
        PainelFalso.avisos = [{"tipo": "alerta", "mensagem": "Limite da IA", "origem": "x",
                               "criado_em": "2026-11-10T10:00:00Z"}]
        texto, erro = self.chamar("avisos_abertos")
        self.assertFalse(erro, texto)
        self.assertIn("Limite da IA", texto)

    def test_nenhum_aviso(self):
        texto, erro = self.chamar("avisos_abertos")
        self.assertFalse(erro)
        self.assertEqual(texto, "Nenhum aviso aberto no painel.")

    def test_chave_recusada(self):
        texto, erro = self.chamar("avisos_abertos", painel=servidor.Painel(self.url, "pnl_errada"))
        self.assertTrue(erro)
        self.assertIn("recusou a chave", texto)

    def test_painel_sem_banco(self):
        PainelFalso.status_forcado = 503
        texto, erro = self.chamar("departamentos")
        self.assertTrue(erro)
        self.assertIn("503", texto)

    def test_painel_fora_do_ar(self):
        texto, erro = self.chamar("departamentos", painel=servidor.Painel("http://127.0.0.1:1", CHAVE))
        self.assertTrue(erro)
        self.assertIn("não consegui falar com o painel", texto)

    def test_url_sem_http_e_recusada(self):
        with self.assertRaises(servidor.ErroPainel):
            servidor.Painel("file:///etc/passwd", CHAVE)

    def test_sem_configuracao(self):
        for url, chave in [("", CHAVE), (self.url, "")]:
            resposta = servidor.tratar(
                {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "avisos_abertos"}},
                lambda: servidor.Painel(url, chave),
            )
            self.assertTrue(resposta["result"]["isError"])
            self.assertIn("não está configurado", resposta["result"]["content"][0]["text"])

    def test_protocolo_por_stdio(self):
        mensagens = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "departamentos", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 4, "method": "recurso/inexistente"},
        ]
        entrada = "".join(json.dumps(m) + "\n" for m in mensagens)
        ambiente = {**os.environ, "PAINEL_API_URL": self.url, "PAINEL_API_KEY": CHAVE}
        saida = subprocess.run([sys.executable, servidor.__file__], input=entrada, capture_output=True,
                               text=True, env=ambiente, timeout=30, check=True, encoding="utf-8").stdout
        respostas = [json.loads(linha) for linha in saida.splitlines()]
        self.assertEqual([r["id"] for r in respostas], [1, 2, 3, 4])
        self.assertEqual(respostas[0]["result"]["serverInfo"]["name"], "painel")
        self.assertEqual(len(respostas[1]["result"]["tools"]), 3)
        self.assertFalse(respostas[2]["result"]["isError"])
        self.assertIn("Crescimento", respostas[2]["result"]["content"][0]["text"])
        self.assertEqual(respostas[3]["error"]["code"], -32601)


if __name__ == "__main__":
    unittest.main()
