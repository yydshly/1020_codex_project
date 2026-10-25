from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[1]
web = root / 'web'
files = [p for p in web.rglob('*') if p.is_file() and 'cat-v11' not in p.name and 'shop-study-08' not in p.name]
baseline = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(root / 'assets/cat-v11-preservation-baseline.json').write_text(json.dumps(baseline, indent=2), encoding='utf-8')

def replace(text, before, after):
    if before not in text:
        raise RuntimeError('Missing expected source: ' + before[:100])
    return text.replace(before, after)

html = (web / 'cat-v10-gait-study.html').read_text(encoding='utf-8')
for a, b in [('cat-v10-gait-study.js','cat-v11-gait-study.js'),('阿橘 · 走跑试修','阿橘 · 头尾协调'),('腿部衔接与摆掌动作 · 嘴部暂未制作','随速度与转弯调整头尾 · 保留走跑对照'),('V9 走跑对照','V10 走跑对照'),('cat-v9-gait-study.html','cat-v10-gait-study.html'),('原 V9 试样页','原 V10 试样页'),('V9 同速走跑对照','V10 同速走跑对照'),('shop-study-07.html','shop-study-08.html'),('自然</button>','随运动</button>')]:
    html = replace(html, a, b)
html = replace(html, '<button id="slow-motion"', '<button data-route="straight" aria-pressed="true">直行</button><button data-route="left" aria-pressed="false">左转</button><button data-route="right" aria-pressed="false">右转</button>\n    <button id="slow-motion"')
(web / 'cat-v11-gait-study.html').write_text(html, encoding='utf-8')

js = (web / 'cat-v10-gait-study.js').read_text(encoding='utf-8')
for a, b in [('./cat-v10.js','./cat-v11.js'),('./cat-v9.js','./cat-v10.js'),('cat-v10-gait-study','cat-v11-gait-study'),('V10 走跑试修','V11 头尾协调'),('V9 走跑对照','V10 走跑对照'),('自然停留观察','随运动协调'),('let requestedSpeed = .36, timeScale = 1;','let requestedSpeed = .36, timeScale = 1, route = "straight";')]:
    js = replace(js, a, b)
js = replace(js, 'const z = active.object.position.z, pose = poses[next]', 'const pose = poses[next]')
js = replace(js, 'camera.position.set(pose[0], pose[1], pose[2] + z); controls.target.set(closeup ? .025 : 0, closeup ? .34 : .245, z + (closeup ? .16 : 0));', '''const offset = new THREE.Vector3(...pose).applyQuaternion(active.object.quaternion);
  const focus = new THREE.Vector3(closeup ? .025 : 0, closeup ? .34 : .245, closeup ? .16 : 0).applyQuaternion(active.object.quaternion);
  camera.position.copy(active.object.position).add(offset); controls.target.copy(active.object.position).add(focus);''')
js = replace(js, 'function setTimeScale(next) {', '''function setRoute(next) {
  if (!["straight", "left", "right"].includes(next)) return;
  route = next;
  document.querySelectorAll('[data-route]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.route === route)));
  updateStatus();
}
document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => setRoute(button.dataset.route)));
function setTimeScale(next) {''')
js = replace(js, ' · ${attentionLabels[attention]}', ' · ${{straight:"直行",left:"左转",right:"右转"}[route]} · ${attentionLabels[attention]}')
js = replace(js, '''const movement = speed * dt; active.object.position.z += movement; camera.position.z += movement; controls.target.z += movement;
  if (active.object.position.z > 30) { active.object.position.z -= 30; camera.position.z -= 30; controls.target.z -= 30; active.update(0, { reset: true, moving: false, speed: 0, time: elapsed }); }
  active.update(dt, { speed, moving: speed > .001, time: elapsed, sampleHeight: () => 0 });''', '''const turnSign = route === "left" ? -1 : route === "right" ? 1 : 0;
  const yawRate = turnSign * .65 * THREE.MathUtils.smoothstep(speed, 0, .20);
  const headingMid = active.object.rotation.y + yawRate * dt * .5;
  active.object.rotation.y += yawRate * dt;
  const dx = Math.sin(headingMid) * speed * dt, dz = Math.cos(headingMid) * speed * dt;
  active.object.position.x += dx; active.object.position.z += dz;
  camera.position.x += dx; camera.position.z += dz; controls.target.x += dx; controls.target.z += dz;
  if (Math.hypot(active.object.position.x, active.object.position.z) > 30) {
    camera.position.x -= active.object.position.x; camera.position.z -= active.object.position.z;
    controls.target.x -= active.object.position.x; controls.target.z -= active.object.position.z;
    active.object.position.x = active.object.position.z = 0;
    active.update(0, { reset: true, moving: false, speed: 0, time: elapsed });
  }
  active.update(dt, { speed, moving: speed > .001, time: elapsed,
    lookAheadYaw: walking ? turnSign * .28 : 0, turning: walking && turnSign !== 0, sampleHeight: () => 0 });''')
