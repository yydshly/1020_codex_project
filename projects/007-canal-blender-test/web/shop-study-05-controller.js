import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCat } from "./cat-v8.js";
import { createNavigation } from "./roam-navigation.js";
import { setupEnvironment } from "./shop-study-01-environment.js";

const element = id => document.getElementById(id);
const world = element("world");
const manifestPath = "models/roam-02-manifest.json";
const navigation = createNavigation();
const entryPosition = navigation.reset({ x: -5.8, y: .85, z: .55 });
const entryHeading = -Math.PI / 2;
const keys = new Set();
const touches = new Set();
const mobile = matchMedia("(pointer: coarse)").matches || innerWidth < 700;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { loaded: false, loading: false, paused: false, mode: "follow", tour: false, elapsed: 0, distance: 0, speed: 0, frames: 0, place: "店前石街", lastStatus: "", tourIndex: 0, visited: [], asset: null };
const cameraDefaults = mobile ? { yaw: -1.17, pitch: .23, distance: 3.6 } : { yaw: -1.16, pitch: .25, distance: 3.4 };
const velocity = { x: 0, z: 0 };
const walkSpeed = .36;
const slowWalkSpeed = .24;
const followCamera = { ...cameraDefaults };
const pointer = { id: null, x: 0, y: 0 };
let renderer;
let scene;
let camera;
let controls;
let model;
let cat;
let environment;
let animationFrame;
let previousTime = 0;
let lastHud = 0;
let tourStuck = 0;
let tourPoints = [];
const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();

function status(message) {
  if (state.lastStatus === message) return;
  state.lastStatus = message;
  element("cat-status").textContent = message;
}

function setTour(enabled) {
  state.tour = enabled;
  element("tour").setAttribute("aria-pressed", String(enabled));
  element("tour").textContent = enabled ? "自己来走" : "走一段看看";
  if (enabled) {
    cat.object.position.copy(entryPosition);
    state.tourIndex = 0;
    tourStuck = 0;
    velocity.x = velocity.z = 0;
    cat.object.rotation.y = entryHeading;
    cat.update(0, { reset: true, speed: 0, moving: false, time: state.elapsed });
    tourPoints = [entryPosition, { x: 2.2, y: .85, z: .55 }, entryPosition];
    setMode("follow", true);
    status("沿店前这段石街，慢慢走一个来回");
  }
}

function setMode(mode, snap = false) {
  if (!state.loaded) return;
  state.mode = mode;
  controls.enabled = mode === "overview";
  element("follow").setAttribute("aria-pressed", String(mode === "follow"));
  element("overview").setAttribute("aria-pressed", String(mode === "overview"));
  if (mode === "overview") {
    const fit = Math.max(1, 1.1 / camera.aspect);
    camera.position.set(-1, 4.0, -1 + 10.6 * fit);
    controls.target.set(-1, 3.8, -1.1);
    camera.fov = 50;
    camera.updateProjectionMatrix();
    controls.update();
  } else {
    camera.fov = mobile ? 62 : 53;
    camera.updateProjectionMatrix();
    updateCamera(1, snap);
  }
}

function setPaused(paused) {
  if (!state.loaded) return;
  state.paused = paused;
  pointer.id = null;
  keys.clear();
  touches.clear();
  velocity.x = velocity.z = 0;
  state.speed = 0;
  document.querySelectorAll("[data-move]").forEach(button => button.classList.remove("active"));
  element("pause").setAttribute("aria-pressed", String(paused));
  element("pause-overlay").hidden = !paused;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  if (!paused) {
    previousTime = performance.now();
    animationFrame = requestAnimationFrame(frame);
    world.focus({ preventScroll: true });
  }
}

function resetCat() {
  if (!state.loaded) return;
  setTour(false);
  cat.object.position.copy(entryPosition);
  cat.object.rotation.y = entryHeading;
  state.speed = 0;
  velocity.x = velocity.z = 0;
  cat.update(0, { speed: 0, moving: false, reset: true, time: state.elapsed });
  Object.assign(followCamera, cameraDefaults);
  setMode("follow", true);
  status("回到店前，重新出发");
  updateMap();
}

