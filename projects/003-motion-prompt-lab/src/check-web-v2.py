"""V2 artifact/link/range checks. Browser checks are recorded separately after real interaction."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlsplit,unquote
import json
ROOT=Path(__file__).resolve().parents[1];WEB=ROOT/"web"
class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=set()
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids,("duplicate id",attrs["id"])
            self.ids.add(attrs["id"])
        self.links.extend(attrs[k] for k in ("href","src") if k in attrs)
p=Links();p.feed((WEB/"index.html").read_text(encoding="utf-8"))
count=0
for link in p.links:
    u=urlsplit(link)
    if u.scheme or u.netloc:continue
    if not u.path:
        if u.fragment:assert u.fragment in p.ids,link
    else:
        path=WEB/unquote(u.path);assert path.is_file(),link
        assert path.resolve().is_relative_to(WEB.resolve()),link
        count+=1
for name in ["media/research-film.mp4","media/v2/research-film-v2.mp4"]:
    req=Request("http://127.0.0.1:8033/"+name,headers={"Range":"bytes=100-199"})
    with urlopen(req) as r:
        assert r.status==206
        assert r.read()==(WEB/name).read_bytes()[100:200]
        assert r.headers["Content-Length"]=="100"
with urlopen("http://127.0.0.1:8033/files/v2-execution-prompt.md") as r:
    prompt=r.read().decode("utf-8")
    assert prompt==(ROOT/"notes/v2-execution-prompt.md").read_text(encoding="utf-8")
    assert len(prompt)>4500
result={"static_references":count,"unique_ids":len(p.ids),"internal_anchors":"pass",
        "both_video_byte_ranges":"206 / exact bytes","full_prompt":"HTTP content matches source; >4500 characters",
        "scope":"Static and HTTP checks. Does not simulate browser interactions."}
(ROOT/"notes/v2-web-static-check.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(result,ensure_ascii=False))
