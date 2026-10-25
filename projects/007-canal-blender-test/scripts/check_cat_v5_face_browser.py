"""Bounded real-browser review for the additive V5 head and eyelid study.

Wait for the V5 module/model to be ready before running. Existing files are
read-only; new screenshots and a short motion clip support visual inspection.
"""
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
PREFIX = 'cat-v5-face'


def write_json(name, data):
    (ASSETS / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def check_preservation():
    baseline = json.loads((ASSETS / 'cat-v5-preservation-baseline.json').read_text(encoding='utf-8-sig'))
    results = []
    for row in baseline['files']:
        path = ROOT / row['path']
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        results.append({'path': row['path'], 'unchanged': actual == row['sha256'], 'sha256': actual})
    report = {'checked_utc': datetime.now(timezone.utc).isoformat(), 'count': len(results),
              'passed': all(row['unchanged'] for row in results), 'files': results}
    write_json(f'{PREFIX}-preservation-check.json', report)
    return report


BLINK_MONITOR_START = """() => {
  const sample={active:true,values:[],states:[],start:performance.now()};window.__faceBlinkCheck=sample;
  function tick(now){if(!sample.active)return;
    const s=window.__catFaceStudy.getState(),b=s.cat.blink;
    sample.values.push(b?.amount??null);
    if(sample.states.length<2||sample.values.length%20===0)sample.states.push({timeMs:now-sample.start,blink:b});
    requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
}"""

BLINK_MONITOR_END = """() => {
  const a=window.__faceBlinkCheck;a.active=false;const valid=a.values.filter(Number.isFinite);
  return {samples:a.values.length,invalid:a.values.length-valid.length,
    min:valid.length?Math.min(...valid):null,max:valid.length?Math.max(...valid):null,
    last:valid.at(-1)??null,durationMs:performance.now()-a.start,states:a.states};
}"""


def run(base, record=True):
    checks, errors, observations = {}, [], {}
    source = ROOT / 'web/models/cat-v5-face.glb'
    observations['source'] = {'path': str(source), 'sha256Start': hashlib.sha256(source.read_bytes()).hexdigest()}
    page = None

    def state(target):
        return target.evaluate('window.__catFaceStudy.getState()')

    def monitor(target, label):
        target.set_default_timeout(20000)
        target.on('pageerror', lambda error: errors.append({'page': label, 'message': str(error)}))
        target.on('console', lambda message: errors.append({'page': label, 'message': message.text, 'location': message.location})
                  if message.type == 'error' and 'favicon' not in message.location.get('url', '') else None)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'])
            context = browser.new_context(viewport={'width': 1100, 'height': 800}, device_scale_factor=1)
            page = context.new_page(); monitor(page, 'desktop')
            page.goto(base.rstrip('/') + '/cat-v5-face-study.html', wait_until='networkidle')
            page.wait_for_function('window.__catFaceStudy?.getState().frames>3', timeout=60000)
            initial = state(page); observations['initial'] = initial
            checks['separate_v5_study_loads'] = initial.get('version') == 'cat-v5-face-study' and initial['mode'] == 'current'
            checks['finite_base_and_morph_geometry'] = initial['geometry']['invalid'] == 0
            checks['blink_diagnostic_available'] = isinstance(initial['cat'].get('blink', {}).get('amount'), (int, float))
            checks['honest_scope_label'] = '转头、低头与眨眼试样 · 嘴部暂未制作' in page.locator('header').inner_text()

            page.locator('[data-attention="off"]').click()
            page.locator('[data-blink="open"]').click(); page.wait_for_timeout(500)
            opened = state(page); observations['open'] = opened
            checks['open_control_opens_eyelids'] = opened['cat']['blink']['amount'] < .05
            page.screenshot(path=str(ASSETS / f'{PREFIX}-open.png'))
            page.locator('[data-blink="closed"]').click(); page.wait_for_timeout(500)
            closed = state(page); observations['closed'] = closed
            checks['closed_control_closes_eyelids'] = closed['cat']['blink']['amount'] > .95
            checks['closed_geometry_is_finite'] = closed['geometry']['invalid'] == 0
            page.screenshot(path=str(ASSETS / f'{PREFIX}-closed.png'))
            page.locator('[data-blink="open"]').click(); page.wait_for_timeout(500)
            page.evaluate(BLINK_MONITOR_START)
            page.locator('#blink-once').click(); page.wait_for_timeout(1300)
            trigger = page.evaluate(BLINK_MONITOR_END); observations['trigger'] = trigger
            checks['single_blink_closes_and_reopens'] = trigger['invalid'] == 0 and trigger['max'] > .8 and trigger['last'] < .05

            page.evaluate(BLINK_MONITOR_START)
            page.locator('[data-blink="auto"]').click(); page.wait_for_timeout(8000)
            auto = page.evaluate(BLINK_MONITOR_END); observations['auto'] = auto
            checks['automatic_blink_occurs'] = auto['invalid'] == 0 and auto['max'] > .8 and auto['min'] < .05
            page.locator('[data-blink="open"]').click()
            for action in ['left', 'right', 'down']:
                page.locator('[data-attention="' + action + '"]').click(); page.wait_for_timeout(800)
                observations[action] = state(page)['cat']['attention']
            checks['left_head_control_retained'] = observations['left']['appliedDegrees']['yaw'] < -7
            checks['right_head_control_retained'] = observations['right']['appliedDegrees']['yaw'] > 7
            checks['lower_head_control_retained'] = observations['down']['appliedDegrees']['pitch'] > 3.5
            page.screenshot(path=str(ASSETS / f'{PREFIX}-down.png'))
            page.locator('[data-view="threequarter"]').click()
            page.locator('[data-attention="natural"]').click(); page.wait_for_timeout(500)
            page.screenshot(path=str(ASSETS / f'{PREFIX}-threequarter.png'))

            page.locator('#previous').click(); previous = state(page); observations['previous'] = previous
            checks['v4_comparison_available'] = previous['mode'] == 'previous' and previous['cat']['attention']['version'] == 'head-attention-04'
            checks['previous_has_no_blink_controls'] = page.locator('#blink-once').is_disabled() and page.locator('[data-blink="closed"]').is_disabled()
            checks['v4_head_controls_remain_available'] = not page.locator('[data-attention="left"]').is_disabled()
            page.locator('[data-view="face"]').click(); page.locator('[data-attention="off"]').click(); page.wait_for_timeout(500)
            page.screenshot(path=str(ASSETS / f'{PREFIX}-v4-comparison.png'))
            page.locator('#previous').click()
            page.locator('[data-view="threequarter"]').click()
            page.locator('[data-attention="right"]').click()
            page.locator('[data-blink="auto"]').click()
            before_walk = state(page)
            page.locator('#walk').click(); page.wait_for_timeout(1500)
            walking = state(page); observations['walking'] = walking
            checks['walking_moves_actual_root'] = walking['walking'] and walking['position'][2] > before_walk['position'][2] + .3
            checks['walking_head_yaw_remains_bounded'] = abs(walking['cat']['attention']['appliedDegrees']['yaw']) <= 4.001
            checks['walking_foot_reach_error_below_25mm'] = walking['cat']['gait']['maxReachError'] < .025
            checks['walking_geometry_is_finite'] = walking['geometry']['invalid'] == 0
            page.locator('#walk').click(); page.wait_for_timeout(500)
            checks['walking_stops_cleanly'] = not state(page)['walking'] and state(page)['speed'] == 0

            if record:
                page.locator('[data-view="face"]').click()
                page.locator('[data-attention="off"]').click(); page.locator('[data-blink="open"]').click()
                page.wait_for_timeout(1000)
                page.evaluate("""() => {const stream=document.querySelector('#viewport canvas').captureStream(30),chunks=[];
                  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2200000});
                  window.__faceClip={recorder,start:performance.now(),events:[],done:new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{
                    stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);
                    reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};})};recorder.start();}""")
                # This machine's MediaRecorder has an initial encoder/capture gap.
                # Retain that raw evidence and exclude only the 3-second preroll.
                page.wait_for_timeout(3000)
                for action in ['left', 'right', 'down']:
                    page.locator('[data-attention="' + action + '"]').click(); page.wait_for_timeout(700)
                    page.locator('#blink-once').click()
                    page.evaluate('(action)=>window.__faceClip.events.push({action,timeMs:performance.now()-window.__faceClip.start})', action)
                    page.wait_for_timeout(1600)
                page.locator('[data-attention="off"]').click(); page.wait_for_timeout(1000)
                events = page.evaluate('window.__faceClip.events')
                encoded = page.evaluate('async()=>{window.__faceClip.recorder.stop();return await window.__faceClip.done;}')
                raw_clip = ASSETS / f'{PREFIX}-motion-raw.webm'; raw_clip.write_bytes(base64.b64decode(encoded.split(',', 1)[1]))
                clip = ASSETS / f'{PREFIX}-motion.webm'
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', '3', '-i', str(raw_clip),
                                '-an', '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-threads', '2',
                                '-fps_mode', 'vfr', '-y', str(clip)], check=True)
                frame_data = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                        'frame=best_effort_timestamp_time', '-of', 'json', str(clip)]))
                timestamps = [float(row['best_effort_timestamp_time']) for row in frame_data['frames']]
                max_gap = max(b - a for a, b in zip(timestamps, timestamps[1:]))
                checks['actual_head_and_blink_video_saved'] = clip.stat().st_size > 10000
                checks['final_video_has_no_capture_gap_over_150ms'] = max_gap < .15
                observations['video'] = {'path': str(clip), 'bytes': clip.stat().st_size,
                        'rawPath': str(raw_clip), 'prerollRemovedSeconds': 3, 'blinkEventsInRaw': events,
                        'durationSeconds': timestamps[-1], 'decodedFrames': len(timestamps), 'maximumFrameGapSeconds': max_gap,
                        'note': 'Real canvas recording. The raw recording is retained; only its initial 3-second capture warmup was removed.'}
            checks['desktop_no_horizontal_overflow'] = page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            context.close()

            phone_context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
            phone = phone_context.new_page(); monitor(phone, 'mobile')
            phone.goto(base.rstrip('/') + '/cat-v5-face-study.html', wait_until='networkidle')
            phone.wait_for_function('window.__catFaceStudy?.getState().frames>3', timeout=60000)
            phone.locator('[data-attention="left"]').tap(); phone.wait_for_timeout(600)
            phone.locator('[data-blink="closed"]').tap(); phone.wait_for_timeout(500)
            phone_closed = state(phone); observations['mobileClosed'] = phone_closed
            checks['mobile_head_and_blink_controls_work'] = phone_closed['cat']['attention']['appliedDegrees']['yaw'] < -5 and phone_closed['cat']['blink']['amount'] > .95
            phone.locator('[data-blink="open"]').tap(); phone.wait_for_timeout(500)
            checks['mobile_eyes_reopen'] = state(phone)['cat']['blink']['amount'] < .05
            checks['mobile_no_horizontal_overflow'] = phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
            bounds = phone.locator('#viewport').bounding_box(); observations['mobileViewport'] = bounds
            checks['mobile_model_visible'] = bounds['height'] >= 300 and bounds['y'] < 420
            phone.screenshot(path=str(ASSETS / f'{PREFIX}-mobile.png'))
            phone_context.close(); browser.close()
    except Exception as error:
        errors.append({'kind': 'check_exception', 'message': str(error), 'traceback': traceback.format_exc()})
        checks['browser_run_completed'] = False

    kept = check_preservation(); checks['all_previous_files_unchanged'] = kept['passed']
    observations['source']['sha256End'] = hashlib.sha256(source.read_bytes()).hexdigest()
    checks['source_asset_frozen_during_check'] = observations['source']['sha256Start'] == observations['source']['sha256End']
    checks['no_browser_or_shader_errors'] = not errors
    report = {'checked_utc': datetime.now(timezone.utc).isoformat(), 'passed': all(checks.values()),
              'checks': checks, 'errors': errors, 'observations': observations,
              'scope': 'Real head controls, eyelid closure/reopening, walking, V4 comparison and mobile layout. Screenshots still require visual review for plausible anatomy; numerical values alone do not establish a good blink.'}
    write_json(f'{PREFIX}-browser-check.json', report)
    print(json.dumps({key: report[key] for key in ['passed', 'checks', 'errors']}, ensure_ascii=False), flush=True)
    if not report['passed']:
        raise RuntimeError('V5 face browser check failed; evidence was preserved')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--base', default='http://127.0.0.1:8062')
    parser.add_argument('--no-video', action='store_true'); parser.add_argument('--prefix', default='cat-v5-face'); args = parser.parse_args()
    PREFIX = args.prefix
    run(args.base, record=not args.no_video)
