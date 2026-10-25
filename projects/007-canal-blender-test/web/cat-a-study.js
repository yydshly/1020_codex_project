import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Only these asset-specific values need updating after the original file is inspected.
// No procedural head, tail, spine, or leg overrides are applied to the author clips.
const ASSET = {
  url: "./models/cat-a-study.glb",
  yaw: 0,
  scale: 0.07,
  walkClip: "Walk",
  runClip: "Run",
  defaultMotion: "walk",
  walkSpeed: null,
  runSpeed: null,
  inPlace: true,
  groundY: null,
  materialNote: "网页毛发与原 Cycles 渲染不同；跑步循环接缝处的尾巴可能轻微不连续。"
};

const $ = id => document.getElementById(id);
const host = $("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e8ece6");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.maxPolarAngle = Math.PI * 0.495;
scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x908675, 2.0));
const key = new THREE.DirectionalLight(0xfff0de, 2.7);
key.position.set(-3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.00005;
key.shadow.normalBias = 0.002;
key.shadow.radius = 3;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xdde9ff, 0.8);
fill.position.set(3, 2, -3);
scene.add(fill);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe8ece6, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.002;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(24, 48, 0xcbd4c5, 0xdbe2d5);
grid.position.y = -0.001;
grid.material.transparent = true;
grid.material.opacity = 0.32;
scene.add(grid);

const actor = new THREE.Group();
scene.add(actor);
const modelFrame = new THREE.Group();
modelFrame.rotation.y = ASSET.yaw;
modelFrame.scale.setScalar(ASSET.scale);
actor.add(modelFrame);
let model, mixer, action, motions = {}, restPose = [], ready = false;
let motion = ASSET.defaultMotion, paused = false, timeScale = 1, route = "inplace", currentView = "threequarter";
let subjectSize = new THREE.Vector3(1, 0.5, 1), subjectCenter = new THREE.Vector3(0, 0.25, 0);
let lastTime = performance.now(), scrubbing = false;
const clipDetails = [];
const motionLabel = { still: "站姿（冻结走路首帧）", walk: "走路", run: "跑步" };
const cameraVectors = { threequarter: [1.3, 0.55, 1.7], side: [2.3, 0.28, 0], front: [0, 0.35, 2.5], rear: [1.5, 0.5, -1.8] };

function resize() {
  const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(resize).observe(host);

function setView(name) {
  if (!cameraVectors[name]) return;
  currentView = name;
  const extent = Math.max(subjectSize.x, subjectSize.y, subjectSize.z, 0.1);
  const offset = new THREE.Vector3(...cameraVectors[name]).normalize();
  // Fit the entire silhouette, including a raised tail, before allowing manual orbit.
  const radius = Math.max(subjectSize.length() * 0.53, 0.1);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const fit = radius / Math.sin(Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)) / 2) * 0.90;
  controls.target.copy(subjectCenter).add(actor.position);
  camera.position.copy(controls.target).addScaledVector(offset, fit);
  controls.minDistance = extent * 0.4;
  controls.maxDistance = extent * 10;
  camera.near = Math.max(0.002, extent / 1000);
  camera.far = Math.max(100, extent * 100);
  camera.updateProjectionMatrix();
  controls.update();
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.view === name)));
}

function updateStatus() {
  if (!ready) return;
  const clip = motion === "still" ? motions.walk : motions[motion];
  const locomotion = route === "travel" ? "直线移动" : "原地观察";
  $("status").textContent = `${motionLabel[motion]}${motion !== "still" && paused ? " · 已暂停" : ""}${motion !== "still" ? ` · ${timeScale === 0.5 ? "半速" : "正常速度"}` : ""} · ${locomotion}${clip ? ` · ${clip.name} / ${clip.duration.toFixed(2)} 秒` : ""}。${ASSET.materialNote}`;
}

function resetLocation() {
  const offset = actor.position.clone();
  actor.position.set(0, 0, 0);
  camera.position.sub(offset);
  controls.target.sub(offset);
  key.position.sub(offset);
  key.target.position.sub(offset);
}

