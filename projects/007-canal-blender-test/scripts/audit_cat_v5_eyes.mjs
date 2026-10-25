// Read-only UV / root-space landmark audit, using the V3 comparison screenshot.
import * as THREE from "../web/vendor/three/build/three.module.min.js";
import { readFile, writeFile } from "node:fs/promises";
const raw = await readFile(new URL("../web/models/cat-v3-rig.glb", import.meta.url));
const jsonSize = raw.readUInt32LE(12), data = JSON.parse(raw.subarray(20, 20 + jsonSize).toString());
const binHeader = 20 + jsonSize, bin = raw.subarray(binHeader + 8, binHeader + 8 + raw.readUInt32LE(binHeader));
const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const types = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
function array(index) {
  const acc = data.accessors[index], view = data.bufferViews[acc.bufferView], Type = types[acc.componentType];
  const start = view.byteOffset + (acc.byteOffset || 0), size = acc.count * count[acc.type] * Type.BYTES_PER_ELEMENT;
  const buf = new Uint8Array(bin.subarray(start, start + size)).buffer;
  if (view.byteStride) throw new Error("Interleaved buffer needs explicit decoding");
  return new Type(buf);
}
const primitive = data.meshes[0].primitives[0], geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(array(primitive.attributes.POSITION), 3));
geometry.setAttribute("normal", new THREE.BufferAttribute(array(primitive.attributes.NORMAL), 3));
geometry.setAttribute("uv", new THREE.BufferAttribute(array(primitive.attributes.TEXCOORD_0), 2));
geometry.setIndex(new THREE.BufferAttribute(array(primitive.indices), 1));
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
mesh.updateMatrixWorld(true);
// Existing study's face camera. Canvas bounds measured in the saved 1100x800
// capture; still-photo micro-sway introduces sub-millimetre landmark uncertainty.
const viewport = { x: 0, y: 128, width: 1100, height: 628 };
const camera = new THREE.OrthographicCamera(-.26 * 1100 / 628 / 2, .26 * 1100 / 628 / 2, .13, -.13, .01, 30);
camera.position.set(1.5, .34, 1.5); camera.lookAt(.025, .34, .16); camera.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster();
function hit(pixel) {
  raycaster.setFromCamera(new THREE.Vector2((pixel[0] - viewport.x) / viewport.width * 2 - 1, 1 - (pixel[1] - viewport.y) / viewport.height * 2), camera);
  const found = raycaster.intersectObject(mesh, false)[0];
  if (!found) throw new Error("No surface at " + pixel);
  return { screenPixel: pixel, position: found.point.toArray(), normal: found.normal.toArray(), uv: found.uv.toArray(), sourcePixel: found.uv.toArray().map(value => value * 1024), faceIndex: found.faceIndex, indices: [found.face.a, found.face.b, found.face.c] };
}
const pixels = {
  screenLeft: { center: [517.5, 442], leftCorner: [489, 440], rightCorner: [550, 451], upperLid: [517, 420], lowerLid: [519, 463] },
  screenRight: { center: [635, 442], leftCorner: [605, 451], rightCorner: [658, 433], upperLid: [636, 420], lowerLid: [635, 462] }
};
const output = { source: "cat-v3-rig.glb", coordinateSystem: "Three root space, Y-up +Z-forward, metres", note: "Initial screenshot-picked landmarks: verify against projected close-up before model authoring.", viewport, eyes: {} };
for (const [eye, points] of Object.entries(pixels)) {
  output.eyes[eye] = Object.fromEntries(Object.entries(points).map(([key, value]) => [key, hit(value)]));
  const e = output.eyes[eye];
  const x = new THREE.Vector3().fromArray(e.rightCorner.position).sub(new THREE.Vector3().fromArray(e.leftCorner.position));
  const n = new THREE.Vector3().fromArray(e.center.normal).normalize();
  x.addScaledVector(n, -x.dot(n)).normalize();
  const y = new THREE.Vector3().crossVectors(n, x).normalize(); if (y.y < 0) y.negate();
  e.axes = { horizontal: x.toArray(), vertical: y.toArray(), outward: n.toArray() };
  const center = new THREE.Vector3().fromArray(e.center.position);
  const positions = geometry.attributes.position;
  e.nearbyVertices = [];
  for (let i = 0; i < positions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(positions, i), delta = v.clone().sub(center);
    if (Math.abs(delta.dot(x)) < .026 && Math.abs(delta.dot(y)) < .022 && Math.abs(delta.dot(n)) < .012) e.nearbyVertices.push({ index: i, position: v.toArray(), uv: new THREE.Vector2().fromBufferAttribute(geometry.attributes.uv, i).toArray(), local: [delta.dot(x), delta.dot(y), delta.dot(n)] });
  }
}
await writeFile(new URL("../assets/cat-v5-eye-landmarks-initial.json", import.meta.url), JSON.stringify(output, null, 2));
for (const [key, eye] of Object.entries(output.eyes)) console.log(key, JSON.stringify({ center: eye.center, axes: eye.axes, nearbyVertices: eye.nearbyVertices.length, landmarks: Object.fromEntries(["leftCorner", "rightCorner", "upperLid", "lowerLid"].map(k => [k, eye[k].position])) }));
