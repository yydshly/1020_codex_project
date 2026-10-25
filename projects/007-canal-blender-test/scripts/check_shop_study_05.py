"""Actual ten-second V8 walk, manual turn, and stop in the unchanged street."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'
errors,checks=[],{}
old=json.loads((ASSETS/'shop-study-05-static-check.json').read_text())['old_sources_sha256']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
    page=browser.new_page(viewport={'width':1152,'height':720},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
    page.goto('http://127.0.0.1:8062/shop-study-05.html',wait_until='networkidle')
    page.locator('#start').click()
    page.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>3',timeout=60000)
    initial=page.evaluate('window.__canalRoam.getState()')
    checks['v8_roam_loads']=initial['version']=='shop-study-05' and initial['cat']['version']=='cat-gait-08'
    checks['same_street_geometry']=initial['asset']=='roam-02.glb' and initial['environment']['geometryBefore']==initial['environment']['geometryAfter']
    page.screenshot(path=str(ASSETS/'shop-study-05-follow.png'))
    page.evaluate("""()=>{const a={active:true,frames:0,allWalkable:true,finite:true,maxSpeed:0,maxReachError:0,maxAngularSpeed:0,maxBlink:0,start:performance.now()};window.__roamV8Audit=a;
      function sample(){if(!a.active)return;const s=window.__canalRoam.getState();a.frames++;a.allWalkable&&=s.walkable;
      a.finite&&=Object.values(s.position).every(Number.isFinite);a.maxSpeed=Math.max(a.maxSpeed,s.speed);
      a.maxReachError=Math.max(a.maxReachError,s.cat.gait.maxReachError);a.maxAngularSpeed=Math.max(a.maxAngularSpeed,Math.abs(s.cat.gait.angularSpeed||0));
      a.maxBlink=Math.max(a.maxBlink,s.cat.blink.amount);requestAnimationFrame(sample);}requestAnimationFrame(sample);}""")
    page.locator('#tour').click();page.wait_for_timeout(10000)
    walked=page.evaluate('window.__canalRoam.getState()')
    checks['actual_walk_moves']=walked['distance']-initial['distance']>2.5
    checks['walking_blink_runs']=walked['cat']['blink']['count']>=1
    page.screenshot(path=str(ASSETS/'shop-study-05-walking.png'))
    # An actual opposing input interrupts the tour and requests a turn.
    page.keyboard.down('s');page.wait_for_timeout(2200);page.keyboard.up('s');page.wait_for_timeout(1200)
    stopped=page.evaluate('window.__canalRoam.getState()')
    audit=page.evaluate('()=>{const a=window.__roamV8Audit;a.active=false;return {...a,durationMs:performance.now()-a.start};}')
    checks['manual_turn_interrupts_tour']=not stopped['tour'] and audit['maxAngularSpeed']>.3
    checks['release_stops_motion']=stopped['speed']<.005
    checks['navigation_and_contacts_valid']=audit['allWalkable'] and audit['finite'] and audit['maxSpeed']<=.365 and audit['maxReachError']<.025
    page.screenshot(path=str(ASSETS/'shop-study-05-after-turn.png'))
    browser.close()
checks['old_versions_preserved']=all(hashlib.sha256((ROOT/'web'/name).read_bytes()).hexdigest()==value for name,value in old.items())
checks['no_browser_or_shader_errors']=not errors
report={'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,
  'initial':initial,'walked':walked,'stopped':stopped,'audit':audit,'old_sources_sha256':old,
  'scope':'Actual walk, opposing manual turn, and stop with existing scene/navigation. This is not a device performance benchmark or a naturalness score.'}
(ASSETS/'shop-study-05-smoke-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:report[k] for k in ['passed','checks','errors','audit']},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('V8 roaming check failed; evidence saved')
