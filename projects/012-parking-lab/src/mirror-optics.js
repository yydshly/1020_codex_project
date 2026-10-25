import { sampleMirrorRay } from './cockpit.js';

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a, value) => ({ x: a.x * value, y: a.y * value, z: a.z * value });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = value => Math.hypot(value.x, value.y, value.z);
const normalized = value => {
  const magnitude = length(value);
  if (!Number.isFinite(magnitude) || magnitude < 1e-12) throw new RangeError('Mirror directions must be finite and nonzero.');
  return scale(value, 1 / magnitude);
};
const degrees = radians => radians * 180 / Math.PI;

// Partial-pivot Gaussian elimination. The normal equations are assembled in
// coordinates relative to the mirror, avoiding cancellation at large world X/Z.
function solve3(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  const tolerance = Math.max(...matrix.flat().map(Math.abs)) * 1e-12;
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (!Number.isFinite(rows[pivot][column]) || Math.abs(rows[pivot][column]) <= tolerance) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = column + 1; row < 3; row++) {
      const factor = rows[row][column] / rows[column][column];
      for (let index = column; index < 4; index++) rows[row][index] -= factor * rows[column][index];
    }
  }
  const solution = [0, 0, 0];
  for (let row = 2; row >= 0; row--) {
    let value = rows[row][3];
    for (let column = row + 1; column < 3; column++) value -= rows[row][column] * solution[column];
    solution[row] = value / rows[row][row];
  }
  return solution.every(Number.isFinite) ? { x: solution[0], y: solution[1], z: solution[2] } : null;
}

/** Texture UV for a reflected world-space direction; no additional mirror flip. */
export function sourceUV(optics, direction) {
  const depth = dot(direction, optics.forward);
  return {
    u: 0.5 + dot(direction, optics.right) / (2 * depth * optics.tanHorizontal),
    v: 0.5 + dot(direction, optics.up) / (2 * depth * optics.tanVertical),
  };
}

/**
 * Fit one virtual pinhole to finite spherical-mirror rays, then map each physical
 * mirror sample to that camera's texture. Reflection directions are geometric;
 * the common ray origin is an approximation: a convex mirror is non-central.
 * maxRayError quantifies the largest sampled perpendicular origin error in m.
 * Near bodywork can therefore have parallax error; this is not exact ray tracing.
 * Display magnification must preserve these UVs and the physical mirror frame.
 */
export function createMirrorOptics(frame, { columns = 24, rows = 16, aspect = 1.58 } = {}) {
  if (!Number.isInteger(columns) || columns < 1 || columns > 256 || !Number.isInteger(rows) || rows < 1 || rows > 256) {
    throw new RangeError('Mirror sampling requires 1 through 256 integer columns and rows.');
  }
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError('Mirror render aspect must be finite and positive.');
  const forward = normalized(sampleMirrorRay(frame, 0, 0).direction);
  let lateral = cross(forward, { x: 0, y: 1, z: 0 });
  if (length(lateral) < 1e-8) lateral = cross(forward, { x: 0, y: 0, z: 1 });
  const right = normalized(lateral);
  const up = normalized(cross(right, forward));
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
  const values = [0, 0, 0];
  const samples = [];
  let minHorizontal = Infinity, maxHorizontal = -Infinity, minVertical = Infinity, maxVertical = -Infinity;
  let requiredHorizontal = 0, requiredVertical = 0;
  for (let row = 0; row <= rows; row++) {
    const v = 1 - 2 * row / rows;
    for (let column = 0; column <= columns; column++) {
      const u = -1 + 2 * column / columns;
      const ray = sampleMirrorRay(frame, u, v);
      const direction = normalized(ray.direction);
      const offset = subtract(ray.origin, frame.center);
      const q = [direction.x, direction.y, direction.z], p = [offset.x, offset.y, offset.z];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const projection = (i === j ? 1 : 0) - q[i] * q[j];
        matrix[i][j] += projection;
        values[i] += projection * p[j];
      }
      const depth = dot(direction, forward);
      if (depth <= 1e-8) throw new RangeError('Mirror rays must fit within a forward perspective hemisphere.');
      const horizontal = dot(direction, right) / depth;
      const vertical = dot(direction, up) / depth;
      requiredHorizontal = Math.max(requiredHorizontal, Math.abs(horizontal));
      requiredVertical = Math.max(requiredVertical, Math.abs(vertical));
      minHorizontal = Math.min(minHorizontal, Math.atan(horizontal)); maxHorizontal = Math.max(maxHorizontal, Math.atan(horizontal));
      minVertical = Math.min(minVertical, Math.atan(vertical)); maxVertical = Math.max(maxVertical, Math.atan(vertical));
      samples.push({ origin: ray.origin, direction });
    }
  }
  let offset = solve3(matrix, values);
  if (!offset) {
    // Degenerate, effectively parallel samples cannot locate a unique eye.
    // The tangent-plane virtual eye remains finite and its error is reported.
    const eye = subtract(frame.eye, frame.center), normal = normalized(frame.normal);
    offset = subtract(eye, scale(normal, 2 * dot(eye, normal)));
  }
  const position = add(frame.center, offset);
  const tanVertical = Math.max(requiredVertical, requiredHorizontal / aspect, 1e-8) * 1.02;
  const tanHorizontal = tanVertical * aspect;
  const optics = { position, forward, right, up, aspect, fov: degrees(2 * Math.atan(tanVertical)), tanHorizontal, tanVertical,
    columns, rows, uvs: new Float32Array(samples.length * 2), maxRayError: 0,
    field: { horizontal: degrees(maxHorizontal - minHorizontal), vertical: degrees(maxVertical - minVertical) } };
  samples.forEach((ray, index) => {
    const uv = sourceUV(optics, ray.direction);
    optics.uvs[index * 2] = uv.u; optics.uvs[index * 2 + 1] = uv.v;
    optics.maxRayError = Math.max(optics.maxRayError, length(cross(subtract(position, ray.origin), ray.direction)));
  });
  return optics;
}
