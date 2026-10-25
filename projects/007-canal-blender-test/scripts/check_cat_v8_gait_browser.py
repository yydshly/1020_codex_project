"""Bounded browser check of V8 gait at matched speeds and real phase samples."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import traceback
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT/'assets'
PREFIX = 'cat-v8-gait-final'


def state(page):
    return page.evaluate('window.__catFaceStudy.getState()')


def run(base, record=True):
    checks, errors, observations = {}, [], {}
    sources = list((ROOT/'web').glob('cat-v8*')) + [ROOT/'web/cat-v7-head.js', ROOT/'web/cat-v7-head-skin.js', ROOT/'web/cat-v6-lid-material.js', ROOT/'web/models/cat-v6-lid-surface.json', ROOT/'web/models/cat-v3-rig.glb']
    hashes = lambda: {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    observations['sourcesBefore'] = hashes()

    def screenshot(page, name):
        page.screenshot(path=str(ASSETS/f'{PREFIX}-{name}.png'))

    def monitor(page, label):
        page.on('pageerror', lambda e: errors.append({'page':label,'message':str(e)}))
        page.on('console', lambda m: errors.append({'page':label,'message':m.text}) if m.type=='error' and 'favicon' not in m.location.get('url','') else None)

    def phase_frames(page, label):
        records = []
        for target in [0, .25, .5, .75]:
            # Capture pixels and the state in the same animation-frame callback.
            # The page's render loop was registered before this observer.
            shot = page.evaluate("""target => new Promise((resolve,reject)=>{
              const start=performance.now();function sample(){const s=window.__catFaceStudy.getState();
                const p=s.cat.gait.phase,d=Math.abs(p-target);if(Math.min(d,1-d)<.025){
                  resolve({target,phase:p,state:s,data:document.querySelector('#viewport canvas').toDataURL('image/png')});return;}
                if(performance.now()-start>7000){reject(Error('Gait phase did not advance'));return;}requestAnimationFrame(sample);
              }requestAnimationFrame(sample);})""", target)
            filename = f'{PREFIX}-{label}-phase-{round(target*100):02d}.png'
            (ASSETS/filename).write_bytes(base64.b64decode(shot.pop('data').split(',',1)[1]))
            shot['path'] = filename
            records.append(shot)
        return records

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
            context = browser.new_context(viewport={'width':1100,'height':900},device_scale_factor=1)
            page = context.new_page();monitor(page,'desktop')
            page.goto(base.rstrip('/')+'/cat-v8-gait-study.html',wait_until='networkidle')
            page.wait_for_function('window.__catFaceStudy?.getState().frames>3',timeout=60000)
            initial=state(page);observations['initial']=initial
            checks['v8_study_loads']=initial['version']=='cat-v8-gait-study' and initial['mode']=='current'
            checks['default_side_and_speed']=initial['view']=='side' and initial['requestedSpeed']==.36
            checks['same_triangle_budget']=initial['geometry']['triangles']==51976
            checks['finite_initial_geometry']=initial['geometry']['invalid']==0
            page.locator('[data-attention="off"]').click();page.locator('[data-blink="open"]').click()
            screenshot(page,'standing-side')
            page.locator('#walk').click();page.wait_for_timeout(2200)
            normal=state(page);observations['normalWalk']=normal
            checks['normal_speed_works']=normal['walking'] and abs(normal['speed']-.36)<.005 and normal['position'][2]>.5
            checks['normal_contacts_valid']=normal['cat']['gait']['maxReachError']<.025
            screenshot(page,'walking-side')
            observations['sidePhases']=phase_frames(page,'side')
            page.locator('[data-view="threequarter"]').click();page.wait_for_timeout(250)
            screenshot(page,'walking-threequarter')
            observations['threequarterPhases']=phase_frames(page,'threequarter')
            page.locator('[data-speed="0.24"]').click();page.wait_for_timeout(1100)
            slow=state(page);observations['slowWalk']=slow
            checks['slow_speed_works']=abs(slow['speed']-.24)<.005 and slow['cat']['gait']['maxReachError']<.025
            page.locator('[data-speed="0.60"]').click();page.wait_for_timeout(1100)
            fast=state(page)
            observations['pressureDiagnostic']={'requested':.60,'supportedNormalSpeed':False,
              'note':'0.60 is an explicit stress diagnostic; gait quality at this speed is not an acceptance gate or a supported-speed claim.',
              'controlReachedSpeed':abs(fast['speed']-.60)<.005,'finiteGeometry':fast['geometry']['invalid']==0,'state':fast}
            page.locator('[data-speed="0.36"]').click();page.wait_for_timeout(800)
            a=state(page);page.wait_for_timeout(1500);b=state(page)
            page.locator('#slow-motion').click()
            c=state(page);page.wait_for_timeout(1500);d=state(page)
            rate_normal=(b['position'][2]-a['position'][2])/(b['elapsed']-a['elapsed'])
            rate_slow=(d['position'][2]-c['position'][2])/(d['elapsed']-c['elapsed'])
            ratio=(d['elapsed']-c['elapsed'])/(b['elapsed']-a['elapsed'])
            observations['slowMotion']={'normalMetresPerSimSecond':rate_normal,'halfMetresPerSimSecond':rate_slow,'elapsedRatio':ratio,'state':d}
            checks['slow_motion_scales_whole_simulation']=d['timeScale']==.5 and .36<ratio<.65 and abs(rate_normal-.36)<.01 and abs(rate_slow-.36)<.01
            page.locator('#slow-motion').click()
            page.locator('[data-view="side"]').click()
            page.locator('#previous').click();page.wait_for_timeout(1400)
            previous=state(page);observations['previous']=previous
            checks['v7_matched_speed_comparison']=previous['mode']=='previous' and previous['view']=='side' and previous['requestedSpeed']==.36 and abs(previous['speed']-.36)<.005
            screenshot(page,'v7-walking-side')
            observations['v7SidePhases']=phase_frames(page,'v7-side')
            page.locator('#previous').click();page.wait_for_timeout(1400)
            page.locator('[data-attention="natural"]').click();page.locator('[data-blink="auto"]').click()
            if record:
                page.evaluate("""()=>{const stream=document.querySelector('#viewport canvas').captureStream(30),chunks=[];
                  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2400000});
                  window.__gaitClip={recorder,done:new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{
                    stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);
                    reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};})};recorder.start();}""")
                page.wait_for_timeout(3000)
                page.wait_for_timeout(3300)
                page.locator('[data-view="threequarter"]').click();page.wait_for_timeout(1600)
                page.locator('#walk').click();page.wait_for_timeout(2000)
                page.locator('#walk').click();page.wait_for_timeout(1000)
                encoded=page.evaluate('async()=>{window.__gaitClip.recorder.stop();return await window.__gaitClip.done;}')
                raw=ASSETS/f'{PREFIX}-motion-raw.webm';raw.write_bytes(base64.b64decode(encoded.split(',',1)[1]))
                clip=ASSETS/f'{PREFIX}-motion.webm'
                subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-ss','3','-i',str(raw),'-t','8','-an','-c:v','libvpx-vp9','-crf','28','-b:v','0','-threads','2','-fps_mode','vfr','-y',str(clip)],check=True)
                frames=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','frame=best_effort_timestamp_time','-of','json',str(clip)]))['frames']
                times=[float(f['best_effort_timestamp_time']) for f in frames]
                observations['video']={'path':str(clip),'duration':times[-1],'frames':len(times),'maxFrameGap':max(y-x for x,y in zip(times,times[1:]))}
                checks['bounded_motion_clip_saved']=clip.stat().st_size>10000 and times[-1]<=8.05
            page.locator('#walk').click();page.wait_for_timeout(1400)
            stopped=state(page);observations['stopped']=stopped
            checks['stop_settles']=not stopped['walking'] and stopped['speed']==0 and stopped['cat']['gait']['maxReachError']<.025
            page.locator('[data-blink="closed"]').click();page.locator('[data-attention="left"]').click();page.wait_for_timeout(900)
            expression=state(page);observations['expression']=expression
            checks['head_and_blink_retained']=expression['cat']['blink']['amount']>.95 and expression['cat']['attention']['appliedDegrees']['yaw'] < -1
            checks['desktop_no_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            context.close()
            mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            page=mobile.new_page();monitor(page,'mobile')
            page.goto(base.rstrip('/')+'/cat-v8-gait-study.html',wait_until='networkidle')
            page.wait_for_function('window.__catFaceStudy?.getState().frames>3',timeout=60000)
            page.locator('[data-speed="0.24"]').tap();page.locator('#slow-motion').tap();page.locator('#walk').tap();page.wait_for_timeout(1800)
            m=state(page);observations['mobile']=m
            checks['mobile_controls_work']=m['walking'] and m['requestedSpeed']==.24 and m['timeScale']==.5
            checks['mobile_no_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            screenshot(page,'mobile');mobile.close();browser.close()
    except Exception as e:
        errors.append({'message':str(e),'traceback':traceback.format_exc()});checks['browser_completed']=False
    old=json.loads((ASSETS/'shop-study-05-static-check.json').read_text())['old_sources_sha256']
    checks['old_pages_unchanged']=all(hashlib.sha256((ROOT/'web'/name).read_bytes()).hexdigest()==value for name,value in old.items())
    observations['sourcesAfter']=hashes()
    checks['runtime_frozen']=observations['sourcesBefore']==observations['sourcesAfter']
    checks['no_browser_or_shader_errors']=not errors
    report={'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'observations':observations,
      'scope':'Actual gait controls, matched-speed V7 comparison, phase pixels, stop/start, head/blink, and mobile. Visual plausibility is reviewed separately.'}
    (ASSETS/f'{PREFIX}-browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['passed','checks','errors']},ensure_ascii=False),flush=True)
    if not report['passed']:raise RuntimeError('V8 browser check failed; evidence saved')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:8062');parser.add_argument('--prefix',default=PREFIX);parser.add_argument('--no-video',action='store_true');args=parser.parse_args()
    PREFIX=args.prefix;run(args.base,not args.no_video)
