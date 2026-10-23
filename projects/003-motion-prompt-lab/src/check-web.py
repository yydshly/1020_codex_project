"""Check published file references and HTTP byte ranges used by video seeking."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit, unquote
import json

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
class Links(HTMLParser):
    def __init__(self):
        super().__init__();self.links=[];self.ids=set()
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if "id" in attrs:self.ids.add(attrs["id"])
        self.links.extend(attrs[k] for k in ("href","src") if k in attrs)
p=Links();p.feed((WEB/"index.html").read_text(encoding="utf-8"))
count=0
for link in p.links:
    u=urlsplit(link)
    if u.scheme or u.netloc:continue
    if not u.path:
        if u.fragment:assert u.fragment in p.ids,link
    else:
        path=WEB/unquote(u.path)
        assert path.is_file(),link
        assert path.resolve().is_relative_to(WEB.resolve()),link
        count+=1
req=Request("http://127.0.0.1:8033/media/research-film.mp4",headers={"Range":"bytes=100-199"})
with urlopen(req) as r:
    assert r.status==206,r.status
    data=r.read()
    assert data==(WEB/"media/research-film.mp4").read_bytes()[100:200]
    assert r.headers["Content-Length"]=="100"
checks={
 "date":"2026-10-20",
 "static_file_references_checked":count,
 "internal_anchors":"All referenced HTML fragments exist.",
 "http_range":"bytes=100-199 returned HTTP 206, correct length and exact byte content.",
 "browser_checks":[
   "IAB desktop: first screen visually inspected.",
   "Prompt filter switched from all eleven modules to four adaptable modules and back.",
   "Video metadata duration20 / readyState4 / seekable0-20 observed.",
   "Scene3 button sought to8.4 seconds; native play then advanced to8.606137 with paused=false.",
   "Switching tabs paused video; frames and evidence panels visibly rendered.",
   "390px iframe responsive viewport: hero and experiment player visually inspected; no visible horizontal overflow.",
   "Keyboard slider and tab navigation checked in final browser pass."
 ],
 "limitations":[
   "390px iframe is responsive layout testing, not a physical phone or mobile-browser emulation.",
   "Audio waveform/loudness verified, not human listening quality.",
   "External links are attributed, not all navigated in browser."
 ]
}
(ROOT/"notes/web-verification.json").write_text(json.dumps(checks,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"PASS: {count} static references, internal anchors, video HTTP range.")
