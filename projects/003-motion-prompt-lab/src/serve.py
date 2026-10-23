"""Local static preview with byte ranges so the video timeline can seek."""
import argparse, re, os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT=Path(__file__).resolve().parents[1]/"web"
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        self.byte_range=None
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def send_head(self):
        self.byte_range=None
        path=self.translate_path(self.path)
        if os.path.isdir(path):
            path=os.path.join(path,"index.html")
        try:
            file=open(path,"rb")
        except OSError:
            self.send_error(404,"File not found");return None
        size=os.fstat(file.fileno()).st_size
        header=self.headers.get("Range")
        start,end=0,size-1
        if header:
            match=re.fullmatch(r"bytes=(\d*)-(\d*)",header)
            try:
                if not match or not any(match.groups()):raise ValueError()
                a,b=match.groups()
                if a:start=int(a);end=min(int(b),size-1) if b else size-1
                else:start=max(0,size-int(b))
                if start>end or start>=size:raise ValueError()
            except ValueError:
                file.close();self.send_response(416);self.send_header("Content-Range",f"bytes */{size}");self.send_header("Content-Length","0");self.end_headers();return None
            self.byte_range=(start,end)
            file.seek(start)
        self.send_response(206 if header else 200)
        self.send_header("Content-Type",self.guess_type(path))
        self.send_header("Accept-Ranges","bytes")
        self.send_header("Content-Length",str(end-start+1))
        self.send_header("Cache-Control","no-cache")
        if header:self.send_header("Content-Range",f"bytes {start}-{end}/{size}")
        self.end_headers()
        return file
    def copyfile(self,source,outputfile):
        remaining=self.byte_range[1]-self.byte_range[0]+1 if self.byte_range else None
        try:
            while remaining is None or remaining>0:
                buf=source.read(min(65536,remaining) if remaining is not None else 65536)
                if not buf:break
                outputfile.write(buf)
                if remaining is not None:remaining-=len(buf)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            pass

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--port",type=int,default=8033);args=p.parse_args()
    print(f"Motion Prompt Lab: http://127.0.0.1:{args.port}/",flush=True)
    ThreadingHTTPServer(("127.0.0.1",args.port),Handler).serve_forever()
