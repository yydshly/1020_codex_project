"""V2 original stereo score. Timed impacts refer to the shared animation frame manifest."""
import array,math,wave,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
T=json.loads((ROOT/"src/timing-v2.json").read_text(encoding="utf-8"))
SR=48000; N=T["duration"]*SR
music=[array.array("f",[0])*N,array.array("f",[0])*N]
sfx=[array.array("f",[0])*N,array.array("f",[0])*N]

def tone(start,duration,freq,gain,pan=0,kind="pluck"):
    begin=int(start*SR)
    for j in range(int(duration*SR)):
        idx=begin+j
        if idx>=N:break
        t=j/SR
        if kind=="pad":
            env=min(1,t/.17)*min(1,(duration-t)/.35)
            val=math.sin(2*math.pi*freq*t)+.14*math.sin(2*math.pi*freq*2*t)+.08*math.sin(2*math.pi*freq*3*t)
        else:
            env=min(1,t/.004)*math.exp(-t*5/duration)
            val=math.sin(2*math.pi*freq*t)+.23*math.sin(2*math.pi*freq*2.003*t)*math.exp(-t*8)
        music[0][idx]+=gain*env*val*(1-pan*.35)
        music[1][idx]+=gain*env*val*(1+pan*.35)

# A cohesive D minor / Bb / F / C loop; richer stereo voicing without stock music.
chords=[(146.832,174.614,220,261.626),(116.541,146.832,174.614,220),(87.307,130.813,174.614,220),(130.813,164.814,195.998,261.626)]
for bar in range(10):
    chord=chords[(bar//2)%4]
    for k,freq in enumerate(chord):tone(bar*2,2.1,freq,.012,(-1 if k%2 else 1)*.6,"pad")
    for sub in range(8):
        moment=bar*2+sub*.25
        if sub in [0,2,3,6]:
            tone(moment,.55,chord[(sub+bar)%4]*4,.035,(-.65 if sub%2 else .65))
        if sub%2==0:
            tone(moment,.35,chord[0]/2,.075,0)
        if sub in [0,4]:
            for j in range(int(.16*SR)):
                idx=int(moment*SR)+j;t=j/SR
                v=.08*math.exp(-t*28)*math.sin(2*math.pi*(48*t+3.1*(1-math.exp(-38*t))))
                for channel in music:channel[idx]+=v
        if bar>=2 and sub in [2,6]:
            for j in range(int(.045*SR)):
                idx=int(moment*SR)+j;t=j/SR
                v=.009*math.exp(-t*100)*(math.sin(2*math.pi*5777*t)+math.sin(2*math.pi*7823*t))
                music[0][idx]+=v;music[1][idx]+=v*.85

for f in T["actionFrames"]:
    start=f/60
    pan=math.sin(f*.017)*.6
    for j in range(int(.10*SR)):
        idx=int(start*SR)+j
        if idx>=N:break
        t=j/SR
        v=.055*math.exp(-t*52)*math.sin(2*math.pi*(760*t-1300*t*t))
        sfx[0][idx]+=v*(1-pan*.3);sfx[1][idx]+=v*(1+pan*.3)
# Swooshes are attached to the actual expansion/fold arrivals; the approach is audible before impact.
for f in [120,180,360,450,660,810,930,990]:
    peak=int(f/60*SR)
    for j in range(-int(.16*SR),int(.08*SR)):
        idx=peak+j
        if not 0<=idx<N:continue
        t=j/SR
        env=math.exp(-((t+.015)/.055)**2)
        v=.013*env*(math.sin(2*math.pi*(1900*t+1600*t*t))+math.sin(2*math.pi*(2701*t+1300*t*t)))
        sfx[0][idx]+=v;sfx[1][idx]+=v*.8

out=ROOT/"web/media/v2";out.mkdir(parents=True,exist_ok=True)
cache=ROOT/".cache/v2";cache.mkdir(parents=True,exist_ok=True)
def export(name,channels):
    pcm=array.array("h")
    for i in range(N):
        envelope=min(1,i/(SR*.008),(N-1-i)/(SR*.3))
        for c in channels:pcm.append(round(max(-1,min(1,c[i]*envelope))*32767))
    raw=cache/(name+".wav")
    with wave.open(str(raw),"wb") as w:w.setparams((2,2,SR,0,"NONE","not compressed"));w.writeframes(pcm.tobytes())
    pre="acompressor=threshold=0.03:ratio=5:attack=0.1:release=100"
    measured=subprocess.run(["ffmpeg","-hide_banner","-i",str(raw),"-af",pre+",loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json","-f","null","-"],capture_output=True,text=True,encoding="utf-8",check=True)
    m=json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}',measured.stderr,re.S)[-1])
    norm="loudnorm=I=-14:TP=-1.5:LRA=7:linear=true"
    for a,b in [("measured_I","input_i"),("measured_TP","input_tp"),("measured_LRA","input_lra"),("measured_thresh","input_thresh"),("offset","target_offset")]:norm+=f":{a}={m[b]}"
    subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(raw),"-af",pre+","+norm,"-ar",str(SR),"-c:a","aac","-b:a","192k",str(out/(name+".m4a"))],check=True)
export("music-only",music)
export("soundtrack",[[a+b for a,b in zip(music[c],sfx[c])] for c in range(2)])
(ROOT/"notes/v2-audio.json").write_text(json.dumps({"bpm":120,"sampleRate":SR,"channels":2,"source":"Original procedural composition, no external song or generated voice","impactFrames":T["actionFrames"],"note":"Targets are onset anchors; perceptual visual peaks must still be reviewed."},indent=2),encoding="utf-8")
print("V2 stereo score and music-only export complete.")
