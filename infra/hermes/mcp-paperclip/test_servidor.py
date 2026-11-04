"""Testes de unidade do MCP do Paperclip, contra um Paperclip falso (spec 005).

Rodar: python3 -m unittest discover -s infra/hermes/mcp-paperclip -v
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

CHAVE = "chave-de-teste"
EMPRESA = "emp-1"
PROJETOS = [
    {"id": "p1", "name": "Crescimento"},
    {"id": "p2", "name": "Administração"},
    {"id": "p3", "name": "Antigo", "archivedAt": "2026-01-01T00:00:00Z"},
]


class PaperclipFalso(BaseHTTPRequestHandler):
    criadas: list[dict] = []

    def log_message(self, *args):  # silencia o log do http.server
        pass

    def _responder(self, status: int, corpo=None):
        dados = json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _autorizado(self) -> bool:
        if self.headers.get("authorization") != f"Bearer {CHAVE}":
            self._responder(401, {"error": "unauthorized"})
            return False
        return True

    def do_GET(self):
        if not self._autorizado():
            return
        if self.path == "/api/agents/me":
            self._responder(200, {"id": "ag-1", "companyId": EMPRESA})
        elif self.path == f"/api/companies/{EMPRESA}/projects":
            self._responder(200, PROJETOS)
        elif self.path == "/api/issues/AST-1":
            self._responder(200, {"identifier": "AST-1", "title": "Proposta", "status": "backlog",
                                  "description": "Texto", "project": {"name": "Crescimento"}})
        else:
            self._responder(404, {"error": "not found"})

    def do_POST(self):
        if not self._autorizado():
            return
        tamanho = int(self.headers.get("content-length", 0))
        corpo = json.loads(self.rfile.read(tamanho))
        if self.path == f"/api/companies/{EMPRESA}/issues":
            PaperclipFalso.criadas.append(corpo)
            self._responder(201, {"id": "uuid-1", "identifier": f"AST-{len(PaperclipFalso.criadas)}",
                                  "title": corpo["title"]})
        else:
            self._responder(404, {"error": "not found"})


class TesteMcpPaperclip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), PaperclipFalso)
        cls.url = f"http://127.0.0.1:{cls.http.server_address[1]}"
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def setUp(self):
        PaperclipFalso.criadas = []
        self.pc = servidor.Paperclip(self.url, CHAVE, "https://agentes.exemplo.com.br/")

    def chamar(self, nome, argumentos=None, pc=None):
        return servidor.chamar_ferramenta(pc or self.pc, nome, argumentos or {})

    def test_lista_departamentos_sem_arquivados(self):
        texto, erro = self.chamar("listar_departamentos")
        self.assertFalse(erro)
        self.assertEqual(json.loads(texto), ["Crescimento", "Administração"])

    def test_cria_tarefa_no_projeto_certo_com_link(self):
        texto, erro = self.chamar("criar_tarefa", {"departamento": "crescimento", "titulo": " Proposta X ",
                                                   "descricao": "Preparar proposta"})
        self.assertFalse(erro, texto)
        self.assertEqual(PaperclipFalso.criadas, [{"title": "Proposta X", "description": "Preparar proposta",
                                                   "projectId": "p1", "parentId": None}])
        resultado = json.loads(texto)
        self.assertEqual(resultado["departamento"], "Crescimento")
        self.assertEqual(resultado["link"], "https://agentes.exemplo.com.br/issues/AST-1")

    def test_departamento_sem_acento_e_maiusculas(self):
        texto, erro = self.chamar("criar_tarefa", {"departamento": "ADMINISTRACAO", "titulo": "Nota",
                                                   "descricao": "Emitir nota"})
        self.assertFalse(erro, texto)
        self.assertEqual(PaperclipFalso.criadas[0]["projectId"], "p2")

    def test_departamento_inexistente_nao_cria(self):
        texto, erro = self.chamar("criar_tarefa", {"departamento": "Vendas", "titulo": "X", "descricao": "Y"})
        self.assertTrue(erro)
        self.assertIn("Crescimento, Administração", texto)
        self.assertIn("Nada foi criado", texto)
        self.assertEqual(PaperclipFalso.criadas, [])

    def test_departamento_arquivado_nao_aceito(self):
        _, erro = self.chamar("criar_tarefa", {"departamento": "Antigo", "titulo": "X", "descricao": "Y"})
        self.assertTrue(erro)
        self.assertEqual(PaperclipFalso.criadas, [])

    def test_titulo_vazio_nao_cria(self):
        _, erro = self.chamar("criar_tarefa", {"departamento": "Crescimento", "titulo": "  ", "descricao": "Y"})
        self.assertTrue(erro)
        self.assertEqual(PaperclipFalso.criadas, [])

    def test_ver_tarefa(self):
        texto, erro = self.chamar("ver_tarefa", {"id": "AST-1"})
        self.assertFalse(erro, texto)
        resultado = json.loads(texto)
        self.assertEqual((resultado["status"], resultado["departamento"]), ("backlog", "Crescimento"))

    def test_tarefa_inexistente(self):
        texto, erro = self.chamar("ver_tarefa", {"id": "AST-999"})
        self.assertTrue(erro)
        self.assertIn("404", texto)

    def test_identificador_que_sai_de_issues_e_recusado(self):
        for ident in ["../agents/me", "AST-1/../../agents/me", "", "a b"]:
            texto, erro = self.chamar("ver_tarefa", {"id": ident})
            self.assertTrue(erro, ident)
            self.assertIn("identificador", texto)

    def test_chave_recusada(self):
        pc = servidor.Paperclip(self.url, "chave-errada")
        texto, erro = self.chamar("criar_tarefa", {"departamento": "Crescimento", "titulo": "X", "descricao": "Y"},
                                  pc=pc)
        self.assertTrue(erro)
        self.assertIn("recusou a chave", texto)
        self.assertEqual(PaperclipFalso.criadas, [])

    def test_paperclip_fora_do_ar(self):
        pc = servidor.Paperclip("http://127.0.0.1:1", CHAVE)
        texto, erro = self.chamar("criar_tarefa", {"departamento": "Crescimento", "titulo": "X", "descricao": "Y"},
                                  pc=pc)
        self.assertTrue(erro)
        self.assertIn("não consegui falar com o Paperclip", texto)

    def test_url_sem_http_e_recusada(self):
        with self.assertRaises(servidor.ErroPaperclip):
            servidor.Paperclip("file:///etc/passwd", CHAVE)

    def test_sem_chave_configurada(self):
        with self.assertRaises(servidor.ErroPaperclip):
            servidor.Paperclip(self.url, "")

    def test_protocolo_por_stdio(self):
        mensagens = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
             "params": {"name": "listar_departamentos", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 4, "method": "recurso/inexistente"},
        ]
        entrada = "".join(json.dumps(m) + "\n" for m in mensagens)
        ambiente = {**os.environ, "PAPERCLIP_API_URL": self.url, "PAPERCLIP_API_KEY": CHAVE}
        saida = subprocess.run([sys.executable, servidor.__file__], input=entrada, capture_output=True,
                               text=True, env=ambiente, timeout=30, check=True, encoding="utf-8").stdout
        respostas = [json.loads(linha) for linha in saida.splitlines()]
        self.assertEqual([r["id"] for r in respostas], [1, 2, 3, 4])
        self.assertEqual(respostas[0]["result"]["protocolVersion"], "2025-06-18")
        self.assertEqual({f["name"] for f in respostas[1]["result"]["tools"]},
                         {"listar_departamentos", "criar_tarefa", "ver_tarefa"})
        self.assertFalse(respostas[2]["result"]["isError"])
        self.assertIn("Crescimento", respostas[2]["result"]["content"][0]["text"])
        self.assertEqual(respostas[3]["error"]["code"], -32601)

    def test_tools_call_sem_variaveis(self):
        resposta = servidor.tratar(
            {"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": "listar_departamentos"}},
            lambda: servidor.Paperclip("", ""),
        )
        self.assertTrue(resposta["result"]["isError"])


if __name__ == "__main__":
    unittest.main()
