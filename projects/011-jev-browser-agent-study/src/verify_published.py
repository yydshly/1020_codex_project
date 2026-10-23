"""Compare deployed static resources with the exact published Git commit."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.request import Request, urlopen

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]
PREFIX = "projects/011-jev-browser-agent-study"
BASE = "https://yydshly.github.io/1020_codex_project/"
ORIGINAL_PNG = "2d562c2d31209ff6a02b7becc20d320dc670aa6d1493cfcfcf5ea08fe7f266f7"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    files = ["index.html", "architecture.html", "guide.html", "style.css", "app.js",
             "assets/browser-agent-architecture.svg", "assets/browser-agent-architecture.png",
             "assets/browser-choice-guide.svg", "assets/browser-choice-guide.png",
             "docs/research.md", "docs/sources.json"]
    jobs = []
    for name in files:
        expected = subprocess.check_output(["git", "show", f"{args.commit}:{PREFIX}/web/{name}"], cwd=ROOT)
        jobs.append((f"{PREFIX}/{name}", expected))
    cover = subprocess.check_output(["git", "show", f"{args.commit}:{PREFIX}/assets/browser-agent-architecture.svg"], cwd=ROOT)
    jobs.append(("covers/011-jev-browser-agent-study.svg", cover))
    jobs.append(("index.html", (ROOT / "_site/index.html").read_bytes().replace(b"\r\n", b"\n")))

    def check(job):
        path, expected = job
        url = BASE + path
        request = Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "Jev-study-publish-verification"})
        with urlopen(request, timeout=30) as response:
            body, status = response.read(), response.status
        result = {"url": url, "status": status, "bytes": len(body), "sha256": digest(body),
                  "expected_sha256": digest(expected), "matches_commit": body == expected}
        if path.endswith("browser-agent-architecture.png"):
            result["matches_approved_original"] = digest(body) == ORIGINAL_PNG
        return result

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(check, jobs))
    report = {"verified_at_utc": datetime.now(timezone.utc).isoformat(), "content_commit": args.commit,
              "base_url": BASE, "resources": results}
    (PROJECT / "notes/online-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for row in results:
        print(f"{row['status']} match={row['matches_commit']} {row['url']}")
    if not all(r["status"] == 200 and r["matches_commit"] and r.get("matches_approved_original", True) for r in results):
        raise SystemExit("Deployed content differs; see notes/online-verification.json")
    print(f"Verified {len(results)} resources; approved landscape PNG is byte-identical")


if __name__ == "__main__":
    main()
