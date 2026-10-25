// Convex exterior attachments are separate from the car body/tyre/road model.
// Their vertices come from the actual rendered meshes; boxes are never used
// as a substitute for a RoundedBox's empty corners in the narrowphase.
const EPS = 1e-5; // 0.01 mm numerical contact tolerance; coordinates are metres.
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, n) => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = a => Math.hypot(a.x, a.y, a.z);
const finitePoint = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const validQuaternion = q => q && ['x', 'y', 'z', 'w'].every(k => Number.isFinite(q[k])) && Math.hypot(q.x, q.y, q.z, q.w) > 1e-12;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const identity = { x: 0, y: 0, z: 0, w: 1 };
const shapeCache = new WeakMap();
const qNormalize = q => {
  const length = Math.hypot(q.x, q.y, q.z, q.w); return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
};
function rotate(q, p) {
  const tx = 2 * (q.y * p.z - q.z * p.y), ty = 2 * (q.z * p.x - q.x * p.z), tz = 2 * (q.x * p.y - q.y * p.x);
  return { x: p.x + q.w * tx + q.y * tz - q.z * ty, y: p.y + q.w * ty + q.z * tx - q.x * tz, z: p.z + q.w * tz + q.x * ty - q.y * tx };
}
const inverseRotate = (q, p) => rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, p);
const qDot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
const angle = (a, b) => 2 * Math.acos(Math.max(-1, Math.min(1, Math.abs(qDot(a, b)))));
function rotationAxis(a, b0) {
  const b = qDot(a, b0) < 0 ? { x: -b0.x, y: -b0.y, z: -b0.z, w: -b0.w } : b0;
  // qb * inverse(qa): SLERP's fixed WORLD rotation axis.
  const axis = { x: -b.w * a.x + b.x * a.w - b.y * a.z + b.z * a.y,
    y: -b.w * a.y + b.x * a.z + b.y * a.w - b.z * a.x,
    z: -b.w * a.z - b.x * a.y + b.y * a.x + b.z * a.w };
  const length = norm(axis); return length > 1e-15 ? scale(axis, 1 / length) : { x: 0, y: 0, z: 0 };
}
const perpendicular = (normal, axis) => Math.hypot(normal.y * axis.z - normal.z * axis.y,
  normal.z * axis.x - normal.x * axis.z, normal.x * axis.y - normal.y * axis.x);
export function interpolateAttachmentTransform(a, b, t) {
  const qa = qNormalize(a.quaternion), qb0 = qNormalize(b.quaternion), product = qDot(qa, qb0);
  const qb = product < 0 ? { x: -qb0.x, y: -qb0.y, z: -qb0.z, w: -qb0.w } : qb0;
  const cosine = Math.max(-1, Math.min(1, Math.abs(product))), theta = Math.acos(cosine);
  const wa = theta < 1e-7 ? 1 - t : Math.sin((1 - t) * theta) / Math.sin(theta), wb = theta < 1e-7 ? t : Math.sin(t * theta) / Math.sin(theta);
  return { position: add(a.position, scale(sub(b.position, a.position), t)), quaternion: qNormalize({ x: qa.x * wa + qb.x * wb,
    y: qa.y * wa + qb.y * wb, z: qa.z * wa + qb.z * wb, w: qa.w * wa + qb.w * wb }) };
}
export const validAttachmentTransform = t => finitePoint(t?.position) && validQuaternion(t?.quaternion);

function attachmentData(part) {
  const cached = shapeCache.get(part); if (cached) return cached;
  if (part?.type !== 'convex' || !Array.isArray(part.vertices) || part.vertices.length < 4 || !part.vertices.every(finitePoint)) return null;
  const center = finitePoint(part.center) ? part.center : scale(part.vertices.reduce(add, { x: 0, y: 0, z: 0 }), 1 / part.vertices.length);
  const data = { center, radius: Math.max(...part.vertices.map(p => norm(sub(p, center)))), rootRadius: Math.max(...part.vertices.map(norm)) };
  shapeCache.set(part, data); return data;
}
function attachmentShape(part, transform) {
  const data = attachmentData(part), quaternion = qNormalize(transform.quaternion);
  return { center: add(transform.position, rotate(quaternion, data.center)), radius: data.radius, support(direction) {
    const localDirection = inverseRotate(quaternion, direction);
    let best = part.vertices[0], projection = dot(best, localDirection);
    for (let i = 1; i < part.vertices.length; i++) {
      const candidate = dot(part.vertices[i], localDirection); if (candidate > projection) { projection = candidate; best = part.vertices[i]; }
    }
    return add(transform.position, rotate(quaternion, best));
  } };
}
function actorShape(actor) {
  if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.z) || actor.enabled === false || actor.visible === false || actor.collision === false) return null;
  const height = Math.max(0, finite(actor.height, 1.8)), base = finite(actor.baseY, finite(actor.y));
  const center = { x: actor.x, y: base + height / 2, z: actor.z };
  const heading = finite(actor.heading), quaternion = validQuaternion(actor.quaternion) ? qNormalize(actor.quaternion) : { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
  if (Number.isFinite(actor.radius)) {
    const radius = Math.max(0, actor.radius);
    return { center, radius: Math.hypot(radius, height / 2), quaternion, support(direction) {
      const d = inverseRotate(quaternion, direction), flat = Math.hypot(d.x, d.z);
      return add(center, rotate(quaternion, { x: flat ? radius * d.x / flat : 0, y: d.y >= 0 ? height / 2 : -height / 2, z: flat ? radius * d.z / flat : 0 }));
    } };
  }
  const half = { x: Math.max(0, finite(actor.width, .64) / 2), y: height / 2, z: Math.max(0, finite(actor.length, .64) / 2) };
  return { center, radius: norm(half), quaternion, support(direction) {
    const d = inverseRotate(quaternion, direction);
    return add(center, rotate(quaternion, { x: d.x >= 0 ? half.x : -half.x, y: d.y >= 0 ? half.y : -half.y, z: d.z >= 0 ? half.z : -half.z }));
  } };
}

