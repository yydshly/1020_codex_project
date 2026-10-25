"""One bounded, ten-second live roaming smoke check for the new V6 cat."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT/'assets'
errors, checks = [], {}
old = json.loads((ASSETS/'shop-study-03-static-check.json').read_text())['old_sources_sha256']
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
    page = browser.new_page(viewport={'width':1152,'height':720}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type=='error' and 'favicon' not in message.location.get('url','') else None)
    page.goto('http://127.0.0.1:8062/shop-study-03.html',wait_until='networkidle')
    page.locator('#start').click()
    page.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>3', timeout=60000)
    initial = page.evaluate('window.__canalRoam.getState()')
    checks['new_entry_and_eyelids_load'] = initial['version']=='shop-study-03' and initial['cat']['blink']['kind']=='separate-skinned-eyelids'
    checks['same_environment_and_geometry'] = initial['asset']=='roam-02.glb' and initial['environment']['geometryBefore']==initial['environment']['geometryAfter'] and initial['cat']['blink']['baseGeometryUnchanged']
    page.screenshot(path=str(ASSETS/'shop-study-03-follow.png'))
    page.locator('#tour').click()
    page.evaluate("""() => {const a={active:true,frames:0,allWalkable:true,finite:true,maxAmount:0,maxSpeed:0,maxReachError:0,maxHeadYaw:0,start:performance.now()};window.__roamV6Audit=a;
      function sample(){if(!a.active)return;const s=window.__canalRoam.getState();a.frames++;a.allWalkable&&=s.walkable;a.finite&&=Object.values(s.position).every(Number.isFinite);
      a.maxAmount=Math.max(a.maxAmount,s.cat.blink.amount);a.maxSpeed=Math.max(a.maxSpeed,s.speed);a.maxReachError=Math.max(a.maxReachError,s.cat.gait.maxReachError);a.maxHeadYaw=Math.max(a.maxHeadYaw,Math.abs(s.cat.attention.appliedDegrees.yaw));requestAnimationFrame(sample);}requestAnimationFrame(sample);}""")
    page.wait_for_timeout(10000)
    final = page.evaluate('window.__canalRoam.getState()')
    audit = page.evaluate('()=>{const a=window.__roamV6Audit;a.active=false;return {...a,durationMs:performance.now()-a.start};}')
    checks['actual_tour_walks_ten_seconds'] = audit['durationMs']>=9900 and final['distance']-initial['distance']>4
    checks['auto_blink_occurs_during_walk'] = final['cat']['blink']['count']>=1 and audit['maxAmount']>.9
    checks['head_attention_occurs_during_walk'] = audit['maxHeadYaw']>.5
    checks['navigation_and_motion_valid'] = audit['allWalkable'] and audit['finite'] and audit['maxSpeed']<=.61 and audit['maxReachError']<.025
    page.locator('#tour').click()
    browser.close()

checks['old_entry_and_environment_unchanged'] = all(hashlib.sha256((ROOT/'web'/name).read_bytes()).hexdigest()==value for name,value in old.items())
checks['no_browser_or_shader_errors'] = not errors
report = {'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'initial':initial,'final':final,'audit':audit,'old_sources_sha256':old,'scope':'Ten-second actual roaming integration, not a full performance benchmark or an anatomical likeness claim.'}
(ASSETS/'shop-study-03-smoke-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({key:report[key] for key in ['passed','checks','errors','audit']},ensure_ascii=False),flush=True)
if not report['passed']:
    raise RuntimeError('V6 roaming smoke check failed')
