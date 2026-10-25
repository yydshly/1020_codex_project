"""Touch-only follow-up: wait for the actual movement state, not a fixed wall delay."""
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets';checks={};errors=[]
files=list((ROOT/'web').glob('cat-v10*'))+list((ROOT/'web').glob('shop-study-07*'))
hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8062/shop-study-07.html',wait_until='networkidle');page.locator('#start').tap();page.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>5',timeout=60000)
 box=page.locator('#world').bounding_box();x,y=box['x']+box['width']*.5,box['y']+box['height']*.5
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+(1.5707963267948966-1.17)/.006,y,steps=8);page.mouse.up()
 page.locator('#run-mode').tap();button=page.locator('[data-move="forward"]');box=button.bounding_box();x,y=box['x']+box['width']/2,box['y']+box['height']/2
 page.evaluate('''()=>{window.__touchAudit={samples:[],start:window.__canalRoam.getState().position};window.__touchAudit.timer=setInterval(()=>{const s=window.__canalRoam.getState();window.__touchAudit.samples.push({speed:s.speed,position:s.position,runMode:s.runMode,gait:s.cat.gait.mode});},100);}''')
 session=context.new_cdp_session(page);session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 page.wait_for_timeout(8000)
 history=page.evaluate('''()=>{clearInterval(window.__touchAudit.timer);return window.__touchAudit;}''');max_speed=max(s['speed'] for s in history['samples']);start=history['start'];max_distance=max(((s['position']['x']-start['x'])**2+(s['position']['z']-start['z'])**2)**.5 for s in history['samples'])
 running=page.evaluate('window.__canalRoam.getState()');checks['touch_pad_visible']=page.locator('#touch-pad').is_visible();checks['touch_run_toggle_and_direction']=running['runMode'] and max_speed>.65 and max_distance>.1
 page.screenshot(path=str(ASSETS/'cat-v10-release-touch-running.png'))
 session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_function('window.__canalRoam.getState().speed<.005',timeout=5000);page.wait_for_timeout(500)
 stopped=page.evaluate('window.__canalRoam.getState()');checks['touch_release_stops']=stopped['speed']<.005;checks['stops_walkable']=stopped['walkable'];checks['mobile_no_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 context.close();browser.close()
checks['runtime_frozen']=before==hashes();checks['no_browser_errors']=not errors
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'running':running,'stopped':stopped,'history':history,'maximumSpeed':max_speed,'maximumDisplacement':max_distance,'sourcesBefore':before,'sourcesAfter':hashes(),'scope':'Real touchStart/touchEnd events on touch controls. Uses the historical speed and displacement while held, so eventual obstacle braking cannot invalidate successful control.'}
(ASSETS/'cat-v10-release-touch-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'checks':checks,'speed':running['speed'],'maximumSpeed':max_speed,'maximumDisplacement':max_distance,'errors':errors},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('V10 mobile touch follow-up failed')