function movementInput() {
  const horizontal = Number(keys.has("KeyD") || keys.has("ArrowRight") || touches.has("right")) - Number(keys.has("KeyA") || keys.has("ArrowLeft") || touches.has("left"));
  const vertical = Number(keys.has("KeyW") || keys.has("ArrowUp") || touches.has("forward")) - Number(keys.has("KeyS") || keys.has("ArrowDown") || touches.has("backward"));
  return { horizontal, vertical };
}

function moveCat(delta) {
  const input = movementInput();
  const manual = input.horizontal !== 0 || input.vertical !== 0;
  if (manual && state.tour) setTour(false);
  const desired = { x: 0, z: 0 };
  let turning = false;
  if (manual) {
    if (state.mode !== "follow") setMode("follow", true);
    const magnitude = Math.hypot(input.horizontal, input.vertical);
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? slowWalkSpeed : walkSpeed;
    const forwardX = -Math.sin(followCamera.yaw);
    const forwardZ = -Math.cos(followCamera.yaw);
    const rightX = Math.cos(followCamera.yaw);
    const rightZ = -Math.sin(followCamera.yaw);
    desired.x = (forwardX * input.vertical + rightX * input.horizontal) / magnitude * speed;
    desired.z = (forwardZ * input.vertical + rightZ * input.horizontal) / magnitude * speed;
  } else if (state.tour) {
    while (state.tourIndex < tourPoints.length && Math.hypot(tourPoints[state.tourIndex].x - cat.object.position.x, tourPoints[state.tourIndex].z - cat.object.position.z) < .08) state.tourIndex += 1;
    if (state.tourIndex >= tourPoints.length) {
      setTour(false);
      status("这一段走完了，换你带路吧");
    } else {
      const destination = tourPoints[state.tourIndex];
      const distance = Math.hypot(destination.x - cat.object.position.x, destination.z - cat.object.position.z);
      const speed = Math.min(walkSpeed, distance * 2);
      desired.x = (destination.x - cat.object.position.x) / distance * speed;
      desired.z = (destination.z - cat.object.position.z) / distance * speed;
    }
  }
  // Reorient before walking into a new direction. A cat cannot spin its body
  // through planted paws at the previous exponential controller's angular speed.
  if (Math.hypot(desired.x, desired.z) > .0001) {
    const heading = Math.atan2(desired.x, desired.z);
    const difference = Math.atan2(Math.sin(heading - cat.object.rotation.y), Math.cos(heading - cat.object.rotation.y));
    const turn = Math.max(-2.2 * delta, Math.min(2.2 * delta, difference));
    cat.object.rotation.y += turn;
    turning = Math.abs(difference - turn) > .12;
    const aligned = Math.max(0, 1 - Math.abs(difference - turn) / .12);
    const readiness = aligned * aligned * (3 - 2 * aligned);
    desired.x *= readiness;
    desired.z *= readiness;
  }
  // Bounded acceleration lets paws settle at the beginning and end of a walk.
  const changeX = desired.x - velocity.x;
  const changeZ = desired.z - velocity.z;
  const difference = Math.hypot(changeX, changeZ);
  const braking = Math.hypot(desired.x, desired.z) < .001;
  const step = Math.min(difference, (braking ? 1.6 : 1.0) * delta);
  if (difference > 1e-8) {
    velocity.x += changeX / difference * step;
    velocity.z += changeZ / difference * step;
  }
  const previous = cat.object.position.clone();
  const next = navigation.move(previous, { x: velocity.x * delta, z: velocity.z * delta });
  cat.object.position.set(next.x, next.y, next.z);
  const moved = Math.hypot(next.x - previous.x, next.z - previous.z);
  state.speed = delta ? moved / delta : 0;
  state.distance += moved;
  if (delta > 0) {
    // Use collision-resolved velocity; do not accumulate pressure against a wall.
    velocity.x = (next.x - previous.x) / delta;
    velocity.z = (next.z - previous.z) / delta;
  }
  if (moved > .00001) {
    tourStuck = 0;
  } else if (state.tour && !turning) {
    tourStuck += delta;
    if (tourStuck > 2) {
      setTour(false);
      status("这里有点挤，换个方向带阿橘走吧");
    }
  }
  return { moving: moved > .00001, turning, blocked: manual && !turning && moved < .00001 };
}

