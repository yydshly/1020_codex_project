"""Save before/after surface pixels with identical V9 skeleton pose and camera."""
import argparse
import base64
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets'
parser=argparse.ArgumentParser();parser.add_argument('--prefix',default='cat-v9-surface-release');args=parser.parse_args();PREFIX=args.prefix
files=list((ROOT/'web').glob('cat-v9*.js'))+list((ROOT/'web/models').glob('cat-v9*'))
hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes();errors=[];states={};checks={}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
    page=browser.new_page(viewport={'width':1100,'height':750},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
    page.goto('http://127.0.0.1:8062/cat-v9-surface-audit.html',wait_until='networkidle')
    page.wait_for_function('window.__catSurfaceAudit?.getState().ready',timeout=90000)
    for view in ['side','threequarter']:
        page.locator(f'[data-view="{view}"]').click()
        for surface in ['before','after']:
            page.locator(f'[data-surface="{surface}"]').click()
            capture=page.evaluate('()=>({state:window.__catSurfaceAudit.getState(),data:document.querySelector("#viewport canvas").toDataURL("image/png")})')
            filename=f'{PREFIX}-{view}-{surface}.png'
            (ASSETS/filename).write_bytes(base64.b64decode(capture.pop('data').split(',',1)[1]));capture['path']=filename;states[f'{view}_{surface}']=capture
    browser.close()
checks['same_bone_pose']=all(s['state']['maxBoneMatrixDifference']<1e-10 for s in states.values())
checks['fixed_time_and_phase']=len({(s['state']['time'],s['state']['after']['gait']['phase']) for s in states.values()})==1
checks['same_cameras']=all(states[f'{v}_before']['state']['camera']==states[f'{v}_after']['state']['camera'] for v in ['side','threequarter'])
checks['no_browser_errors']=not errors;checks['runtime_frozen']=before==hashes()
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'states':states,'sourcesBefore':before,'sourcesAfter':hashes(),'scope':'Pixel pairs differ only in surface skin weights. Naturalness and surface quality require visual review.'}
(ASSETS/f'{PREFIX}-browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:report[k] for k in ['passed','checks','errors']},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Fixed-pose surface browser comparison failed')
