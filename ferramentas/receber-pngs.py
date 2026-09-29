#!/usr/bin/env python3
"""
Recebedor de imagens, usado só na hora de gerar os desenhos da planta
para o widget do Android.

O desenho da planta é um SVG montado em JavaScript, e não há
rasterizador instalado nesta máquina. A saída foi usar o próprio
navegador: ele desenha o SVG num canvas, exporta PNG e manda para cá.

Some assim que termina. Não faz parte do app.
"""
import base64, json, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

DESTINO = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pngs'
os.makedirs(DESTINO, exist_ok=True)


class Recebedor(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._liberar()
        self.end_headers()

    def do_POST(self):
        tamanho = int(self.headers.get('Content-Length', 0))
        pacote = json.loads(self.rfile.read(tamanho))
        for nome, b64 in pacote.items():
            caminho = os.path.join(DESTINO, nome + '.png')
            with open(caminho, 'wb') as f:
                f.write(base64.b64decode(b64))
            print('gravei', caminho, os.path.getsize(caminho), 'bytes', flush=True)
        self.send_response(200)
        self._liberar()
        self.end_headers()
        self.wfile.write(b'ok')

    def _liberar(self):
        # O navegador precisa de permissão para falar com outra porta.
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *a):
        pass


HTTPServer(('127.0.0.1', 8124), Recebedor).serve_forever()