function updateCamera(delta, snap = false) {
  if (state.mode === "overview") {
    controls.update();
    return;
  }
  target.copy(cat.object.position).add(new THREE.Vector3(-Math.sin(followCamera.yaw) * .55, .42, -Math.cos(followCamera.yaw) * .55));
  const distance = followCamera.distance;
  desiredCamera.set(Math.sin(followCamera.yaw) * Math.cos(followCamera.pitch) * distance, Math.sin(followCamera.pitch) * distance, Math.cos(followCamera.yaw) * Math.cos(followCamera.pitch) * distance).add(target);
  cameraDirection.subVectors(desiredCamera, target);
  raycaster.set(target, cameraDirection.clone().normalize());
  raycaster.far = cameraDirection.length();
  const hit = raycaster.intersectObjects(environment.cameraOccluders, false).find(intersection => intersection.distance > .18);
  if (hit) desiredCamera.copy(target).addScaledVector(cameraDirection.normalize(), Math.max(.6, hit.distance - .18));
  // Looking ahead must not leave the lower character hidden behind furniture.
  const subject = cat.object.position.clone().add(new THREE.Vector3(0, .25, 0));
  const subjectRay = desiredCamera.clone().sub(subject);
  raycaster.set(subject, subjectRay.clone().normalize());
  raycaster.far = subjectRay.length();
  const subjectHit = raycaster.intersectObjects(environment.cameraOccluders, false).find(intersection => intersection.distance > .14);
  if (subjectHit) desiredCamera.copy(subject).addScaledVector(subjectRay.normalize(), Math.max(.5, subjectHit.distance - .16));
  if (snap || reducedMotion) camera.position.copy(desiredCamera);
  else camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 9));
  camera.lookAt(target);
}

function placeName() {
  const { x, z } = cat.object.position;
  if (z > 1.5 && z < 10.8 && x > 7.7 && x < 10.3) return "石拱桥上";
  if (z > 1.5 && z < 10.9 && x > -19 && x < -17) return "回程木桥";
  if (z > 10.7) return "运河对岸";
  if (z < -6.8) return "店后小巷";
  if (z < -1.1) return "转角的小路";
  return "店前石街";
}

function updateHud(motion) {
  state.place = placeName();
  element("location").textContent = state.place;
  if (!state.visited.includes(state.place)) state.visited.push(state.place);
  if (motion.turning) status("转过身，再慢慢走");
  else if (motion.blocked) status("前面走不过去，沿着石街走吧");
  else if (state.tour) status(`正在带路 · ${state.place}`);
  else if (motion.moving) status(state.speed < .55 ? `放慢脚步走过${state.place}` : `慢慢走过${state.place}`);
  else if (state.lastStatus !== "这一段走完了，换你带路吧") status(`停在${state.place}，看看四周`);
  updateMap();
}

