"""Bounded actual-browser checks and views of the additive V7 head correction."""
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
ASSETS = ROOT / 'assets'
PREFIX = 'cat-v7-head-final'


def state(page):
    return page.evaluate('window.__catFaceStudy.getState()')


def run(base, record=True):
    errors, checks, observations = [], {}, {}
    paths = [ROOT/'web'/p for p in ['cat-v7-head.js', 'cat-v7-head-skin.js', 'cat-v7-head-study.js', 'cat-v7-head-study.html', 'cat-v6-face.js', 'cat-v6-lid-material.js', 'models/cat-v6-lid-surface.json', 'models/cat-v3-rig.glb']]
    source_hashes = lambda: {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.exists()}
    observations['sourcesBefore'] = source_hashes()

    def screenshot(page, suffix):
        page.screenshot(path=str(ASSETS/f'{PREFIX}-{suffix}.png'))

    def monitor(page, label):
        page.on('pageerror', lambda e: errors.append({'page': label, 'message': str(e)}))
        page.on('console', lambda m: errors.append({'page': label, 'message': m.text}) if m.type == 'error' and 'favicon' not in m.location.get('url', '') else None)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'])
            context = browser.new_context(viewport={'width': 1100, 'height': 800}, device_scale_factor=1)
            page = context.new_page(); monitor(page, 'desktop')
            page.goto(base.rstrip('/')+'/cat-v7-head-study.html', wait_until='networkidle')
            page.wait_for_function('window.__catFaceStudy?.getState().frames>3', timeout=60000)
            initial = state(page); observations['initial'] = initial
            checks['v7_study_loads'] = initial['version'] == 'cat-v7-head-study' and initial['mode'] == 'current'
            checks['default_view_shows_whole_body'] = initial['view'] == 'threequarter'
            checks['finite_geometry'] = initial['geometry']['invalid'] == 0
            checks['honest_scope_label'] = '头颈朝向修正、转头与眨眼 · 嘴部暂未制作' in page.locator('header').inner_text()
            page.locator('[data-attention="off"]').click()
            page.locator('[data-blink="open"]').click(); page.wait_for_timeout(600)
            for view in ['front', 'side', 'threequarter', 'face', 'eyeSide']:
                page.locator(f'[data-view="{view}"]').click(); page.wait_for_timeout(250)
                observations[view] = state(page)
                screenshot(page, view)
            page.locator('[data-view="face"]').click()
            for blink in ['half', 'closed', 'open']:
                page.locator(f'[data-blink="{blink}"]').click(); page.wait_for_timeout(200)
                s = state(page); observations[blink] = s
                target = {'half': .5, 'closed': 1, 'open': 0}[blink]
                checks[f'{blink}_control_works'] = abs(s['cat']['blink']['amount']-target)<.03 and s['geometry']['invalid']==0
                screenshot(page, blink)
            page.locator('[data-blink="closed"]').click()
            page.locator('[data-view="eyeSide"]').click(); page.wait_for_timeout(200)
            screenshot(page, 'side-closed')
            page.locator('[data-blink="open"]').click()
            page.locator('[data-view="face"]').click()
            for action in ['left', 'right', 'down']:
                page.locator(f'[data-attention="{action}"]').click(); page.wait_for_timeout(1000)
                observations[action] = state(page)
                screenshot(page, action)
            checks['manual_head_controls_work'] = (observations['left']['cat']['attention']['appliedDegrees']['yaw'] < -1 and observations['right']['cat']['attention']['appliedDegrees']['yaw'] > 1 and observations['down']['cat']['attention']['appliedDegrees']['pitch'] > 1)
            page.locator('[data-attention="off"]').click(); page.wait_for_timeout(700)
            page.locator('#previous').click(); page.wait_for_timeout(700)
            previous = state(page); observations['previous'] = previous
            checks['v6_comparison_loads'] = previous['mode']=='previous' and previous['cat']['attention']['version']=='head-attention-04'
            checks['v6_half_remains_available'] = not page.locator('[data-blink="half"]').is_disabled()
            for view in ['front', 'side', 'threequarter', 'face']:
                page.locator(f'[data-view="{view}"]').click(); page.wait_for_timeout(200)
                screenshot(page, 'v6-'+view)
            page.locator('#previous').click()
            page.locator('[data-attention="natural"]').click()
            page.locator('[data-blink="auto"]').click()
            page.locator('[data-view="threequarter"]').click()
            before = state(page)
            page.locator('#walk').click(); page.wait_for_timeout(3500)
            walking = state(page); observations['walking'] = walking
            checks['actual_walk_moves_forward'] = walking['walking'] and walking['position'][2]>before['position'][2]+.8
            checks['walking_contacts_valid'] = walking['cat']['gait']['maxReachError']<.025
            checks['automatic_blink_runs_with_walk'] = walking['cat']['blink']['count']>=1
            checks['walking_geometry_finite'] = walking['geometry']['invalid']==0
            screenshot(page, 'walking')
            if record:
                page.evaluate("""() => {const stream=document.querySelector('#viewport canvas').captureStream(30),chunks=[];
                  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2200000});
                  window.__headClip={recorder,done:new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{
                    stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);
                    reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};})};recorder.start();}""")
                page.wait_for_timeout(3000)
                page.wait_for_timeout(3500)
                page.locator('#walk').click(); page.wait_for_timeout(2000)
                page.locator('[data-attention="left"]').click(); page.wait_for_timeout(1000)
                page.locator('[data-attention="natural"]').click(); page.wait_for_timeout(1000)
                encoded = page.evaluate('async()=>{window.__headClip.recorder.stop();return await window.__headClip.done;}')
                raw = ASSETS/f'{PREFIX}-motion-raw.webm'; raw.write_bytes(base64.b64decode(encoded.split(',',1)[1]))
                clip = ASSETS/f'{PREFIX}-motion.webm'
                subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-ss','3','-i',str(raw),'-t','8','-an','-c:v','libvpx-vp9','-crf','28','-b:v','0','-threads','2','-fps_mode','vfr','-y',str(clip)],check=True)
                frames = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','frame=best_effort_timestamp_time','-of','json',str(clip)]))['frames']
                times=[float(f['best_effort_timestamp_time']) for f in frames]
                observations['video']={'path':str(clip),'rawPath':str(raw),'prerollRemovedSeconds':3,'durationSeconds':times[-1],'frames':len(times),'maxFrameGap':max(b-a for a,b in zip(times,times[1:]))}
                checks['short_actual_motion_clip_saved']=clip.stat().st_size>10000 and times[-1]<=8.05
            else:
                page.locator('#walk').click()
            page.wait_for_timeout(500)
            checks['walking_stops_cleanly']=not state(page)['walking'] and state(page)['speed']==0
            checks['desktop_no_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            context.close()
            mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            page=mobile.new_page(); monitor(page,'mobile')
            page.goto(base.rstrip('/')+'/cat-v7-head-study.html',wait_until='networkidle')
            page.wait_for_function('window.__catFaceStudy?.getState().frames>3',timeout=60000)
            page.locator('[data-attention="left"]').tap(); page.wait_for_timeout(800)
            page.locator('[data-blink="half"]').tap(); page.wait_for_timeout(200)
            observations['mobile']=state(page)
            checks['mobile_controls_work']=observations['mobile']['cat']['attention']['appliedDegrees']['yaw'] < -1 and abs(observations['mobile']['cat']['blink']['amount']-.5)<.03
            checks['mobile_no_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            screenshot(page,'mobile'); mobile.close(); browser.close()
    except Exception as e:
        errors.append({'message':str(e),'traceback':traceback.format_exc()}); checks['browser_run_completed']=False
    old=json.loads((ASSETS/'shop-study-04-static-check.json').read_text())['old_sources_sha256']
    checks['old_sources_unchanged']=all(hashlib.sha256((ROOT/'web'/name).read_bytes()).hexdigest()==value for name,value in old.items())
    observations['sourcesAfter']=source_hashes()
    checks['sources_frozen_during_check']=observations['sourcesBefore']==observations['sourcesAfter']
    checks['no_browser_or_shader_errors']=not errors
    report={'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'errors':errors,'observations':observations,'scope':'Real controls, V6 comparison, frontal/side views, head motion, eyelid closure and walking. Visual artifacts require separate image review; passing numerics does not establish plausible anatomy.'}
    (ASSETS/f'{PREFIX}-browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['passed','checks','errors']},ensure_ascii=False),flush=True)
    if not report['passed']: raise RuntimeError('V7 browser checks failed; evidence saved')


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--base',default='http://127.0.0.1:8062'); parser.add_argument('--prefix',default=PREFIX); parser.add_argument('--no-video',action='store_true'); args=parser.parse_args()
    PREFIX=args.prefix; run(args.base,not args.no_video)
