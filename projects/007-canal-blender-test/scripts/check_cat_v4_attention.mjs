// CPU-only animation regression: decode the real mesh/skin while excluding
// images from an in-memory GLB copy. No browser, GPU or asset mutation is used.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const project = new URL("../", import.meta.url);
const web = new URL("web/", project);
const threeURL = new URL("vendor/three/build/three.module.min.js", web).href;
const addonsURL = new URL("vendor/three/examples/jsm/", web).href;
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`), import.meta.url);
const THREE = await import(threeURL);
const { GLTFLoader } = await import(new URL("vendor/three/examples/jsm/loaders/GLTFLoader.js", web));
if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class ProgressEvent { constructor(type, values) { this.type = type; Object.assign(this, values); } };
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (resource, options) => {
  const address = resource instanceof URL ? resource : new URL(typeof resource === "string" ? resource : resource.url);
  if (address.protocol === "file:") return new Response(await readFile(address));
  return nativeFetch(resource, options);
};
const protectedFiles = ["roam-cat-v3.js", "cat-v3-study.js", "cat-v3-study.html", "models/cat-v3-rig.glb", "models/cat-v3-rig.json"];
async function hashes() {
  const entries = await Promise.all(protectedFiles.map(async path => [path, createHash("sha256").update(await readFile(new URL(path, web))).digest("hex")]));
  return Object.fromEntries(entries);
}
const before = await hashes();
GLTFLoader.prototype.loadAsync = async function (url) {
  const raw = await readFile(new URL(url));
  const jsonSize = raw.readUInt32LE(12), source = JSON.parse(raw.subarray(20, 20 + jsonSize).toString());
  const binHeader = 20 + jsonSize, binSize = raw.readUInt32LE(binHeader);
  source.buffers[0].uri = "data:application/octet-stream;base64," + raw.subarray(binHeader + 8, binHeader + 8 + binSize).toString("base64");
  delete source.images; delete source.textures; delete source.materials; delete source.samplers;
  for (const mesh of source.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  return this.parseAsync(JSON.stringify(source), "");
};
const { createCat: createV3 } = await import(new URL("roam-cat-v3.js", web));
const { createCat: createV4 } = await import(new URL("cat-v4-attention.js", web));
const report = { checkedAt: new Date().toISOString(), method: "CPU; original GLB geometry, joints and skin; texture image decode omitted in memory", checks: {}, runs: [], sourceHashes: before };
let failures = [];
function check(name, condition) { report.checks[name] = condition; if (!condition) failures.push(name); }
function maxDelta(a, b) { return Math.max(...a.map((value, i) => Math.abs(value - b[i]))); }
function boneMap(cat) { const result = new Map(); cat.object.traverse(node => { if (node.isBone) result.set(node.name, node); }); return result; }
for (const fps of [30, 60]) {
  const v3 = await createV3(THREE), v4 = await createV4(THREE), b3 = boneMap(v3), b4 = boneMap(v4);
  const run = { fps, frames: 0, maxNonHeadBoneMatrixDelta: 0, maxFootDelta: 0, maxGaitDelta: 0, maxHeadAngle: 0, maxWalkingYaw: 0, maxPitch: 0, maxYawEnvelopeOvershoot: 0, resetZero: true };
  const dt = 1 / fps; let z = 0, yaw = 0, nonFinite = false, disabledIdentical = false;
  v4.setAttention({ enabled: true, yaw: 8, pitch: 4 });
  for (let frame = 0; frame < fps * 20; frame++) {
    const t = frame * dt;
    if (frame === fps * 4) v4.setAttention({ yaw: -8, pitch: 0 });
    if (frame === fps * 8) v4.setAttention({ mode: "natural" });
    if (frame === fps * 12) v4.setAttention({ enabled: false });
    const speed = t >= 3 && t < 7 ? .6 : 0;
    z += speed * dt;
    if (t >= 7 && t < 9) yaw += .45 * dt;
    const state = { speed, moving: speed > 0, time: t, reset: frame === 0 || frame === fps * 10, sampleHeight: () => 0 };
    for (const cat of [v3, v4]) { cat.object.position.set(0, 0, z); cat.object.rotation.y = yaw; cat.update(dt, state); }
    const a = v3.getDebugState(), b = v4.getDebugState();
    for (const [name, bone] of b3) if (name !== "head") run.maxNonHeadBoneMatrixDelta = Math.max(run.maxNonHeadBoneMatrixDelta, maxDelta(bone.matrixWorld.elements, b4.get(name).matrixWorld.elements));
    for (let i = 0; i < a.feet.length; i++) for (const key of ["world", "renderedWorld"]) run.maxFootDelta = Math.max(run.maxFootDelta, maxDelta(a.feet[i][key], b.feet[i][key]));
    for (const key of Object.keys(a.gait)) run.maxGaitDelta = Math.max(run.maxGaitDelta, Math.abs(a.gait[key] - b.gait[key]));
    const headAngle = b3.get("head").quaternion.angleTo(b4.get("head").quaternion);
    run.maxHeadAngle = Math.max(run.maxHeadAngle, headAngle);
    run.maxPitch = Math.max(run.maxPitch, Math.abs(b.attention.appliedDegrees.pitch));
    run.maxYawEnvelopeOvershoot = Math.max(run.maxYawEnvelopeOvershoot, Math.abs(b.attention.appliedDegrees.yaw) - b.attention.yawLimit);
    if (speed >= .15) run.maxWalkingYaw = Math.max(run.maxWalkingYaw, Math.abs(b.attention.appliedDegrees.yaw));
    if (state.reset) run.resetZero &&= Math.abs(b.attention.appliedDegrees.yaw) + Math.abs(b.attention.appliedDegrees.pitch) === 0;
    if (t >= 18) disabledIdentical = headAngle < 1e-7;
    nonFinite ||= [...b4.values()].some(bone => bone.matrixWorld.elements.some(value => !Number.isFinite(value)));
    run.frames++;
  }
  report.runs.push(run);
  check(`${fps}fps_non_head_joints_unchanged`, run.maxNonHeadBoneMatrixDelta < 1e-12);
  check(`${fps}fps_foot_points_unchanged`, run.maxFootDelta < 1e-12);
  check(`${fps}fps_gait_unchanged`, run.maxGaitDelta < 1e-12);
  check(`${fps}fps_head_actually_turns`, run.maxHeadAngle > .08);
  check(`${fps}fps_walking_yaw_at_most_4_degrees`, run.maxWalkingYaw <= 4 + 1e-10);
  check(`${fps}fps_yaw_within_envelope`, run.maxYawEnvelopeOvershoot < 1e-10);
  check(`${fps}fps_pitch_at_most_4_degrees`, run.maxPitch <= 4 + 1e-10);
  check(`${fps}fps_reset_clears_attention`, run.resetZero);
  check(`${fps}fps_disabled_returns_to_original_head`, disabledIdentical);
  check(`${fps}fps_all_matrices_finite`, !nonFinite);
  v3.dispose(); v4.dispose();
}
check("existing_source_files_unchanged", JSON.stringify(before) === JSON.stringify(await hashes()));
report.passed = failures.length === 0; report.failures = failures;
report.visualVerification = "Pending browser GPU availability; this test does not certify facial appearance.";
await writeFile(new URL("assets/cat-v4-attention-matrix-check.json", project), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, runs: report.runs, report: fileURLToPath(new URL("assets/cat-v4-attention-matrix-check.json", project)) }, null, 2));
if (failures.length) process.exitCode = 1;
