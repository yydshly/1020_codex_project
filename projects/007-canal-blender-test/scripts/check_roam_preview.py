import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time

from playwright.sync_api import sync_playwright


PROJECT_DIR = Path(__file__).resolve().parents[1]
ASSETS = PROJECT_DIR / 'assets'


def run(url):
    errors = []
    checks = {}
    observations = {}
    started = time.perf_counter()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=playwright.chromium.executable_path,
            headless=True,
            args=['--enable-webgl', '--ignore-gpu-blocklist'],
        )

        def monitor(page, label):
            def capture(error):
                errors.append(error)
                print('BROWSER_ERROR', json.dumps(error, ensure_ascii=False)[:9000], flush=True)
            page.on('pageerror', lambda error: capture({'page': label, 'message': str(error), 'stack': error.stack}))
            page.on('console', lambda message: capture({'page': label, 'message': message.text, 'location': message.location}) if message.type == 'error' and 'favicon' not in message.location.get('url', '') else None)

        def state(page):
            return page.evaluate('window.__canalRoam.getState()')

        desktop = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        page = desktop.new_page()
        monitor(page, 'desktop')
        page.goto(url, wait_until='networkidle')
        checks['entry_is_explicitly_started'] = page.locator('#loading').is_visible() and page.locator('#start').is_enabled()
        page.locator('#start').click()
        page.wait_for_function('window.__canalRoam?.getState().loaded', timeout=90000)
        try:
            page.wait_for_function('window.__canalRoam.getState().frames > 3', timeout=30000)
        except Exception:
            print('BROWSER_STATE', json.dumps(state(page)), flush=True)
            page.screenshot(path=str(ASSETS / 'roam-01-browser-failure.png'))
            raise
        initial = state(page)
        checks['desktop_uses_integrated_scene'] = initial['asset'] == 'roam-02.glb'
        checks['desktop_loaded_with_walkable_cat'] = initial['loaded'] and initial['walkable'] and initial['mode'] == 'follow'
        page.keyboard.down('d')
        try:
            page.wait_for_function('(distance) => window.__canalRoam.getState().distance > distance + .15', arg=initial['distance'], timeout=20000)
        finally:
            page.keyboard.up('d')
        moved = state(page)
        checks['keyboard_moves_the_cat'] = moved['distance'] > initial['distance'] + .1 and moved['walkable']
        page.locator('#pause').click()
        paused = state(page)
        page.wait_for_timeout(400)
        still = state(page)
        checks['pause_stops_animation_and_movement'] = paused['paused'] and still['frames'] == paused['frames'] and still['position'] == paused['position']
        page.locator('#resume').click()
        checks['resume_returns_to_walk'] = state(page)['paused'] is False
        page.locator('#overview').click()
        checks['overview_mode_works'] = state(page)['mode'] == 'overview'
        overview_frame = state(page)['frames']
        page.wait_for_function('(frame) => window.__canalRoam.getState().frames > frame + 1', arg=overview_frame, timeout=20000)
        page.screenshot(path=str(ASSETS / 'roam-01-overview.png'))
        page.locator('#follow').click()
        checks['follow_mode_works'] = state(page)['mode'] == 'follow'
        page.locator('#reset').click()
        reset = state(page)
        checks['reset_returns_to_safe_spawn'] = reset['walkable'] and all(abs(reset['position'][axis] - initial['position'][axis]) < .001 for axis in ('x', 'y', 'z'))
        page.locator('#help').click()
        checks['help_opens'] = page.locator('#help-panel').is_visible()
        page.locator('#help').click()
        page.locator('#tour').click()
        tour_initial = state(page)
        page.wait_for_function('(distance) => window.__canalRoam.getState().distance > distance + .2', arg=tour_initial['distance'], timeout=20000)
        tour_moved = state(page)
        checks['guided_walk_moves_with_collision'] = tour_moved['tour'] and tour_moved['walkable'] and tour_moved['distance'] > tour_initial['distance'] + .15
        page.locator('#tour').click()
        page.locator('#reset').click()
        page.wait_for_timeout(350)
        page.screenshot(path=str(ASSETS / 'roam-01-desktop.png'))
        observations['desktop'] = {'initial': initial, 'moved': moved, 'guided_walk': tour_moved, 'final': state(page)}
        checks['desktop_has_no_horizontal_overflow'] = page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        desktop.close()

        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        mobile_page = mobile.new_page()
        monitor(mobile_page, 'mobile')
        mobile_page.goto(url, wait_until='networkidle')
        mobile_page.locator('#start').click()
        mobile_page.wait_for_function('window.__canalRoam?.getState().loaded', timeout=90000)
        mobile_page.wait_for_function('window.__canalRoam.getState().frames > 3', timeout=30000)
        checks['mobile_direction_pad_visible'] = mobile_page.locator('#touch-pad').is_visible()
        mobile_initial = state(mobile_page)
        checks['mobile_uses_integrated_scene'] = mobile_initial['asset'] == 'roam-02.glb'
        button = mobile_page.locator('[data-move="right"]').bounding_box()
        mobile_page.mouse.move(button['x'] + button['width'] / 2, button['y'] + button['height'] / 2)
        mobile_page.mouse.down()
        try:
            mobile_page.wait_for_function('(distance) => window.__canalRoam.getState().distance > distance + .1', arg=mobile_initial['distance'], timeout=20000)
        finally:
            mobile_page.mouse.up()
        mobile_moved = state(mobile_page)
        checks['mobile_direction_pad_moves_cat'] = mobile_moved['distance'] > mobile_initial['distance'] + .08 and mobile_moved['walkable']
        checks['mobile_has_no_horizontal_overflow'] = mobile_page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        checks['mobile_direction_pad_inside_viewport'] = button['x'] >= 0 and button['y'] >= 0 and button['x'] + button['width'] <= 390 and button['y'] + button['height'] <= 844
        mobile_page.locator('#reset').click()
        mobile_page.wait_for_timeout(350)
        mobile_page.screenshot(path=str(ASSETS / 'roam-01-mobile.png'))
        observations['mobile'] = {'initial': mobile_initial, 'moved': mobile_moved, 'final': state(mobile_page)}
        mobile.close()
        browser.close()
    checks['no_browser_or_shader_errors'] = not errors
    report = {'checked_utc': datetime.now(timezone.utc).isoformat(), 'url': url, 'passed': all(checks.values()), 'checks': checks, 'observations': observations, 'errors': errors, 'seconds': round(time.perf_counter() - started, 3), 'scope': 'Real Chromium WebGL load, keyboard and pointer movement, pause/reset, view switching and beginning of guided walk. Navigation loops and route geometry are checked separately; this does not certify all controller or camera positions.'}
    (ASSETS / 'roam-01-browser-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'checks': checks, 'errors': errors, 'seconds': report['seconds']}, ensure_ascii=False), flush=True)
    if not report['passed']:
        raise RuntimeError('Browser checks failed; inspect the new report.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8062/roam.html')
    run(parser.parse_args().url)
