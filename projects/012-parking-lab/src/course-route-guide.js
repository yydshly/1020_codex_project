import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sampleChapterPose } from './exam-courses.js';
import { BAY, CAR, corners } from './vehicle.js';

export const COURSE_ROUTE_LAYER = 1;
const SURFACE_OFFSET = .065;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const point = p => ({ x: p.x, y: p.y, z: p.z });
const motion = pose => Math.abs(finite(pose?.speed)) > .02 ? Math.sign(pose.speed) : 0;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

function sampleTimes(chapter, maximum) {
  const duration = Math.max(0, finite(chapter.duration, chapter.poses?.at(-1)?.t));
  const critical = new Set([0, duration]);
  const add = value => { if (Number.isFinite(value)) critical.add(clamp(value, 0, duration)); };
  for (const cue of chapter.cues || []) add(cue.t);
  // Preserve changes of driving direction and stationary intervals, without
  // asking the sampler to evaluate every one of the parking demo's 8k frames.
  const source = chapter.poses || [];
  for (let i = 1; i < source.length; i++) if (motion(source[i - 1]) !== motion(source[i])) {
    add(source[i - 1].t); add(source[i].t);
  }
  let values = [...critical].sort((a, b) => a - b);
  if (values.length > maximum) values = Array.from({ length: maximum }, (_, i) => values[Math.round(i * (values.length - 1) / (maximum - 1))]);
  const times = new Set(values), budget = Math.min(maximum - times.size, Math.ceil(duration / .2));
  for (let i = 1; i <= budget; i++) times.add(duration * i / (budget + 1));
  return [...times].sort((a, b) => a - b);
}

function routeHeight(chapter, pose) {
  if (chapter.sceneType !== 'hill') return finite(pose.y);
  if (Math.abs(pose.x) > 4 || pose.z <= 0 || pose.z >= 73) return 0;
  return pose.z < 18 ? pose.z * .1 : pose.z > 55 ? (73 - pose.z) * .1 : 1.8;
}

/** Bounded sampling of the original chapter path. The displayed polyline is
 * the model's rear-axle reference path, never an exam stop/steering target.
 * Stops have no path arrows and split runs; reversing changes its own style.
 * No source poses or sampler state are changed. */
