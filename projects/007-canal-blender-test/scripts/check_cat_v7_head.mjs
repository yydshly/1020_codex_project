// Full V7 wrapper regression against V6. Uses the actual source GLB skin and
// geometry. A no-pixel texture replaces only image decoding in memory; no GPU.
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
const testedFiles = ['cat-v7-head.js', 'cat-v7-head-skin.js', 'cat-v6-face.js', 'cat-v6-lid-material.js', 'models/cat-v6-lid-surface.json'];
async function hashes(paths) { return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(new URL(path, web)))]))); }
const report = { checkedAt: new Date().toISOString(), method: 'CPU; real GLB geometry/skin/joints; no-pixel Texture fixture only for omitted image decode', checks: {}, runs: [], testedFiles: await hashes(testedFiles) };
const failures = [];
function check(name, condition) { report.checks[name] = Boolean(condition); if (!condition) failures.push(name); }
function delta(a, b) { if (a.length !== b.length) return Infinity; let max = 0; for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]-b[i])); return max; }
function bones(cat) { const map = new Map(); cat.object.traverse(node => { if (node.isBone) map.set(node.name, node); }); return map; }
function meshes(cat) { const list = []; cat.object.traverse(node => { if (node.isMesh) list.push(node); }); return list; }
function arrayHash(attribute) { return sha(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)); }
function geometrySnapshot(mesh) { return { attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).filter(([key]) => key !== 'skinWeight' && key !== 'skinIndex').map(([key, attribute]) => [key, arrayHash(attribute)])), index: arrayHash(mesh.geometry.index), morphs: Object.keys(mesh.geometry.morphAttributes), bindMatrix: [...mesh.bindMatrix.elements] }; }
function allFinite(value) { if (typeof value === 'number') return Number.isFinite(value); return !value || typeof value !== 'object' || Object.values(value).every(allFinite); }
function headWeight(mesh, vertex) {
  const sw = mesh.geometry.attributes.skinWeight, si = mesh.geometry.attributes.skinIndex;
  let value = 0;
  for (let slot = 0; slot < 4; slot++) if (mesh.skeleton.bones[si.getComponent(vertex, slot)]?.name === 'head') value += sw.getComponent(vertex, slot);
  return value;
}
function validateSkin(mesh) {
  const sw = mesh.geometry.attributes.skinWeight, si = mesh.geometry.attributes.skinIndex;
  let maxSumError = 0, finite = true, inRange = true, paletteValid = true;
  for (let vertex = 0; vertex < sw.count; vertex++) {
    let sum = 0;
    for (let slot = 0; slot < 4; slot++) {
      const w = sw.getComponent(vertex, slot), joint = si.getComponent(vertex, slot);
      sum += w; finite &&= Number.isFinite(w); inRange &&= w >= 0 && w <= 1;
      paletteValid &&= Number.isInteger(joint) && Boolean(mesh.skeleton.bones[joint]);
    }
    maxSumError = Math.max(maxSumError, Math.abs(sum-1));
  }
  return { maxSumError, finite, inRange, paletteValid };
}

GLTFLoader.prototype.loadAsync = async function (url) {
  const bytes = await readFile(new URL(url)), jsonSize = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20+jsonSize).toString());
  const offset = 20+jsonSize, binSize = bytes.readUInt32LE(offset);
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(offset+8, offset+8+binSize).toString('base64');
  delete json.images; delete json.textures; delete json.materials; delete json.samplers;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const loaded = await this.parseAsync(JSON.stringify(json), '');
  loaded.scene.traverse(node => { if (node.isMesh) for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material.map = new THREE.Texture(); });
  return loaded;
};

