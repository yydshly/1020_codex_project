// SPDX-License-Identifier: GPL-3.0-only
// Strict, domain-neutral camera snapshots. No DOM, Three.js or ocean dependency.
// URL v1 format: v1:mode:px,py,pz:tx,ty,tz (coordinates quantized to 0.1).
const MODES = new Set(['overview', 'follow', 'top']);
const FIELDS = new Set(['position', 'target', 'mode']);
const VECTOR_FIELDS = new Set(['0', '1', '2', 'length']);
const NUMBER_TOKEN = /^-?(?:0|[1-9]\d{0,3})(?:\.\d)?$/;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = message => { throw new TypeError(message); };

function validateVector(vector, label) {
  if (!Array.isArray(vector) || vector.length !== 3 || Reflect.ownKeys(vector).some(key => !VECTOR_FIELDS.has(key))) fail(`${label}必须是三个坐标组成的数组`);
  for (let axis = 0; axis < 3; axis++) {
    if (!Object.hasOwn(vector, axis) || !finite(vector[axis]) || Math.abs(vector[axis]) > 5000) fail(`${label}坐标必须为绝对值不超过 5000 的有限数值`);
  }
}

/** Validate without mutation; unknown keys, sparse vectors and unsupported modes fail. */
export function validateCameraState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('相机状态必须为对象');
  const prototype = Object.getPrototypeOf(state);
  if (prototype !== Object.prototype && prototype !== null) fail('相机状态必须为普通数据对象');
  const fields = Reflect.ownKeys(state);
  if (fields.length !== 3 || fields.some(key => !FIELDS.has(key))) fail('相机状态只允许 position、target 和 mode');
  if (!MODES.has(state.mode)) fail('相机模式必须为 overview、follow 或 top');
  validateVector(state.position, 'position');
  validateVector(state.target, 'target');
  const distance = Math.hypot(...state.position.map((value, axis) => value - state.target[axis]));
  if (distance < 10 || distance > 2500) fail('相机与目标的距离必须在 10–2500 之间');
  return true;
}

function quantize(value) {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Output is the raw parameter value; let URLSearchParams perform URL escaping. */
export function encodeCameraState(state) {
  validateCameraState(state);
  const snapshot = {position:state.position.map(quantize), target:state.target.map(quantize), mode:state.mode};
  // Near an exact distance bound, rounding must not produce an invalid snapshot.
  validateCameraState(snapshot);
  return `v1:${snapshot.mode}:${snapshot.position.join(',')}:${snapshot.target.join(',')}`;
}

/** Reject malformed input completely, then return an independently owned frozen snapshot. */
export function decodeCameraState(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 128) fail('相机链接参数必须为非空短字符串');
  const parts = raw.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1' || !MODES.has(parts[1])) fail('相机链接版本、模式或字段数量无效');
  const parseVector = value => {
    const tokens = value.split(',');
    if (tokens.length !== 3 || tokens.some(token => !NUMBER_TOKEN.test(token))) fail('相机链接坐标必须为三个至多一位小数的十进制数');
    return tokens.map(token => {
      const number = Number(token);
      return Object.is(number, -0) ? 0 : number;
    });
  };
  const snapshot = {position:parseVector(parts[2]), target:parseVector(parts[3]), mode:parts[1]};
  validateCameraState(snapshot);
  Object.freeze(snapshot.position);
  Object.freeze(snapshot.target);
  return Object.freeze(snapshot);
}

/** Component-wise coordinate tolerance; a different mode is always a different state. */
export function isSameCameraState(a, b, tolerance = .15) {
  validateCameraState(a);
  validateCameraState(b);
  if (!finite(tolerance) || tolerance < 0) fail('相机比较容差必须为非负有限数值');
  return a.mode === b.mode && ['position', 'target'].every(key => a[key].every((value, axis) => Math.abs(value - b[key][axis]) <= tolerance));
}
