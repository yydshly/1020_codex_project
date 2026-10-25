"""Four bounded same-time V9/V10 paw captures and short real-time motion checks."""
import base64,hashlib,json
from datetime import datetime,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets';PREFIX='cat-v10-paw-review'
files=list((ROOT/'web').glob('cat-v10*.js'))+list((ROOT/'web').glob('cat-v10*.html'))
hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes();errors=[];captures=[];checks={}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
 page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
 page.goto('http://127.0.0.1:8062/cat-v10-paw-study.html',wait_until='networkidle')
 page.wait_for_function('window.__catFormStudy?.getState().candidatesReady',timeout=90000)
 for phase in [.25,.75]:
  page.evaluate('phase=>window.__catFormStudy.seek("run",phase)',phase)
  for variant in ['baseline','current']:
   page.locator(f'[data-variant="{variant}"]').click()
   capture=page.evaluate('()=>({state:window.__catFormStudy.getState(),data:document.querySelector("#viewport canvas").toDataURL("image/png")})')
   filename=f'{PREFIX}-run-{int(phase*100):02d}-side-{variant}.png'
   (ASSETS/filename).write_bytes(base64.b64decode(capture.pop('data').split(',',1)[1]))
   captures.append({'phase':phase,'variant':variant,'path':filename,**capture})
 page.goto('http://127.0.0.1:8062/cat-v10-gait-study.html',wait_until='networkidle')
 page.wait_for_function('window.__catFaceStudy?.getState().ready',timeout=90000)
 page.locator('[data-speed="0.90"]').click();page.locator('#walk').click();page.wait_for_timeout(2500)
 motion=page.evaluate('''()=>new Promise(resolve=>{const start=performance.now(),samples=[];function frame(){const s=window.__catFaceStudy.getState();samples.push({wall:performance.now(),speed:s.speed,cat:s.cat});if(performance.now()-start<3000)requestAnimationFrame(frame);else resolve(samples);}requestAnimationFrame(frame);})''')
 page.locator('#walk').click();page.wait_for_timeout(1200);stopped=page.evaluate('window.__catFaceStudy.getState()')
 page.locator('#previous').click();page.locator('#walk').click();page.wait_for_timeout(2200);previous=page.evaluate('window.__catFaceStudy.getState()')
 page.locator('#walk').click();page.wait_for_timeout(800)
 browser.close()
checks['both_variants_loaded']=all(c['state']['availability'].get(v)=='ready' for c in captures for v in ['baseline','current'])
checks['same_time_camera_phase']=all(captures[i]['state']['camera']==captures[i+1]['state']['camera'] and captures[i]['state']['time']==captures[i+1]['state']['time'] and abs(captures[i]['state']['cats']['baseline']['gait']['phase']-captures[i]['state']['cats']['current']['gait']['phase'])<1e-7 for i in [0,2])
checks['phase_hits_target']=all(abs(c['state']['cats']['baseline']['gait']['phase']-c['phase'])<1e-5 for c in captures)
checks['public_current_trots']=all(s['cat']['variant']=='current' and s['cat']['gait']['mode']=='trot' and abs(s['speed']-.9)<.005 for s in motion)
checks['feet_finite_and_reachable']=all(all(all(abs(x)<1e5 for x in f['renderedWorld']) and f['reachError']<.015 for f in s['cat']['feet']) for s in motion)
checks['stops_and_lands']=stopped['speed']==0 and all(f['stance'] for f in stopped['cat']['feet'])
checks['previous_comparison_allows_run']=previous['mode']=='previous' and abs(previous['speed']-.9)<.005
checks['no_browser_errors']=not errors;checks['runtime_frozen']=before==hashes()
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'captures':captures,'motion':motion,'stopped':stopped,'previous':previous,'sourcesBefore':before,'sourcesAfter':hashes(),'scope':'Same-time paw screenshots with intentionally different paw/IK matrices; public normal-speed motion and stop. Visual naturalness is reviewed separately.'}
(ASSETS/f'{PREFIX}-browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'checks':checks,'errors':errors,'motionFrames':len(motion),'maxReach':max(s['cat']['gait']['maxReachError'] for s in motion)},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('V10 paw browser check failed')