const { createCat: createV6 } = await import(new URL('cat-v6-face.js', web));
const { createCat: createV7 } = await import(new URL('cat-v7-head.js', web));
const eyeMetadata = JSON.parse(await readFile(new URL('assets/cat-v5-eye-landmarks-final.json', project), 'utf8'));
for (const fps of [30, 60]) {
  const v6 = await createV6(THREE), v7 = await createV7(THREE);
  const b6 = bones(v6), b7 = bones(v7), m6 = meshes(v6), m7 = meshes(v7);
  const body6 = m6.find(mesh => !mesh.name.includes('V6 curved'));
  const body7 = m7.find(mesh => !mesh.name.includes('V6 curved'));
  const lids = m7.find(mesh => mesh.name.includes('V6 curved'));
  check(`${fps}fps_mesh_and_bone_counts_preserved`, m6.length === m7.length && b6.size === b7.size && [...b6.keys()].every(name => b7.has(name)));
  check(`${fps}fps_body_position_normal_uv_index_unchanged`, JSON.stringify(geometrySnapshot(body6)) === JSON.stringify(geometrySnapshot(body7)));
  check(`${fps}fps_body_skin_actually_changed`, arrayHash(body6.geometry.attributes.skinWeight) !== arrayHash(body7.geometry.attributes.skinWeight));
  const bodyStatic = geometrySnapshot(body7), oldSkinHash = [arrayHash(body6.geometry.attributes.skinIndex), arrayHash(body6.geometry.attributes.skinWeight)];
  const newSkinHash = [arrayHash(body7.geometry.attributes.skinIndex), arrayHash(body7.geometry.attributes.skinWeight)];
  const bodyMap = body7.material.map;
  const skin = validateSkin(body7);
  check(`${fps}fps_body_skin_valid_and_normalized`, skin.finite && skin.inRange && skin.paletteValid && skin.maxSumError < 1e-6);
  const eyeIds = [...new Set(Object.values(eyeMetadata.eyes).flatMap(eye => eye.aperture_vertex_ids))];
  check(`${fps}fps_eye_aperture_skin_rigid_head`, eyeIds.every(id => headWeight(body7, id) > 1-1e-7));
  // Pick rigid face/skull vertices distributed over the face, ears and jaw.
  // These anatomical distances must remain fixed through yaw, pitch and gait.
  const p = body7.geometry.attributes.position, candidates = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)-.005, z = p.getZ(i)-.15;
    if (p.getY(i) >= .284 && x*.8289901626607705 + z*.5592631851031045 >= .018 && headWeight(body7, i) >= 1-1e-7) candidates.push(i);
  }
  const selected = Array.from({length: Math.min(72, candidates.length)}, (_, i) => candidates[Math.floor(i*(candidates.length-1)/Math.max(1, Math.min(72, candidates.length)-1))]);
  const rest = selected.map(i => new THREE.Vector3().fromBufferAttribute(p, i));
  check(`${fps}fps_rigid_face_samples_exist`, selected.length >= 32);
  const run = { fps, frames: 0, maxNonHeadBoneMatrixDelta: 0, maxFootDelta: 0, maxGaitDelta: 0,
    maxRigidFacePairDistanceError: 0, maxHeadQuaternionDifference: 0, maxLidWeightSumError: 0,
    bodySkinWeightSumError: skin.maxSumError, faceSamples: selected.length, maxWalkingAttentionYaw: 0,
    footStatesIdentical: true, allFinite: true, lidsAlwaysHeadSkinned: true, bodyStaticThroughout: true,
    oldSkinPreserved: true, newSkinStable: true, lidsClosedReached: false, lidsHalfReached: false,
    lidsOpenReached: false, automaticBlinkSeen: false, lidsHiddenWhenOpen: true };
  let z = 0, yaw = 0;
  v6.setAttention({ enabled: false });
  v7.setAttention({ enabled: true, yaw: 6, pitch: 3 });
  v7.setBlink({ mode: 'auto' });
  for (let frame = 0; frame < fps*20; frame++) {
    const dt = 1/fps, t = frame*dt;
    if (frame === fps*4) v7.setAttention({ yaw: -6, pitch: 0 });
    if (frame === fps*8) v7.setAttention({ mode: 'natural' });
    if (frame === fps*12) v7.setAttention({ enabled: false });
    if (frame === fps) v7.setBlink({ amount: .5 });
    if (frame === Math.round(fps*1.5) || frame === fps*18) v7.setBlink({ mode: 'closed' });
    if (frame === fps*2 || frame === fps*19) v7.setBlink({ mode: 'open' });
    if (frame === fps*3 || frame === fps*11) v7.setBlink({ mode: 'auto', trigger: true });
    const speed = t >= 3 && t < 7 ? .6 : 0;
    z += speed*dt; if (t >= 7 && t < 9) yaw += .45*dt;
    const state = { speed, moving: speed > 0, time: t, reset: frame === 0 || frame === fps*10, sampleHeight: () => 0 };
    for (const cat of [v6, v7]) { cat.object.position.set(0, 0, z); cat.object.rotation.y = yaw; cat.update(dt, state); }
    const a = v6.getDebugState(), b = v7.getDebugState(), blink = b.blink;
    for (const [name, bone] of b6) if (name !== 'head') run.maxNonHeadBoneMatrixDelta = Math.max(run.maxNonHeadBoneMatrixDelta, delta(bone.matrixWorld.elements, b7.get(name).matrixWorld.elements));
    for (let i = 0; i < a.feet.length; i++) for (const key of ['world', 'renderedWorld']) run.maxFootDelta = Math.max(run.maxFootDelta, delta(a.feet[i][key], b.feet[i][key]));
    run.footStatesIdentical &&= JSON.stringify(a.feet) === JSON.stringify(b.feet);
    for (const key of Object.keys(a.gait)) run.maxGaitDelta = Math.max(run.maxGaitDelta, Math.abs(a.gait[key]-b.gait[key]));
    run.maxHeadQuaternionDifference = Math.max(run.maxHeadQuaternionDifference, b6.get('head').quaternion.angleTo(b7.get('head').quaternion));
    if (t > 5 && t < 7) run.maxWalkingAttentionYaw = Math.max(run.maxWalkingAttentionYaw, Math.abs(b.attention.appliedDegrees.yaw));
    run.allFinite &&= allFinite(b) && Object.values(lids.geometry.attributes).every(attribute => attribute.array.every(Number.isFinite));
    const lidSkin = validateSkin(lids);
    run.maxLidWeightSumError = Math.max(run.maxLidWeightSumError, lidSkin.maxSumError);
    run.allFinite &&= lidSkin.finite && lidSkin.inRange && lidSkin.paletteValid;
    for (let i = 0; i < lids.geometry.attributes.position.count; i++) run.lidsAlwaysHeadSkinned &&= headWeight(lids, i) > 1-1e-7;
    if (frame === Math.round(fps*1.3)) run.lidsHalfReached = blink.amount === .5 && lids.visible;
    if (frame === Math.round(fps*1.8)) run.lidsClosedReached = blink.amount === 1 && lids.visible;
    if (frame === Math.round(fps*2.8)) run.lidsOpenReached = blink.amount === 0 && !lids.visible;
    if (blink.mode === 'auto' && blink.amount > .7 && t > 4.5) run.automaticBlinkSeen = true;
    if (blink.amount === 0) run.lidsHiddenWhenOpen &&= !lids.visible;
    if (frame % Math.max(1, Math.floor(fps/5)) === 0 || frame === fps*20-1) {
      body7.skeleton.update();
      const posed = selected.map(index => body7.getVertexPosition(index, new THREE.Vector3()));
      for (let i = 0; i < posed.length; i++) {
        const j = (i*17+11)%posed.length;
        run.maxRigidFacePairDistanceError = Math.max(run.maxRigidFacePairDistanceError, Math.abs(posed[i].distanceTo(posed[j])-rest[i].distanceTo(rest[j])));
        run.allFinite &&= posed[i].toArray().every(Number.isFinite);
      }
    }
    if (frame % fps === 0 || frame === fps*20-1) {
      run.bodyStaticThroughout &&= JSON.stringify(geometrySnapshot(body7)) === JSON.stringify(bodyStatic) && body7.material.map === bodyMap;
      run.oldSkinPreserved &&= arrayHash(body6.geometry.attributes.skinIndex) === oldSkinHash[0] && arrayHash(body6.geometry.attributes.skinWeight) === oldSkinHash[1];
      run.newSkinStable &&= arrayHash(body7.geometry.attributes.skinIndex) === newSkinHash[0] && arrayHash(body7.geometry.attributes.skinWeight) === newSkinHash[1];
    }
    run.frames++;
  }
  report.runs.push(run);
  for (const key of ['maxNonHeadBoneMatrixDelta', 'maxFootDelta', 'maxGaitDelta']) check(`${fps}fps_${key}_exactly_zero`, run[key] === 0);
  for (const key of ['footStatesIdentical', 'allFinite', 'lidsAlwaysHeadSkinned', 'bodyStaticThroughout', 'oldSkinPreserved', 'newSkinStable', 'lidsClosedReached', 'lidsHalfReached', 'lidsOpenReached', 'automaticBlinkSeen', 'lidsHiddenWhenOpen']) check(`${fps}fps_${key}`, run[key]);
  check(`${fps}fps_rigid_skull_distances_preserved`, run.maxRigidFacePairDistanceError < 5e-7);
  check(`${fps}fps_head_pose_actually_corrected`, run.maxHeadQuaternionDifference > .75 && run.maxHeadQuaternionDifference < 1.3);
  check(`${fps}fps_steady_walk_attention_within_two_degrees`, run.maxWalkingAttentionYaw <= 2.01);
  check(`${fps}fps_lid_skin_normalized`, run.maxLidWeightSumError < 1e-6);
  v6.dispose(); v7.dispose();
}
check('compared_1800_frames', report.runs.reduce((sum, run) => sum+run.frames, 0) === 1800);
check('tested_files_frozen_during_check', JSON.stringify(await hashes(testedFiles)) === JSON.stringify(report.testedFiles));

