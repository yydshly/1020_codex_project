"""Export an original SVG research diagram as a shareable PNG.

Requires resvg-py only for this optional authoring step; the website has no
third-party runtime dependencies. Run the matching build script after edits.
"""

from pathlib import Path
import argparse
import shutil

try:
    import resvg_py
except ImportError as exc:
    raise SystemExit("PNG export requires resvg-py: python -m pip install resvg-py==0.5.0") from exc


PROJECT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", nargs="?", default="browser-choice-guide", choices=["browser-choice-guide", "browser-agent-architecture"])
    name = parser.parse_args().name
    SVG = PROJECT / "assets" / f"{name}.svg"
    PNG = SVG.with_suffix(".png")
    PNG.write_bytes(resvg_py.svg_to_bytes(svg_path=str(SVG), background="#ffffff"))
    print("PNG exported with system fonts, SVG arrowheads and dashed paths")
    shutil.copyfile(PNG, PROJECT / "web/assets" / PNG.name)
    print("Original and website PNG copies synchronized")


if __name__ == "__main__":
    main()