function solve(matrix, values) {
  const count = values.length, rows = matrix.map((row, i) => [...row, values[i]]);
  const tolerance = Math.max(1e-25, ...matrix.flat().map(Math.abs)) * 1e-13;
  for (let column = 0; column < count; column++) {
    let pivot = column;
    for (let row = column + 1; row < count; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) <= tolerance) return null;
    [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    const divisor = rows[column][column]; for (let k = column; k <= count; k++) rows[column][k] /= divisor;
    for (let row = 0; row < count; row++) if (row !== column) {
      const factor = rows[row][column]; for (let k = column; k <= count; k++) rows[row][k] -= factor * rows[column][k];
    }
  }
  return rows.map(row => row[count]);
}
// The closest point to a simplex is on one of its affine faces. Enumerating
// its at most 15 faces also handles degenerate/coplanar mesh support points.
function closest(simplex) {
  let best = null;
  for (let mask = 1; mask < 1 << simplex.length; mask++) {
    const selected = simplex.filter((_, index) => mask & 1 << index), anchor = selected[0].p;
    const directions = selected.slice(1).map(vertex => sub(vertex.p, anchor));
    const solution = directions.length ? solve(directions.map(a => directions.map(b => dot(a, b))), directions.map(a => -dot(a, anchor))) : [];
    if (!solution) continue;
    const weights = [1 - solution.reduce((a, b) => a + b, 0), ...solution];
    if (weights.some(weight => weight < -1e-9)) continue;
    const p = selected.reduce((sum, vertex, index) => add(sum, scale(vertex.p, weights[index])), { x: 0, y: 0, z: 0 });
    const squared = dot(p, p);
    if (!best || squared < best.squared) best = { p, squared, selected, weights };
  }
  return best;
}
function convexDistance(a, b) {
  const support = direction => { const aa = a.support(direction), bb = b.support(scale(direction, -1)); return { p: sub(aa, bb), a: aa, b: bb }; };
  let direction = sub(b.center, a.center); if (norm(direction) < 1e-9) direction = { x: 1, y: 0, z: 0 };
  let simplex = [support(direction)], result = closest(simplex), lowerBound = 0;
  for (let iteration = 0; iteration < 80; iteration++) {
    if (result.squared <= 1e-20) break;
    const candidate = support(scale(result.p, -1)), distance = Math.sqrt(result.squared);
    lowerBound = Math.max(0, dot(result.p, candidate.p) / distance);
    if (result.squared - dot(result.p, candidate.p) <= 1e-13 * Math.max(1, result.squared)
      || result.selected.some(vertex => norm(sub(vertex.p, candidate.p)) < 1e-12)) break;
    simplex = [...result.selected.filter((_, index) => result.weights[index] > 1e-10), candidate];
    result = closest(simplex);
  }
  const pointA = result.selected.reduce((sum, vertex, index) => add(sum, scale(vertex.a, result.weights[index])), { x: 0, y: 0, z: 0 });
  const pointB = result.selected.reduce((sum, vertex, index) => add(sum, scale(vertex.b, result.weights[index])), { x: 0, y: 0, z: 0 });
  const length = norm(result.p), normal = length > 1e-12 ? scale(result.p, 1 / length) : { x: 0, y: 0, z: 0 };
  lowerBound = length > 1e-12 ? Math.max(0, dot(normal, support(scale(normal, -1)).p)) : 0;
  return { distance: Math.sqrt(result.squared), lowerBound, normal,
    position: scale(add(pointA, pointB), .5) };
}

/** Actual convex attachment against the registered actor's 3-D box/cylinder.
 * Exposed for geometric regression checks; never mutates shared mesh vertices. */
export function courseAttachmentDistance(part, transform, actor) {
  const data = attachmentData(part), other = actorShape(actor);
  if (!data || !validAttachmentTransform(transform) || !other) return null;
  return convexDistance(attachmentShape(part, transform), other);
}

