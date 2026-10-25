import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCat as createPrevious } from "./cat-v5-face.js";
import { createCat as createCurrent } from "./cat-v6-face.js";

const host = document.getElementById("viewport");
const scene = new THREE.Scene(); scene.background = new THREE.Color("#e6e8e5");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-.6, .6, .45, -.45, .01, 30);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .12;
controls.minZoom = .6; controls.maxZoom = 4; controls.maxPolarAngle = Math.PI * .49;
scene.add(new THREE.HemisphereLight(0xf3f7ff, 0x807464, 2.0));
const key = new THREE.DirectionalLight(0xffeee0, 2.6); key.position.set(-2, 3.5, 3.5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: .2, far: 10 });
key.shadow.normalBias = .002; key.shadow.bias = -.00008; key.shadow.radius = 3; scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xd8e5ff, .85); fill.position.set(2, 1, -2); scene.add(fill, fill.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe6e8e5, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.001; ground.receiveShadow = true; scene.add(ground);

let cats;
try { const [current, previous] = await Promise.all([createCurrent(THREE), createPrevious(THREE)]); cats = { current, previous }; }
catch (error) { document.getElementById("status").textContent = `猫模型暂未载入：${error.message}`; console.error(error); throw error; }
for (const cat of Object.values(cats)) { scene.add(cat.object); cat.object.visible = false; }
let active = cats.current, mode = "current", view = "face", attention = "natural", blinkMode = "auto";
let walking = false, speed = 0, elapsed = 0, lastTime = performance.now(), frames = 0;
active.object.visible = true;
const poses = { front: [0, .29, 2.1], side: [2.1, .28, 0], threequarter: [1.45, .62, 1.65], face: [1.5, .34, 1.5], eyeSide: [1.7, .34, -.9] };

function resize() {
  const width = host.clientWidth, height = host.clientHeight, aspect = width / Math.max(1, height), extent = camera.userData.extent || .69;
  camera.left = -extent * aspect / 2; camera.right = extent * aspect / 2; camera.top = extent / 2; camera.bottom = -extent / 2;
  camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
}
function setView(next) {
  if (!poses[next]) return;
  view = next; const z = active.object.position.z, pose = poses[next], closeup = next === "face" || next === "eyeSide"; camera.zoom = 1; camera.userData.extent = closeup ? .26 : .69;
  camera.position.set(pose[0], pose[1], pose[2] + z); controls.target.set(closeup ? .025 : 0, closeup ? .34 : .245, z + (closeup ? .16 : 0));
  resize(); controls.update(); document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
}
new ResizeObserver(resize).observe(host);
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));

const attentionLabels = { left: "看左", right: "看右", down: "低头", natural: "自然停留观察", off: "头部附加动作已停用" };
const blinkLabels = { auto: "自动眨眼", open: "保持睁眼", half: "保持半闭", closed: "保持闭眼" };
function updateStatus() {
  document.getElementById("status").textContent = `${mode === "current" ? "V6 眼睑试样" : "V5 眨眼对照"} · ${walking ? "步行" : "站姿"} · ${attentionLabels[attention]} · ${blinkLabels[blinkMode]}；嘴部暂未制作`;
}
function setAttention(next) {
  if (!(next in attentionLabels)) return;
  attention = next;
  for (const cat of Object.values(cats)) {
    if (next === "natural") cat.setAttention({ enabled: true, mode: "natural" });
    else if (next === "off") cat.setAttention({ enabled: false });
    else cat.setAttention({ enabled: true, yaw: next === "left" ? -8 : next === "right" ? 8 : 0, pitch: next === "down" ? 4 : 0 });
  }
  document.querySelectorAll("[data-attention]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.attention === next)));
  updateStatus();
}
function setBlink(next, trigger = false) {
  if (!(next in blinkLabels) || (next === "half" && mode === "previous")) return;
  blinkMode = next;
  active.setBlink(next === "half" ? { mode: "open", amount: .5 } : { mode: next, ...(trigger ? { trigger: true } : {}) });
  document.querySelectorAll("[data-blink]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.blink === next)));
  updateStatus();
}
document.querySelectorAll("[data-attention]").forEach(button => button.addEventListener("click", () => setAttention(button.dataset.attention)));
document.querySelectorAll("[data-blink]").forEach(button => button.addEventListener("click", () => setBlink(button.dataset.blink)));
// A single blink always returns to open eyes, even after a held closed-eye check.
document.getElementById("blink-once").addEventListener("click", () => setBlink("open", true));
document.getElementById("walk").addEventListener("click", () => {
  walking = !walking; document.getElementById("walk").setAttribute("aria-pressed", String(walking));
  document.getElementById("walk").textContent = walking ? "停下来" : "走两步"; updateStatus();
});
document.getElementById("previous").addEventListener("click", () => {
  const old = active; old.object.visible = false; mode = mode === "current" ? "previous" : "current"; active = cats[mode];
  active.object.position.copy(old.object.position); active.object.quaternion.copy(old.object.quaternion);
  active.update(0, { reset: true, speed: 0, moving: false, time: elapsed }); active.object.visible = true; speed = 0;
  document.getElementById("previous").setAttribute("aria-pressed", String(mode === "previous"));
  document.getElementById("previous").textContent = mode === "previous" ? "返回 V6 眼睑试样" : "V5 对照";
  document.querySelector('[data-blink="half"]').disabled = mode === "previous";
  if (mode === "previous" && blinkMode === "half") blinkMode = "open";
  setBlink(blinkMode);
  setAttention(attention); updateStatus();
});

function geometryStats() {
  let meshes = 0, triangles = 0, invalid = 0, morphTargets = 0;
  active.object.traverse(node => {
    if (!node.isMesh) return; meshes++;
    const p = node.geometry.attributes.position; triangles += (node.geometry.index?.count || p.count) / 3;
    for (const value of p.array) if (!Number.isFinite(value)) invalid++;
    for (const attr of node.geometry.morphAttributes.position || []) {
      morphTargets++; for (const value of attr.array) if (!Number.isFinite(value)) invalid++;
    }
    for (const value of node.morphTargetInfluences || []) if (!Number.isFinite(value)) invalid++;
  });
  return { meshes, triangles, invalid, morphTargets };
}
setView(view); setAttention(attention); setBlink(blinkMode);
function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now; elapsed += dt; frames++;
  const desired = walking ? .60 : 0; speed += Math.sign(desired - speed) * Math.min(Math.abs(desired - speed), (walking ? 1.8 : 2.8) * dt);
  const movement = speed * dt; active.object.position.z += movement; camera.position.z += movement; controls.target.z += movement;
  if (active.object.position.z > 30) { active.object.position.z -= 30; camera.position.z -= 30; controls.target.z -= 30; active.update(0, { reset: true, moving: false, speed: 0, time: elapsed }); }
  active.update(dt, { speed, moving: speed > .001, time: elapsed, sampleHeight: () => 0 });
  key.position.z = active.object.position.z + 3.5; key.target.position.z = active.object.position.z;
  fill.position.z = active.object.position.z - 2; fill.target.position.z = active.object.position.z;
  controls.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__catFaceStudy = Object.freeze({
  setView, setAttention, setBlink,
  getState() { return { ready: true, version: "cat-v6-face-study", frames, mode, view, attention, blinkMode, walking, speed, position: active.object.position.toArray(), geometry: geometryStats(), cat: active.getDebugState() }; }
});
