// Real geometry/skin CPU regression; image decode is omitted only in memory.
// Run after cat-v5-face.js and cat-v5-face.glb are generated. No old file writes.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const project = new URL("../", import.meta.url), web = new URL("web/", project);
const threeURL = new URL("vendor/three/build/three.module.min.js", web).href;
const addonsURL = new URL("vendor/three/examples/jsm/", web).href;
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`), import.meta.url);
const THREE = await import(threeURL);
const { GLTFLoader } = await import(new URL("vendor/three/examples/jsm/loaders/GLTFLoader.js", web));
if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class ProgressEvent { constructor(type, values) { this.type = type; Object.assign(this, values); } };
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (resource, options) => {
  const url = resource instanceof URL ? resource : new URL(typeof resource === "string" ? resource : resource.url);
  return url.protocol === "file:" ? new Response(await readFile(url)) : nativeFetch(resource, options);
};

// Captured before V5 implementation; catches preparation-time changes as well
// as accidental writes during this test, rather than only comparing a run to itself.
const protectedHashes = {
  "roam-cat-v3.js": "40a2196fee7d02c2239bcd49d9c0c3cc16dd3e4ee4ca099e59a65ad412794b8d",
  "cat-v4-attention.js": "2d849dc7e802d77c1b7a046ad4e49fd91ea30d9ed6cff68daf31def02ba6658b",
  "cat-v3-study.js": "d5b9a4ef8a279abd078d64f39a7ea870ceef5271038b40068775fd3cef6b44fb",
  "cat-v3-study.html": "6749e14f1a12dca38af94ef93558a960f341d5c6f590a1ec68d6135dea0b6f16",
  "models/cat-v3-rig.glb": "6c8d0f0133805e0727cc6cdfc558456d670e0d33a5158685084413e7786a77f1",
  "models/cat-v3-rig.json": "8d067bc3456a0b32f9d0d66f46c27d9fe464c6dd618458893f49fd2404c4b5ea"
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function hashes() {
  return Object.fromEntries(await Promise.all(Object.keys(protectedHashes).map(async path => [path, sha(await readFile(new URL(path, web)))])));
}
function glb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error("Invalid GLB header");
  const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size).toString());
  const offset = 20 + size, binSize = bytes.readUInt32LE(offset);
  return { json, bin: bytes.subarray(offset + 8, offset + 8 + binSize) };
}
function accessor(asset, index) {
  const entry = asset.json.accessors[index], view = asset.json.bufferViews[entry.bufferView];
  if (entry.sparse) throw new Error("Unexpected sparse base accessor; expand before comparing");
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[entry.type];
  const bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[entry.componentType];
  const size = components * bytes, stride = view.byteStride || size, packed = Buffer.alloc(entry.count * size);
  const start = (view.byteOffset || 0) + (entry.byteOffset || 0);
  for (let n = 0; n < entry.count; n++) asset.bin.copy(packed, n * size, start + n * stride, start + n * stride + size);
  return { componentType: entry.componentType, type: entry.type, count: entry.count, normalized: Boolean(entry.normalized), sha: sha(packed) };
}
GLTFLoader.prototype.loadAsync = async function(url) {
  const { json, bin } = glb(await readFile(new URL(url)));
  json.buffers[0].uri = "data:application/octet-stream;base64," + bin.toString("base64");
  delete json.images; delete json.textures; delete json.materials; delete json.samplers;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  return this.parseAsync(JSON.stringify(json), "");
};

const report = { checkedAt: new Date().toISOString(), method: "CPU; full real geometry, joints and skin; image decode omitted in memory", checks: {}, runs: [], morphs: [], sourceHashes: await hashes() };
const failures = [];
function check(name, condition) { report.checks[name] = Boolean(condition); if (!condition) failures.push(name); }
function delta(a, b) {
  if (a.length !== b.length) return Infinity;
  let max = 0; for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}
function boneMap(cat) { const map = new Map(); cat.object.traverse(node => { if (node.isBone) map.set(node.name, node); }); return map; }
function meshes(cat) { const list = []; cat.object.traverse(node => { if (node.isMesh) list.push(node); }); return list; }
function finite(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (value && typeof value === "object") return Object.values(value).every(finite);
  return true;
}
function arrayHash(attribute) { return sha(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)); }

check("legacy_hashes_match_pre_V5_baseline", JSON.stringify(report.sourceHashes) === JSON.stringify(protectedHashes));
const oldAsset = glb(await readFile(new URL("models/cat-v3-rig.glb", web)));
const newAssetBytes = await readFile(new URL("models/cat-v5-face.glb", web));
const newAsset = glb(newAssetBytes);
const faceMetadata = JSON.parse(await readFile(new URL("models/cat-v5-face.json", web), "utf8"));
check("asset_matches_manifest_sha", faceMetadata.sha256 === sha(newAssetBytes) && faceMetadata.source_sha256 === protectedHashes["models/cat-v3-rig.glb"]);
check("old_binary_payload_preserved_byte_for_byte", oldAsset.bin.subarray(0, oldAsset.json.buffers[0].byteLength).equals(newAsset.bin.subarray(0, oldAsset.json.buffers[0].byteLength)));
check("asset_nodes_and_rest_transforms_unchanged", JSON.stringify(oldAsset.json.nodes) === JSON.stringify(newAsset.json.nodes));
check("asset_skin_hierarchy_unchanged", JSON.stringify(oldAsset.json.skins) === JSON.stringify(newAsset.json.skins));
check("asset_materials_and_images_unchanged", ["materials", "textures", "images", "samplers"].every(key => JSON.stringify(oldAsset.json[key]) === JSON.stringify(newAsset.json[key])));
check("original_accessors_unchanged", oldAsset.json.accessors.every((entry, index) => JSON.stringify(accessor(oldAsset, index)) === JSON.stringify(accessor(newAsset, index))));
check("mesh_and_primitive_counts_unchanged", oldAsset.json.meshes.length === newAsset.json.meshes.length && oldAsset.json.meshes.every((mesh, i) => mesh.primitives.length === newAsset.json.meshes[i].primitives.length));
check("base_attribute_bindings_unchanged", oldAsset.json.meshes.every((mesh, i) => mesh.primitives.every((primitive, j) => {
  const next = newAsset.json.meshes[i].primitives[j];
  return JSON.stringify(primitive.attributes) === JSON.stringify(next.attributes) && primitive.indices === next.indices;
})));

const { createCat: createV4 } = await import(new URL("cat-v4-attention.js", web));
const { createCat: createV5 } = await import(new URL("cat-v5-face.js", web));
for (const fps of [30, 60]) {
  const v4 = await createV4(THREE), v5 = await createV5(THREE);
  const b4 = boneMap(v4), b5 = boneMap(v5), m4 = meshes(v4), m5 = meshes(v5);
  check(`${fps}fps_bone_names_and_mesh_count_unchanged`, b4.size === b5.size && [...b4.keys()].every(name => b5.has(name)) && m4.length === m5.length);
  const morphMeshes = m5.filter(mesh => mesh.geometry.morphAttributes.position?.length);
  check(`${fps}fps_has_two_eyelid_morphs`, morphMeshes.length > 0 && morphMeshes.every(mesh => mesh.geometry.morphAttributes.position.length === 2 && mesh.geometry.morphTargetsRelative));
  check(`${fps}fps_runtime_base_geometry_unchanged`, m4.every((mesh, i) => {
    const next = m5[i];
    return Object.entries(mesh.geometry.attributes).every(([key, attribute]) => next.geometry.attributes[key] && arrayHash(attribute) === arrayHash(next.geometry.attributes[key]))
      && arrayHash(mesh.geometry.index) === arrayHash(next.geometry.index)
      && delta(mesh.bindMatrix.elements, next.bindMatrix.elements) === 0;
  }));
  if (fps === 30) for (const mesh of morphMeshes) {
    const base = mesh.geometry.attributes.position, count = base.count;
    for (const [target, attribute] of mesh.geometry.morphAttributes.position.entries()) {
      const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], affected = new Set();
      let maxDisplacement = 0, allFinite = true, minHeadWeight = 1, minHeadNeckWeight = 1, headIsDominant = true;
      const skinIndices = mesh.geometry.attributes.skinIndex, skinWeights = mesh.geometry.attributes.skinWeight;
      for (let vertex = 0; vertex < count; vertex++) {
        const d = [attribute.getX(vertex), attribute.getY(vertex), attribute.getZ(vertex)];
        allFinite &&= d.every(Number.isFinite);
        const length = Math.hypot(...d); maxDisplacement = Math.max(maxDisplacement, length);
        if (length <= 1e-10) continue;
        affected.add(vertex);
        const p = [base.getX(vertex), base.getY(vertex), base.getZ(vertex)];
        for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis], p[axis]); high[axis] = Math.max(high[axis], p[axis]); }
        let headWeight = 0, neckWeight = 0, largestOtherWeight = 0;
        for (let slot = 0; slot < 4; slot++) {
          const name = mesh.skeleton.bones[skinIndices.getComponent(vertex, slot)]?.name, weight = skinWeights.getComponent(vertex, slot);
          if (name === "head") headWeight += weight;
          else { largestOtherWeight = Math.max(largestOtherWeight, weight); if (name === "neck") neckWeight += weight; }
        }
        minHeadWeight = Math.min(minHeadWeight, headWeight);
        minHeadNeckWeight = Math.min(minHeadNeckWeight, headWeight + neckWeight);
        headIsDominant &&= headWeight >= largestOtherWeight;
      }
      const extent = high.map((value, i) => value - low[i]);
      const item = { mesh: mesh.name, target, name: Object.keys(mesh.morphTargetDictionary).find(key => mesh.morphTargetDictionary[key] === target), affectedVertices: affected.size, vertexCount: count, changedRatio: affected.size / count, maxDisplacement, minHeadWeight, minHeadNeckWeight, headIsDominant, bounds: { low, high, extent }, allFinite };
      const declared = faceMetadata.morph_targets.find(entry => entry.name === item.name);
      report.morphs.push(item);
      check(`morph_${target}_finite_nonzero_local_displacement`, allFinite && affected.size > 0 && maxDisplacement > 1e-5 && maxDisplacement < .025);
      check(`morph_${target}_under_five_percent_of_mesh`, affected.size / count < .05);
      // Original skin blends these eye vertices between head and neck. Keep
      // those exact weights; do not demand a new rigid head-only weighting.
      check(`morph_${target}_confined_to_small_head_region`, extent[0] < .10 && extent[1] < .07 && extent[2] < .10 && headIsDominant && minHeadNeckWeight >= 1 - 1e-6);
      check(`morph_${target}_matches_declared_eye_region`, declared
        && delta(low, declared.region_min) < 1e-7 && delta(high, declared.region_max) < 1e-7
        && declared.affected_vertices === affected.size
        && declared.morph_vertex_indices.length === affected.size
        && declared.morph_vertex_indices.every(vertex => affected.has(vertex)));
      // These broad bounds are only a locality guard. Closed-eye likeness is
      // assessed visually; no numeric threshold can certify its anatomy.
      if (mesh.geometry.morphAttributes.normal?.[target]) {
        const normals = mesh.geometry.morphAttributes.normal[target];
        const ring = new Set(affected), indices = mesh.geometry.index;
        for (let face = 0; face < indices.count; face += 3) {
          const vertices = [indices.getX(face), indices.getX(face + 1), indices.getX(face + 2)];
          if (vertices.some(vertex => affected.has(vertex))) vertices.forEach(vertex => ring.add(vertex));
        }
        const coordinateKey = vertex => [base.getX(vertex), base.getY(vertex), base.getZ(vertex)].join(",");
        const ringPositions = new Set([...ring].map(coordinateKey));
        let normalFinite = true, outsideRing = 0, outsideWeldedRing = 0, maxClosedNormalUnitError = 0;
        for (let vertex = 0; vertex < count; vertex++) {
          const d = [normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)];
          normalFinite &&= d.every(Number.isFinite);
          if (Math.hypot(...d) > 1e-8) {
            if (!ring.has(vertex)) {
              outsideRing++;
              // UV seams duplicate a surface vertex. Accept only an exactly
              // coincident one-ring position; there is no radius expansion.
              if (!ringPositions.has(coordinateKey(vertex))) outsideWeldedRing++;
            }
            const n = mesh.geometry.attributes.normal;
            maxClosedNormalUnitError = Math.max(maxClosedNormalUnitError,
              Math.abs(Math.hypot(n.getX(vertex) + d[0], n.getY(vertex) + d[1], n.getZ(vertex) + d[2]) - 1));
          }
        }
        item.normalAffectedOutsideRawOneRing = outsideRing;
        item.normalAffectedOutsideWeldedOneRing = outsideWeldedRing;
        item.maxClosedNormalUnitError = maxClosedNormalUnitError;
        check(`morph_${target}_normal_delta_finite_and_local`, normalFinite && outsideWeldedRing === 0 && maxClosedNormalUnitError < 1e-4);
      }
    }
  }
  const run = { fps, frames: 0, maxBoneMatrixDelta: 0, maxFootDelta: 0, maxGaitDelta: 0, maxAttentionDelta: 0, footStatesIdentical: true, minBlink: 1, maxBlink: 0, closedReached: false, openReached: false, automaticBlinkSeen: false, untriggeredBlinkSeen: false, allFinite: true, blinkWithinBounds: true, morphWithinBounds: true };
  let z = 0, yaw = 0;
  for (const cat of [v4, v5]) cat.setAttention({ enabled: true, yaw: 8, pitch: 4 });
  v5.setBlink({ mode: "auto" });
  for (let frame = 0; frame < fps * 20; frame++) {
    const dt = 1 / fps, t = frame * dt;
    for (const cat of [v4, v5]) {
      if (frame === fps * 4) cat.setAttention({ yaw: -8, pitch: 0 });
      if (frame === fps * 8) cat.setAttention({ mode: "natural" });
      if (frame === fps * 12) cat.setAttention({ enabled: false });
    }
    if (frame === fps || frame === fps * 18) v5.setBlink({ mode: "closed" });
    if (frame === fps * 2 || frame === fps * 19) v5.setBlink({ mode: "open" });
    if (frame === fps * 3 || frame === fps * 11) v5.setBlink({ mode: "auto", trigger: true });
    const speed = t >= 3 && t < 7 ? .6 : 0;
    z += speed * dt; if (t >= 7 && t < 9) yaw += .45 * dt;
    const state = { speed, moving: speed > 0, time: t, reset: frame === 0 || frame === fps * 10, sampleHeight: () => 0 };
    for (const cat of [v4, v5]) { cat.object.position.set(0, 0, z); cat.object.rotation.y = yaw; cat.update(dt, state); }
    const a = v4.getDebugState(), b = v5.getDebugState(), blink = b.blink;
    if (!blink) throw new Error("getDebugState().blink is required");
    for (const [name, bone] of b4) run.maxBoneMatrixDelta = Math.max(run.maxBoneMatrixDelta, delta(bone.matrixWorld.elements, b5.get(name).matrixWorld.elements));
    for (let i = 0; i < a.feet.length; i++) for (const key of ["world", "renderedWorld"]) run.maxFootDelta = Math.max(run.maxFootDelta, delta(a.feet[i][key], b.feet[i][key]));
    run.footStatesIdentical &&= JSON.stringify(a.feet) === JSON.stringify(b.feet);
    for (const key of Object.keys(a.gait)) run.maxGaitDelta = Math.max(run.maxGaitDelta, Math.abs(a.gait[key] - b.gait[key]));
    for (const key of ["yaw", "pitch"]) run.maxAttentionDelta = Math.max(run.maxAttentionDelta, Math.abs(a.attention.appliedDegrees[key] - b.attention.appliedDegrees[key]));
    run.allFinite &&= finite(b) && [...b5.values()].every(bone => bone.matrixWorld.elements.every(Number.isFinite));
    const values = [blink.amount, blink.left, blink.right];
    run.blinkWithinBounds &&= values.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
    run.minBlink = Math.min(run.minBlink, ...values); run.maxBlink = Math.max(run.maxBlink, ...values);
    const influences = morphMeshes.flatMap(mesh => [...mesh.morphTargetInfluences]);
    run.morphWithinBounds &&= influences.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
    if (frame === Math.round(fps * 1.8)) run.closedReached = values.every(value => Math.abs(value - 1) < 1e-5) && influences.every(value => Math.abs(value - 1) < 1e-5);
    if (frame === Math.round(fps * 2.8)) run.openReached = values.every(value => value === 0) && influences.every(value => value === 0);
    if (blink.mode === "auto" && blink.amount > .7) run.automaticBlinkSeen = true;
    if (blink.mode === "auto" && blink.amount > .7 && ((t > 4.5 && t < 10) || (t > 12.5 && t < 18))) run.untriggeredBlinkSeen = true;
    run.frames++;
  }
  report.runs.push(run);
  for (const key of ["maxBoneMatrixDelta", "maxFootDelta", "maxGaitDelta", "maxAttentionDelta"]) check(`${fps}fps_${key}_exactly_zero`, run[key] === 0);
  for (const key of ["footStatesIdentical", "closedReached", "openReached", "automaticBlinkSeen", "untriggeredBlinkSeen", "allFinite", "blinkWithinBounds", "morphWithinBounds"]) check(`${fps}fps_${key}`, run[key]);
  v4.dispose(); v5.dispose();
}
check("compared_1800_frames", report.runs.reduce((sum, run) => sum + run.frames, 0) === 1800);
check("legacy_files_still_match_pre_V5_baseline", JSON.stringify(await hashes()) === JSON.stringify(protectedHashes));
report.passed = failures.length === 0; report.failures = failures;
report.visualVerification = "CPU verifies preservation, locality and finite eyelid weights, not convincing closed-eye appearance; browser review is separate.";
const reportURL = new URL("assets/cat-v5-face-matrix-check.json", project);
await writeFile(reportURL, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, runs: report.runs, morphs: report.morphs, report: fileURLToPath(reportURL) }, null, 2));
if (failures.length) process.exitCode = 1;