/** First contact along interpolated real car-root transforms. The conservative
 * advance uses a separating-distance lower bound and bounds ALL vertex travel,
 * including pitch/yaw and actor rotation; it does not sample only endpoints.
 * actorsAt must return the same actor geometry used by the scene/body checks. */
export function sweepCourseAttachments({ attachments, previousTransform, transform, actorsAt, actorTravel = 0, linearActors = true }) {
  if (!Array.isArray(attachments) || !validAttachmentTransform(previousTransform) || !validAttachmentTransform(transform)) return null;
  const qa = qNormalize(previousTransform.quaternion), qb = qNormalize(transform.quaternion), egoAngle = angle(qa, qb);
  const egoAxis = rotationAxis(qa, qb);
  const translation = sub(transform.position, previousTransform.position), startActors = actorsAt(0), endActors = actorsAt(1);
  const endById = new Map(endActors.map(actor => [actor.id, actor]));
  const frameCache = new Map([[0, new Map(startActors.map(actor => [actor.id, actor]))], [1, endById]]);
  const actorAt = (id, fraction) => {
    if (!frameCache.has(fraction)) frameCache.set(fraction, new Map(actorsAt(fraction).map(actor => [actor.id, actor])));
    return frameCache.get(fraction).get(id);
  };
  let first = null;
  for (const part of attachments) {
    const data = attachmentData(part); if (!data || part.enabled === false) continue;
    const firstShape = attachmentShape(part, previousTransform);
    for (const actor of startActors) {
      const endActor = endById.get(actor.id), oldOther = actorShape(actor), newOther = actorShape(endActor);
      if (!oldOther || !newOther) continue;
      const actorDelta = sub(newOther.center, oldOther.center), relative = sub(translation, actorDelta);
      const actorAngle = angle(oldOther.quaternion || identity, newOther.quaternion || identity);
      const actorAxis = rotationAxis(oldOther.quaternion || identity, newOther.quaternion || identity);
      const resizing = Math.abs(finite(actor.height, 1.8) - finite(endActor.height, 1.8)) / 2
        + Math.abs(finite(actor.width, .64) - finite(endActor.width, .64)) / 2 + Math.abs(finite(actor.length, .64) - finite(endActor.length, .64)) / 2
        + Math.abs(finite(actor.radius) - finite(endActor.radius));
      const egoAngular = egoAngle * data.rootRadius, actorAngular = actorAngle * Math.max(oldOther.radius, newOther.radius);
      const angular = egoAngular + actorAngular + resizing;
      const movement = linearActors ? norm(relative) + angular : norm(translation) + actorTravel + angular;
      // Spheres only prune impossible pairs; the actual convex hull decides all
      // contacts. This also avoids testing tiny mirror parts against far decor.
      if (norm(sub(firstShape.center, oldOther.center)) > data.radius + Math.max(oldOther.radius, newOther.radius) + movement + EPS) continue;
      let fraction = 0, safeFraction = 0;
      for (let iteration = 0; iteration < 8192; iteration++) {
        const at = interpolateAttachmentTransform(previousTransform, transform, fraction);
        const other = actorShape(actorAt(actor.id, fraction)); if (!other) break;
        const contact = convexDistance(attachmentShape(part, at), other);
        if (contact.distance <= EPS) {
          if (!first || fraction < first.fraction) first = { fraction, safeFraction, partId: part.id, partLabel: part.label || '外后视镜', side: part.side,
            actorId: actor.id, actorLabel: actor.label || (actor.type === 'pedestrian' ? '行人' : '障碍物'), position: contact.position };
          break;
        }
        if (fraction >= (first?.fraction ?? 1)) break;
        // Along any separating normal, only closing translation and the bound
        // on rotating support points can close the gap. Parallel/retreating
        // motion therefore exits immediately instead of issuing stale alerts.
        // Rotation about n cannot close a gap along n. Project the fixed
        // SLERP world axes onto its perpendicular plane; a global angular
        // speed bound would take thousands of micron steps for harmless
        // pitch parallel to a wall and could exhaust before a tiny yaw hits.
        const projectedAngular = egoAngular * perpendicular(contact.normal, egoAxis)
          + actorAngular * perpendicular(contact.normal, actorAxis) + resizing;
        const closing = linearActors ? Math.max(0, -dot(relative, contact.normal)) + projectedAngular : norm(translation) + actorTravel + projectedAngular;
        if (closing <= 1e-12) break;
        // A lower bound (not GJK's upper distance estimate) is essential here:
        // advancing by an upper estimate could jump through a thin mirror rim.
        const advance = Math.max(0, contact.lowerBound) / closing * .9;
        if (advance <= 1e-12) break;
        safeFraction = fraction;
        fraction = Math.min(first?.fraction ?? 1, fraction + advance);
      }
    }
  }
  return first;
}
