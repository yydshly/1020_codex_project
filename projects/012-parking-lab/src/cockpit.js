import { BAY, CAR, clamp, localToWorld } from './vehicle.js';

const radians = degrees => degrees * Math.PI / 180;
export function createCockpitSettings() {
  return { seatHeight: 1.28, seatFore: 1.10, left: { yaw: 9, pitch: -18 }, right: { yaw: 10, pitch: -18 } };
}
export const COCKPIT_STORAGE_KEY = 'parking-lab.cockpit.v2';
export function restoreCockpitSettings(serialized) {
  let settings = createCockpitSettings();
  try {
    const saved = JSON.parse(serialized);
    if (saved?.version !== 2 || !saved.settings) return settings;
    for (const name of ['seatHeight', 'seatFore', 'left.yaw', 'left.pitch', 'right.yaw', 'right.pitch']) {
      const [side, axis] = name.split('.');
      const value = axis ? saved.settings[side]?.[axis] : saved.settings[name];
      if (typeof value === 'number' && Number.isFinite(value)) settings = setCockpitSetting(settings, name, value);
    }
  } catch { /* Corrupt or unavailable preferences must never prevent driving. */ }
  return settings;
}
export function setCockpitSetting(settings, name, value) {
  const next = { ...settings, left: { ...settings.left }, right: { ...settings.right } };
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return next;
  if (name === 'seatHeight') next.seatHeight = clamp(numeric, 1.15, 1.38);
  if (name === 'seatFore') next.seatFore = clamp(numeric, 0.9, 1.3);
  const [side, axis] = name.split('.');
  if (['left', 'right'].includes(side) && axis === 'yaw') next[side].yaw = clamp(numeric, -5, 25);
  if (['left', 'right'].includes(side) && axis === 'pitch') next[side].pitch = clamp(numeric, -38, -5);
  return next;
}

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, value) => ({ x: a.x * value, y: a.y * value, z: a.z * value });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => scale(a, 1 / length(a));
const worldUp = { x: 0, y: 1, z: 0 };
const referenceEye = { x: 0.39, y: 1.28, z: 1.10 };
const rotate = (state, vector) => ({ x: vector.x * Math.cos(state.heading) + vector.z * Math.sin(state.heading), y: vector.y, z: -vector.x * Math.sin(state.heading) + vector.z * Math.cos(state.heading) });
const worldPoint = (state, point) => ({ ...localToWorld(state, point.x, point.z), y: point.y });

export function driverEye(state, settings = createCockpitSettings()) {
  return worldPoint(state, { x: referenceEye.x, y: settings.seatHeight, z: settings.seatFore });
}

/** Finite convex mirror geometry. Local +X is the driver's left. The mirror's
 * mounting normal is calibrated against a FIXED reference eye, so moving the
 * seat changes the reflected view without silently re-adjusting the mirror. */
