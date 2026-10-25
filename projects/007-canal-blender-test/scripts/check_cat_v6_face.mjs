// CPU-only regression of the actual V4 and V6 cat implementations. The source
// GLB keeps all geometry, bones and skin. Only image decoding is replaced with
// a no-pixel THREE.Texture fixture; nothing is written back to the asset.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const project = new URL('../', import.meta.url), web = new URL('web/', project);
const threeURL = new URL('vendor/three/build/three.module.min.js', web).href;
const addonsURL = new URL('vendor/three/examples/jsm/', web).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`), import.meta.url);
const THREE = await import(threeURL);
const { GLTFLoader } = await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js', web));
if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class ProgressEvent { constructor(type, values) { this.type = type; Object.assign(this, values); } };
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (resource, options) => {
  const url = resource instanceof URL ? resource : new URL(typeof resource === 'string' ? resource : resource.url);
  return url.protocol === 'file:' ? new Response(await readFile(url)) : nativeFetch(resource, options);
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const protectedHashes = {
  'roam-cat-v3.js': '40a2196fee7d02c2239bcd49d9c0c3cc16dd3e4ee4ca099e59a65ad412794b8d',
  'cat-v4-attention.js': '2d849dc7e802d77c1b7a046ad4e49fd91ea30d9ed6cff68daf31def02ba6658b',
  'cat-v3-study.js': 'd5b9a4ef8a279abd078d64f39a7ea870ceef5271038b40068775fd3cef6b44fb',
  'cat-v3-study.html': '6749e14f1a12dca38af94ef93558a960f341d5c6f590a1ec68d6135dea0b6f16',
  'models/cat-v3-rig.glb': '6c8d0f0133805e0727cc6cdfc558456d670e0d33a5158685084413e7786a77f1',
  'models/cat-v3-rig.json': '8d067bc3456a0b32f9d0d66f46c27d9fe464c6dd618458893f49fd2404c4b5ea'
};
async function hashes(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(new URL(path, web)))])));
}
const testedFiles = ['cat-v6-face.js', 'cat-v6-lid-material.js', 'models/cat-v6-lid-surface.json'];
const report = { checkedAt: new Date().toISOString(), method: 'CPU; actual GLB mesh/skin/bones; image decoding replaced only in memory by a no-pixel Texture', checks: {}, runs: [], sourceHashes: await hashes(Object.keys(protectedHashes)), testedFiles: await hashes(testedFiles) };
const failures = [];
function check(name, condition) { report.checks[name] = Boolean(condition); if (!condition) failures.push(name); }
function delta(a, b) { if (a.length !== b.length) return Infinity; let max = 0; for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i])); return max; }
function bones(cat) { const map = new Map(); cat.object.traverse(node => { if (node.isBone) map.set(node.name, node); }); return map; }
function meshes(cat) { const values = []; cat.object.traverse(node => { if (node.isMesh) values.push(node); }); return values; }
function arrayHash(attribute) { return sha(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)); }
function geometrySnapshot(mesh) { return { attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, attribute]) => [key, arrayHash(attribute)])), index: arrayHash(mesh.geometry.index), morphs: Object.keys(mesh.geometry.morphAttributes), bindMatrix: [...mesh.bindMatrix.elements] }; }
function materialSnapshot(material) { return { color: material.color.toArray(), roughness: material.roughness, metalness: material.metalness, opacity: material.opacity, transparent: material.transparent, alphaTest: material.alphaTest, side: material.side, map: material.map?.uuid }; }
function allFinite(value) { if (typeof value === 'number') return Number.isFinite(value); return !value || typeof value !== 'object' || Object.values(value).every(allFinite); }

GLTFLoader.prototype.loadAsync = async function (url) {
  const bytes = await readFile(new URL(url)), jsonSize = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  const offset = 20 + jsonSize, binSize = bytes.readUInt32LE(offset);
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(offset + 8, offset + 8 + binSize).toString('base64');
  delete json.images; delete json.textures; delete json.materials; delete json.samplers;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const loaded = await this.parseAsync(JSON.stringify(json), '');
  loaded.scene.traverse(node => { if (node.isMesh) for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material.map = new THREE.Texture(); });
  return loaded;
};

check('legacy_source_hashes_match_fixed_baseline', JSON.stringify(report.sourceHashes) === JSON.stringify(protectedHashes));
const field = JSON.parse(await readFile(new URL('models/cat-v6-lid-surface.json', web), 'utf8'));
check('heightfield_records_unchanged_source', field.sourceSha256 === protectedHashes['models/cat-v3-rig.glb']);
check('heightfield_samples_complete_and_finite', field.eyes.length === 2 && field.eyes.every(eye => eye.height.length === field.resolution ** 2 && eye.weights.length === field.resolution ** 2 * 4 && eye.height.every(Number.isFinite) && eye.weights.every(Number.isFinite)));
check('heightfield_has_no_aperture_fallbacks', field.eyes.every(eye => eye.apertureFallbackCount === 0));
const { createCat: createV4 } = await import(new URL('cat-v4-attention.js', web));
const { createCat: createV6 } = await import(new URL('cat-v6-face.js', web));

for (const fps of [30, 60]) {
  const v4 = await createV4(THREE), v6 = await createV6(THREE);
  const b4 = bones(v4), b6 = bones(v6), m4 = meshes(v4), m6 = meshes(v6);
  const original = m6.find(mesh => mesh.name === m4[0].name);
  const extra = m6.filter(mesh => mesh !== original);
  check(`${fps}fps_exactly_one_added_mesh`, original && m4.length === 1 && m6.length === 2 && extra.length === 1);
  check(`${fps}fps_bone_names_unchanged`, b4.size === b6.size && [...b4.keys()].every(name => b6.has(name)));
  check(`${fps}fps_original_geometry_identical`, JSON.stringify(geometrySnapshot(m4[0])) === JSON.stringify(geometrySnapshot(original)));
  const originalGeometry = geometrySnapshot(original), originalMaterial = materialSnapshot(original.material), originalMap = original.material.map;
  const lids = extra[0];
  const triangles = (lids.geometry.index?.count ?? lids.geometry.attributes.position.count) / 3;
  check(`${fps}fps_added_geometry_under_budget`, triangles > 0 && triangles < 3500);
  check(`${fps}fps_lids_share_original_skeleton_and_bind`, lids.skeleton === original.skeleton && delta(lids.bindMatrix.elements, original.bindMatrix.elements) === 0);
  check(`${fps}fps_skin_palette_names_correct`, field.skinJoints.every((joint, i) => lids.skeleton.bones[joint]?.name === field.skinJointNames[i]));
  check(`${fps}fps_lids_reuse_original_colour_texture`, lids.material.map === original.material.map);
  check(`${fps}fps_original_mesh_has_no_new_morphs`, Object.keys(original.geometry.morphAttributes).length === 0);
  const run = { fps, frames: 0, addedTriangles: triangles, addedVertices: lids.geometry.attributes.position.count,
    maxBoneMatrixDelta: 0, maxBindInverseDelta: 0, maxFootDelta: 0, maxGaitDelta: 0, maxAttentionDelta: 0, maxWeightSumError: 0,
    footStatesIdentical: true, allFinite: true, skinWeightsInRange: true, skinIndicesCorrect: true,
    closedReached: false, halfReached: false, openReached: false, automaticBlinkSeen: false, untriggeredBlinkSeen: false,
    lidsHiddenWhenOpen: true, blinkWithinBounds: true, originalStayedUnchanged: true, maxHalfToClosedPositionDelta: 0 };
  let z = 0, yaw = 0, halfPositions;
  for (const cat of [v4, v6]) cat.setAttention({ enabled: true, yaw: 8, pitch: 4 });
  v6.setBlink({ mode: 'auto' });
  for (let frame = 0; frame < fps * 20; frame++) {
    const dt = 1 / fps, t = frame * dt;
    for (const cat of [v4, v6]) {
      if (frame === fps * 4) cat.setAttention({ yaw: -8, pitch: 0 });
      if (frame === fps * 8) cat.setAttention({ mode: 'natural' });
      if (frame === fps * 12) cat.setAttention({ enabled: false });
    }
    if (frame === fps) v6.setBlink({ amount: .5 });
    if (frame === Math.round(fps * 1.5) || frame === fps * 18) v6.setBlink({ mode: 'closed' });
    if (frame === fps * 2 || frame === fps * 19) v6.setBlink({ mode: 'open' });
    if (frame === fps * 3 || frame === fps * 11) v6.setBlink({ mode: 'auto', trigger: true });
    const speed = t >= 3 && t < 7 ? .6 : 0;
    z += speed * dt; if (t >= 7 && t < 9) yaw += .45 * dt;
    const state = { speed, moving: speed > 0, time: t, reset: frame === 0 || frame === fps * 10, sampleHeight: () => 0 };
    for (const cat of [v4, v6]) { cat.object.position.set(0, 0, z); cat.object.rotation.y = yaw; cat.update(dt, state); }
    const a = v4.getDebugState(), b = v6.getDebugState(), blink = b.blink;
    // Attached SkinnedMesh bindMatrixInverse follows the moving root in both
    // versions. Compare it to V4 at the same frame, never to the rest snapshot.
    run.maxBindInverseDelta = Math.max(run.maxBindInverseDelta, delta(m4[0].bindMatrixInverse.elements, original.bindMatrixInverse.elements));
    for (const [name, bone] of b4) run.maxBoneMatrixDelta = Math.max(run.maxBoneMatrixDelta, delta(bone.matrixWorld.elements, b6.get(name).matrixWorld.elements));
    for (let i = 0; i < a.feet.length; i++) for (const key of ['world', 'renderedWorld']) run.maxFootDelta = Math.max(run.maxFootDelta, delta(a.feet[i][key], b.feet[i][key]));
    run.footStatesIdentical &&= JSON.stringify(a.feet) === JSON.stringify(b.feet);
    for (const key of Object.keys(a.gait)) run.maxGaitDelta = Math.max(run.maxGaitDelta, Math.abs(a.gait[key] - b.gait[key]));
    for (const key of ['yaw', 'pitch']) run.maxAttentionDelta = Math.max(run.maxAttentionDelta, Math.abs(a.attention.appliedDegrees[key] - b.attention.appliedDegrees[key]));
    run.allFinite &&= allFinite(b) && Object.values(lids.geometry.attributes).every(attribute => attribute.array.every(Number.isFinite));
    const sw = lids.geometry.attributes.skinWeight, si = lids.geometry.attributes.skinIndex;
    for (let vertex = 0; vertex < sw.count; vertex++) {
      let sum = 0;
      for (let slot = 0; slot < 4; slot++) {
        const weight = sw.getComponent(vertex, slot); sum += weight;
        run.skinWeightsInRange &&= weight >= 0 && weight <= 1;
        run.skinIndicesCorrect &&= si.getComponent(vertex, slot) === field.skinJoints[slot];
      }
      run.maxWeightSumError = Math.max(run.maxWeightSumError, Math.abs(sum - 1));
    }
    const values = [blink.amount, blink.left, blink.right];
    run.blinkWithinBounds &&= values.every(value => value >= 0 && value <= 1);
    if (frame === Math.round(fps * 1.3)) { run.halfReached = values.every(value => value === .5) && lids.visible; halfPositions = [...lids.geometry.attributes.position.array]; }
    if (frame === Math.round(fps * 1.8)) { run.closedReached = values.every(value => value === 1) && lids.visible; run.maxHalfToClosedPositionDelta = delta(halfPositions, lids.geometry.attributes.position.array); }
    if (frame === Math.round(fps * 2.8)) run.openReached = values.every(value => value === 0) && !lids.visible;
    if (blink.amount === 0) run.lidsHiddenWhenOpen &&= !lids.visible;
    if (blink.mode === 'auto' && blink.amount > .7) run.automaticBlinkSeen = true;
    if (blink.mode === 'auto' && blink.amount > .7 && ((t > 4.5 && t < 10) || (t > 12.5 && t < 18))) run.untriggeredBlinkSeen = true;
    if (frame % fps === 0 || frame === fps * 20 - 1) run.originalStayedUnchanged &&= JSON.stringify(geometrySnapshot(original)) === JSON.stringify(originalGeometry) && JSON.stringify(materialSnapshot(original.material)) === JSON.stringify(originalMaterial) && original.material.map === originalMap;
    run.frames++;
  }
  report.runs.push(run);
  for (const key of ['maxBoneMatrixDelta', 'maxBindInverseDelta', 'maxFootDelta', 'maxGaitDelta', 'maxAttentionDelta']) check(`${fps}fps_${key}_exactly_zero`, run[key] === 0);
  for (const key of ['footStatesIdentical', 'allFinite', 'skinWeightsInRange', 'skinIndicesCorrect', 'closedReached', 'halfReached', 'openReached', 'automaticBlinkSeen', 'untriggeredBlinkSeen', 'lidsHiddenWhenOpen', 'blinkWithinBounds', 'originalStayedUnchanged']) check(`${fps}fps_${key}`, run[key]);
  check(`${fps}fps_skin_weights_normalized`, run.maxWeightSumError < 1e-6);
  check(`${fps}fps_lids_actually_move_between_half_and_closed`, run.maxHalfToClosedPositionDelta > .001);
  v4.dispose(); v6.dispose();
}
check('compared_1800_frames', report.runs.reduce((sum, run) => sum + run.frames, 0) === 1800);
check('legacy_files_still_match_fixed_baseline', JSON.stringify(await hashes(Object.keys(protectedHashes))) === JSON.stringify(protectedHashes));
check('tested_runtime_files_frozen_during_check', JSON.stringify(await hashes(testedFiles)) === JSON.stringify(report.testedFiles));
report.passed = failures.length === 0; report.failures = failures;
report.visualVerification = 'This CPU check establishes preservation and finite skinned eyelid geometry, not side-view occlusion or natural appearance; browser image review is still required.';
const reportURL = new URL('assets/cat-v6-face-matrix-check.json', project);
await writeFile(reportURL, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, runs: report.runs, report: fileURLToPath(reportURL) }, null, 2));
if (failures.length) process.exitCode = 1;
