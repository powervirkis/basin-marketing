import os
import json
import urllib.parse
import urllib.request
import urllib.error
import http.server
import socketserver

PORT         = int(os.environ.get("PORT", 8080))
DIR          = os.path.dirname(os.path.abspath(__file__))
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_LIST_ID = os.environ.get("BREVO_LIST_ID", "")   # numeric string; optional


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, fmt, *args):
        pass

    # ── Clean-URL routing (e.g. /ugs -> /ugs/index.html, no redirect) ───────
    # Keeps canonical/nav links pointing at the extension-less path (/ugs)
    # returning a direct 200 instead of relying on the default 301
    # directory-slash redirect that http.server would otherwise issue.
    CLEAN_ROUTES = {
        "/ugs": "/ugs/index.html",
    }

    def _rewrite_clean_path(self):
        parsed = urllib.parse.urlsplit(self.path)
        target = self.CLEAN_ROUTES.get(parsed.path)
        if target:
            self.path = urllib.parse.urlunsplit(("", "", target, parsed.query, parsed.fragment))

    def do_GET(self):
        self._rewrite_clean_path()
        super().do_GET()

    def do_HEAD(self):
        self._rewrite_clean_path()
        super().do_HEAD()

    # ── POST /subscribe ─────────────────────────────────────────────────────
    def do_POST(self):
        if self.path != "/subscribe":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            data    = json.loads(self.rfile.read(length))
            email   = data.get("email", "").strip()
            name    = data.get("name", "").strip()
            company = data.get("company", "").strip()
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"ok": False, "error": "Invalid JSON"})
            return

        if not email:
            self._json(400, {"ok": False, "error": "Email is required"})
            return

        if not BREVO_API_KEY:
            self._json(500, {"ok": False, "error": "Server not configured"})
            return

        # Build Brevo contact payload
        payload = {
            "email": email,
            "updateEnabled": True,
            "attributes": {},
        }
        if name:
            payload["attributes"]["FIRSTNAME"] = name.split()[0]
            if len(name.split()) > 1:
                payload["attributes"]["LASTNAME"] = " ".join(name.split()[1:])
        if company:
            payload["attributes"]["COMPANY"] = company
        if BREVO_LIST_ID:
            payload["listIds"] = [int(BREVO_LIST_ID)]

        req = urllib.request.Request(
            "https://api.brevo.com/v3/contacts",
            data=json.dumps(payload).encode(),
            headers={
                "Content-Type": "application/json",
                "api-key": BREVO_API_KEY,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req) as resp:
                # 201 Created or 204 No Content on duplicate (updateEnabled)
                _ = resp.read()
            self._json(200, {"ok": True})
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            self._json(502, {"ok": False, "error": body})
        except urllib.error.URLError as e:
            self._json(502, {"ok": False, "error": str(e.reason)})

    # ── helpers ─────────────────────────────────────────────────────────────
    def _json(self, code: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Serving on :{PORT}", flush=True)
    httpd.serve_forever()
