"""Copy the reviewed MP4 without re-encoding; derive poster/contact sheet from it.

This is packaging, not an extra full render or an approval mechanism.
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
round_name = sys.argv[1]
source = ROOT / "web/media/v3" / f"{round_name}.mp4"
review = ROOT / "notes/v3" / f"review-{round_name}.md"
if not review.exists():
    raise RuntimeError("A completed independent review must exist before packaging.")
target = ROOT / "web/media/v3/final.mp4"
shutil.copyfile(source, target)
cache = ROOT / ".cache/v3-source/final-extracts"
cache.mkdir(parents=True, exist_ok=True)

def extract(frame_number, dest):
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(target), "-vf",
         f"select=eq(n\\,{frame_number})", "-frames:v", "1", str(dest)],
        check=True,
    )

extract(0, ROOT / "web/media/v3/poster.png")
frames = [i * 150 + offset for i in range(8) for offset in (45, 105)]
frames[0], frames[-1] = 0, 1199
sheet = Image.new("RGB", (1280, 816), "#eee9dc")
draw = ImageDraw.Draw(sheet)
for index, frame_number in enumerate(frames):
    dest = cache / f"f{frame_number:04}.png"
    extract(frame_number, dest)
    image = Image.open(dest).convert("RGB").resize((320, 180), Image.Resampling.LANCZOS)
    x, y = index % 4 * 320, index // 4 * 204
    sheet.paste(image, (x, y))
    draw.text((x + 8, y + 183), f"{frame_number / 60:.2f}s / f{frame_number}", fill="#263b34")
sheet.save(ROOT / "web/media/v3/contact-sheet.jpg", quality=94)
paths = [
    source, target, review, ROOT / "web/media/v3/music-only.m4a",
    ROOT / "web/media/v3/poster.png", ROOT / "web/media/v3/contact-sheet.jpg",
]
record = {
    "reviewed_round": round_name,
    "packaging_is_not_a_render": True,
    "final_equals_reviewed_bytes": source.read_bytes() == target.read_bytes(),
    "poster_source_frame": 0,
    "contact_sheet_source_frames": frames,
    "sha256": {
        p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in paths
    },
}
(ROOT / "notes/v3/final-artifacts.json").write_text(
    json.dumps(record, ensure_ascii=False, indent=2), encoding="utf8"
)
print(json.dumps(record, ensure_ascii=False, indent=2))
