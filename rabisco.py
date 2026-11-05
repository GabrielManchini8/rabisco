"""Abre o Rabisco no navegador usando só o Python (sem Node.js)."""
import http.server, socketserver, threading, webbrowser, os, sys, socket

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
PORTA = 5173

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                      ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml"}
    def __init__(self, *a, **k): super().__init__(*a, directory=PASTA, **k)
    def log_message(self, *a): pass  # silencioso

def porta_livre(p):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", p)) != 0

if __name__ == "__main__":
    url = f"http://localhost:{PORTA}"
    if not porta_livre(PORTA):  # já está aberto em outra janela
        webbrowser.open(url); sys.exit(0)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORTA), Handler) as srv:
        print(f"Rabisco rodando em {url}\nDeixe esta janela aberta. Para fechar: Ctrl+C ou feche a janela.")
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        try: srv.serve_forever()
        except KeyboardInterrupt: pass
