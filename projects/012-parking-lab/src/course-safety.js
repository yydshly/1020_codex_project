import { BAY, CAR, COURSE, BOUNDS, localToWorld } from './vehicle.js';
import { interpolateAttachmentTransform, sweepCourseAttachments } from './course-attachment-collision.js';

// Metric geometry shared by risk checks and optional scene/teaching overlays.
// These are the actual rendered road rectangles/ribbons, not a tube fitted to
// a demonstration trajectory. Risk reminders are not an examination score.
const EPS = .015;
const TAU = Math.PI * 2;
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const rect = (left, right, back, front) => ({ kind: 'rect', left, right, back, front });
const segment = (id, x1, z1, x2, z2, type = 'solid-line', blocking = false) => ({ id, a: { x: x1, z: z1 }, b: { x: x2, z: z2 }, type, blocking, width: type === 'opposing-line' ? .25 : .1 });
const modelCache = new WeakMap();

function curveRoad() {
  const points = Array.from({ length: 101 }, (_, i) => ({ x: 5 * Math.sin(TAU * i / 100), z: -20 + 52 * i / 100 }));
  const tangent = 10 * Math.PI / 52, length = 30;
  const continuation = (u, side) => ({ x: side * tangent * length * (u - u * u + u ** 3 / 3), z: (side < 0 ? -20 : 32) + side * length * u });
  const approach = Array.from({ length: 16 }, (_, i) => continuation((16 - i) / 16, -1));
  const exit = Array.from({ length: 16 }, (_, i) => continuation((i + 1) / 16, 1));
  const complete = [{ x: -tangent * length / 3, z: -180 }, ...approach, ...points, ...exit, { x: tangent * length / 3, z: 275 }];
  const edges = [[], []];
  complete.forEach((p, i) => {
    const a = complete[Math.max(0, i - 1)], b = complete[Math.min(complete.length - 1, i + 1)], n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (const [index, sign] of [-1, 1].entries()) edges[index].push({ x: p.x + sign * (b.z - a.z) / n * 1.75, z: p.z - sign * (b.x - a.x) / n * 1.75 });
  });
  return { kind: 'polygon', points: [...edges[0], ...edges[1].reverse()], centerline: complete };
}

