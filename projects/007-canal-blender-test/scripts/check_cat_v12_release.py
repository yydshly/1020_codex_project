from pathlib import Path
import hashlib,json,re,subprocess
r=Path(__file__).resolve().parents[1]
b=json.loads((r/'assets/cat-v12-preservation-baseline.json').read_text())
changed=[name for name,h in b.items() if not (r/name).is_file() or hashlib.sha256((r/name).read_bytes()).hexdigest()!=h]
preservation={'passed':not changed,'checkedFiles':len(b),'changed':changed}
(r/'assets/cat-v12-preservation-check.json').write_text(json.dumps(preservation,indent=2),encoding='utf-8')
import imageio_ffmpeg
result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-i',str(r/'assets/cat-v12-final-motion.webm'),'-vf','showinfo','-f','null','-'],capture_output=True,text=True)
times=[float(value) for value in re.findall(r'\bn:\s*\d+.*?pts_time:([\d.]+)',result.stderr)]
# Review clip omits the first 0.6s of encoder startup; raw 8s capture is kept.
checks={'decoded':result.returncode==0,'enough_frames':len(times)>=210,'normal_duration':bool(times) and 7.1<times[-1]-times[0]<7.5,'no_large_frame_gap':bool(times) and max(b-a for a,b in zip(times,times[1:]))<.15}
recording={'passed':all(checks.values()),'checks':checks,'frames':len(times),'firstTimestamp':times[0] if times else None,'lastTimestamp':times[-1] if times else None,'maxGap':max(b-a for a,b in zip(times,times[1:])) if len(times)>1 else None,'source':'Actual browser canvas, timeScale=1; first 0.6s encoder startup omitted; no retiming; full raw capture retained'}
(r/'assets/cat-v12-motion-quality-check.json').write_text(json.dumps(recording,indent=2),encoding='utf-8')
print(json.dumps({'preservation':preservation,'recording':recording}))
if not preservation['passed'] or not recording['passed']:raise SystemExit(1)
