import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Measured from the original paw paths at the same .07 scale used in the study.
// Run is an authored bounding run, not a trot. Street speed deliberately plays
// that clip slower than the original 2.6 m/s paw-travel reference.
export const CAT_A_SPEEDS = Object.freeze({ walk: .48, slow: .30, run: 1.65, nativeRun: 2.6 });
const SCALE = .07;
const CONTACT_PHASE = .426;
const smooth = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const wrap = value => ((value % 1) + 1) % 1;

// Kept independent of rendering so collision stops and rapid input changes can
// be tested without replacing the author's skeleton with procedural motion.
export function createCatMotionState({ walkDuration = 1.125, runDuration = .583333313 } = {}) {
  const state = { phase: CONTACT_PHASE, movingBlend: 0, runBlend: 0, speed: 0, cycleRate: 0,
    idleWeight: 1, walkWeight: 0, runWeight: 0, walkTime: CONTACT_PHASE * walkDuration, runTime: CONTACT_PHASE * runDuration };
  function update(delta, input = {}) {
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const speed = Math.max(0, Number.isFinite(input.speed) ? input.speed : 0);
    if (input.reset) {
      Object.assign(state, { phase: CONTACT_PHASE, movingBlend: 0, runBlend: 0, speed: 0, cycleRate: 0 });
    } else {
      if (state.movingBlend < .015 && speed > .01) state.phase = CONTACT_PHASE;
      state.speed = speed;
      state.movingBlend = damp(state.movingBlend, smooth(speed, .008, .10), 12, dt);
      state.runBlend = damp(state.runBlend, smooth(speed, .65, 1.2), 10, dt);
      const stride = CAT_A_SPEEDS.walk * walkDuration * (1 - state.runBlend)
        + CAT_A_SPEEDS.nativeRun * runDuration * state.runBlend;
      state.cycleRate = speed > .005 ? speed / stride : 0;
      state.phase = wrap(state.phase + state.cycleRate * dt);
    }
    state.idleWeight = 1 - state.movingBlend;
    state.walkWeight = state.movingBlend * (1 - state.runBlend);
    state.runWeight = state.movingBlend * state.runBlend;
    // Both clips always have a phase, including when their blend weight is zero.
    // Repeated Shift taps therefore never restart a leg on an unrelated frame.
    state.walkTime = state.phase * walkDuration;
    state.runTime = state.phase * runDuration;
    return state;
  }
  return { state, update };
}

function freezeClip(THREE, source, time) {
  const tracks = source.tracks.map(track => {
    const value = track.createInterpolant(new Float32Array(track.getValueSize())).evaluate(time);
    return new track.constructor(track.name, [0], Array.from(value));
  });
  return new THREE.AnimationClip("Walk contact pose (frozen)", 1, tracks);
}

export async function createCat(THREE) {
  const gltf = await new GLTFLoader().loadAsync(new URL("./models/cat-a-study.glb", import.meta.url).href);
  const walk = gltf.animations.find(clip => clip.name === "Walk");
  const run = gltf.animations.find(clip => clip.name === "Run");
  if (!walk || !run) throw new Error("A 模型缺少原作 Walk / Run 动画");
  const object = new THREE.Group(); object.name = "SkaterCat_street_actor";
  const terrain = new THREE.Group(); terrain.name = "Whole_cat_slope_alignment";
  const modelFrame = new THREE.Group(); modelFrame.scale.setScalar(SCALE);
  object.add(terrain); terrain.add(modelFrame); modelFrame.add(gltf.scene);
  const model = gltf.scene;
  model.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true; node.receiveShadow = true; node.frustumCulled = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) if (material.map) material.map.anisotropy = 4;
  });
  const mixer = new THREE.AnimationMixer(model);
  const idleClip = freezeClip(THREE, walk, CONTACT_PHASE * walk.duration);
  const actions = {
    idle: mixer.clipAction(idleClip), walk: mixer.clipAction(walk), run: mixer.clipAction(run)
  };
  for (const [name, action] of Object.entries(actions)) {
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    action.paused = true;
    action.setEffectiveWeight(name === "idle" ? 1 : 0);
  }
  mixer.update(0); object.updateMatrixWorld(true);
  const body = model.getObjectByName("Cat");
  if (!body?.isSkinnedMesh) throw new Error("A 模型缺少可校准落脚的身体蒙皮");
  body.computeBoundingBox();
  const bodyBounds = new THREE.Box3().setFromObject(body);
  const groundOffset = -bodyBounds.min.y;
  modelFrame.position.y = groundOffset;
  object.updateMatrixWorld(true);
  const motion = createCatMotionState({ walkDuration: walk.duration, runDuration: run.duration });
  let disposed = false, slope = 0, elapsed = 0;
  const sampleAhead = .22;

  function update(delta, input = {}) {
    if (disposed) return;
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const state = motion.update(delta, input);
    elapsed = input.reset ? 0 : elapsed + dt;
    actions.idle.setEffectiveWeight(state.idleWeight);
    actions.walk.setEffectiveWeight(state.walkWeight);
    actions.run.setEffectiveWeight(state.runWeight);
    actions.idle.time = 0;
    actions.walk.time = state.walkTime;
    actions.run.time = state.runTime;
    mixer.update(0);
    let requestedSlope = 0;
    if (typeof input.sampleHeight === "function") {
      const dx = Math.sin(object.rotation.y) * sampleAhead;
      const dz = Math.cos(object.rotation.y) * sampleAhead;
      const front = input.sampleHeight(object.position.x + dx, object.position.z + dz);
      const back = input.sampleHeight(object.position.x - dx, object.position.z - dz);
      if (Number.isFinite(front) && Number.isFinite(back))
        requestedSlope = Math.max(-.48, Math.min(.48, -Math.atan2(front - back, sampleAhead * 2)));
    }
    slope = input.reset ? requestedSlope : damp(slope, requestedSlope, 7, dt);
    terrain.rotation.x = slope;
    object.updateMatrixWorld(true);
  }

  function dispose() {
    if (disposed) return;
    disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(model);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    model.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }

  return {
    object, update, dispose,
    metadata: { author: "JonasDichelle", license: "CC BY 3.0", source: "https://blendswap.com/blend/18519",
      asset: "models/cat-a-study.glb", originalClips: ["Walk", "Run"],
      idle: "Frozen original Walk contact frame at phase .426; no authored idle clip",
      limitations: "Original Run tail loop seam remains; no independent turn/idle clip or paw IK; slope uses whole-body alignment." },
    getDebugState() {
      const s = motion.state;
      return { source: "A / Skater Cat", elapsed, gait: { ...s, phase: s.phase, speed: s.speed,
        mode: s.movingBlend < .05 ? "contact-pose" : s.runBlend > .5 ? "run" : "walk" },
        animation: { idleWeight: s.idleWeight, walkWeight: s.walkWeight, runWeight: s.runWeight,
          walkTime: s.walkTime, runTime: s.runTime, phase: s.phase, cyclesPerSecond: s.cycleRate },
        groundOffset, slope, scale: SCALE, nativeSpeeds: { walk: CAT_A_SPEEDS.walk, run: CAT_A_SPEEDS.nativeRun } };
    }
  };
}
