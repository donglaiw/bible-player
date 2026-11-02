#!/usr/bin/env python3
"""Private, dependency-free audio Bible player. Python 3.9+."""
import argparse
import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
BOOKS = json.loads((ROOT / "books.json").read_text())


def library(folder):
    result = {book: {} for book, _ in BOOKS}
    warnings = []
    for book, maximum in BOOKS:
        directory = folder / book
        if not directory.exists():
            continue
        for path in sorted(directory.iterdir()):
            if not path.is_file() or path.suffix.lower() not in {'.mp3', '.m4a', '.wav'}:
                continue
            # Accept 001.mp3 or Psalm 001.mp3, never guess from multiple numbers.
            names = re.escape(book)
            if book == "Psalms":
                names = "Psalms?"
            if book == "Proverbs":
                names = "Proverbs?"
            match = re.fullmatch(r"(?:(?:" + names + r")\s*[-_ ]*)?0*(\d+)", path.stem, re.I)
            if not match or not 1 <= int(match[1]) <= maximum:
                warnings.append(f"Unrecognized filename: {book}/{path.name}")
                continue
            chapter = str(int(match[1]))
            if chapter in result[book]:
                warnings.append(f"Duplicate chapter: {book} {chapter}")
                result[book][chapter] = None
            else:
                result[book][chapter] = f"/audio/{book}/{path.name}"
    return {"books": result, "warnings": warnings}


def handler_for(audio_dir):
    class Handler(BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.respond(False)

        def do_GET(self):
            self.respond(True)

        def respond(self, body):
            route = unquote(urlsplit(self.path).path)
            if route == "/api/library":
                payload = json.dumps(library(audio_dir)).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                if body:
                    self.wfile.write(payload)
                return
            if route.startswith("/audio/"):
                base, relative = audio_dir.resolve(), route[len("/audio/"):]
            else:
                base, relative = (ROOT / "web").resolve(), route.lstrip("/") or "index.html"
            path = (base / relative).resolve()
            if base not in path.parents or not path.is_file():
                self.send_error(404)
                return
            size = path.stat().st_size
            start, end, status = 0, size - 1, 200
            requested = self.headers.get("Range")
            if requested:
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
                if not match or not any(match.groups()) or size == 0:
                    self.range_error(size)
                    return
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = min(int(last), size - 1) if last else size - 1
                else:
                    start = max(0, size - int(last))
                if start >= size or start > end:
                    self.range_error(size)
                    return
                status = 206
            length = max(0, end - start + 1)
            self.send_response(status)
            self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if body:
                try:
                    with path.open("rb") as source:
                        source.seek(start)
                        remaining = length
                        while remaining:
                            chunk = source.read(min(65536, remaining))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def range_error(self, size):
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
    return Handler


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-dir", type=Path, default=ROOT / "audio")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(args.audio_dir))
    print(f"Bible player: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
