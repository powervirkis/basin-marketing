import os
import http.server
import socketserver

PORT = int(os.environ.get("PORT", 8080))
DIR  = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, fmt, *args):  # silence access logs on Heroku
        pass

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Serving on :{PORT}", flush=True)
    httpd.serve_forever()
