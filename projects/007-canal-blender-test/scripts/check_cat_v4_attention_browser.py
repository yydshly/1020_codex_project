"""Bounded visual/browser check of the separate head-attention experiment."""
import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'

def run(base):
    checks, errors, observations = {}, [], {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'])
        context = browser.new_context(viewport={'width': 1100, 'height': 800}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and 'favicon' not in message.location.get('url', '') else None)
        page.goto(base + '/cat-v4-attention-study.html', wait_until='networkidle')
        page.wait_for_function('window.__catAttentionStudy?.getState().frames > 3')
        state = lambda: page.evaluate('window.__catAttentionStudy.getState()')
        observations['initial'] = state()
        checks['new_model_loads'] = state()['cat']['attention']['version'] == 'head-attention-04'
        checks['unchanged_geometry'] = state()['geometry']['triangles'] == 49000 and state()['geometry']['invalid'] == 0
        checks['honest_face_label'] = '眼球、嘴部尚未绑定' in page.locator('header').inner_text()
        for action in ['left', 'right', 'down']:
            page.locator('[data-attention="' + action + '"]').click()
            page.wait_for_timeout(800)
            observations[action] = state()['cat']['attention']
            page.screenshot(path=str(ASSETS / f'cat-v4-attention-{action}.png'))
        checks['left_control_turns_head'] = observations['left']['appliedDegrees']['yaw'] < -7
        checks['right_control_turns_head'] = observations['right']['appliedDegrees']['yaw'] > 7
        checks['down_control_lowers_head'] = observations['down']['appliedDegrees']['pitch'] > 3.5
        page.locator('[data-view="threequarter"]').click()
        page.screenshot(path=str(ASSETS / 'cat-v4-attention-threequarter.png'))
        page.locator('[data-view="face"]').click()
        page.locator('[data-attention="off"]').click()
        page.wait_for_timeout(2300)
        disabled = state()['cat']['attention']
        checks['disable_returns_to_original_pose'] = not disabled['enabled'] and abs(disabled['appliedDegrees']['yaw']) + abs(disabled['appliedDegrees']['pitch']) < .001
        page.locator('[data-attention="natural"]').click()
        page.wait_for_timeout(2700)
        checks['natural_has_deliberate_attention'] = state()['cat']['attention']['mode'] == 'natural' and state()['cat']['attention']['appliedDegrees']['yaw'] < -3
        page.locator('#previous').click()
        checks['v3_comparison_available'] = state()['mode'] == 'previous' and 'attention' not in state()['cat']
        checks['attention_buttons_disabled_for_v3'] = page.locator('[data-attention="left"]').is_disabled()
        page.screenshot(path=str(ASSETS / 'cat-v4-attention-v3-comparison.png'))
        page.locator('#previous').click()
        page.locator('[data-view="threequarter"]').click()
        page.locator('[data-attention="right"]').click()
        page.locator('#walk').click()
        page.wait_for_timeout(1200)
        walking = state()
        checks['walking_advances_root'] = walking['walking'] and walking['position'][2] > .3
        checks['walking_yaw_at_most_4_degrees'] = abs(walking['cat']['attention']['appliedDegrees']['yaw']) <= 4.001
        checks['walking_reach_error_under_25mm'] = walking['cat']['gait']['maxReachError'] < .025
        observations['walking'] = walking
        page.locator('#walk').click()
        page.wait_for_timeout(500)
        page.locator('[data-view="face"]').click()
        page.locator('[data-attention="off"]').click()
        page.wait_for_timeout(1300)
        page.evaluate("""() => {const stream=document.querySelector('#viewport canvas').captureStream(24);const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2200000});window.__headClip={recorder,done:new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};})};recorder.start();}""")
        for action, duration in [('left', 2800), ('right', 2800), ('down', 2400)]:
            page.locator('[data-attention="' + action + '"]').click()
            page.wait_for_timeout(duration)
        encoded = page.evaluate('async()=>{window.__headClip.recorder.stop();return await window.__headClip.done;}')
        video = ASSETS / 'cat-v4-attention-motion.webm'
        video.write_bytes(base64.b64decode(encoded.split(',')[1]))
        checks['motion_video_saved'] = video.stat().st_size > 10000
        checks['desktop_no_horizontal_overflow'] = page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        context.close()
        phone_context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        phone = phone_context.new_page()
        phone.on('pageerror', lambda error: errors.append('mobile: ' + str(error)))
        phone.goto(base + '/cat-v4-attention-study.html', wait_until='networkidle')
        phone.wait_for_function('window.__catAttentionStudy?.getState().frames > 3')
        phone.locator('[data-attention="left"]').click()
        phone.wait_for_timeout(500)
        checks['mobile_controls_work'] = phone.evaluate('window.__catAttentionStudy.getState().cat.attention.appliedDegrees.yaw < -5')
        checks['mobile_no_horizontal_overflow'] = phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
        bounds = phone.locator('#viewport').bounding_box()
        checks['mobile_model_viewport_visible'] = bounds['height'] >= 300 and bounds['y'] < 400
        phone.screenshot(path=str(ASSETS / 'cat-v4-attention-mobile.png'))
        observations['mobile_viewport'] = bounds
        phone_context.close()
        browser.close()
    checks['no_console_or_shader_errors'] = not errors
    report = {'checked_utc': datetime.now(timezone.utc).isoformat(), 'passed': all(checks.values()), 'checks': checks, 'errors': errors, 'observations': observations, 'visual_review': 'Screenshots saved for human/agent visual inspection; numerical checks do not establish likeness.'}
    (ASSETS / 'cat-v4-attention-browser-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['passed', 'checks', 'errors']}, ensure_ascii=False), flush=True)
    if not report['passed']:
        raise RuntimeError('Head attention browser check failed')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:8062')
    run(parser.parse_args().base)
