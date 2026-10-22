"""Local-only static preview. No model runtime or third-party calls."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1] / 'web'
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8044)
    args=parser.parse_args()
    print(f'Digital Human Atlas: http://127.0.0.1:{args.port}/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