function playMotion(next) {
  if (!ready || (next === "still" ? !motions.walk : !motions[next])) return;
  motion = next;
  resetLocation();
  mixer.stopAllAction();
  action = null;
  for (const pose of restPose) {
    pose.node.position.copy(pose.position);
    pose.node.quaternion.copy(pose.quaternion);
    pose.node.scale.copy(pose.scale);
    if (pose.morphs) pose.node.morphTargetInfluences.splice(0, pose.morphs.length, ...pose.morphs);
  }
  const clip = next === "still" ? motions.walk : motions[next];
  if (clip) {
    action = mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.update(0);
    if (next === "still") action.paused = true;
  }
  model.updateMatrixWorld(true);
  $("timeline").disabled = !action || next === "still";
  $("pause").disabled = next === "still";
  $("slow").disabled = next === "still";
  $("timeline").value = 0;
  document.querySelectorAll("[data-motion]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.motion === next)));
  const travelSpeed = next === "walk" ? ASSET.walkSpeed : next === "run" ? ASSET.runSpeed : null;
  const travelButton = document.querySelector('[data-route="travel"]');
  travelButton.disabled = !ASSET.inPlace || !Number.isFinite(travelSpeed) || !action;
  travelButton.hidden = travelButton.disabled;
  if (travelButton.disabled && route === "travel") setRoute("inplace");
  updateStatus();
}

function setRoute(next) {
  if (next === "travel" && document.querySelector('[data-route="travel"]').disabled) return;
  route = next;
  resetLocation();
  document.querySelectorAll("[data-route]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.route === next)));
  updateStatus();
}

document.querySelectorAll("[data-motion]").forEach(button => button.addEventListener("click", () => playMotion(button.dataset.motion)));
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => setRoute(button.dataset.route)));
$("reset-view").addEventListener("click", () => setView(currentView));
$("pause").addEventListener("click", () => {
  paused = !paused;
  $("pause").textContent = paused ? "继续播放" : "暂停";
  $("pause").setAttribute("aria-pressed", String(paused));
  updateStatus();
});
$("slow").addEventListener("click", () => {
  timeScale = timeScale === 1 ? 0.5 : 1;
  $("slow").setAttribute("aria-pressed", String(timeScale === 0.5));
  updateStatus();
});
$("timeline").addEventListener("input", event => {
  if (!action) return;
  scrubbing = true;
  action.time = Number(event.target.value) * action.getClip().duration;
  mixer.update(0);
  updateTime();
});
$("timeline").addEventListener("change", () => { scrubbing = false; });
$("timeline").addEventListener("pointercancel", () => { scrubbing = false; });

function updateTime() {
  const duration = action?.getClip().duration || 0, elapsed = action?.time || 0;
  $("time").textContent = `${elapsed.toFixed(2)} / ${duration.toFixed(2)} s`;
  if (!scrubbing) $("timeline").value = duration > 0 ? elapsed / duration : 0;
}

function findClip(clips, exactName, pattern) {
  return (exactName && clips.find(clip => clip.name === exactName)) || clips.find(clip => pattern.test(clip.name));
}