export function createCourseRouteData(chapter, { maxPoints = 320, sample = sampleChapterPose } = {}) {
  const maximum = clamp(Math.floor(finite(maxPoints, 320)), 2, 1000);
  const samples = sampleTimes(chapter, maximum).map(t => {
    const pose = sample(chapter, t);
    return { x: finite(pose.x), y: routeHeight(chapter, pose) + SURFACE_OFFSET, z: finite(pose.z),
      t, heading: finite(pose.heading), speed: finite(pose.speed) };
  });
  const segments = [];
  let active = null, totalLength = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], length = distance(a, b);
    if (length < .001) { active = null; continue; }
    const projection = (b.x - a.x) * Math.sin(a.heading) + (b.z - a.z) * Math.cos(a.heading);
    const direction = Math.abs(projection) > 1e-8 ? projection > 0 ? 'forward' : 'reverse' : b.speed < 0 ? 'reverse' : 'forward';
    if (!active || active.direction !== direction) {
      active = { direction, points: [point(a)], length: 0 }; segments.push(active);
    }
    active.points.push(point(b)); active.length += length; totalLength += length;
  }
  const arrows = [], spacing = Math.max(4, totalLength / 12);
  for (const segment of segments) {
    if (segment.length < 1.2) continue;
    let travelled = 0, next = Math.min(spacing / 2, segment.length / 2);
    for (let i = 1; i < segment.points.length; i++) {
      const a = segment.points[i - 1], b = segment.points[i], length = distance(a, b);
      while (next <= travelled + length && next < segment.length - .4 && arrows.length < 20) {
        const flat = Math.hypot(b.x - a.x, b.z - a.z);
        if (flat > 1e-8) arrows.push({ position: lerp(a, b, clamp((next - travelled) / length, 0, 1)),
          direction: { x: (b.x - a.x) / flat, z: (b.z - a.z) / flat }, reverse: segment.direction === 'reverse' });
        next += spacing;
      }
      travelled += length;
    }
  }
  const first = samples[0], last = samples.at(-1), labels = [];
  if (distance(first, last) < .5) labels.push({ kind: 'start-end', text: chapter.id === 'reverse-parking' ? '起点 / 终点 A端' : '起点 / 终点', position: point(first) });
  else labels.push({ kind: 'start', text: '起点', position: point(first) }, { kind: 'finish', text: '终点', position: point(last) });
  if (chapter.id === 'reverse-parking') {
    labels.push({ kind: 'target', text: '目标车库', position: { x: 0, y: SURFACE_OFFSET, z: (BAY.back + BAY.entrance) / 2 } });
    const time = chapter.cues?.[7]?.t;
    if (Number.isFinite(time)) {
      const sampled = samples.find(p => Math.abs(p.t - time) < 1e-8), original = sampled || sample(chapter, time);
      labels.push({ kind: 'transfer', text: '换边 B端', position: sampled ? point(sampled)
        : { x: original.x, y: routeHeight(chapter, original) + SURFACE_OFFSET, z: original.z } });
    }
  }
  else if (chapter.scene?.bay && ['side', 'parking'].includes(chapter.sceneType)) labels.push({ kind: 'target', text: '目标车位',
    position: { x: chapter.scene.bay.x, y: SURFACE_OFFSET, z: chapter.scene.bay.z } });
  else if (totalLength > 2) {
    let remaining = totalLength / 2, middle = first;
    outer: for (const segment of segments) for (let i = 1; i < segment.points.length; i++) {
      const a = segment.points[i - 1], b = segment.points[i], length = distance(a, b);
      if (remaining <= length) { middle = lerp(a, b, remaining / length); break outer; }
      remaining -= length;
    }
    labels.push({ kind: 'path', text: '示范路径', position: point(middle) });
  }
  // Fit the complete vehicle envelope along the route, not just its rear axle.
  const bounds = new THREE.Box3();
  for (const sample of samples) for (const corner of corners(sample)) {
    bounds.expandByPoint(new THREE.Vector3(corner.x, sample.y, corner.z));
    bounds.expandByPoint(new THREE.Vector3(corner.x, sample.y + 2.8, corner.z));
  }
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 10);
  const labelWidth = clamp(span * .085, 2.6, 7);
  for (const label of labels) {
    bounds.expandByPoint(new THREE.Vector3(label.position.x - labelWidth / 2, label.position.y, label.position.z - labelWidth / 2));
    bounds.expandByPoint(new THREE.Vector3(label.position.x + labelWidth / 2, label.position.y + 2, label.position.z + labelWidth / 2));
  }
  bounds.expandByScalar(.5);
  return { samples, segments, arrows, labels, totalLength, labelWidth, arrowSize: clamp(span * .03, .6, 2.2),
    bounds: { min: point(bounds.min), max: point(bounds.max) } };
}

/** Fixed chapter overview. Unlike the ordinary orbit camera, this does not
 * depend on the moving car or its heading. Fit every bounding-box corner for
 * the actual aspect ratio rather than silently clipping long road chapters. */
export function courseRouteCamera(data, { aspect = 1.8, fov = 52, top = false } = {}) {
  aspect = Math.max(.1, finite(aspect, 1.8)); fov = clamp(finite(fov, 52), 25, 75);
  const min = data.bounds.min, max = data.bounds.max;
  const target = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const out = top ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 1.5, -1).normalize();
  const up = top ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, out).normalize(), vertical = new THREE.Vector3().crossVectors(out, right).normalize();
  const tanY = Math.tan(fov * Math.PI / 360), tanX = tanY * aspect;
  let distance = 10;
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
    const offset = new THREE.Vector3(x, y, z).sub(target), depth = offset.dot(out);
    distance = Math.max(distance, depth + Math.abs(offset.dot(right)) * 1.15 / tanX, depth + Math.abs(offset.dot(vertical)) * 1.15 / tanY);
  }
  return { position: point(target.clone().addScaledVector(out, distance)), target: point(target), up: point(up), fov };
}