export function getCourseSafetyModel(chapter) {
  if (!chapter || typeof chapter !== 'object') throw new TypeError('A chapter is required.');
  if (modelCache.has(chapter)) return modelCache.get(chapter);
  const type = chapter.sceneType, roads = [], lines = [], obstacles = [];
  const obstacle = (id, label, x, z, width, length, height = 1.8, baseY = 0) => obstacles.push({ id, type: 'obstacle', label, x, z, width, length, height, baseY, heading: 0 });
  if (type === 'parking') {
    roads.push(rect(COURSE.roadLeft, COURSE.roadRight, BAY.entrance, COURSE.roadTop), rect(BAY.left, BAY.right, BAY.back, BAY.entrance));
    lines.push(segment('bay-left', BAY.left, BAY.back, BAY.left, BAY.entrance, 'parking-line', true), segment('bay-right', BAY.right, BAY.back, BAY.right, BAY.entrance, 'parking-line', true),
      segment('bay-back', BAY.left, BAY.back, BAY.right, BAY.back, 'parking-line', true));
  } else if (type === 'hill') {
    roads.push(rect(-3.5, 3.5, -180, 275));
    for (let z = 0; z < 20; z += 2) for (const x of [-3.75, 3.75]) obstacle(`hill-bollard-${x}-${z}`, '坡道边桩', x, z, .205, .205, .55, Math.min(1.8, z * .1));
  } else if (type === 'side') {
    roads.push(rect(-8, 5, -17, 15), rect(-1.75, 1.75, -180, -17), rect(-1.75, 1.75, 15, 250));
    // The entry and front mouth are open during the manoeuvre. The existing
    // four-side paint is not treated as four impenetrable walls.
    lines.push(segment('side-bay-far', -4.5, -10.5, -4.5, -3.5, 'parking-line', true), segment('side-bay-back', -4.5, -10.5, -1.9, -10.5, 'parking-line', true));
    for (const z of [-3.1, -10.9]) obstacle(`side-bollard-${z}`, '侧方停车边桩', -4.9, z, .205, .205, .55);
  } else if (type === 'curve') {
    roads.push(curveRoad());
    for (let i = 0; i <= 100; i += 15) obstacle(`curve-bollard-${i}`, '曲线边桩', 5 * Math.sin(TAU * i / 100) + 3.2, -20 + 52 * i / 100, .205, .205, .55);
  } else if (type === 'angle') {
    roads.push(rect(-1.75, 1.75, -180, 6.85), rect(-1.75, 275, 3.35, 6.85));
    obstacle('angle-bollard-inner', '直角内侧边桩', 2.1, 3, .205, .205, .55);
    obstacle('angle-bollard-outer', '直角外侧边桩', -2.1, 7.2, .205, .205, .55);
  } else if (type === 'uturn') {
    roads.push(rect(-8, 12, 0, 24), rect(-3.5, 0, -180, 0), rect(6.1, 9.6, -180, 0));
  } else {
    const width = type === 'road_lanes' ? 14 : 7, junction = ['intersection', 'left_turn', 'right_turn'].includes(type);
    roads.push(rect(-width / 2, width / 2, -180, 370));
    if (junction) roads.push(rect(-275, 275, 16.5, 23.5), rect(-6, 6, 12, 28));
    if (type === 'bus') roads.push(rect(-6.7, -3.5, 12, 28));
    const spans = junction ? [[-180, 12], [28, 370]] : [[-180, 370]];
    for (const [i, [back, front]] of spans.entries()) {
      lines.push(segment(`opposing-center-${i}`, 0, back, 0, front, 'opposing-line', true));
      for (const x of [-width / 2 + .15, width / 2 - .15]) lines.push(segment(`road-edge-paint-${i}-${x}`, x, back, x, front, 'edge-line', false));
    }
    if (junction) for (const [i, [left, right]] of [[-275, -6], [6, 275]].entries()) lines.push(segment(`cross-road-center-${i}`, left, 20, right, 20, 'opposing-line', true));
    if (type === 'bus') obstacle('parked-bus', '停靠公交车', -5.15, 20, 2.3, 9.5, 2.25, .325);
    if (type === 'school') {
      obstacles.push({ id: 'school-child', type: 'pedestrian', label: '学校路侧学生', x: -5.1, z: 19, radius: .32, height: 1.74, baseY: .01 },
        { id: 'school-guardian', type: 'pedestrian', label: '学校路侧行人', x: -5.6, z: 20, radius: .32, height: 1.74, baseY: .01 });
    }
    for (let z = -30; z < 110; z += 22) obstacle(`street-pole-${z}`, '路侧灯杆', -width / 2 - .9, z, .09, .09, 5.5);
  }
  const model = { chapterId: chapter.id, sceneType: type, roads, lines, obstacles, bounds: type === 'parking' ? BOUNDS : null,
    basis: '教学道路与风险提醒，不替代实考评分' };
  modelCache.set(chapter, model); return model;
}

/** Scripted fallback for non-rendering consumers/tests. The scene's authoritative
 * actual actor centres should be supplied in context.actors whenever available. */