try {
  const gltf = await new GLTFLoader().loadAsync(ASSET.url, progress => {
    if (progress.total > 0) $("loading").textContent = `正在载入模型与原生动画… ${Math.round(progress.loaded / progress.total * 100)}%`;
  });
  model = gltf.scene;
  modelFrame.add(model);
  model.traverse(node => {
    restPose.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), morphs: node.morphTargetInfluences?.slice() });
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material.map) material.map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      }
    }
  });
  mixer = new THREE.AnimationMixer(model);
  motions.walk = findClip(gltf.animations, ASSET.walkClip, /walk|步行|走/i);
  motions.run = findClip(gltf.animations, ASSET.runClip, /run|gallop|跑/i);
  for (const clip of gltf.animations) clipDetails.push({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length });
  // The source's saved/rest pose is not a standing pose. Ground and frame the
  // actual first Walk frame, then leave it frozen until the requested clip starts.
  if (!motions.walk) throw new Error("缺少作者 Walk 动画，无法建立自然站姿。");
  action = mixer.clipAction(motions.walk);
  action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  mixer.update(0);
  action.paused = true;
  modelFrame.updateMatrixWorld(true);
  // Cached skinned bounds may describe the bind pose. Compute them only after
  // the author's natural frame has been applied.
  model.traverse(node => {
    if (node.isSkinnedMesh) { node.computeBoundingBox(); node.computeBoundingSphere(); }
  });
  const bounds = new THREE.Box3().setFromObject(modelFrame);
  // Ground the skin/feet, not the fur tips. In this asset the groom extends
  // roughly 19 mm below the body at web scale, which otherwise makes feet float.
  const body = model.getObjectByName("Cat");
  const soleBounds = body ? new THREE.Box3().setFromObject(body) : bounds;
  const groundY = ASSET.groundY ?? -soleBounds.min.y;
  modelFrame.position.y += groundY;
  // Keep the original GLB transform intact inside the wrapper; only global grounding is added.
  modelFrame.updateMatrixWorld(true);
  bounds.setFromObject(modelFrame).getSize(subjectSize);
  bounds.getCenter(subjectCenter);
  const extent = Math.max(subjectSize.x, subjectSize.y, subjectSize.z, 0.1);
  const half = extent * 2;
  Object.assign(key.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.05, far: extent * 20 + 20 });
  key.shadow.camera.updateProjectionMatrix();
  key.position.set(-extent * 3, extent * 5, extent * 4);
  key.target.position.copy(subjectCenter);
  grid.scale.setScalar(extent);
  ready = true;
  document.querySelectorAll("button").forEach(button => { button.disabled = false; });
  document.querySelector('[data-motion="walk"]').disabled = !motions.walk;
  document.querySelector('[data-motion="run"]').disabled = !motions.run;
  $("loading").hidden = true;
  if (!Number.isFinite(ASSET.walkSpeed) || !Number.isFinite(ASSET.runSpeed)) $("route-hint").textContent = "原地播放作者动画，头尾随原生动作。";
  resize();
  setView(currentView);
  playMotion(motions[motion] ? motion : motions.walk ? "walk" : "still");
  if (!motions.walk || !motions.run) $("stamp").textContent = `未发现${!motions.walk ? "走路" : ""}${!motions.walk && !motions.run ? "、" : ""}${!motions.run ? "跑步" : ""}片段；请核对原始文件。`;
} catch (error) {
  $("loading").classList.add("error");
  $("loading").textContent = "等待原始模型文件。取得 A 的原始模型与动画后，这里才会显示网页小样。";
  $("status").textContent = "当前仅完成独立预览界面，尚未载入 A 的模型，不能进行走跑与自然度验收。";
  $("stamp").textContent = "等待原始模型 · 未开始效果验收";
  console.error(error);
}

// Read-only diagnostics for browser review; animation is still driven solely by the GLB clips.
window.catAStudy = {
  getState: () => ({ ready, motion, paused, timeScale, route, view: currentView, clip: action?.getClip().name || null, time: action?.time || 0, clips: clipDetails, asset: ASSET.url, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls })
};
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (ready && !paused && !scrubbing) {
    if (motion !== "still") mixer.update(dt * timeScale);
    if (route === "travel" && action) {
      const speed = motion === "walk" ? ASSET.walkSpeed : ASSET.runSpeed;
      const dz = speed * dt * timeScale;
      actor.position.z += dz;
      camera.position.z += dz;
      controls.target.z += dz;
      key.position.z += dz;
      key.target.position.z += dz;
      grid.position.z = Math.round(actor.position.z / Math.max(subjectSize.length(), 0.1)) * Math.max(subjectSize.length(), 0.1);
      if (actor.position.z > Math.max(20, subjectSize.length() * 30)) resetLocation();
    }
  }
  updateTime();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
resize();
requestAnimationFrame(frame);
