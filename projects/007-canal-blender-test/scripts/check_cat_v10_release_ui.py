"""Targeted V10 head/blink, same-speed comparison, and mobile study controls."""
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets';checks={};errors=[];observations={}
files=list((ROOT/'web').glob('cat-v10*.js'))+list((ROOT/'web').glob('cat-v10*.html'))
hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
 page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1);page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8062/cat-v10-gait-study.html',wait_until='networkidle');page.wait_for_function('window.__catFaceStudy?.getState().ready',timeout=60000)
 page.locator('[data-attention="right"]').click();page.wait_for_timeout(900);right=page.evaluate('window.__catFaceStudy.getState()');observations['headRight']=right['cat']['attention'];checks['head_turn_works']=right['cat']['attention']['appliedDegrees']['yaw']>1
 page.locator('[data-attention="down"]').click();page.wait_for_timeout(900);down=page.evaluate('window.__catFaceStudy.getState()');checks['head_down_works']=down['cat']['attention']['appliedDegrees']['pitch']>1
 page.locator('#blink-once').click()
 blink=page.evaluate('''()=>new Promise(resolve=>{const t=performance.now(),a=[];function f(){a.push(window.__catFaceStudy.getState().cat.blink.amount);if(performance.now()-t<450)requestAnimationFrame(f);else resolve(a);}requestAnimationFrame(f);})''')
 observations['blinkAmounts']=blink;checks['blink_closes_and_reopens']=max(blink)>.9 and blink[-1]<.05
 page.locator('[data-attention="natural"]').click();page.locator('[data-blink="auto"]').click();page.locator('[data-speed="0.90"]').click();page.locator('#walk').click();page.wait_for_timeout(2000)
 current=page.evaluate('window.__catFaceStudy.getState()');checks['current_runs']=current['cat']['variant']=='current' and abs(current['speed']-.9)<.005
 page.locator('#previous').click();page.wait_for_timeout(1600);previous=page.evaluate('window.__catFaceStudy.getState()');checks['v9_same_speed_run']=previous['mode']=='previous' and abs(previous['speed']-.9)<.005 and previous['requestedSpeed']==.9
 page.locator('#previous').click();page.wait_for_timeout(1600);returned=page.evaluate('window.__catFaceStudy.getState()');checks['returns_to_v10_run']=returned['mode']=='current' and returned['cat']['variant']=='current' and abs(returned['speed']-.9)<.005
 page.locator('#walk').click();page.wait_for_timeout(1200);stopped=page.evaluate('window.__catFaceStudy.getState()');checks['stops_with_four_feet']=stopped['speed']==0 and all(f['stance'] for f in stopped['cat']['feet'])
 checks['desktop_fits_height']=page.evaluate('document.body.getBoundingClientRect().height===innerHeight && document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200);checks['mobile_no_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks['mobile_controls_visible']=page.locator('[data-speed="0.90"]').is_visible() and page.locator('#previous').is_visible()
 page.screenshot(path=str(ASSETS/'cat-v10-release-mobile-study.png'),full_page=True)
 browser.close()
checks['runtime_frozen']=before==hashes();checks['no_browser_errors']=not errors
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'observations':observations,'sourcesBefore':before,'sourcesAfter':hashes()}
(ASSETS/'cat-v10-release-ui-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'checks':checks,'errors':errors},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('V10 targeted UI check failed')
