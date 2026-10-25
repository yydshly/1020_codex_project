"""Bounded Chromium evidence for the additive shop/street material study.

Uses the actual page, GPU rendering and cat controller. Screenshots and timing
are evidence for human review; no automated metric claims to measure realism.
Existing source/assets are never written. Run only after the new page is ready.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

from playwright.sync_api import sync_playwright


PROJECT = Path(__file__).resolve().parents[1]
ASSETS = PROJECT / 'assets'
PREFIX = 'shop-study-01'
VIEWPORT = {'width': 1152, 'height': 720}


def write_json(name, data):
    (ASSETS / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def preservation():
    baseline = json.loads((ASSETS / f'{PREFIX}-preservation-baseline.json').read_text(encoding='utf-8-sig'))
    files = []
    for entry in baseline['files']:
        path = PROJECT / entry['path']
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        files.append({'path': entry['path'], 'unchanged': actual == entry['sha256'], 'sha256': actual})
    result = {'checked_utc': datetime.now(timezone.utc).isoformat(), 'count': len(files),
              'passed': all(row['unchanged'] for row in files), 'files': files}
    write_json(f'{PREFIX}-preservation-check.json', result)
    return result


def triangle_count(value):
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, dict):
        for key in ('triangles', 'triangleCount', 'totalTriangles'):
            if key in value:
                return value[key]
    return None


MONITOR_START = """() => {
  const audit={active:true,frames:0,intervals:[],allWalkable:true,maxReachError:0,
    maxSpeed:0,invalidPositions:0,tourFrames:0,start:performance.now(),previous:0,lastFrame:-1};
  window.__shopCheck=audit;
  function sample(now){
    if(!audit.active)return;
    const s=window.__canalRoam.getState();
    if(s.frames!==audit.lastFrame){
      if(audit.previous) audit.intervals.push(now-audit.previous);
      audit.previous=now;audit.lastFrame=s.frames;audit.frames++;
      audit.allWalkable &&= Boolean(s.walkable);
      audit.maxSpeed=Math.max(audit.maxSpeed,Number(s.speed)||0);
      if(s.tour)audit.tourFrames++;
      if(!s.position||![s.position.x,s.position.y,s.position.z].every(Number.isFinite))audit.invalidPositions++;
      for(const f of s.cat?.feet||[])if(f.stance)audit.maxReachError=Math.max(audit.maxReachError,Number(f.reachError)||0);
    }
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}"""

MONITOR_END = """() => {
  const a=window.__shopCheck;a.active=false;const duration=performance.now()-a.start;
  const sorted=[...a.intervals].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]??null;
  const median=q(.5);
  return {durationMs:duration,frames:a.frames,sampleCount:sorted.length,
    medianFps:median?1000/median:null,averageFps:a.frames/(duration/1000),
    medianFrameMs:median,p95FrameMs:q(.95),p99FrameMs:q(.99),
    allWalkable:a.allWalkable,maxReachError:a.maxReachError,maxSpeed:a.maxSpeed,
    invalidPositions:a.invalidPositions,tourFrames:a.tourFrames};
}"""

RECORD_START = """() => {
  const canvas=document.querySelector('#world canvas');
  const stream=canvas.captureStream(24);const chunks=[];
  const mimeType=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2500000});
  const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{
    stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:mimeType}));};});
  window.__shopClip={recorder,done,mimeType};recorder.start();return {mimeType};
}"""


def run(base, record=True):
    started = time.perf_counter()
    errors, checks, observations = [], {}, {}

    def state(page):
        return page.evaluate('window.__canalRoam.getState()')

    def monitor_errors(page, label):
        page.set_default_timeout(20000)
        page.on('pageerror', lambda e: errors.append({'page': label, 'kind': 'pageerror', 'message': str(e)}))
        page.on('console', lambda m: errors.append({'page': label, 'kind': 'console', 'message': m.text, 'location': m.location})
                if m.type == 'error' and 'favicon' not in m.location.get('url', '') else None)
        page.on('requestfailed', lambda r: errors.append({'page': label, 'kind': 'requestfailed', 'url': r.url, 'message': r.failure})
                if 'favicon' not in r.url else None)

    def ready(page, entry):
        page.goto(base.rstrip('/') + '/' + entry, wait_until='networkidle')
        page.locator('#start').click()
        page.wait_for_function('window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames>10', timeout=90000)
        page.wait_for_timeout(700)
        if state(page)['paused']:
            page.locator('#resume').click()

    def renderer(page):
        return page.evaluate("""() => {
          const canvas=document.querySelector('#world canvas');const gl=canvas.getContext('webgl2');
          const ext=gl.getExtension('WEBGL_debug_renderer_info');
          return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
            vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
            size:[canvas.width,canvas.height],pixelRatio:devicePixelRatio};
        }""")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=[
            '--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'])
        # Only one live WebGL context at a time avoids contaminating GPU timings.
        old_context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
        old = old_context.new_page()
        monitor_errors(old, 'previous')
        ready(old, 'roam-cat-v3.html')
        observations['previous'] = {'initial': state(old), 'renderer': renderer(old)}
        old.screenshot(path=str(ASSETS / f'{PREFIX}-previous-follow.png'))
        old.evaluate(MONITOR_START)
        old.wait_for_timeout(5000)
        observations['previous']['fixedFollowPerformance'] = old.evaluate(MONITOR_END)
        checks['previous_entry_loads'] = state(old)['loaded'] and state(old)['walkable']
        print('PREVIOUS_READY', observations['previous']['fixedFollowPerformance'], flush=True)
        old_context.close()

        context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
        page = context.new_page()
        monitor_errors(page, 'desktop')
        ready(page, 'shop-study-01.html')
        initial = state(page)
        observations['desktop'] = {'initial': initial, 'renderer': renderer(page)}
        checks['independent_entry_version'] = initial.get('version') == 'shop-study-01'
        checks['same_scene_asset'] = initial.get('asset') == 'roam-02.glb'
        checks['cat_version_preserved'] = initial.get('cat', {}).get('version') == observations['previous']['initial'].get('cat', {}).get('version')
        checks['starts_walkable'] = initial['walkable'] and initial['mode'] == 'follow'
        checks['hardware_renderer'] = 'swiftshader' not in observations['desktop']['renderer']['renderer'].lower()
        page.screenshot(path=str(ASSETS / f'{PREFIX}-follow.png'))
        page.evaluate(MONITOR_START)
        page.wait_for_timeout(5000)
        observations['desktop']['fixedFollowPerformance'] = page.evaluate(MONITOR_END)
        page.locator('#overview').click()
        page.wait_for_timeout(600)
        observations['desktop']['front'] = state(page)
        page.screenshot(path=str(ASSETS / f'{PREFIX}-front.png'))
        checks['second_fixed_view_available'] = state(page)['mode'] == 'overview'
        print('DESKTOP_VIEWS_READY', flush=True)

        environment = initial.get('environment') or initial.get('environmentDiagnostics') or {}
        before, after = triangle_count(environment.get('geometryBefore')), triangle_count(environment.get('geometryAfter'))
        checks['geometry_triangle_count_preserved'] = before is not None and before == after
        selected = environment.get('selectedTriangles', 0)
        if isinstance(selected, dict):
            selected = sum(v for v in selected.values() if isinstance(v, (int, float)))
        checks['shop_material_selection_exists'] = isinstance(selected, (int, float)) and selected > 0
        probes = environment.get('staticReflectionProbes')
        checks['static_reflection_diagnostic_exists'] = probes is not None
        observations['desktop']['environment'] = environment
        observations['desktop']['rendererInfo'] = initial.get('rendererInfo', initial.get('renderer'))

        page.locator('#reset').click()
        page.locator('#tour').click()
        tour_start = state(page)
        page.evaluate(MONITOR_START)
        if record:
            observations['recording'] = page.evaluate(RECORD_START)
        page.wait_for_timeout(20000)
        tour_end = state(page)
        tour_metrics = page.evaluate(MONITOR_END)
        observations['desktop']['tour'] = {'start': tour_start, 'end': tour_end, 'metrics': tour_metrics}
        if record:
            data = page.evaluate('async()=>{window.__shopClip.recorder.stop();return await window.__shopClip.done;}')
            video = ASSETS / f'{PREFIX}-walk-20s.webm'
            video.write_bytes(base64.b64decode(data.split(',', 1)[1]))
            observations['recording'].update({'path': str(video), 'bytes': video.stat().st_size})
        checks['twenty_second_actual_tour'] = tour_metrics['durationMs'] >= 19500 and tour_end['distance'] > tour_start['distance'] + 4
        checks['tour_remains_walkable'] = tour_metrics['allWalkable'] and tour_metrics['invalidPositions'] == 0
        checks['stance_reach_error_below_35mm'] = tour_metrics['maxReachError'] < .035
        checks['walking_speed_not_increased'] = tour_metrics['maxSpeed'] <= .61
        if state(page)['tour']:
            page.locator('#tour').click()
        checks['desktop_no_overflow'] = page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        observations['desktop']['final'] = state(page)
        print('TOUR_READY', tour_metrics, flush=True)
        context.close()

        mobile_context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        mobile = mobile_context.new_page()
        monitor_errors(mobile, 'mobile')
        ready(mobile, 'shop-study-01.html')
        phone_initial = state(mobile)
        checks['mobile_loads'] = phone_initial.get('version') == 'shop-study-01' and phone_initial['walkable']
        pad = mobile.locator('[data-move="forward"]').bounding_box()
        checks['mobile_controls_visible'] = mobile.locator('#touch-pad').is_visible() and pad is not None and pad['x'] >= 0 and pad['y'] + pad['height'] <= 844
        client = mobile_context.new_cdp_session(mobile)
        touch = {'x': pad['x'] + pad['width'] / 2, 'y': pad['y'] + pad['height'] / 2}
        client.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [touch]})
        try:
            mobile.wait_for_function('(n)=>window.__canalRoam.getState().distance>n+.12', arg=phone_initial['distance'], timeout=15000)
        finally:
            client.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        moved = state(mobile)
        checks['actual_touch_moves_cat'] = moved['walkable'] and moved['distance'] > phone_initial['distance'] + .1
        checks['mobile_no_overflow'] = mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
        mobile.locator('#reset').click()
        mobile.wait_for_timeout(250)
        mobile.screenshot(path=str(ASSETS / f'{PREFIX}-mobile.png'))
        observations['mobile'] = {'initial': phone_initial, 'moved': moved, 'renderer': renderer(mobile)}
        mobile_context.close()
        browser.close()

    kept = preservation()
    checks['all_existing_files_unchanged'] = kept['passed']
    checks['preservation_baseline_has_331_files'] = kept['count'] == 331
    checks['no_browser_shader_or_request_errors'] = not errors
    old_perf = observations['previous']['fixedFollowPerformance']
    new_perf = observations['desktop']['fixedFollowPerformance']
    observations['performanceComparison'] = {
        'sameViewport': VIEWPORT, 'sameDevicePixelRatio': 1,
        'previousMedianFps': old_perf['medianFps'], 'newMedianFps': new_perf['medianFps'],
        'previousP95FrameMs': old_perf['p95FrameMs'], 'newP95FrameMs': new_perf['p95FrameMs'],
        'note': 'Sequential real Chromium GPU contexts, 5 seconds each at the initial fixed follow view. Tour metrics include 24fps MediaRecorder overhead when recording is enabled.'}
    result = {'checked_utc': datetime.now(timezone.utc).isoformat(), 'passed': all(checks.values()),
              'checks': checks, 'errors': errors, 'observations': observations,
              'seconds': round(time.perf_counter() - started, 2),
              'scope': 'Two fixed views and 20-second real walk; previous-entry performance comparison; mobile touch; original-file preservation. Human review is still needed for material/lighting quality.'}
    write_json(f'{PREFIX}-browser-check.json', result)
    print(json.dumps({k: result[k] for k in ('passed', 'checks', 'errors', 'seconds')}, ensure_ascii=False), flush=True)
    if not result['passed']:
        raise RuntimeError('Shop study check failed; inspect the saved report')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:8062')
    parser.add_argument('--no-video', action='store_true')
    args = parser.parse_args()
    run(args.base, record=not args.no_video)
