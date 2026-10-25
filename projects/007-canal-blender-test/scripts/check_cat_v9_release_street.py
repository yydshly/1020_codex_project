"""Targeted load/run/stop confirmation after rejecting surface skin candidates."""
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets'
files=list((ROOT/'web').glob('cat-v9*.js'))+list((ROOT/'web').glob('shop-study-06*'))
hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes();errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
    page=browser.new_page(viewport={'width':1152,'height':720},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
    page.goto('http://127.0.0.1:8062/shop-study-06.html',wait_until='networkidle')
    page.locator('#start').click();page.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>3',timeout=60000)
    initial=page.evaluate('window.__canalRoam.getState()')
    page.locator('#run-mode').click();page.locator('#tour').click()
    page.wait_for_function('window.__canalRoam.getState().speed>.89 && window.__canalRoam.getState().cat.gait.runBlend>.99',timeout=15000)
    page.wait_for_timeout(700)
    running=page.evaluate('window.__canalRoam.getState()')
    page.screenshot(path=str(ASSETS/'cat-v9-release-street-running.png'))
    page.locator('#tour').click();page.wait_for_function('window.__canalRoam.getState().speed<.005',timeout=5000);page.wait_for_timeout(900)
    stopped=page.evaluate('window.__canalRoam.getState()')
    browser.close()
checks={'loads_final_v9':initial['cat']['version']=='cat-gait-09','surface_candidate_disabled':all(s['cat']['surfaceSkin']['enabled'] is False for s in [initial,running,stopped]),'runs_at_point_nine':abs(running['speed']-.9)<.005 and running['cat']['gait']['runBlend']>.99 and running['cat']['gait']['mode']=='trot','stops':stopped['speed']<.005 and not stopped['tour'],'walkable':all(s['walkable'] for s in [initial,running,stopped]),'stopped_feet_reachable':stopped['cat']['gait']['maxReachError']<.015,'runtime_frozen':before==hashes(),'no_browser_errors':not errors}
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'sourcesBefore':before,'sourcesAfter':hashes(),'initial':initial,'running':running,'stopped':stopped,'scope':'Targeted confirmation of release default after turning off the rejected surface candidate. Earlier full street suite remains separate evidence.'}
(ASSETS/'cat-v9-release-street-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:report[k] for k in ['passed','checks','errors']},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Release street confirmation failed')
