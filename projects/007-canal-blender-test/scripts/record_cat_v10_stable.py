"""Bounded normal-speed V10 motion capture after other CPU/GPU work has ended."""
import argparse
import base64
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets'
parser=argparse.ArgumentParser();parser.add_argument('--prefix',default='cat-v10-release');args=parser.parse_args();PREFIX=args.prefix
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
    page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
    page.goto('http://127.0.0.1:8062/cat-v10-gait-study.html',wait_until='networkidle')
    page.wait_for_function('window.__catFaceStudy?.getState().frames>3',timeout=60000)
    page.locator('[data-attention="natural"]').click();page.locator('[data-blink="auto"]').click();page.locator('#walk').click();page.wait_for_timeout(1800)
    captured=page.evaluate('''()=>new Promise(resolve=>{const stream=document.querySelector('#viewport canvas').captureStream(30),chunks=[];
      const r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:3000000});
      const audit={start:performance.now(),samples:[],rafTimes:[]};let count=0,running;
      r.ondataavailable=e=>chunks.push(e.data);
      r.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const finalState=window.__catFaceStudy.getState();const f=new FileReader();f.onload=()=>resolve({encoded:f.result,audit,running,finalState});f.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};
      function frame(){if(r.state==='inactive')return;audit.rafTimes.push(performance.now());if(++count%6===0){const s=window.__catFaceStudy.getState();audit.samples.push({wall:performance.now(),elapsed:s.elapsed,speed:s.speed,phase:s.cat.gait.phase,timeScale:s.timeScale,mode:s.cat.gait.mode});}requestAnimationFrame(frame);}
      r.start();requestAnimationFrame(frame);
      setTimeout(()=>window.__catFaceStudy.setSpeed(.9),4100);
      setTimeout(()=>{running=window.__catFaceStudy.getState();},6700);
      setTimeout(()=>window.__catFaceStudy.setView('threequarter'),6900);
      setTimeout(()=>window.__catFaceStudy.setSpeed(.36),8400);
      setTimeout(()=>document.getElementById('walk').click(),9400);
      setTimeout(()=>r.stop(),11000);
    })''')
    encoded=captured['encoded'];audit=captured['audit'];running=captured['running'];state=captured['finalState']
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
samples=audit['samples'];wall_gap=max((b-a)/1000 for a,b in zip(audit['rafTimes'],audit['rafTimes'][1:]))
checks={'capture_frames_at_least_160':len(times)>=160,'capture_gap_below_150ms':max_gap<.15,'duration_approx_eight_seconds':7.7<times[-1]<8.15,'normal_time_scale':all(s['timeScale']==1 for s in samples),'contains_walk_and_trot':all(mode in [s['mode'] for s in samples] for mode in ['walk','trot']),'run_speed_and_blend':abs(running['speed']-.9)<.005 and running['cat']['gait']['runBlend']>.99,'accepted_current_variant':running['cat']['variant']=='current' and abs(running['cat']['continuousSkin']['sigma']-.008)<1e-9,'ends_stopped':state['speed']==0 and not state['walking'],'no_browser_errors':not errors}
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'frames':len(times),'duration':times[-1],'maxFrameGap':max_gap,'rafSamples':len(audit['rafTimes']),'maxRafGap':wall_gap,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'captureAudit':audit,'runningState':running,'finalState':state,'scope':'Actual browser canvas at timeScale 1; scheduled walk/run/stop controls avoid remote-control pauses. Only a three-second encoder warm-up is trimmed; timestamps preserved. Visual quality reviewed separately.'}
(ASSETS/f'{PREFIX}-motion-quality-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['captureAudit','runningState','finalState']},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Motion capture quality failed')
