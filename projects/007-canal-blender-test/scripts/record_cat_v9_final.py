"""Bounded normal-speed V9 motion capture after other CPU/GPU work has ended."""
import argparse
import base64
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets'
parser=argparse.ArgumentParser();parser.add_argument('--prefix',default='cat-v9-release');args=parser.parse_args();PREFIX=args.prefix
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
    page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
    page.goto('http://127.0.0.1:8062/cat-v9-gait-study.html',wait_until='networkidle')
    page.wait_for_function('window.__catFaceStudy?.getState().frames>3',timeout=60000)
    page.locator('[data-attention="natural"]').click();page.locator('[data-blink="auto"]').click();page.locator('#walk').click();page.wait_for_timeout(1800)
    page.evaluate('''()=>{const stream=document.querySelector('#viewport canvas').captureStream(30),chunks=[];
      const r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:3000000});
      const audit={start:performance.now(),samples:[]};window.__finalClip={r,audit,done:new Promise(resolve=>{r.ondataavailable=e=>chunks.push(e.data);r.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const f=new FileReader();f.onload=()=>resolve(f.result);f.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};})};
      function frame(){if(r.state==='inactive')return;const s=window.__catFaceStudy.getState();audit.samples.push({wall:performance.now(),elapsed:s.elapsed,speed:s.speed,phase:s.cat.gait.phase,timeScale:s.timeScale,mode:s.cat.gait.mode});requestAnimationFrame(frame);}
      r.start();requestAnimationFrame(frame);setTimeout(()=>{if(r.state!=='inactive')r.stop();},11000);}''')
    # The GPU video encoder can omit initial frames while warming up. Keep a
    # three-second pre-roll, then preserve timestamps when extracting the clip.
    page.wait_for_timeout(3000)
    page.wait_for_timeout(1100);page.locator('[data-speed="0.90"]').click();page.wait_for_timeout(2800)
    running=page.evaluate('window.__catFaceStudy.getState()')
    page.locator('[data-view="threequarter"]').click();page.wait_for_timeout(1500)
    page.locator('[data-speed="0.36"]').click();page.wait_for_timeout(1000)
    page.locator('#walk').click();page.wait_for_timeout(2000)
    encoded=page.evaluate('async()=>{if(window.__finalClip.r.state!=="inactive")window.__finalClip.r.stop();return await window.__finalClip.done;}')
    audit=page.evaluate('window.__finalClip.audit');state=page.evaluate('window.__catFaceStudy.getState()')
    raw=ASSETS/f'{PREFIX}-motion-raw.webm';raw.write_bytes(base64.b64decode(encoded.split(',',1)[1]))
    path=ASSETS/f'{PREFIX}-motion.webm'
    page.locator('[data-view="side"]').click();page.locator('[data-speed="0.90"]').click();page.locator('#walk').click();page.wait_for_timeout(1800)
    page.screenshot(path=str(ASSETS/f'{PREFIX}-proof-running.png'))
    page.locator('#walk').click();page.wait_for_timeout(800)
    browser.close()
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-ss','3','-i',str(raw),'-t','8','-an','-c:v','libvpx-vp9','-crf','28','-b:v','0','-threads','2','-fps_mode','vfr','-y',str(path)],check=True)
frames=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)]))['frames']
times=[float(f['best_effort_timestamp_time']) for f in frames]
max_gap=max(y-x for x,y in zip(times,times[1:]))
samples=audit['samples'];wall_gap=max((b['wall']-a['wall'])/1000 for a,b in zip(samples,samples[1:]))
checks={'capture_frames_at_least_160':len(times)>=160,'capture_gap_below_150ms':max_gap<.15,'duration_approx_eight_seconds':7.7<times[-1]<8.15,'normal_time_scale':all(s['timeScale']==1 for s in samples),'contains_walk_and_trot':all(mode in [s['mode'] for s in samples] for mode in ['walk','trot']),'run_speed_and_blend':abs(running['speed']-.9)<.005 and running['cat']['gait']['runBlend']>.99,'surface_candidate_disabled':running['cat']['surfaceSkin']['enabled'] is False,'ends_stopped':state['speed']==0 and not state['walking'],'no_browser_errors':not errors}
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'frames':len(times),'duration':times[-1],'maxFrameGap':max_gap,'rafSamples':len(samples),'maxRafGap':wall_gap,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'captureAudit':audit,'runningState':running,'finalState':state,'scope':'Actual browser canvas at timeScale 1, not an accelerated or slowed clip. Visual quality reviewed separately.'}
(ASSETS/f'{PREFIX}-motion-quality-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['captureAudit','runningState','finalState']},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Motion capture quality failed')
