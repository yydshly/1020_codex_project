"""Exercise keyboard/touch running, walking, sharp turns and pause in street 07."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'
checks,errors,observations={},[],{}
files=list((ROOT/'web').glob('cat-v10*'))+list((ROOT/'web').glob('shop-study-07*'))+list((ROOT/'web/models').glob('cat-v10*'))
hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes()


def state(page):return page.evaluate('window.__canalRoam.getState()')


def open_street(page):
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
    page.goto('http://127.0.0.1:8062/shop-study-07.html',wait_until='networkidle')
    page.locator('#start').click();page.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>3',timeout=60000)


def look_along_street(page, default_yaw=-1.16):
    # Default camera points diagonally toward the shop; W alone eventually hits
    # its wall. Drag the real camera to align with the unobstructed pavement.
    box=page.locator('#world').bounding_box()
    x,y=box['x']+box['width']*.5,box['y']+box['height']*.5
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+(1.5707963267948966+default_yaw)/.006,y,steps=8);page.mouse.up()


try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
        context=browser.new_context(viewport={'width':1152,'height':720},device_scale_factor=1)
        page=context.new_page();open_street(page)
        initial=state(page);observations['initial']=initial
        checks['v10_street_loads']=initial['version']=='shop-study-07' and initial['cat']['version']=='cat-form-10' and initial['cat']['variant']=='current'
        checks['unchanged_street_geometry']=initial['asset']=='roam-02.glb' and initial['environment']['geometryBefore']==initial['environment']['geometryAfter']
        page.evaluate('''()=>{const a={active:true,stage:'tour',frames:0,allWalkable:true,allFinite:true,maxSpeed:0,maxReach:0,maxTurnSpeed:0,modes:[],start:performance.now()};window.__v9RoamAudit=a;
          function frame(){if(!a.active)return;const s=window.__canalRoam.getState();a.frames++;a.allWalkable&&=s.walkable;a.allFinite&&=Object.values(s.position).every(Number.isFinite);a.maxSpeed=Math.max(a.maxSpeed,s.speed);
            if(s.cat.gait.maxReachError>a.maxReach){a.maxReach=s.cat.gait.maxReachError;a.maxReachStage=a.stage;a.maxReachState=s;}
            if(Math.abs(s.cat.gait.angularSpeed)>.2)a.maxTurnSpeed=Math.max(a.maxTurnSpeed,s.speed);if(!a.modes.includes(s.cat.gait.mode))a.modes.push(s.cat.gait.mode);requestAnimationFrame(frame);}requestAnimationFrame(frame);}''')
        page.locator('#run-mode').click();page.wait_for_timeout(700)
        alone=state(page);checks['run_toggle_alone_does_not_move']=alone['runMode'] and alone['speed']==0 and alone['distance']==initial['distance']
        page.locator('#tour').click();page.wait_for_timeout(6500)
        touring=state(page);observations['runTour']=touring
        checks['tour_can_trot']=touring['speed']>.85 and touring['cat']['gait']['mode']=='trot' and touring['distance']-initial['distance']>1.8
        page.screenshot(path=str(ASSETS/'shop-study-07-running.png'))
        page.locator('#reset').click();page.wait_for_timeout(500)
        checks['reset_clears_run_toggle']=not state(page)['runMode']
        page.evaluate("window.__v9RoamAudit.stage='keyboard_along_street'")
        look_along_street(page)
        page.keyboard.down('Shift');page.keyboard.down('ArrowUp');page.wait_for_timeout(3800)
        keyboard_run=state(page);observations['keyboardRun']=keyboard_run
        checks['shift_direction_runs']=keyboard_run['speed']>.85 and keyboard_run['cat']['gait']['runBlend']>.95
        page.keyboard.up('Shift');page.wait_for_timeout(1300)
        walking=state(page);observations['keyboardWalk']=walking
        checks['release_shift_walks']=abs(walking['speed']-.36)<.01 and not walking['runRequested']
        page.keyboard.down('c');page.wait_for_timeout(1000)
        slow=state(page);observations['keyboardSlow']=slow
        checks['c_direction_slow_walks']=abs(slow['speed']-.24)<.01
        page.keyboard.up('c');page.keyboard.up('ArrowUp');page.wait_for_timeout(1200)
        checks['release_direction_stops']=state(page)['speed']<.005
        page.locator('#reset').click();page.wait_for_timeout(300);look_along_street(page)
        page.evaluate("window.__v9RoamAudit.stage='opposing_turn'")
        page.keyboard.down('Shift');page.keyboard.down('ArrowUp');page.wait_for_timeout(3000)
        page.keyboard.up('ArrowUp');page.keyboard.down('ArrowDown');page.wait_for_timeout(2600)
        page.keyboard.up('ArrowDown');page.keyboard.up('Shift');page.wait_for_timeout(1200)
        turned=state(page);observations['afterOpposingTurn']=turned
        checks['opposing_turn_and_stop']=turned['speed']<.005 and turned['walkable']
        # Deliberately retain the previous diagonal-camera wall-stop case as an
        # adversarial check, separate from unobstructed keyboard functionality.
        page.locator('#reset').click();page.wait_for_timeout(300)
        page.evaluate("window.__v9RoamAudit.stage='collision_hard_stop'")
        page.keyboard.down('Shift');page.keyboard.down('ArrowUp');page.wait_for_timeout(4700)
        wall=state(page);observations['collisionStop']=wall
        checks['collision_stops_on_walkable_ground']=wall['speed']<.005 and wall['walkable']
        page.keyboard.up('ArrowUp');page.keyboard.up('Shift');page.wait_for_timeout(900)
        page.evaluate("window.__v9RoamAudit.stage='pause_and_blur'")
        page.locator('#run-mode').click();page.locator('#pause').click()
        paused=state(page);observations['paused']=paused
        checks['pause_clears_run_and_input']=paused['paused'] and not paused['runMode'] and not paused['runRequested'] and paused['speed']==0
        page.locator('#resume').click();page.wait_for_timeout(700)
        checks['resume_does_not_move_by_itself']=state(page)['speed']==0
        page.locator('#run-mode').click();page.evaluate("window.dispatchEvent(new Event('blur'))")
        blurred=state(page);checks['blur_clears_run']=blurred['paused'] and not blurred['runMode'] and not blurred['runRequested']
        page.locator('#resume').click()
        audit=page.evaluate('()=>{const a=window.__v9RoamAudit;a.active=false;return {...a,durationMs:performance.now()-a.start};}')
        observations['audit']=audit
        checks['navigation_and_rig_valid']=audit['allWalkable'] and audit['allFinite'] and audit['maxReach']<.025 and audit['maxSpeed']<=.905
        checks['fast_turns_brake_first']=audit['maxTurnSpeed']<.42
        checks['desktop_no_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(ASSETS/'shop-study-07-follow.png'));context.close()
        mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
        page=mobile.new_page();open_street(page)
        checks['touch_pad_visible']=page.locator('#touch-pad').is_visible()
        look_along_street(page,default_yaw=-1.17)
        page.locator('#run-mode').tap()
        box=page.locator('[data-move="forward"]').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.wait_for_timeout(3800)
        mobile_run=state(page);observations['mobileRun']=mobile_run
        checks['touch_run_toggle_and_direction']=mobile_run['runMode'] and mobile_run['speed']>.85 and mobile_run['cat']['gait']['mode']=='trot'
        page.mouse.up();page.wait_for_timeout(1200)
        checks['touch_release_stops']=state(page)['speed']<.005
        checks['mobile_no_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(ASSETS/'shop-study-07-mobile.png'));mobile.close();browser.close()
except Exception as e:errors.append({'error':str(e),'traceback':traceback.format_exc()});checks['browser_completed']=False
after=hashes();checks['runtime_frozen']=before==after;checks['no_browser_errors']=not errors
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'sourcesBefore':before,'sourcesAfter':after,'observations':observations,'scope':'Actual keyboard and touch controls with existing scene/navigation. Naturalness and frame rate are separate reviews.'}
(ASSETS/'shop-study-07-smoke-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:report[k] for k in ['passed','checks','errors']},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Street 07 check failed; evidence saved')
