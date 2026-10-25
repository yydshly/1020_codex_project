"""Independent neutral-angle and live-roaming review for cat v3."""
import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'

def run(base, integration=True, video=False, prefix='cat-v3-asset', full_tour=False):
    errors=[]; checks={}; observations={}; started=time.perf_counter()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
        context=browser.new_context(viewport={'width':1100,'height':800},device_scale_factor=1)
        page=context.new_page();page.set_default_timeout(15000)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('console',lambda message:errors.append(message.text) if message.type=='error' and 'favicon' not in message.location.get('url','') else None)
        page.goto(base+'/cat-v3-study.html',wait_until='networkidle')
        page.wait_for_function('window.__catStudy?.getState().frames>3')
        state=lambda:page.evaluate('window.__catStudy.getState()')
        observations['initial']=state();checks['finite_geometry']=state()['geometry']['invalid']==0
        checks['standing_geometry_above_ground']=state()['geometry']['bounds']['min'][1]>=-.004
        checks['new_model_visible']=state()['mode']=='current'
        for view in ['front','side','threequarter','rear','face']:
            page.locator('[data-view="'+view+'"]').click();page.wait_for_timeout(150)
            page.screenshot(path=str(ASSETS/f'{prefix}-study-{view}.png'))
        page.locator('#previous').click();checks['previous_model_available']=state()['mode']=='previous'
        page.locator('[data-view="side"]').click();page.wait_for_timeout(150)
        page.screenshot(path=str(ASSETS/f'{prefix}-study-previous-side.png'))
        page.locator('#previous').click();page.locator('[data-view="threequarter"]').click()
        before=state();page.locator('#walk').click();page.wait_for_timeout(1500);moving=state()
        checks['walk_advances_actual_root']=moving['walking'] and moving['position'][2]>before['position'][2]+.3
        checks['walk_finite_geometry']=moving['geometry']['invalid']==0
        checks['walking_geometry_above_ground']=moving['geometry']['bounds']['min'][1]>=-.006
        if video:
            page.evaluate("""() => {const stream=document.querySelector('#viewport canvas').captureStream(24);const chunks=[];const r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2000000});window.__clip={r,stream,done:new Promise(resolve=>{r.ondataavailable=e=>chunks.push(e.data);r.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};})};r.start();}""")
            page.wait_for_timeout(4000)
            page.locator('#walk').click();page.wait_for_timeout(1000)
            data=page.evaluate('async()=>{window.__clip.r.stop();return await window.__clip.done;}')
            (ASSETS/f'{prefix}-study-walk.webm').write_bytes(base64.b64decode(data.split(',')[1]))
        else:page.locator('#walk').click();page.wait_for_timeout(900)
        settled=state();checks['stop_settles']=not settled['walking'] and settled['speed']==0
        observations['walking']=moving;observations['settled']=settled
        if integration:
            page.goto(base+'/roam-cat-v3.html',wait_until='networkidle');page.locator('#start').click()
            page.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>3',timeout=60000)
            first=page.evaluate('window.__canalRoam.getState()');checks['street_loads_walkable_cat']=first['walkable']
            page.screenshot(path=str(ASSETS/f'{prefix}-street-front.png'))
            page.locator('#tour').click()
            if full_tour:
                page.evaluate("""() => {const audit={frames:0,allWalkable:true,maxReachError:0};window.__catTourAudit=audit;function sample(){const s=window.__canalRoam.getState();audit.frames++;audit.allWalkable&&=s.walkable;for(const foot of s.cat?.feet||[])if(foot.stance)audit.maxReachError=Math.max(audit.maxReachError,foot.reachError||0);if(s.tour)requestAnimationFrame(sample);}requestAnimationFrame(sample);}""")
            page.wait_for_timeout(2500)
            moving=page.evaluate('window.__canalRoam.getState()');checks['street_demo_walks']=moving['tour'] and moving['distance']>first['distance']+.5 and moving['walkable']
            observations['street']={'initial':first,'moving':moving}
            if full_tour:
                page.wait_for_function('!window.__canalRoam.getState().tour',timeout=45000);page.wait_for_timeout(900)
                final=page.evaluate('window.__canalRoam.getState()');audit=page.evaluate('window.__catTourAudit')
                checks['whole_sample_return_completes']=not final['tour'] and 15<final['distance']-first['distance']<17 and audit['allWalkable']
                checks['stance_foot_reach_error_under_25mm']=audit['maxReachError']<.025
                observations['street']['final']=final;observations['street']['full_tour_audit']=audit
            else:page.locator('#tour').click()
            context.close()
            mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            phone=mobile.new_page();phone.set_default_timeout(15000)
            phone.on('pageerror',lambda error:errors.append('mobile: '+str(error)))
            phone.on('console',lambda message:errors.append('mobile: '+message.text) if message.type=='error' and 'favicon' not in message.location.get('url','') else None)
            phone.goto(base+'/roam-cat-v3.html',wait_until='networkidle');phone.locator('#start').click()
            phone.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>3',timeout=60000)
            initial_phone=phone.evaluate('window.__canalRoam.getState()')
            checks['mobile_loads_new_cat_asset']=initial_phone.get('cat',{}).get('version')=='asset-rig-03' and initial_phone['walkable']
            direction=phone.locator('[data-move="forward"]').bounding_box()
            checks['mobile_touch_controls_visible']=phone.locator('#touch-pad').is_visible() and direction['x']>=0 and direction['y']+direction['height']<=844
            phone.mouse.move(direction['x']+direction['width']/2,direction['y']+direction['height']/2);phone.mouse.down()
            try:phone.wait_for_function('(n)=>window.__canalRoam.getState().distance>n+.12',arg=initial_phone['distance'],timeout=15000)
            finally:phone.mouse.up()
            moved_phone=phone.evaluate('window.__canalRoam.getState()')
            checks['mobile_touch_moves_new_cat']=moved_phone['walkable'] and moved_phone['distance']>initial_phone['distance']+.1
            checks['mobile_no_horizontal_overflow']=phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
            phone.locator('#reset').click();phone.wait_for_timeout(500);phone.screenshot(path=str(ASSETS/f'{prefix}-mobile.png'))
            observations['mobile']={'initial':initial_phone,'moved':moved_phone};mobile.close()
        browser.close()
    checks['no_browser_or_shader_errors']=not errors
    report={'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'observations':observations,'seconds':round(time.perf_counter()-started,2),'scope':'Neutral orthographic angle review plus actual-root walk and optional street smoke test. These checks do not judge feline likeness automatically.'}
    (ASSETS/f'{prefix}-browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['passed','checks','errors','seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:raise RuntimeError('Cat v3 check failed')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:8062');parser.add_argument('--study-only',action='store_true');parser.add_argument('--video',action='store_true');parser.add_argument('--full-tour',action='store_true');parser.add_argument('--prefix',default='cat-v3-asset');args=parser.parse_args();run(args.base,not args.study_only,args.video,args.prefix,args.full_tour)