export function getCourseTrafficActors(chapter, time = 0) {
  const t = finite(time), actors = [];
  if (chapter.sceneType === 'crosswalk') {
    const start = chapter.pedestrianStart ?? 8, end = chapter.pedestrianEnd ?? 14, progress = clamp((t - start) / Math.max(.1, end - start), 0, 1);
    actors.push({ id: 'crosswalk-person', type: 'pedestrian', label: '横过道路的行人', x: -5.5 + 11 * progress, z: chapter.scene?.crossingZ ?? 15, radius: .32, height: 1.74, baseY: .01 });
  }
  if (['meeting', 'night'].includes(chapter.sceneType)) {
    const a = chapter.scene?.oncoming ?? { x: 1.75, z: 80, speed: 4 };
    actors.push({ id: 'oncoming-car', type: 'vehicle', label: '对向车辆', x: a.x, z: a.z - t * a.speed - 1.1525, width: 1.86, length: 4.24, heading: Math.PI, height: 1.405, baseY: .01 });
  }
  if (chapter.id?.includes('overtake') || chapter.kind === 'overtake') {
    const a = chapter.scene?.leadVehicle ?? { x: -5.25, z: 4, speed: 1.2 };
    actors.push({ id: 'lead-car', type: 'vehicle', label: '前方车辆', x: a.x, z: a.z + t * a.speed + 1.1525, width: 1.86, length: 4.24, heading: 0, height: 1.405, baseY: .01 });
  }
  return actors;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (a, b) => a.x * b.z - a.z * b.x;
function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
  const t = n > 1e-12 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / n, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function boundary(shape) {
  if (shape.kind === 'rect') return [{ x: shape.left, z: shape.back }, { x: shape.right, z: shape.back }, { x: shape.right, z: shape.front }, { x: shape.left, z: shape.front }];
  return shape.points;
}
function inShape(p, shape, tolerance = EPS) {
  if (shape.kind === 'rect') return p.x >= shape.left - tolerance && p.x <= shape.right + tolerance && p.z >= shape.back - tolerance && p.z <= shape.front + tolerance;
  const points = shape.points;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if (pointSegmentDistance(p, a, b) <= tolerance) return true;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function intersectionT(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-10) return null;
  const q = { x: c.x - a.x, z: c.z - a.z }, t = cross(q, s) / denominator, u = cross(q, r) / denominator;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? clamp(t, 0, 1) : null;
}
export function courseCarPolygon(pose) {
  return [[-CAR.width / 2, -CAR.rearOverhang], [CAR.width / 2, -CAR.rearOverhang], [CAR.width / 2, CAR.length - CAR.rearOverhang], [-CAR.width / 2, CAR.length - CAR.rearOverhang]]
    .map(([x, z]) => localToWorld(pose, x, z));
}
/** Road-paint reminders distinguish tyre contact from body overhang. Bay and
 * road containment still use the whole body. This is a contact-patch teaching
 * approximation, not a claim about an examination camera's pixel thresholds. */
export function courseWheelPolygons(pose) {
  return [0, CAR.wheelbase].flatMap(z => [-1, 1].map(sign => {
    const center = localToWorld(pose, sign * CAR.trackWidth / 2, z);
    const state = { ...center, heading: pose.heading + (z ? finite(pose.steer) : 0) };
    return [[-CAR.tireWidth / 2, -.11], [CAR.tireWidth / 2, -.11], [CAR.tireWidth / 2, .11], [-CAR.tireWidth / 2, .11]].map(([x, z]) => localToWorld(state, x, z));
  }));
}
function outsideRoad(polygon, model) {
  const contains = p => model.roads.some(shape => inShape(p, shape));
  for (const p of polygon) if (!contains(p)) return p;
  // Split each vehicle edge at every real road boundary, then test all pieces.
  // This catches a bumper crossing a concave corner even with all corners in.
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], cuts = [0, 1];
    for (const shape of model.roads) {
      const points = boundary(shape);
      for (let j = 0; j < points.length; j++) {
        const t = intersectionT(a, b, points[j], points[(j + 1) % points.length]); if (t !== null) cuts.push(t);
      }
    }
    cuts.sort((a, b) => a - b);
    for (let j = 1; j < cuts.length; j++) {
      const t = (cuts[j - 1] + cuts[j]) / 2, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (!contains(p)) return p;
    }
  }
  return null;
}
function pointInConvex(point, polygon) {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], c = cross({ x: b.x - a.x, z: b.z - a.z }, { x: point.x - a.x, z: point.z - a.z });
    if (Math.abs(c) < 1e-9) continue;
    if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c);
  }
  return true;
}
function polygonTouchesLine(polygon, line) {
  const dx = line.b.x - line.a.x, dz = line.b.z - line.a.z, length = Math.hypot(dx, dz);
  if (line.width > 0 && length > 1e-9) {
    const nx = -dz / length * line.width / 2, nz = dx / length * line.width / 2;
    return overlaps(polygon, [{ x: line.a.x + nx, z: line.a.z + nz }, { x: line.b.x + nx, z: line.b.z + nz },
      { x: line.b.x - nx, z: line.b.z - nz }, { x: line.a.x - nx, z: line.a.z - nz }]);
  }
  if (pointInConvex(line.a, polygon) || pointInConvex(line.b, polygon)) return true;
  return polygon.some((a, i) => intersectionT(a, polygon[(i + 1) % polygon.length], line.a, line.b) !== null);
}
function actorPolygon(actor) {
  const w = Math.max(.01, finite(actor.width, .64)), l = Math.max(.01, finite(actor.length, .64)), state = { x: actor.x, z: actor.z, heading: finite(actor.heading) };
  return [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]].map(([x, z]) => localToWorld(state, x, z));
}
function overlaps(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], axis = { x: q.z - p.z, z: p.x - q.x };
    const aa = a.map(p => p.x * axis.x + p.z * axis.z), bb = b.map(p => p.x * axis.x + p.z * axis.z);
    if (Math.max(...aa) < Math.min(...bb) - 1e-8 || Math.max(...bb) < Math.min(...aa) - 1e-8) return false;
  }
  return true;
}
function actorDistance(carPolygon, actor) {
  if (Number.isFinite(actor.radius)) {
    const p = { x: actor.x, z: actor.z };
    if (pointInConvex(p, carPolygon)) return -actor.radius;
    return Math.min(...carPolygon.map((a, i) => pointSegmentDistance(p, a, carPolygon[(i + 1) % 4]))) - actor.radius;
  }
  const polygon = actorPolygon(actor);
  if (overlaps(carPolygon, polygon)) return -1e-6;
  return Math.min(...carPolygon.flatMap(p => polygon.map((a, i) => pointSegmentDistance(p, a, polygon[(i + 1) % 4]))),
    ...polygon.flatMap(p => carPolygon.map((a, i) => pointSegmentDistance(p, a, carPolygon[(i + 1) % 4]))));
}
const validPose = p => p && ['x', 'z', 'heading'].every(k => Number.isFinite(p[k]));
function poseAt(a, b, t) {
  const next = { ...b };
  for (const key of ['x', 'z', 'y', 'pitch', 'elapsed', 'distance', 'speed', 'steer']) if (Number.isFinite(a[key]) || Number.isFinite(b[key]))
    next[key] = finite(a[key], finite(b[key])) + (finite(b[key], finite(a[key])) - finite(a[key], finite(b[key]))) * t;
  const startTime = finite(a.t, finite(a.time, NaN)), endTime = finite(b.t, finite(b.time, NaN));
  if (Number.isFinite(startTime) || Number.isFinite(endTime)) {
    next.t = finite(startTime, endTime) + (finite(endTime, startTime) - finite(startTime, endTime)) * t;
    if (Number.isFinite(a.time) || Number.isFinite(b.time)) next.time = next.t;
  }
  next.heading = wrap(a.heading + wrap(b.heading - a.heading) * t); return next;
}
function actorFrames(chapter, previous, pose, context, previousContext) {
  const scripted = at => [...getCourseSafetyModel(chapter).obstacles, ...getCourseTrafficActors(chapter, at.t ?? at.time)];
  const current = Array.isArray(context?.actors) ? context.actors : [...getCourseSafetyModel(chapter).obstacles, ...getCourseTrafficActors(chapter, pose.t ?? pose.time)];
  const old = Array.isArray(previousContext?.actors) ? previousContext.actors : Array.isArray(context?.actors) ? context.actors
    : [...getCourseSafetyModel(chapter).obstacles, ...getCourseTrafficActors(chapter, previous.t ?? previous.time)];
  const oldById = new Map(old.map(actor => [actor.id, actor]));
  const valid = actor => actor && Number.isFinite(actor.x) && Number.isFinite(actor.z);
  let travel = 0;
  for (const actor of current) {
    const before = oldById.get(actor.id); if (!valid(actor) || !valid(before)) continue;
    // A long vehicle can sweep into the car while its centre never moves.
    // Bound corner travel, rather than measuring only centre translation.
    const radius = Number.isFinite(actor.radius) ? 0 : Math.hypot(finite(actor.width, .64), finite(actor.length, .64)) / 2;
    travel = Math.max(travel, dist(actor, before) + Math.abs(wrap(finite(actor.heading) - finite(before.heading))) * radius
      + Math.abs(finite(actor.baseY, finite(actor.y)) - finite(before.baseY, finite(before.y))));
  }
  const linear = Array.isArray(context?.actors) || Array.isArray(previousContext?.actors);
  if (!linear && chapter.sceneType === 'crosswalk') {
    const startTime = finite(previous.t, finite(previous.time)), endTime = finite(pose.t, finite(pose.time));
    const start = chapter.pedestrianStart ?? 8, end = chapter.pedestrianEnd ?? 14;
    if (Math.max(startTime, endTime) > start && Math.min(startTime, endTime) < end)
      travel = Math.max(travel, Math.abs(endTime - startTime) * 11 / Math.max(.1, end - start));
  }
  return { travel, linear, at(t) {
    // Evaluate a scripted walker at the actual interpolated clock. Interpolating
    // endpoints across its waiting/moving phases would invent the wrong timing.
    if (!Array.isArray(context?.actors) && !Array.isArray(previousContext?.actors)) return scripted(poseAt(previous, pose, t));
    return current.filter(valid).map(actor => {
      const before = oldById.get(actor.id); if (!valid(before)) return actor;
      const next = { ...actor, heading: wrap(finite(before.heading) + wrap(finite(actor.heading) - finite(before.heading)) * t) };
      for (const key of ['x', 'z', 'height']) if (Number.isFinite(before[key]) || Number.isFinite(actor[key]))
        next[key] = finite(before[key], finite(actor[key])) + (finite(actor[key], finite(before[key])) - finite(before[key], finite(actor[key]))) * t;
      const oldBase = finite(before.baseY, finite(before.y)), base = finite(actor.baseY, finite(actor.y));
      next.baseY = oldBase + (base - oldBase) * t;
      if ([before.quaternion, actor.quaternion].every(q => q && ['x', 'y', 'z', 'w'].every(k => Number.isFinite(q[k])) && Math.hypot(q.x, q.y, q.z, q.w) > 1e-12)) {
        const origin = { x: 0, y: 0, z: 0 };
        next.quaternion = interpolateAttachmentTransform({ position: origin, quaternion: before.quaternion }, { position: origin, quaternion: actor.quaternion }, t).quaternion;
      }
      return next;
    });
  } };
}
function event(id, type, blocking, title, detail, position, actor = null) {
  return { id, type, severity: blocking ? 'danger' : 'warning', blocking, title, detail, position: { x: position.x, z: position.z }, ...(actor ? { actorId: actor.id } : {}) };
}
function risksAt(chapter, pose, actors, motion = null) {
  const model = getCourseSafetyModel(chapter), polygon = courseCarPolygon(pose), events = [];
  const referencePolygon = motion && courseCarPolygon(motion.pose), referenceActors = motion && new Map(motion.actors.map(actor => [actor.id, actor]));
  for (const actor of actors) {
    if (actor.enabled === false || actor.visible === false || actor.collision === false) continue;
    const base = finite(actor.baseY, finite(actor.y)), top = base + finite(actor.height, 1.8), carBase = finite(pose.y) + .02;
    if (top < carBase || base > carBase + 1.48) continue;
    const range = Math.hypot(actor.x - pose.x, actor.z - pose.z);
    if (range > CAR.length + Math.max(finite(actor.length), finite(actor.width), finite(actor.radius)) + 1) continue;
    const distance = actorDistance(polygon, actor), label = actor.label || (actor.type === 'pedestrian' ? '行人' : actor.type === 'vehicle' ? '其他车辆' : '障碍物');
    if (distance <= 0) events.push(event(`collision:${actor.id}`, actor.type === 'pedestrian' ? 'pedestrian-collision' : 'collision', true,
      `与${label}接触风险`, '车辆继续沿当前轨迹将接触目标，练习已暂停在接触前。先检查前后与两侧，再从错误前重练。', pose, actor));
    else if (distance < .55) {
      const reference = referenceActors?.get(actor.id);
      const change = reference ? distance - actorDistance(referencePolygon, reference) : 0;
      const closing = motion?.forward ? change > 1e-6 : change < -1e-6;
      const moving = reference && (dist(pose, motion.pose) + dist(actor, reference)
        + Math.abs(wrap(pose.heading - motion.pose.heading)) + Math.abs(wrap(finite(actor.heading) - finite(reference.heading))) > 1e-6);
      if (closing || moving && Math.abs(change) <= 1e-6) events.push(event(`near:${actor.id}`, 'proximity', false,
        closing ? `接近${label}` : `与${label}余量较小`, closing
          ? '与目标的间距正在缩小，请减速并观察车身外摆和两侧空间；目标也可能正在驶近。'
          : '行驶中与目标的余量较小，请减速并保持前后和两侧空间。', pose, actor));
    }
  }
  const outside = outsideRoad(polygon, model);
  if (outside) events.push(event('road-edge', chapter.sceneType === 'parking' ? 'parking-line' : 'road-edge', true,
    chapter.sceneType === 'parking' ? '车身将越过倒库练习边线' : '车身将越出可行驶道路', '检测到继续行驶将越出道路或练习区域，已在风险前一刻暂停。请对照俯视与驾驶位检查方向和车身余量。', outside));
  const wheels = courseWheelPolygons(pose);
  for (const line of model.lines) {
    const bodyTouch = polygonTouchesLine(polygon, line);
    const tyreTouch = line.type === 'opposing-line' && wheels.some(wheel => polygonTouchesLine(wheel, line));
    if (line.type === 'opposing-line') {
      if (tyreTouch) events.push(event(line.id, line.type, true, '轮胎触及对向分隔实线', '已在轮胎继续压线前暂停。请保持本侧道路；路口开口和同向虚线换道不作此项提醒。', pose));
      else if (bodyTouch) events.push(event(`${line.id}:body-close`, 'solid-line-proximity', false, '车身外摆接近对向分隔线', '车身前后角正在靠近实线，请减速并核对车头外摆与轮胎位置。', pose));
    } else if (bodyTouch) {
      if (line.type === 'edge-line') events.push(event(line.id, line.type, false, '车身接近道路边缘线', '车辆外缘已跨到边缘标线附近；请减速并核对轮胎和路沿余量。', pose));
      else events.push(event(line.id, line.type, line.blocking, '车身触及车库边线', '库口是允许进出的开口，当前触及的是库侧或库后边线。请回看同侧镜中的车身与边线。', pose));
    }
  }
  return events;
}