function updateMap() {
  if (!state.loaded) return;
  const canvas = element("map");
  const context = canvas.getContext("2d");
  const bounds = navigation.mapBounds;
  const width = canvas.width;
  const height = canvas.height;
  const margin = 17;
  const scale = Math.min((width - margin * 2) / (bounds.maxX - bounds.minX + 1), (height - margin * 2) / (bounds.maxZ - bounds.minZ + 1));
  const offsetX = (width - (bounds.maxX - bounds.minX) * scale) / 2;
  const offsetY = (height - (bounds.maxZ - bounds.minZ) * scale) / 2;
  const point = (coordinateX, coordinateZ) => [offsetX + (coordinateX - bounds.minX) * scale, offsetY + (coordinateZ - bounds.minZ) * scale];
  context.clearRect(0, 0, width, height);
  const waterStart = point(bounds.minX, 1.75);
  const waterEnd = point(bounds.maxX, 10.55);
  context.fillStyle = "#335c69";
  context.fillRect(waterStart[0], waterStart[1], waterEnd[0] - waterStart[0], waterEnd[1] - waterStart[1]);
  context.fillStyle = "#72938b";
  for (const zone of navigation.zones) {
    const start = point(zone.minX, zone.minZ);
    context.fillRect(start[0], start[1], (zone.maxX - zone.minX) * scale, (zone.maxZ - zone.minZ) * scale);
  }
  const refinedStart = point(-7, -.9);
  context.fillStyle = "#e6c994";
  context.fillRect(refinedStart[0], refinedStart[1], 10 * scale, 2.2 * scale);
  context.fillStyle = "#ae9a78";
  for (const [left, top, right, bottom] of [[-9.9, -6.6, -4.1, -1.1], [-3.9, -6.6, 1.9, -1.1], [2.1, -6.6, 7.9, -1.1], [-13.8, 16.35, -8.2, 21.35], [-5.9, 16.35, -.1, 21.35], [2, 16.35, 7.6, 21.35]]) {
    const start = point(left, top);
    context.fillRect(start[0], start[1], (right - left) * scale, (bottom - top) * scale);
  }
  const position = point(cat.object.position.x, cat.object.position.z);
  context.save();
  context.translate(...position);
  context.rotate(-cat.object.rotation.y);
  context.fillStyle = "#f2c478";
  context.beginPath();
  context.moveTo(0, 9);
  context.lineTo(-6, -6);
  context.lineTo(6, -6);
  context.closePath();
  context.fill();
  context.restore();
  context.strokeStyle = "#f2c47877";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(...position, 11, 0, Math.PI * 2);
  context.stroke();
}