export function createMirrorFrame(state, sideName, settings = createCockpitSettings()) {
  const side = sideName === 'left' ? 1 : -1;
  const center = { x: side * (CAR.width / 2 + 0.12), y: 1.05, z: 1.86 };
  const adjustment = settings[sideName === 'left' ? 'left' : 'right'];
  const yaw = radians(adjustment.yaw), pitch = radians(adjustment.pitch);
  const referenceDirection = { x: side * Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
  const normal = unit(add(unit(subtract(referenceEye, center)), referenceDirection));
  const right = unit(cross(worldUp, normal));
  const up = unit(cross(normal, right));
  return { center: worldPoint(state, center), eye: driverEye(state, settings), normal: rotate(state, normal),
    right: rotate(state, right), up: rotate(state, up), width: 0.19, height: 0.12, radius: 1.4 };
}

/** u/v are normalized mirror-plane coordinates; the visible aperture is
 * [-1,1]². A small mathematical extension is also used by projection's Newton
 * search; no clamping is applied because that would corrupt its derivatives. */
export function sampleMirrorRay(frame, u, v) {
  const a = u * frame.width / 2, b = v * frame.height / 2;
  const depthSquared = frame.radius ** 2 - a * a - b * b;
  if (!Number.isFinite(depthSquared) || depthSquared <= 0) return null;
  const offset = add(scale(frame.right, a), scale(frame.up, b));
  const normal = unit(add(offset, scale(frame.normal, Math.sqrt(depthSquared))));
  const origin = add(frame.center, add(offset, scale(frame.normal, Math.sqrt(depthSquared) - frame.radius)));
  const fromEye = subtract(origin, frame.eye);
  if (length(fromEye) < 1e-9) return null;
  const incoming = unit(fromEye);
  const direction = unit(subtract(incoming, scale(normal, 2 * dot(incoming, normal))));
  return { origin, direction, normal };
}

/** Invert the reflected rays to locate a world point on the finite mirror.
 * visible means geometric visibility through the aperture and reflective face;
 * scene occlusion must still be checked by the renderer. */
export function projectMirrorPoint(frame, point) {
  const hidden = () => ({ visible: false });
  if (!point || !['x', 'y', 'z'].every(key => Number.isFinite(point[key]))) return hidden();
  const centerRay = sampleMirrorRay(frame, 0, 0);
  if (!centerRay) return hidden();
  const horizontal = unit(cross(worldUp, centerRay.direction));
  const vertical = unit(cross(centerRay.direction, horizontal));
  const evaluate = (u, v) => {
    const ray = sampleMirrorRay(frame, u, v);
    if (!ray) return null;
    const offset = subtract(point, ray.origin);
    if (length(offset) < 1e-8) return null;
    const target = unit(offset), difference = subtract(target, ray.direction);
    return { ray, target, x: dot(difference, horizontal), y: dot(difference, vertical) };
  };
  let u = 0, v = 0, value = evaluate(u, v);
  const h = 1e-4;
  for (let iteration = 0; iteration < 20 && value; iteration++) {
    const error = Math.hypot(value.x, value.y);
    if (error < 1e-10) break;
    const uMinus = evaluate(u - h, v), uPlus = evaluate(u + h, v);
    const vMinus = evaluate(u, v - h), vPlus = evaluate(u, v + h);
    if (!uMinus || !uPlus || !vMinus || !vPlus) return hidden();
    const j00 = (uPlus.x - uMinus.x) / (2 * h), j10 = (uPlus.y - uMinus.y) / (2 * h);
    const j01 = (vPlus.x - vMinus.x) / (2 * h), j11 = (vPlus.y - vMinus.y) / (2 * h);
    const determinant = j00 * j11 - j01 * j10;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return hidden();
    const du = (j11 * value.x - j01 * value.y) / determinant;
    const dv = (j00 * value.y - j10 * value.x) / determinant;
    let improved = false;
    for (let damping = 1; damping >= 1 / 128; damping /= 2) {
      const nextU = clamp(u - du * damping, -4, 4), nextV = clamp(v - dv * damping, -4, 4);
      const next = evaluate(nextU, nextV);
      if (next && Math.hypot(next.x, next.y) < error) { u = nextU; v = nextV; value = next; improved = true; break; }
    }
    if (!improved) return hidden();
  }
  if (!value || Math.abs(u) > 1 + 1e-7 || Math.abs(v) > 1 + 1e-7) return hidden();
  if (length(subtract(value.target, value.ray.direction)) > 1e-7) return hidden();
  if (dot(subtract(frame.eye, value.ray.origin), value.ray.normal) <= 0 || dot(value.target, value.ray.normal) <= 0) return hidden();
  u = clamp(u, -1, 1); v = clamp(v, -1, 1);
  const ray = sampleMirrorRay(frame, u, v);
  return { x: (u + 1) / 2, y: (1 - v) / 2, visible: true, origin: ray.origin, direction: ray.direction };
}

// Compatibility envelope only: a single perspective camera cannot reproduce
// all rays of a finite curved mirror. New rendering uses sampleMirrorRay.
export function mirrorPose(state, sideName, settings) {
  const frame = createMirrorFrame(state, sideName, settings);
  const center = sampleMirrorRay(frame, 0, 0), top = sampleMirrorRay(frame, 0, 1), bottom = sampleMirrorRay(frame, 0, -1);
  const fov = Math.acos(clamp(dot(top.direction, bottom.direction), -1, 1)) * 180 / Math.PI;
  return { position: center.origin, target: add(center.origin, scale(center.direction, 12)), fov };
}
// Retained for older callers only. Physical mirror projection above already
// returns display coordinates and must not receive another horizontal flip.
export function mirroredScreenPoint(point) {
  return { x: (1 - point.x) / 2, y: (1 - point.y) / 2, visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 0.94 && Math.abs(point.y) <= 0.88 };
}
export function cockpitCue(state, progress) {
  const phase = progress.phase;
  if (phase === 1 || phase === 3) return { main: 'forward', title: '先看正前与侧窗，再扫两侧镜', text: '出库先确认车身与库角的空间，再转向；两侧镜用来复核后轮和车尾是否挤线。' };
  if (phase === 4) return { main: 'both', title: '完成后，对照两侧镜里的车身姿态', text: '可暂停切到俯视，把刚才镜中的边线、后轮和实际位置对应起来。' };
  const side = phase === 2 ? 'left' : 'right';
  const sideText = side === 'left' ? '左' : '右';
  if (Math.abs(state.heading) < radians(8)) return { main: 'both', title: '左右镜交替看：车身是否趋于平行', text: '比较两侧车身与库边线的夹角和余量；接近平行时主动回正，随后看停车参照。不要只盯一面镜。' };
  if (state.z < BAY.entrance + 1.7) return { main: side, title: `主看${sideText}镜：车身与库角的余量`, text: '先认出镜中内侧车身和附近地面，再看同侧库角从哪里经过；同时扫另一侧镜和正前方，留意车头外摆。' };
  return { main: side, title: `先看${sideText}镜，建立车身与库角的对应`, text: '让镜中内侧保留少量车身和后轮附近地面。点镜面放大观察；Q/E 转头，C 回到正前，拖动车内画面可自由观察。' };
}
