"""Check this project's content references and portable files without building other projects."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / "web/data.js").read_text(encoding="utf-8")
data = json.loads(raw.removeprefix("window.ATLAS = ").strip().removesuffix(";"))
source_ids = {s["id"] for s in data["sources"]}
platform_ids = {p["id"] for p in data["platforms"]}
assert len(platform_ids) == len(data["platforms"]) == 6
assert len(source_ids) == len(data["sources"]) == 19
for p in data["platforms"]:
    assert set(p["sources"]) <= source_ids, p["name"]
    assert len(p["features"]) == 4
for r in data["routes"]:
    assert set(r["platforms"]) <= platform_ids
for s in data["sources"]:
    assert s["platform"] in platform_ids
    assert urlsplit(s["url"]).scheme == "https"


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.references = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids, f"Duplicate id: {attrs['id']}"
            self.ids.add(attrs["id"])
        for key in ("href", "src"):
            if attrs.get(key):
                self.references.append(attrs[key])


for filename in ("index.html", "guide.html", "overview.html"):
    path = ROOT / "web" / filename
    page = Page()
    page.feed(path.read_text(encoding="utf-8"))
    for ref in page.references:
        url = urlsplit(ref)
        if url.scheme or url.netloc:
            continue
        if url.path:
            assert (path.parent / unquote(url.path)).is_file(), f"Missing file: {ref}"
        elif url.fragment:
            assert url.fragment in page.ids or url.fragment.removeprefix("source-") in source_ids, ref

svg = ET.parse(ROOT / "web/platform-guide.svg")
assert svg.getroot().attrib["viewBox"] == "0 0 1600 3510"
assert (ROOT / "assets/platform-guide.svg").read_bytes() == (ROOT / "web/platform-guide.svg").read_bytes()
assert (ROOT / "notes/research.md").read_bytes() == (ROOT / "web/research.md").read_bytes()
json.loads((ROOT / "project.json").read_text(encoding="utf-8"))
print("PASS: 6 platforms, 5 routes, 19 sources; references, local assets, SVG and generated copies are consistent.")
