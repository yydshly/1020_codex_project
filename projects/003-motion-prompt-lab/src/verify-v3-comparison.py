"""Independent technical measurements of V3 using the historical comparison threshold."""
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "web/media/v3/final.mp4"

def run(args):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", check=True)

probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                        "-of", "json", str(VIDEO)]).stdout)
stream = next(s for s in probe["streams"] if s["codec_type"] == "video")
duration = float(stream["duration"])

def freeze(threshold):
    log = run(["ffmpeg", "-hide_banner", "-i", str(VIDEO), "-vf",
               f"freezedetect=n={threshold}dB:d=0.5", "-an", "-f", "null", "-"]).stderr
    events = re.findall(r"freeze_(?:start|end|duration): [\d.]+", log)
    intervals, start = [], None
    for event in events:
        kind, value = event.split(": ")
        value = float(value)
        if kind == "freeze_start":
            start = value
        elif kind == "freeze_end" and start is not None:
            intervals.append([start, value])
            start = None
    if start is not None:
        intervals.append([start, duration])
    total = sum(b - a for a, b in intervals)
    longest = max((b - a for a, b in intervals), default=0)
    return {
        "threshold_db": threshold, "duration_threshold_seconds": 0.5,
        "intervals": intervals, "events": events,
        "low_motion_seconds": round(total, 3), "longest_seconds": round(longest, 3),
        "target_total_seconds": round(duration / 30, 3),
        "target_longest_seconds": 0.5,
        "machine_gate_pass": total <= duration / 30 + 1e-6 and longest <= 0.5 + 1e-6,
        "limitation": "Only runs lasting at least 0.5s are counted; shorter stalls are excluded. Pixel low-motion detection is not a test of meaningful or perceptually continuous movement, nor exhaustive proof of the original freeze requirement.",
    }

def loudness():
    log = run(["ffmpeg", "-hide_banner", "-i", str(VIDEO), "-af",
               "loudnorm=I=-14:TP=-1:LRA=7:print_format=json", "-f", "null", "-"]).stderr
    data = json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', log, re.S)[-1])
    return {
        "integrated_lufs": float(data["input_i"]),
        "true_peak_dbtp": float(data["input_tp"]),
        "measurement": "FFmpeg loudnorm input measurements on decoded final MP4",
        "human_listening_review": False,
    }

with ThreadPoolExecutor(max_workers=3) as pool:
    f50 = pool.submit(freeze, -50)
    f60 = pool.submit(freeze, -60)
    audio = pool.submit(loudness)
    result = {
        "video": {
            "width": stream["width"], "height": stream["height"],
            "fps": float(Fraction(stream["avg_frame_rate"])),
            "frames": int(stream["nb_frames"]), "duration": duration,
        },
        "audio": audio.result(),
        "freeze_comparable_with_v1_v2": f50.result(),
        "freeze_secondary_threshold": f60.result(),
        "sha256": hashlib.sha256(VIDEO.read_bytes()).hexdigest(),
        "scope": "Independent final-file measurements for the comparison website; does not replace creative reviews.",
    }

result["exact_format_pass"] = result["video"] == {
    "width": 1280, "height": 720, "fps": 60.0, "frames": 1200, "duration": 20.0}
(ROOT / "notes/v3/comparison-measurements.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
