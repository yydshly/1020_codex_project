"""Check the V9 walk/trot controls in the actual browser and save phase pixels."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'


def run(prefix, record):
    checks, errors, observations = {}, [], {}
    sources=list((ROOT/'web').glob('cat-v9*')) + list((ROOT/'web').glob('shop-study-06*'))
    hashes=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    before=hashes()
    def state(page):return page.evaluate('window.__catFaceStudy.getState()')
    def shot(page,label):page.screenshot(path=str(ASSETS/f'{prefix}-{label}.png'))
    def phases(page,label):
        records=[]
        for phase in [0,.25,.5,.75]:
            sample=page.evaluate('''p=>new Promise((resolve,reject)=>{const start=performance.now();
              function frame(){const s=window.__catFaceStudy.getState(),d=Math.abs(s.cat.gait.phase-p);
                if(Math.min(d,1-d)<.03){resolve({phase:p,state:s,data:document.querySelector('#viewport canvas').toDataURL('image/png')});return;}
                if(performance.now()-start>6000){reject(Error('Gait phase did not advance'));return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);})''',phase)
            name=f'{prefix}-{label}-phase-{round(phase*100):02d}.png'
            (ASSETS/name).write_bytes(base64.b64decode(sample.pop('data').split(',',1)[1]));sample['path']=name;records.append(sample)
        return records
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
            context=browser.new_context(viewport={'width':1100,'height':900},device_scale_factor=1)
            page=context.new_page()
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)
            page.goto('http://127.0.0.1:8062/cat-v9-gait-study.html',wait_until='networkidle')
            page.wait_for_function('window.__catFaceStudy?.getState().frames>3',timeout=60000)
            initial=state(page);observations['initial']=initial
            checks['v9_loads']=initial['version']=='cat-v9-gait-study' and initial['cat']['version']=='cat-gait-09'
            checks['unchanged_triangle_budget']=initial['geometry']['triangles']==51976
            checks['initial_geometry_finite']=initial['geometry']['invalid']==0
            page.locator('[data-attention="off"]').click();page.locator('[data-blink="open"]').click()
            shot(page,'stand-side');page.locator('#walk').click();page.wait_for_timeout(2200)
            walk=state(page);observations['walk']=walk
            checks['normal_walk']=abs(walk['speed']-.36)<.005 and walk['cat']['gait']['mode']=='walk'
            observations['walkSidePhases']=phases(page,'walk-side')
            page.locator('[data-speed="0.90"]').click();page.wait_for_timeout(2400)
            trot=state(page);observations['trot']=trot
            checks['actual_trot_mode']=abs(trot['speed']-.9)<.005 and trot['cat']['gait']['mode']=='trot' and trot['cat']['gait']['runBlend']>.95
            sample=page.evaluate('''()=>new Promise(resolve=>{const a={frames:0,airborneFrames:0,maxReach:0,maxTargetError:0,allFinite:true,start:performance.now(),supportCounts:{},modes:[],samples:[]};
              function frame(){const s=window.__catFaceStudy.getState(),g=s.cat.gait;a.frames++;a.maxReach=Math.max(a.maxReach,g.maxReachError);if(!a.modes.includes(g.mode))a.modes.push(g.mode);
                let support=0;for(const f of s.cat.feet){const p=f.renderedWorld;a.allFinite&&=p.every(Number.isFinite);a.maxTargetError=Math.max(a.maxTargetError,Math.hypot(...p.map((v,i)=>v-f.world[i])));if(Math.abs(p[1]-s.position[1])<.003)support++;}
                a.supportCounts[support]=(a.supportCounts[support]||0)+1;if(support===0)a.airborneFrames++;
                a.samples.push({elapsed:s.elapsed,position:s.position,phase:g.phase,feet:s.cat.feet.map(f=>({name:f.name,stance:f.stance,y:f.renderedWorld[1],phase:f.phase}))});
                if(performance.now()-a.start>2200){resolve({...a,durationMs:performance.now()-a.start});return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);})''')
            observations['steadyRun']=sample
            checks['trot_contains_actual_airborne_frames']=sample['airborneFrames']>1
            support_pairs=[sorted(f['name'] for f in s['feet'] if abs(f['y']-s['position'][1])<.003) for s in sample['samples']]
            valid_pairs=[[],['fore_left','hind_right'],['fore_right','hind_left']]
            checks['trot_uses_diagonal_support_pairs']=all(pair in valid_pairs for pair in support_pairs) and all(pair in support_pairs for pair in valid_pairs[1:])
            checks['run_anchors_finite_and_reachable']=sample['allFinite'] and sample['maxTargetError']<.025 and sample['maxReach']<.025
            observations['runSidePhases']=phases(page,'run-side');shot(page,'running-side')
            page.locator('[data-view="threequarter"]').click();observations['runThreequarterPhases']=phases(page,'run-threequarter');shot(page,'running-threequarter')
            page.locator('[data-speed="0.36"]').click();page.wait_for_timeout(1800)
            back=state(page);observations['backToWalk']=back
            checks['run_to_walk_transition']=abs(back['speed']-.36)<.005 and back['cat']['gait']['runBlend']<.05
            page.locator('[data-speed="0.24"]').click();page.wait_for_timeout(1100)
            checks['slow_walk']=abs(state(page)['speed']-.24)<.005
            page.locator('[data-speed="0.90"]').click();page.wait_for_timeout(1500)
            page.locator('#previous').click();page.wait_for_timeout(1400)
            previous=state(page);observations['v8Comparison']=previous
            checks['v8_comparison_clamped_to_walk']=previous['mode']=='previous' and previous['requestedSpeed']==.36 and abs(previous['speed']-.36)<.005 and page.locator('[data-speed="0.90"]').is_disabled()
            page.locator('[data-view="side"]').click();observations['v8SidePhases']=phases(page,'v8-walk-side')
            page.locator('#previous').click();page.wait_for_timeout(1000)
            checks['return_restores_run_control']=not page.locator('[data-speed="0.90"]').is_disabled()
            page.locator('[data-attention="natural"]').click();page.locator('[data-blink="auto"]').click()
            if record:
                page.evaluate('''()=>{const stream=document.querySelector('#viewport canvas').captureStream(30),chunks=[];
                  const r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2400000});
                  window.__v9Clip={r,done:new Promise(resolve=>{r.ondataavailable=e=>chunks.push(e.data);r.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const f=new FileReader();f.onload=()=>resolve(f.result);f.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};})};r.start();setTimeout(()=>{if(r.state!=='inactive')r.stop();},8000);}''')
                page.wait_for_timeout(1200);page.locator('[data-speed="0.90"]').click();page.wait_for_timeout(3000)
                page.locator('[data-view="threequarter"]').click();page.wait_for_timeout(1600)
                page.locator('[data-speed="0.36"]').click();page.wait_for_timeout(1200)
                page.locator('#walk').click();page.wait_for_timeout(1800)
                encoded=page.evaluate('async()=>{if(window.__v9Clip.r.state!=="inactive")window.__v9Clip.r.stop();return await window.__v9Clip.done;}')
                clip=ASSETS/f'{prefix}-motion.webm';clip.write_bytes(base64.b64decode(encoded.split(',',1)[1]));observations['video']=str(clip)
                checks['motion_clip_saved']=clip.stat().st_size>10000
            else:page.locator('#walk').click();page.wait_for_timeout(1500)
            stopped=state(page);observations['stopped']=stopped
            checks['release_settles']=not stopped['walking'] and stopped['speed']==0 and stopped['cat']['gait']['maxReachError']<.025
            page.locator('[data-blink="closed"]').click();page.locator('[data-attention="left"]').click();page.wait_for_timeout(900)
            expression=state(page);observations['expression']=expression
            checks['head_blink_retained']=expression['cat']['blink']['amount']>.95 and expression['cat']['attention']['appliedDegrees']['yaw']<-1
            checks['desktop_no_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            context.close()
            mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            page=mobile.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://127.0.0.1:8062/cat-v9-gait-study.html',wait_until='networkidle');page.wait_for_function('window.__catFaceStudy?.getState().frames>3',timeout=60000)
            page.locator('[data-speed="0.90"]').tap();page.locator('#walk').tap();page.wait_for_timeout(2200)
            m=state(page);observations['mobile']=m;checks['mobile_run_controls']=m['walking'] and abs(m['speed']-.9)<.005
            checks['mobile_no_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth');shot(page,'mobile')
            mobile.close();browser.close()
    except Exception as e:errors.append({'error':str(e),'traceback':traceback.format_exc()});checks['browser_completed']=False
    after=hashes();checks['runtime_frozen']=before==after;checks['no_browser_errors']=not errors
    report={'checkedAt':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'sourcesBefore':before,'sourcesAfter':after,'observations':observations,'scope':'Real browser walk/run controls, actual bone-transformed sole anchors, same-speed V8 comparison, stop/head/blink/mobile. Visual naturalness is reviewed separately.'}
    (ASSETS/f'{prefix}-browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['passed','checks','errors']},ensure_ascii=False),flush=True)
    if not report['passed']:raise RuntimeError('V9 browser check failed; evidence saved')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--prefix',default='cat-v9-final');parser.add_argument('--no-video',action='store_true');args=parser.parse_args();run(args.prefix,not args.no_video)