function textTexture(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = Math.max(160, Math.min(512, text.length * 43 + 56)); canvas.height = 112;
  const context = canvas.getContext('2d');
  context.fillStyle = '#213f35ed'; context.beginPath(); context.roundRect(4, 4, canvas.width - 8, 104, 18); context.fill();
  context.strokeStyle = '#d0decb'; context.lineWidth = 2; context.stroke();
  context.fillStyle = '#f6f3df'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = '600 41px "Microsoft YaHei", sans-serif'; context.fillText(text, canvas.width / 2, 57, canvas.width - 32);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

/** All descendants live on teaching layer 1. Physical mirror captures and the
 * same-eye driver/zoom cameras remain on layer 0, with no camera/FOV changes.
 * The returned objects are visual aids only and register no safety actors. */
export function createCourseRouteGuide(chapter) {
  const data = createCourseRouteData(chapter), group = new THREE.Group(); group.name = 'course-route-teaching-guide'; group.visible = false;
  const geometries = new Set(), materials = new Set(), textures = new Set(), lineMaterials = [], labelSprites = [];
  const color = direction => direction === 'reverse' ? '#e0a44d' : '#398ec9';
  for (const [index, segment] of data.segments.entries()) {
    const geometry = new LineGeometry(); geometry.setPositions(segment.points.flatMap(p => [p.x, p.y, p.z])); geometries.add(geometry);
    const material = new LineMaterial({ color: color(segment.direction), linewidth: 3, dashed: segment.direction === 'reverse', dashSize: .9, gapSize: .6,
      transparent: true, opacity: .93, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    materials.add(material); lineMaterials.push(material);
    const line = new Line2(geometry, material); line.computeLineDistances(); line.name = `course-route-${segment.direction}-${index}`;
    line.userData.direction = segment.direction; line.renderOrder = 12; group.add(line);
  }
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .55, -.25, 0, .03, .25, 0, .03,
    -.06, 0, .05, -.06, 0, -.45, .06, 0, -.45, -.06, 0, .05, .06, 0, -.45, .06, 0, .05], 3)); geometries.add(arrowGeometry);
  const basic = color => { const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false }); materials.add(material); return material; };
  const arrowMaterials = { forward: basic(color('forward')), reverse: basic(color('reverse')) };
  for (const [index, arrow] of data.arrows.entries()) {
    const mesh = new THREE.Mesh(arrowGeometry, arrowMaterials[arrow.reverse ? 'reverse' : 'forward']); mesh.name = `course-route-arrow-${index}`;
    mesh.position.set(arrow.position.x, arrow.position.y + .008, arrow.position.z); mesh.rotation.y = Math.atan2(arrow.direction.x, arrow.direction.z);
    mesh.scale.setScalar(data.arrowSize); mesh.renderOrder = 13; group.add(mesh);
  }
  const ringGeometry = new THREE.RingGeometry(.23, .34, 32); ringGeometry.rotateX(-Math.PI / 2); geometries.add(ringGeometry);
  function label(text, position, parent = group) {
    const texture = textTexture(text); if (texture) textures.add(texture);
    const material = new THREE.SpriteMaterial({ map: texture, color: texture ? '#ffffff' : '#e5e9db', transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false, toneMapped: false }); materials.add(material);
    const sprite = new THREE.Sprite(material); sprite.name = `course-route-label-${text}`; sprite.userData.label = text;
    sprite.center.set(.5, 1);
    sprite.position.set(position.x, position.y + 1.25, position.z); sprite.renderOrder = 15; parent.add(sprite);
    labelSprites.push({ sprite, aspect: Math.max(160, Math.min(512, text.length * 43 + 56)) / 112 }); return sprite;
  }
  for (const item of data.labels) {
    label(item.text, item.position);
    const ring = new THREE.Mesh(ringGeometry, item.kind === 'target' ? arrowMaterials.reverse : arrowMaterials.forward);
    ring.position.set(item.position.x, item.position.y + .004, item.position.z); ring.scale.setScalar(Math.max(1, data.arrowSize)); ring.renderOrder = 13; group.add(ring);
  }
  const current = new THREE.Group(); current.name = 'course-route-current-vehicle'; group.add(current);
  const currentLabel = label('当前车辆 · 模型位置', { x: 0, y: .4, z: 0 }, current);
  currentLabel.center.set(.5, 0);
  const currentRing = new THREE.Mesh(ringGeometry, basic('#faf3d1')); currentRing.renderOrder = 14; current.add(currentRing);
  group.traverse(object => { object.layers.set(COURSE_ROUTE_LAYER); object.castShadow = false; object.receiveShadow = false; });
  let disposed = false;
  return { group, data,
    setResolution(width, height) {
      for (const material of lineMaterials) material.resolution.set(Math.max(1, width), Math.max(1, height));
      // A long road overview must not turn a label into the same few-pixel
      // problem as a physical distant mirror. Keep text about 12 CSS px tall.
      const scale = 2 * Math.tan(52 * Math.PI / 360) * 34 / Math.max(1, height);
      for (const { sprite, aspect } of labelSprites) sprite.scale.set(scale * aspect, scale, 1);
    },
    setVehicleTransform(matrix) {
      current.position.set(0, 1.62, 1.3).applyMatrix4(matrix);
      const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
      currentLabel.visible = ![data.samples[0], data.samples.at(-1)].some(p => Math.hypot(origin.x - p.x, origin.z - p.z) <= 1.5);
    },
    dispose() {
      if (disposed) return; disposed = true; group.removeFromParent();
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
    },
  };
}
