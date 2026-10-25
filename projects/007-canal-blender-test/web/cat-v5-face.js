import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCat as createPrevious } from './cat-v4-attention.js';

function releaseAsset(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse(node => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
  textures.forEach(item => item.dispose()); skeletons.forEach(item => item.dispose());
}
function equalAttribute(a, b) {
  return a && b && a.itemSize === b.itemSize && a.count === b.count && a.array.every((value, i) => value === b.array[i]);
}

// Preserve V4's entire skeleton, skin, gait and head controller. Only copy the
// compatible eyelid morph attributes from the separately saved facial asset.
export async function createCat(THREE) {
  const base = await createPrevious(THREE);
  let loaded;
  const meshes = [];
  try {
    loaded = await new GLTFLoader().loadAsync(new URL('./models/cat-v5-face.glb', import.meta.url).href);
    const sources = [];
    loaded.scene.traverse(node => { if (node.isSkinnedMesh) sources.push(node); });
    base.object.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });
    if (sources.length !== meshes.length) throw new Error('Facial asset mesh count changed');
    for (let i = 0; i < meshes.length; i++) {
      const target = meshes[i], source = sources[i];
      for (const key of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        if (!equalAttribute(target.geometry.attributes[key], source.geometry.attributes[key])) throw new Error(`Facial asset changed base ${key}`);
      }
      if (!equalAttribute(target.geometry.index, source.geometry.index)) throw new Error('Facial asset changed triangle indices');
      if (source.morphTargetDictionary?.Blink_Left === undefined || source.morphTargetDictionary?.Blink_Right === undefined) throw new Error('Eyelid morph targets are unavailable');
      for (const kind of ['position', 'normal']) {
        if (source.geometry.morphAttributes[kind]) target.geometry.morphAttributes[kind] = source.geometry.morphAttributes[kind].map(attribute => attribute.clone());
      }
      target.geometry.morphTargetsRelative = source.geometry.morphTargetsRelative;
      target.updateMorphTargets();
      target.morphTargetDictionary = { ...source.morphTargetDictionary };
      target.morphTargetInfluences.fill(0);
      for (const material of (Array.isArray(target.material) ? target.material : [target.material])) material.needsUpdate = true;
    }
  } catch (error) {
    base.dispose(); throw error;
  } finally { if (loaded) releaseAsset(loaded.scene); }

  const blink = { mode: 'auto', amount: 0, left: 0, right: 0, count: 0, active: false };
  let clock = 0, nextBlink = 2.6, disposed = false;
  const duration = .28;
  const smooth = value => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  function curve(time) {
    if (time < 0) return 0;
    if (time < .085) return smooth(time / .085);
    if (time < .13) return 1;
    if (time < duration) return 1 - smooth((time - .13) / .15);
    return 0;
  }
  function apply(left, right) {
    blink.left = left; blink.right = right; blink.amount = (left + right) / 2;
    for (const mesh of meshes) {
      mesh.morphTargetInfluences[mesh.morphTargetDictionary.Blink_Left] = left;
      mesh.morphTargetInfluences[mesh.morphTargetDictionary.Blink_Right] = right;
    }
  }
  function setBlink(options = {}) {
    if (['auto', 'open', 'closed'].includes(options.mode)) {
      blink.mode = options.mode; blink.active = false; clock = 0;
      if (options.mode === 'auto') nextBlink = 2.6;
      apply(options.mode === 'closed' ? 1 : 0, options.mode === 'closed' ? 1 : 0);
    }
    if (options.trigger) {
      if (blink.mode === 'closed') blink.mode = 'open';
      blink.active = true; clock = 0; apply(0, 0);
    }
  }
  function update(delta, state = {}) {
    if (disposed) return;
    base.update(delta, state);
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    if (state.reset) { blink.active = false; clock = 0; nextBlink = 2.6; }
    clock += dt;
    if (blink.mode === 'closed') apply(1, 1);
    else {
      if (!blink.active && blink.mode === 'auto' && clock >= nextBlink) { blink.active = true; clock = 0; }
      if (blink.active) {
        apply(curve(clock), curve(clock - .006));
        if (clock >= duration + .006) {
          blink.active = false; blink.count++; clock = 0;
          nextBlink = 3.7 + ((blink.count * 17) % 29) / 10;
          apply(0, 0);
        }
      } else apply(0, 0);
    }
  }
  return {
    object: base.object, update, setAttention: base.setAttention, setBlink,
    getDebugState() { return { ...base.getDebugState(), blink: { ...blink, duration, eyelidMorphs: true, independentGaze: false, mouthControl: false } }; },
    dispose() { if (!disposed) { disposed = true; base.dispose(); } }
  };
}
