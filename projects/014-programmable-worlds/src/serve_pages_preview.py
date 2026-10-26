from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import functools
site=Path(__file__).resolve().parents[3]/'_site'
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/1020_codex_project/'):
   self.path=self.path[len('/1020_codex_project'):]
  return super().do_GET()
 def do_HEAD(self):
  if self.path.startswith('/1020_codex_project/'):
   self.path=self.path[len('/1020_codex_project'):]
  return super().do_HEAD()
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8814),functools.partial(Handler,directory=str(site))).serve_forever()
