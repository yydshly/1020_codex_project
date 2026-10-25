"""Vendor the pinned atlas runtime without Git metadata or build dependencies.

SPDX-License-Identifier: GPL-3.0-only
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

PIN = "53059f1c7fed305807b19365857a5f135daf3ac6"
PROJECT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkout", type=Path)
    args = parser.parse_args()
    source = args.checkout.resolve()
    commit = subprocess.check_output(
        ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
    ).strip()
    if commit != PIN:
        raise SystemExit(f"Expected {PIN}; got {commit}")
    destination = PROJECT / "web" / "upstream"
    destination.mkdir(parents=True, exist_ok=True)
    files = [source / name for name in (
        "index.html", "LICENSE", "README_ZH.md", "CONTRIBUTING_ZH.md",
        "llms.txt", "manifest.webmanifest",
    )]
    for folder in ("js", "css", "assets", "topics", "geojson"):
        files.extend(p for p in (source / folder).rglob("*") if p.is_file()
                     and not p.name.startswith("hero_demo_")
                     and not (p.name.startswith("preview_") and "_en." in p.name))
    manifest = []
    for original in sorted(files):
        if original.is_symlink():
            raise SystemExit(f"Refusing linked source: {original.name}")
        relative = original.relative_to(source)
        target = destination / relative
        if not target.resolve().is_relative_to(destination.resolve()):
            raise SystemExit("Invalid destination")
        target.parent.mkdir(parents=True, exist_ok=True)
        # Read the committed blob, independent of Windows checkout line endings.
        original_data = subprocess.check_output(
            ["git", "-C", str(source), "show", f"{PIN}:{relative.as_posix()}"]
        )
        data = original_data
        if relative.as_posix() == "index.html":
            # The local copy uses system font fallbacks and no upstream analytics.
            page = data.decode("utf-8")
            page = re.sub(r'^.*<(?:link|script)[^\n]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com|events\.vercount\.one|static\.cloudflareinsights\.com)[^\n]*\n', '', page, flags=re.M)
            data = page.encode("utf-8")
        target.write_bytes(data)
        manifest.append({
            "path": relative.as_posix(),
            "upstream_sha256": hashlib.sha256(original_data).hexdigest(),
            "local_sha256": hashlib.sha256(data).hexdigest(),
            "modified": data != original_data,
        })
    (destination / "SOURCE.json").write_text(json.dumps({
        "repository": "https://github.com/DeanChensj/jiangshan-map",
        "commit": PIN,
        "retrieved_on": "2026-10-24",
        "license": "GPL-3.0",
        "changes": ["index.html: remove remote font requests and analytics; system font fallbacks remain"],
        "files": manifest,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(source / "LICENSE", PROJECT / "LICENSE")
    print(f"Vendored {len(manifest)} files at {PIN[:12]}")


if __name__ == "__main__":
    main()