/** Swept risk check. context.actors is authoritative actual scene geometry;
 * supply previousContext to detect relative motion of crossing traffic too.
 * The controller pauses and restores lastSafePose on blocking, preserving its
 * own driving/session metadata. If the initial state is already unsafe,
 * startedUnsafe is true and lastSafePose is null: no safe state was observed.
 * Actual mirror hulls use context.egoAttachments/egoTransform independently;
 * their width never changes the body/paint/tyre envelopes.
 * Existing demonstrations are never mutated. */
export function evaluateCourseSafety({ chapter, previous, pose, context = null, previousContext = null } = {}) {
  if (!chapter || !validPose(pose)) return { events: [], blocking: false, startedUnsafe: false, lastSafePose: validPose(previous) ? { ...previous } : null, contactPose: null, fraction: 1 };
  const start = validPose(previous) ? previous : pose;
  const travel = dist(start, pose) + Math.abs(wrap(pose.heading - start.heading)) * CAR.length + Math.abs(finite(pose.y) - finite(start.y));
  const actors = actorFrames(chapter, start, pose, context, previousContext);
  const steps = Math.min(4096, Math.max(1, Math.ceil((travel + actors.travel) / .08)));
  const mirror = sweepCourseAttachments({ attachments: context?.egoAttachments, previousTransform: previousContext?.egoTransform || context?.egoTransform,
    transform: context?.egoTransform, actorsAt: actors.at, actorTravel: actors.travel, linearActors: actors.linear });
  const fractions = new Set(Array.from({ length: steps + 1 }, (_, index) => index / steps));
  if (mirror) { fractions.add(mirror.safeFraction); fractions.add(mirror.fraction); }
  const samples = [...fractions].filter(fraction => fraction <= (mirror?.fraction ?? 1)).sort((a, b) => a - b);
  let warnings = [], preceding = null;
  for (const fraction of samples) {
    const sample = poseAt(start, pose, fraction);
    const sampleActors = actors.at(fraction);
    const reference = preceding || { pose: poseAt(start, pose, samples[1] ?? 1), actors: actors.at(samples[1] ?? 1), forward: true };
    const events = risksAt(chapter, sample, sampleActors, reference);
    if (mirror && fraction === mirror.fraction) events.push({ id: `mirror:${mirror.partId}:${mirror.actorId}`, type: 'mirror-contact', severity: 'danger', blocking: true,
      title: `${mirror.partLabel}与${mirror.actorLabel}擦碰风险`, detail: '检测到外后视镜实体将接触目标，已在接触前暂停。镜壳和支架的空间独立于车身及轮胎边线，请检查同侧外镜、车头外摆与障碍物。',
      partId: mirror.partId, partLabel: mirror.partLabel, side: mirror.side, actorId: mirror.actorId, position: { ...mirror.position } });
    const blocking = events.some(event => event.blocking);
    // Only active warnings survive a completed sweep. A warning from an earlier
    // sample must clear once the vehicle has left it or the gap is opening.
    warnings = events.filter(item => !item.blocking);
    if (blocking) {
      const startedUnsafe = fraction === 0;
      return { events: startedUnsafe ? events.map(item => item.blocking ? { ...item,
        detail: '当前位置已存在接触、越线或越界风险，练习已暂停；本次没有可恢复的接触前位置。请检查车辆周围，再从此前的练习记录或本项起点重练。' } : item) : events,
        // SLERP describes the swept root correctly, but setPose recomputes the
        // ramp's height/pitch from the road. An intermediate Euler pose need
        // not reproduce that SLERP hull. For attachment stops restore the real
        // frame-start pose/context already checked safe, at most one UI frame
        // earlier; the contact marker still uses the true swept witness point.
        blocking: true, startedUnsafe, lastSafePose: startedUnsafe ? null : events.some(item => item.type === 'mirror-contact') ? { ...start } : preceding.pose,
        contactPose: sample, fraction };
    }
    preceding = { pose: sample, actors: sampleActors };
  }
  return { events: warnings, blocking: false, startedUnsafe: false, lastSafePose: { ...pose }, contactPose: null, fraction: 1 };
}
