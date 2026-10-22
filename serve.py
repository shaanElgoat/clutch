"""Dev server for CLUTCH.

  python serve.py            -> serves dist/ on http://localhost:8933 (and your LAN IP, for phones)
  python serve.py src        -> serves the unbuilt src/ folder

POST /shot?name=x.png with a base64 PNG data URL saves it into the project (used for testing).
"""
import base64, http.server, os, pathlib, re, socket, sys

ROOT = pathlib.Path(__file__).parent
WEB = ROOT / (sys.argv[1] if len(sys.argv) > 1 else '.')
PORT = 8955


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(WEB), **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        m = re.match(r'^/shot\?name=([\w\-/]+\.png)$', self.path)
        if not m:
            self.send_response(400); self.end_headers(); return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        data = base64.b64decode(body.split(',', 1)[-1])
        out = ROOT / ('icons' if m.group(1).startswith('icon') else 'shots') / m.group(1)
        out.parent.mkdir(exist_ok=True)
        out.write_bytes(data)
        self.send_response(200); self.end_headers()

    def log_message(self, *a):
        pass


http.server.SimpleHTTPRequestHandler.extensions_map.update({'.webmanifest': 'application/manifest+json', '.js': 'application/javascript'})
try:
    lan = socket.gethostbyname(socket.gethostname())
except OSError:
    lan = '?'
print(f'CLUTCH on http://localhost:{PORT}  (same Wi-Fi phone: http://{lan}:{PORT})', flush=True)
http.server.ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
