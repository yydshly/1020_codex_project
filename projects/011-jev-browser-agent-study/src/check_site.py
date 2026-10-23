"""Check static-site portability, local links, identifiers, downloads and guide copies."""

from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET

PROJECT = Path(__file__).resolve().parents[1]
WEB = PROJECT / "web"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.ids = set()
        self.duplicates = []
        self.refs = []
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        ident = attrs.get("id")
        if ident:
            if ident in self.ids:
                self.duplicates.append(ident)
            self.ids.add(ident)
        for attr in ("href", "src"):
            if attrs.get(attr):
                self.refs.append(attrs[attr])


def main():
    errors = []
    pages = {path.resolve(): Page(path) for path in WEB.rglob("*.html")}
    for path, page in pages.items():
        if page.duplicates:
            errors.append(f"Duplicate IDs in {path.name}: {page.duplicates}")
        for ref in page.refs:
            parts = urlsplit(ref)
            if parts.scheme or parts.netloc:
                continue
            if parts.path.startswith("/"):
                errors.append(f"Root-dependent resource in {path.name}: {ref}")
                continue
            target = (path.parent / unquote(parts.path)).resolve() if parts.path else path
            if not target.is_relative_to(WEB.resolve()):
                errors.append(f"Resource outside public directory: {ref}")
            elif not target.is_file():
                errors.append(f"Missing local resource in {path.name}: {ref}")
            elif parts.fragment and target in pages and unquote(parts.fragment) not in pages[target].ids:
                errors.append(f"Missing anchor in {path.name}: {ref}")
    sources = json.loads((PROJECT / "notes/sources.json").read_text(encoding="utf-8"))
    metadata = json.loads((PROJECT / "project.json").read_text(encoding="utf-8"))
    for name in ("research.md", "sources.json"):
        if (PROJECT / "notes" / name).read_bytes() != (WEB / "docs" / name).read_bytes():
            errors.append(f"Download copy is stale: {name}")
    original = PROJECT / "assets/browser-choice-guide.svg"
    public = WEB / "assets/browser-choice-guide.svg"
    ET.parse(original)
    ET.parse(public)
    if original.read_bytes() != public.read_bytes():
        errors.append("Guide SVG copies differ")
    if not (PROJECT / metadata["cover"]).is_file():
        errors.append("Project cover is missing")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Site OK: {len(pages)} HTML pages, unique IDs, local resources and anchors valid")
    print(f"Downloads match research originals; source index type: {type(sources).__name__}")
    print("Guide SHA-256: " + hashlib.sha256(original.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
