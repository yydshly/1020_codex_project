"""Original procedural soundtrack. No external music or speech models."""
import json, math, wave, array, subprocess, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIMING = json.loads((ROOT / "src/timing.json").read_text(encoding="utf-8"))
SR = 48000
N = SR * TIMING["duration"]
out = ROOT / "web/media"
out.mkdir(parents=True, exist_ok=True)
music = array.array("f", [0]) * N
effects = array.array("f", [0]) * N

def add_tone(start, duration, freq, gain):
    i0 = int(start * SR)
    length = int(duration * SR)
    for j in range(min(length, N - i0)):
        t = j / SR
        env = min(1, t / .025) * math.exp(-t / (duration * .35))
        music[i0+j] += gain * env * (math.sin(2*math.pi*freq*t) + .18*math.sin(4*math.pi*freq*t))

# Cmaj7 / Am7 / Fmaj7 / G6 / Cmaj7; quiet, minimal pulse.
chords = [(130.813,164.814,195.998,246.942),(110,130.813,164.814,195.998),
          (87.307,110,130.813,164.814),(97.999,123.471,146.832,195.998),
          (130.813,164.814,195.998,246.942)]
for scene, chord in enumerate(chords):
    for k, freq in enumerate(chord):
        add_tone(scene*4, 3.9, freq, .025)
    for beat in range(8):
        start=scene*4+beat*.5
        add_tone(start, .42, chord[beat%4]*4, .04)
        if beat%2==0:
            for j in range(int(.18*SR)):
                idx=int(start*SR)+j
                t=j/SR
                phase=2*math.pi*(48*t + 4.0*(1-math.exp(-35*t)))
                music[idx] += .15*math.exp(-t*24)*math.sin(phase)
        # deterministic bright tick, no unseeded noise
        for j in range(int(.035*SR)):
            idx=int(start*SR)+j
            t=j/SR
            music[idx] += .011*math.exp(-t*120)*(math.sin(2*math.pi*6700*t)+math.sin(2*math.pi*8311*t))
for frame in TIMING["actionFrames"]:
    if frame==0: continue
    start=frame/TIMING["fps"]
    for j in range(int(.12*SR)):
        idx=int(start*SR)+j
        t=j/SR
        effects[idx] += .035*math.exp(-t*40)*math.sin(2*math.pi*(950*t-1800*t*t))

def save(name, data):
    pcm=array.array("h")
    for i,v in enumerate(data):
        fade=min(1,i/(SR*.015),(N-1-i)/(SR*.35))
        v=max(-1,min(1,v*fade))
        pcm.append(round(v*32767))
    raw=ROOT/".cache"/f"{name}.wav"
    with wave.open(str(raw),"wb") as w:
        w.setparams((1,2,SR,0,"NONE","not compressed"));w.writeframes(pcm.tobytes())
    # Compress transient crest factor, then normalize with measured two-pass values.
    compressor="acompressor=threshold=0.025:ratio=8:attack=0.1:release=100"
    measured=subprocess.run(["ffmpeg","-hide_banner","-i",str(raw),"-af",
                            compressor+",loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json",
                            "-f","null","-"],capture_output=True,text=True,encoding="utf-8",check=True)
    values=json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}',measured.stderr,re.S)[-1])
    norm="loudnorm=I=-14:TP=-1.5:LRA=7:linear=true"
    for target,key in [("measured_I","input_i"),("measured_TP","input_tp"),("measured_LRA","input_lra"),("measured_thresh","input_thresh"),("offset","target_offset")]:
        norm+=f":{target}={values[key]}"
    subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(raw),
                    "-af",compressor+","+norm,"-ar",str(SR),
                    "-c:a","aac","-b:a","192k",str(out/f"{name}.m4a")],check=True)
save("music-only",music)
save("soundtrack",array.array("f",(m+s for m,s in zip(music,effects))))
print("Created 20-second original music-only and mixed tracks.")

