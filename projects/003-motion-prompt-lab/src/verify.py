"""Measure the encoded deliverable; do not infer aesthetics from technical checks."""
import hashlib, json, re, subprocess
from pathlib import Path
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[1]
video = ROOT / "web/media/research-film.mp4"

def run(args):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)

probe = json.loads(run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(video)]).stdout)
v = next(x for x in probe["streams"] if x["codec_type"]=="video")
loud = run(["ffmpeg","-hide_banner","-i",str(video),"-af","loudnorm=I=-14:TP=-1:LRA=7:print_format=json","-f","null","-"]).stderr
audio = json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}',loud,re.S)[-1])
freeze = run(["ffmpeg","-hide_banner","-i",str(video),"-vf","freezedetect=n=-50dB:d=0.5","-an","-f","null","-"]).stderr
black = run(["ffmpeg","-hide_banner","-i",str(video),"-vf","blackdetect=d=0.1:pix_th=0.10","-an","-f","null","-"]).stderr
run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(video),
     "-vf","select='eq(mod(n,60),30)',scale=320:180,tile=4x5","-frames:v","1",str(ROOT/"web/media/contact-sheet-decoded.jpg")])

def lum(h):
    rgb = [int(h[i:i+2],16)/255 for i in (1,3,5)]
    r,g,b = [c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
    return .2126*r+.7152*g+.0722*b
def contrast(a,b):
    l1,l2=sorted([lum(a),lum(b)])
    return round((l2+.05)/(l1+.05),2)

freeze_events = re.findall(r"freeze_(?:start|end|duration): [\d.]+",freeze)
freeze_total = sum(float(x.split(": ")[1]) for x in freeze_events if x.startswith("freeze_duration"))
starts = [float(x.split(": ")[1]) for x in freeze_events if x.startswith("freeze_start")]
ends = [float(x.split(": ")[1]) for x in freeze_events if x.startswith("freeze_end")]
if starts and (not ends or starts[-1]>ends[-1]):
    freeze_total += float(v["duration"])-starts[-1]
checks = {
 "video":{"width":v["width"],"height":v["height"],"fps":float(Fraction(v["avg_frame_rate"])),
          "frames":int(v["nb_frames"]),"duration":float(v["duration"]),"codec":v["codec_name"],
          "pixel_format":v["pix_fmt"],"container_duration":float(probe["format"]["duration"])},
 "audio":{"integrated_lufs":float(audio["input_i"]),"true_peak_dbtp":float(audio["input_tp"]),
          "loudness_range_lu":float(audio["input_lra"]),"measurement":"FFmpeg loudnorm on decoded final MP4"},
 "freeze":{"events":freeze_events,"low_motion_seconds":round(freeze_total,2),
           "threshold_db":-50,"duration_threshold_seconds":0.5,
           "limitation":"Full-frame pixel test only. A moving timer masks static main content; does NOT prove purposeful movement or satisfy the original artistic freeze rule."},
 "black":{"events":re.findall(r"black_start:[^\n]+",black),"limitation":"No detected black interval is not a compositional quality judgment."},
 "contrast":{"ink_on_paper":contrast("#19362f","#f3f2e9"),"muted_on_paper":contrast("#52635c","#f3f2e9"),
             "mint_on_dark":contrast("#c0d6ba","#102c25"),"ink_on_orange":contrast("#19362f","#e79b40"),
             "limitation":"Design color pairs; does not measure every anti-aliased or transitional pixel."},
 "sync":{"scene_start_frames":[0,240,480,720,960],"beat_frames":30,
         "scene_anchor_error_frames":0,"limitation":"Code anchor positions only; perceived visual peaks are not all measured. Audio has no dialogue."},
 "sha256":hashlib.sha256(video.read_bytes()).hexdigest(),
 "scope":"One locally produced, iterated sample. No controlled prompt comparison, no claimed model speed benchmark.",
 "not_verified":["Industry-best-reference parity","All motion perceptual peaks within one frame","All composition safe margins algorithmically verified","Narrative clarity with independent audience","3D / character performance / speech / vertical layout"]
}
assert (checks["video"]["width"],checks["video"]["height"],checks["video"]["frames"],checks["video"]["fps"])==(1280,720,1200,60)
assert checks["video"]["duration"]==20
assert abs(checks["audio"]["integrated_lufs"]+14)<1
assert checks["audio"]["true_peak_dbtp"]<=-1
(ROOT/"notes/verification.json").write_text(json.dumps(checks,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(checks,ensure_ascii=False,indent=2))
