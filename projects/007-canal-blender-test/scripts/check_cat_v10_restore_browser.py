"""Identical-pose V9 current / V10 candidate shape review, no old files changed."""
import argparse,base64,hashlib,json
from datetime import datetime,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets'
parser=argparse.ArgumentParser();parser.add_argument('--prefix',default='cat-v10-restore-review');parser.add_argument('--phases',default='0');parser.add_argument('--motions',default='run');args=parser.parse_args()
phases=[float(x) for x in args.phases.split(',')];motions=args.motions.split(',');variants=['current','restore']
files=list((ROOT/'web').glob('cat-v10*.js'))+list((ROOT/'web').glob('cat-v10*.html'))
hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes();errors=[];captures=[];checks={}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
 page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
 page.goto('http://127.0.0.1:8062/cat-v10-restore-study.html',wait_until='networkidle')
 page.wait_for_function('window.__catFormStudy?.getState().candidatesReady',timeout=90000)
 initial=page.evaluate('window.__catFormStudy.getState()')
 for motion in motions:
  for phase in phases:
   page.evaluate('s=>window.__catFormStudy.seek(s.motion,s.phase)',{'motion':motion,'phase':phase})
   for view in ['side','threequarter']:
    page.locator(f'[data-view="{view}"]').click()
    for variant in variants:
     page.locator(f'[data-variant="{variant}"]').click()
     capture=page.evaluate('()=>({state:window.__catFormStudy.getState(),data:document.querySelector("#viewport canvas").toDataURL("image/png")})')
     filename=f'{args.prefix}-{motion}-{int(phase*100):02d}-{view}-{variant}.png'
     (ASSETS/filename).write_bytes(base64.b64decode(capture.pop('data').split(',',1)[1]))
     captures.append({'motion':motion,'phase':phase,'view':view,'variant':variant,'path':filename,**capture})
 page.screenshot(path=str(ASSETS/f'{args.prefix}-page.png'))
 browser.close()
checks['variants_ready']=all(initial['availability'].get(v)=='ready' for v in variants)
checks['exact_same_bones']=all(all(x==0 for x in c['state']['boneDifferences'].values()) for c in captures)
checks['unchanged_triangle_count']=all(c['state']['cats'][v]['geometry']['triangles']==51976 for c in captures for v in variants)
checks['no_invalid_vertices']=all(c['state']['cats'][v]['geometry']['invalid']==0 for c in captures for v in variants)
checks['camera_pose_fixed_per_pair']=all(captures[i]['state']['camera']==captures[i+1]['state']['camera'] and captures[i]['state']['time']==captures[i+1]['state']['time'] for i in range(0,len(captures),2))
checks['phase_hits_target']=all(min(abs(c['state']['cats']['current']['gait']['phase']-c['phase']),1-abs(c['state']['cats']['current']['gait']['phase']-c['phase']))<1e-5 for c in captures)
checks['no_browser_errors']=not errors
checks['runtime_frozen']=before==hashes()
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'initial':initial,'captures':captures,'sourcesBefore':before,'sourcesAfter':hashes(),'scope':'Same-pose captures verify comparison validity only; visible quality must be judged separately.'}
(ASSETS/f'{args.prefix}-browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'checks':checks,'errors':errors,'captures':len(captures)},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('V10 same-pose comparison checks failed')