function frame(now) {
  animationFrame = undefined;
  if (state.paused || !state.loaded) return;
  const delta = Math.min(.06, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  state.elapsed += delta;
  state.frames += 1;
  const motion = moveCat(delta);
  cat.update(delta, { speed: state.speed, moving: motion.moving, time: state.elapsed, sampleHeight: navigation.sampleHeight });
  environment.update(state.elapsed, { cat: cat.object, camera });
  updateCamera(delta);
  renderer.render(scene, camera);
  if (now - lastHud > 160) {
    updateHud(motion);
    lastHud = now;
  }
  animationFrame = requestAnimationFrame(frame);
}

async function start() {
  if (state.loading || state.loaded) return;
  state.loading = true;
  element("start").disabled = true;
  element("load-status").textContent = "正在打开老街…";
  try {
    const response = await fetch(manifestPath);
    if (!response.ok) throw new Error("暂时读不到街区文件");
    const manifest = await response.json();
    state.asset = manifest.asset;
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", "小猫阿橘所在的雨后临水老街");
    world.replaceChildren(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(47, 1, .06, 500);
    const loaded = await new GLTFLoader().loadAsync(new URL(manifest.asset, new URL(manifestPath, document.baseURI)).href, event => {
      const total = event.total || manifest.bytes;
      element("load-status").textContent = `正在载入街区 ${Math.min(100, Math.round(event.loaded / total * 100))}%`;
    });
    model = loaded.scene;
    scene.add(model);
    element("load-status").textContent = "点亮街灯，等阿橘出门…";
    environment = await setupEnvironment(renderer, scene, model, { mobile });
    cat = await createCat(THREE);
    cat.object.position.copy(entryPosition);
    cat.object.rotation.y = entryHeading;
    scene.add(cat.object);
    controls = new OrbitControls(camera, world);
    controls.enableDamping = true;
    controls.dampingFactor = .08;
    controls.minDistance = 3;
    controls.maxDistance = 160;
    controls.maxPolarAngle = Math.PI * .49;
    controls.enabled = false;
    const resize = () => {
      renderer.setSize(world.clientWidth, world.clientHeight, false);
      camera.aspect = world.clientWidth / Math.max(1, world.clientHeight);
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(world);
    resize();
    state.loaded = true;
    element("loading").hidden = true;
    for (const id of ["view-tools", "mini-map", "cat-card"]) element(id).hidden = false;
    element("touch-pad").hidden = !mobile;
    renderer.domElement.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      setPaused(true);
      element("pause-overlay").querySelector("p").textContent = "画面暂时中断，请刷新页面重新进入。";
    });
    setMode("follow", true);
    status("沿着店前石街，按方向键慢慢走");
    updateMap();
    world.focus({ preventScroll: true });
    previousTime = performance.now();
    animationFrame = requestAnimationFrame(frame);
  } catch (error) {
    environment?.dispose();
    cat?.dispose();
    controls?.dispose();
    renderer?.dispose();
    world.replaceChildren();
    element("load-status").textContent = `没能打开街区：${error.message}。请重试。`;
    element("start").textContent = "重新进入 →";
    element("start").disabled = false;
    console.error(error);
  } finally {
    state.loading = false;
  }
}

element("start").addEventListener("click", start);
element("follow").addEventListener("click", () => setMode("follow", true));
element("overview").addEventListener("click", () => setMode("overview"));
element("tour").addEventListener("click", () => setTour(!state.tour));
element("reset").addEventListener("click", resetCat);
element("pause").addEventListener("click", () => setPaused(!state.paused));
element("resume").addEventListener("click", () => setPaused(false));
element("help").addEventListener("click", () => {
  const panel = element("help-panel");
  panel.hidden = !panel.hidden;
  element("help").setAttribute("aria-expanded", String(!panel.hidden));
});
document.addEventListener("keydown", event => {
  if (!state.loaded || event.ctrlKey || event.metaKey || event.altKey) return;
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(event.code)) {
    event.preventDefault();
    if (!state.paused) keys.add(event.code);
  } else if (event.code === "KeyR" && !event.repeat) resetCat();
  else if (event.code === "Escape") {
    element("help-panel").hidden = true;
    element("help").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", () => setPaused(true));
document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
world.addEventListener("pointerdown", event => {
  if (!state.loaded || state.paused || state.mode !== "follow" || event.button !== 0) return;
  pointer.id = event.pointerId;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  world.setPointerCapture(event.pointerId);
  world.focus({ preventScroll: true });
});
world.addEventListener("pointermove", event => {
  if (pointer.id !== event.pointerId || state.mode !== "follow") return;
  followCamera.yaw -= (event.clientX - pointer.x) * .006;
  followCamera.pitch = THREE.MathUtils.clamp(followCamera.pitch + (event.clientY - pointer.y) * .004, .08, .95);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) world.addEventListener(type, event => { if (pointer.id === event.pointerId) pointer.id = null; });
world.addEventListener("wheel", event => {
  if (!state.loaded || state.mode !== "follow") return;
  event.preventDefault();
  followCamera.distance = THREE.MathUtils.clamp(followCamera.distance + event.deltaY * .004, 1.6, 6);
}, { passive: false });
for (const button of document.querySelectorAll("[data-move]")) {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (state.paused) return;
    touches.add(button.dataset.move);
    button.classList.add("active");
    button.setPointerCapture(event.pointerId);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, () => {
    touches.delete(button.dataset.move);
    button.classList.remove("active");
  });
}

window.__canalRoam = Object.freeze({
  getState() {
    return { version: "shop-study-05", environment: environment?.metadata ?? null, rendererInfo: renderer ? {render:{...renderer.info.render},memory:{...renderer.info.memory}} : null, speed: state.speed, velocity: { ...velocity }, camera: camera ? { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, target: { x: target.x, y: target.y, z: target.z }, fov: camera.fov } : null, refinedStreet: { minX: -7, maxX: 3 }, cat: cat?.getDebugState?.() ?? null, loaded: state.loaded, paused: state.paused, mode: state.mode, tour: state.tour, tourIndex: state.tourIndex, distance: state.distance, place: state.place, frames: state.frames, asset: state.asset, position: cat ? { x: cat.object.position.x, y: cat.object.position.y, z: cat.object.position.z } : null, walkable: cat ? navigation.isWalkable(cat.object.position.x, cat.object.position.z) : false, visited: [...state.visited] };
  }
});