js = replace(js, 'key.position.z = active.object.position.z + 3.5; key.target.position.z = active.object.position.z;', 'key.position.x = active.object.position.x - 2; key.target.position.x = active.object.position.x;\n  key.position.z = active.object.position.z + 3.5; key.target.position.z = active.object.position.z;')
js = replace(js, 'fill.position.z = active.object.position.z - 2;', 'fill.position.x = active.object.position.x + 2; fill.target.position.x = active.object.position.x;\n  fill.position.z = active.object.position.z - 2;')
js = replace(js, 'setView, setAttention, setBlink, setSpeed, setTimeScale,', 'setView, setAttention, setBlink, setSpeed, setTimeScale, setRoute,')
js = replace(js, 'requestedSpeed, timeScale, elapsed,', 'requestedSpeed, timeScale, route, elapsed,')
(web / 'cat-v11-gait-study.js').write_text(js, encoding='utf-8')

html = (web / 'shop-study-07.html').read_text(encoding='utf-8')
for a,b in [('shop-study-07-controller.js','shop-study-08-controller.js'),('步态试修','头尾协调'),('cat-v10-gait-study.html','cat-v11-gait-study.html'),('shop-study-05.html','shop-study-07.html')]:
    html = replace(html,a,b)
html = replace(html, '阿橘会轻轻转头、眨眼。小跑时对角腿交替，急转时先放慢。可以进步态页，观察慢走与小跑，也能与 V8 同速对照行走。嘴部动作留到下一轮，暂未加入独立的眼球注视。', '阿橘会随走跑调整头尾，转弯时看向前路，停下后缓缓放松。小跑时对角腿交替，急转时先放慢。可以进对照页，观察直行、转弯和停稳。嘴部与独立眼球注视暂未加入。')
(web / 'shop-study-08.html').write_text(html,encoding='utf-8')
js = (web / 'shop-study-07-controller.js').read_text(encoding='utf-8')
for a,b in [('./cat-v10.js','./cat-v11.js'),('shop-study-07','shop-study-08'),('let turning = false;','let turning = false, lookAheadYaw = 0;'),('cat.object.rotation.y += turn;','cat.object.rotation.y += turn;\n    lookAheadYaw = THREE.MathUtils.clamp(difference - turn, -.55, .55);'),('return { moving: moved > .00001, turning, blocked:', 'return { moving: moved > .00001, turning, lookAheadYaw, blocked:'),('moving: motion.moving, time: state.elapsed, sampleHeight:', 'moving: motion.moving, turning: motion.turning, lookAheadYaw: motion.lookAheadYaw, time: state.elapsed, sampleHeight:')]:
    js = replace(js,a,b)
(web / 'shop-study-08-controller.js').write_text(js,encoding='utf-8')
print(json.dumps({'preservedBaselineFiles':len(baseline),'newPages':['cat-v11-gait-study','shop-study-08']}))
