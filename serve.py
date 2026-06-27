"""
Local dev server for the Gopang IT Solution site.

WHY THIS EXISTS:
The site uses clean URLs (e.g. /about, /services) that are mapped to the real
files (pages/about.html, ...) by vercel.json's "rewrites". On the live Vercel
site this works automatically. But VS Code Live Server / python -m http.server
are PLAIN static servers — they don't read vercel.json, so /about returns
"Cannot GET /about". This script mirrors the Vercel rewrites locally.

HOW TO RUN (from the project folder, in a terminal):
    python serve.py
then open  http://127.0.0.1:8077  in your browser.
Use this instead of Live Server while developing. Production (Vercel) is unaffected.
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8077


class RewriteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        rel = clean.lstrip("/")

        if clean in ("", "/"):
            return os.path.join(ROOT, "index.html")

        full = os.path.join(ROOT, rel)
        if os.path.isfile(full) or os.path.isdir(full):
            return super().translate_path(path)

        name = rel[:-1] if rel.endswith("/") else rel
        base = name[:-5] if name.endswith(".html") else name

        # mirror vercel.json: clean url -> pages/<name>.html or admin/<name>.html
        for candidate in (
            os.path.join(ROOT, "pages", base + ".html"),
            os.path.join(ROOT, "admin", base + ".html"),
            os.path.join(ROOT, base + ".html"),
        ):
            if os.path.isfile(candidate):
                return candidate

        return super().translate_path(path)

    def end_headers(self):
        # no-cache so edits show immediately during development
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(ROOT)
    print("Gopang dev server (mirrors vercel.json rewrites)")
    print(f"  -> http://127.0.0.1:{PORT}   (use this instead of Live Server)")
    print("  Press Ctrl+C to stop.")
    ThreadingHTTPServer(("127.0.0.1", PORT), RewriteHandler).serve_forever()
