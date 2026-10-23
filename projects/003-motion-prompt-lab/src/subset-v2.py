"""Subset the fixed OFL font for deterministic, fast SVG rasterization."""
import sys,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/".cache/python"))
from fontTools import subset
source=ROOT/".cache/NotoSansCJKsc-Regular.otf"
dest=ROOT/".cache/NotoSansCJKsc-v2-subset.otf"
chars=(ROOT/"src/film-v2.mjs").read_text(encoding="utf-8")
opts=subset.Options()
opts.name_IDs=["*"]
font=subset.load_font(str(source),opts)
worker=subset.Subsetter(options=opts)
worker.populate(text=chars+"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /→·，。")
worker.subset(font)
subset.save_font(font,str(dest),opts)
(ROOT/"notes/v2-font.json").write_text(json.dumps({"originalSHA256":hashlib.sha256(source.read_bytes()).hexdigest(),"subsetSHA256":hashlib.sha256(dest.read_bytes()).hexdigest(),"subsetBytes":dest.stat().st_size,"license":"SIL OFL1.1","method":"fontTools4.60.1; all characters in src/film-v2.mjs; no system fallback"},indent=2),encoding="utf-8")
print(f"Subset font: {dest.stat().st_size} bytes")
