"""Measure final encoded V2, including the main-content crop; preserve V1 evidence."""
import hashlib,json,re,subprocess
from pathlib import Path
from fractions import Fraction

ROOT=Path(__file__).resolve().parents[1]
video=ROOT/"web/media/v2/research-film-v2.mp4"
def run(args):
    return subprocess.run(args,capture_output=True,text=True,encoding="utf-8",errors="replace",check=True)
def measure_freeze(filter_prefix=""):
    log=run(["ffmpeg","-hide_banner","-i",str(video),"-vf",filter_prefix+"freezedetect=n=-50dB:d=0.5","-an","-f","null","-"]).stderr
    events=re.findall(r"freeze_(?:start|end|duration): [\d.]+",log)
    intervals=[];start=None
    for event in events:
        kind,value=event.split(": ");value=float(value)
        if kind=="freeze_start":start=value
        elif kind=="freeze_end" and start is not None:
            intervals.append([start,value]);start=None
    if start is not None:intervals.append([start,20.0])
    total=sum(b-a for a,b in intervals)
    longest=max((b-a for a,b in intervals),default=0)
    return {"events":events,"intervals":intervals,"low_motion_seconds":round(total,3),
            "longest_seconds":round(longest,3),"threshold_db":-50,"duration_threshold_seconds":0.5,
            "target_total_seconds":round(20/30,3),"target_longest_seconds":0.5,
            "machine_gate_pass":total<=20/30 and longest<=.5,
            "limitation":"Pixel-level low-motion detection; does not establish meaningful movement or perceptual quality."}
probe=json.loads(run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(video)]).stdout)
v=next(s for s in probe["streams"] if s["codec_type"]=="video")
a=next(s for s in probe["streams"] if s["codec_type"]=="audio")
loud=run(["ffmpeg","-hide_banner","-i",str(video),"-af","loudnorm=I=-14:TP=-1:LRA=7:print_format=json","-f","null","-"]).stderr
audio=json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}',loud,re.S)[-1])
freeze=measure_freeze()
core=measure_freeze("crop=1160:520:60:100,")
core["crop"]={"x":60,"y":100,"width":1160,"height":520,"excludes":"header and footer"}
black=run(["ffmpeg","-hide_banner","-i",str(video),"-vf","blackdetect=d=0.1:pix_th=0.10","-an","-f","null","-"]).stderr
run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(video),"-vf",
     "select='eq(mod(n,60),30)',scale=320:180,tile=4x5","-frames:v","1",
     str(ROOT/"web/media/v2/contact-sheet-decoded.jpg")])
def lum(h):
    vals=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    r,g,b=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in vals]
    return .2126*r+.7152*g+.0722*b
def contrast(a,b):
    lo,hi=sorted([lum(a),lum(b)]);return round((hi+.05)/(lo+.05),2)
T=json.loads((ROOT/"src/timing-v2.json").read_text(encoding="utf-8"))
result={
 "video":{"width":v["width"],"height":v["height"],"fps":float(Fraction(v["avg_frame_rate"])),
          "frames":int(v["nb_frames"]),"duration":float(v["duration"]),"codec":v["codec_name"],
          "pixel_format":v["pix_fmt"],"container_duration":float(probe["format"]["duration"])},
 "audio":{"integrated_lufs":float(audio["input_i"]),"true_peak_dbtp":float(audio["input_tp"]),
          "loudness_range_lu":float(audio["input_lra"]),"sample_rate":int(a["sample_rate"]),
          "channels":a["channels"],"measurement":"FFmpeg loudnorm on decoded final MP4",
          "human_listening_review":False},
 "freeze":freeze,"core_freeze":core,
 "black":{"events":re.findall(r"black_start:[^\n]+",black)},
 "contrast":{"ink_on_paper":contrast("#19362f","#f3f2e9"),"muted_on_paper":contrast("#52635c","#f3f2e9"),
             "paper_on_ink":contrast("#f3f2e9","#19362f"),"mint_on_ink":contrast("#c0d6ba","#19362f"),
             "ink_on_gold":contrast("#19362f","#e79b40"),
             "scope":"Stable design-color pairs only; transition opacity and anti-aliased edges excluded."},
 "timing":{"scene_start_frames":T["sceneFrames"],"composition_intervals_seconds":
           [(b-a)/60 for a,b in zip(T["sceneFrames"],T["sceneFrames"][1:])],
           "beat_frames":T["beatFrames"],"action_frames":T["actionFrames"],
           "all_action_anchors_on_beat":all(f%T["beatFrames"]==0 for f in T["actionFrames"]),
           "scope":"Source anchor check. Does not claim all visible/perceived peaks have been measured within one frame."},
 "sha256":hashlib.sha256(video.read_bytes()).hexdigest(),
 "v1_sha256":hashlib.sha256((ROOT/"web/media/research-film.mp4").read_bytes()).hexdigest(),
 "scope":"Second iterated production of the same subject. Different pipeline and effort; not a controlled prompt A/B or general capability ceiling.",
 "not_verified":["Human listening quality","Professional reference parity","All perceptual audiovisual peaks within one frame",
                 "Independent human audience comprehension","3D, character acting, speech, vertical layout, actual Kokoro inference"]
}
assert (v["width"],v["height"],int(v["nb_frames"]),float(Fraction(v["avg_frame_rate"])))==(1280,720,1200,60)
assert float(v["duration"])==20
assert abs(result["audio"]["integrated_lufs"]+14)<1
assert result["audio"]["true_peak_dbtp"]<=-1
assert result["v1_sha256"]=="8b7d1c540c1a1851de5d5011631baf2001b6acf3bd4b2dd3ec331c160dcb7867","V1 must remain unchanged"
(ROOT/"notes/v2-verification.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(result,ensure_ascii=False,indent=2))
