"""Verify published local links, source identity, preserved films and streaming."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit, unquote
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids = [], set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids, ("duplicate id", attrs["id"])
            self.ids.add(attrs["id"])
        self.links.extend(attrs[k] for k in ("href", "src") if k in attrs)

parser = Links()
parser.feed((WEB / "index.html").read_text(encoding="utf-8"))
count = 0
for link in parser.links:
    url = urlsplit(link)
    if url.scheme or url.netloc:
        continue
    if not url.path:
        if url.fragment:
            assert url.fragment in parser.ids, link
    else:
        path = WEB / unquote(url.path)
        assert path.is_file(), link
        assert path.resolve().is_relative_to(WEB.resolve()), link
        count += 1

summary = json.loads((WEB / "files/v3/web-summary.json").read_text(encoding="utf-8"))
expected = {
    "media/research-film.mp4": "8b7d1c540c1a1851de5d5011631baf2001b6acf3bd4b2dd3ec331c160dcb7867",
    "media/v2/research-film-v2.mp4": "d9076d830cee88ee085405451933c87889b851e2ed73a6cc1ea60978c55505de",
    summary["video_file"]: summary["video_sha256"],
}
films = {}
for name, old_hash in expected.items():
    data = (WEB / name).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if old_hash:
        assert digest == old_hash, ("historical film changed", name)
    request = Request("http://127.0.0.1:8033/" + name, headers={"Range": "bytes=100-199"})
    with urlopen(request) as response:
        assert response.status == 206
        assert response.read() == data[100:200]
        assert response.headers["Content-Length"] == "100"
    films[name] = {"sha256": digest, "http_range": "206 / exact bytes"}

manifest = json.loads((ROOT / "notes/v3/source-manifest.json").read_text(encoding="utf-8"))
raw = (ROOT / manifest["raw_file"]).read_bytes()
assert hashlib.sha256(raw).hexdigest() == manifest["sha256"]
assert len(raw) == manifest["utf8_bytes"]
assert len(raw.decode("utf-8")) == manifest["characters"]
with urlopen("http://127.0.0.1:8033/files/v3/web-summary.json") as response:
    summary = json.load(response)
assert summary["requirements"] and summary["metrics"]
for artifact in summary.get("artifacts", []):
    target = (WEB / artifact["href"]).resolve()
    assert target.is_relative_to(WEB.resolve()) and target.is_file(), artifact
for group in json.loads((WEB / "files/hub-artifacts.json").read_text(encoding="utf-8")):
    for artifact in group["items"]:
        target = (WEB / artifact["href"]).resolve()
        assert target.is_relative_to(WEB.resolve()) and target.is_file(), artifact
assert not (WEB / "files/v3/original-prompt.txt").exists()
result = {
    "static_references": count,
    "unique_ids": len(parser.ids),
    "internal_anchors": "PASS",
    "films": films,
    "original_input_sha256": manifest["sha256"],
    "original_input_unchanged": True,
    "scope": "Local artifact identity, links and HTTP streaming; browser interaction checked separately.",
}
(ROOT / "notes/v3/web-static-check.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