const baseline = JSON.parse(await readFile(new URL('assets/cat-v7-preservation-baseline.json', project), 'utf8'));
const runtimeLogNames = new Set(['assets/cat-v6-preview-server-out.log', 'assets/cat-v6-preview-server-error.log']);
const preservation = { checkedAt: new Date().toISOString(), baselineCount: baseline.files.length, versionFiles: [], runtimeLogs: [], missing: [], changed: [] };
for (const item of baseline.files) {
  let bytes;
  try { bytes = await readFile(new URL(item.path, project)); } catch { preservation.missing.push(item.path); continue; }
  const actual = { path: item.path, bytes: bytes.length, sha256: sha(bytes) };
  if (runtimeLogNames.has(item.path)) { preservation.runtimeLogs.push({ ...actual, excludedReason: 'Active local preview server output; expected to grow with requests', baselineBytes: item.bytes }); continue; }
  const unchanged = actual.sha256 === item.sha256 && actual.bytes === item.bytes;
  preservation.versionFiles.push({ ...actual, unchanged });
  if (!unchanged) preservation.changed.push(item.path);
}
preservation.passed = preservation.missing.length === 0 && preservation.changed.length === 0;
check('530_file_preservation_baseline_present', preservation.baselineCount === 530);
check('two_expected_runtime_logs_identified', preservation.runtimeLogs.length === 2);
check('all_version_files_preserved', preservation.passed);
await writeFile(new URL('assets/cat-v7-preservation-check.json', project), JSON.stringify(preservation, null, 2)+'\n');
report.preservation = { baselineCount: preservation.baselineCount, versionFileCount: preservation.versionFiles.length, runtimeLogCount: preservation.runtimeLogs.length, changed: preservation.changed, missing: preservation.missing };
report.passed = failures.length === 0; report.failures = failures;
report.scope = 'Preserves the original geometry and every non-head bone/foot/gait. Checks rigid skull distances and eyelid skin; neck silhouette and eyelid contact still require visual inspection.';
const reportURL = new URL('assets/cat-v7-head-matrix-check.json', project);
await writeFile(reportURL, JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ passed: report.passed, failures, checks: report.checks, runs: report.runs, preservation: report.preservation, report: fileURLToPath(reportURL) }, null, 2));
if (failures.length) process.exitCode = 1;
