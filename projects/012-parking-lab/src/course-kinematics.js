// Deterministic teaching motion: one continuous position curve supplies the
// displayed speed, body heading, front-wheel angle and signed wheel travel.
// This is a kinematic demonstration, not an engine / clutch force simulator.
import { CAR } from './vehicle.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function monotoneTrack(points, { startVelocity, endVelocity } = {}) {
  const n = points.length, h = [], slope = [], tangent = Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    h[i] = points[i + 1].t - points[i].t;
    slope[i] = (points[i + 1].value - points[i].value) / h[i];
  }
  tangent[0] = startVelocity ?? slope[0]; tangent[n - 1] = endVelocity ?? slope[n - 2];
  for (let i = 1; i < n - 1; i++) if (slope[i - 1] * slope[i] > 0) {
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }
  // A hold has zero velocity at both ends. The limiter prevents an endpoint
  // velocity hint from overshooting a stop position or reversing direction.
  for (let i = 0; i < n - 1; i++) {
    if (!slope[i]) { tangent[i] = tangent[i + 1] = 0; continue; }
    for (const j of [i, i + 1]) if (tangent[j] * slope[i] < 0) tangent[j] = 0;
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], norm = Math.hypot(a, b);
    if (norm > 3) { tangent[i] *= 3 / norm; tangent[i + 1] *= 3 / norm; }
  }
  return time => {
    const t = clamp(time, points[0].t, points[n - 1].t);
    let low = 0, high = n - 1;
    while (low + 1 < high) { const mid = (low + high) >> 1; if (points[mid].t <= t) low = mid; else high = mid; }
    const dt = h[low], u = (t - points[low].t) / dt, a = points[low].value, b = points[high].value;
    const m = tangent[low] * dt, k = tangent[high] * dt;
    return {
      value: (2 * u ** 3 - 3 * u * u + 1) * a + (u ** 3 - 2 * u * u + u) * m + (-2 * u ** 3 + 3 * u * u) * b + (u ** 3 - u * u) * k,
      velocity: ((6 * u * u - 6 * u) * a + (3 * u * u - 4 * u + 1) * m + (-6 * u * u + 6 * u) * b + (3 * u * u - 2 * u) * k) / dt,
      acceleration: ((12 * u - 6) * a + (6 * u - 4) * m + (-12 * u + 6) * b + (6 * u - 2) * k) / (dt * dt),
    };
  };
}

// Lateral displacement follows longitudinal progress, not an independent clock.
// This prevents an accelerating departure from demanding an impossible turn at
// near-zero speed. Its curvature is finite even at a standing start.
function lateralTrack(points, time, along) {
  let i = 0; while (i < points.length - 2 && points[i + 1].t <= time) i++;
  const a = points[i], b = points[i + 1], span = b.z - a.z, d = b.x - a.x;
  if (!span || !d) return { value: a.x, velocity: 0, acceleration: 0 };
  const u = clamp((along.value - a.z) / span, 0, 1), first = 30 * u * u * (1 - u) ** 2, second = 60 * u * (1 - 3 * u + 2 * u * u);
  return {
    value: a.x + d * u ** 3 * (10 - 15 * u + 6 * u * u),
    velocity: d * first * along.velocity / span,
    acceleration: d * (second * (along.velocity / span) ** 2 + first * along.acceleration / span),
  };
}

export function keyframePosition(points) {
  const z = monotoneTrack(points.map(p => ({ t: p.t, value: p.z })), {
    startVelocity: (points[0].speed || 0) * Math.cos(points[0].heading || 0),
    endVelocity: (points.at(-1).speed || 0) * Math.cos(points.at(-1).heading || 0),
  });
  return t => {
    const along = z(t), x = lateralTrack(points, t, along);
    return { x: x.value, z: along.value, dx: x.velocity, dz: along.velocity,
      ddx: x.acceleration, ddz: along.acceleration, heading: 0 };
  };
}

// Re-time a line/circle path in metres instead of interpolating unrelated speed
// labels. All original geometric junctions, stop positions and timestamps stay.
export function retimedPath(knots, position) {
  const track = monotoneTrack(knots.map(k => ({ t: k.t, value: k.s })));
  const geometry = s => {
    let i = 0; while (i < knots.length - 2 && knots[i + 1].s < s - 1e-10) i++;
    while (i < knots.length - 2 && knots[i + 1].s === knots[i].s) i++;
    const a = knots[i], b = knots[i + 1], u = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
    return position(a.t + (b.t - a.t) * u);
  };
  return t => {
    const progress = track(t), s = progress.value;
    let from = 0, to = knots.at(-1).s;
    for (let i = 0; i < knots.length - 1; i++) if (knots[i].s === knots[i + 1].s) {
      if (t > knots[i].t && t < knots[i + 1].t) return { ...geometry(s), dx: 0, dz: 0, ddx: 0, ddz: 0 };
      if (t <= knots[i].t) { to = knots[i].s; break; }
      if (t >= knots[i + 1].t) from = knots[i].s;
    }
    const p = differentiate(u => geometry(from + u), s - from, to - from), v = progress.velocity, a = progress.acceleration;
    return { ...p, dx: p.dx * v, dz: p.dz * v,
      ddx: p.ddx * v * v + p.dx * a, ddz: p.ddz * v * v + p.dz * a };
  };
}

function differentiate(position, t, duration) {
  const p = position(t);
  if (Number.isFinite(p.dx)) return p;
  const h = .001;
  if (t < h || t > duration - h) {
    const sign = t < h ? 1 : -1, a = position(t + sign * h), b = position(t + sign * 2 * h), c = position(t + sign * 3 * h);
    return { ...p, dx: sign * (-3 * p.x + 4 * a.x - b.x) / (2 * h), dz: sign * (-3 * p.z + 4 * a.z - b.z) / (2 * h),
      ddx: (2 * p.x - 5 * a.x + 4 * b.x - c.x) / (h * h), ddz: (2 * p.z - 5 * a.z + 4 * b.z - c.z) / (h * h) };
  }
  const a = position(t - h), b = position(t + h);
  return { ...p, dx: (b.x - a.x) / (2 * h), dz: (b.z - a.z) / (2 * h),
    ddx: (b.x - 2 * p.x + a.x) / (h * h), ddz: (b.z - 2 * p.z + a.z) / (h * h) };
}

export function createKinematicSampler({ duration, position, direction = () => 1, metadata, controls = () => ({}) }) {
  const motion = t => {
    const p = differentiate(position, t, duration), magnitude = Math.hypot(p.dx, p.dz), sign = direction(t);
    const moving = magnitude > 1e-6, yaw = moving ? (p.dz * p.ddx - p.dx * p.ddz) / (magnitude * magnitude) : 0;
    const speed = moving ? sign * magnitude : 0;
    const acceleration = moving ? (p.dx * p.ddx + p.dz * p.ddz) / magnitude : 0;
    return { ...p, t, speed, heading: moving ? Math.atan2(sign * p.dx, sign * p.dz) : p.heading || 0,
      steer: moving ? Math.atan(CAR.wheelbase * yaw / speed) : 0, acceleration };
  };
  // Signed path length, integrated once, then locally integrated for arbitrary
  // seek times. Simpson's rule is independent of RAF history and playback rate.
  const count = Math.ceil(duration / .05), step = duration / count, distances = [0];
  const travel = (a, b) => (b - a) / 6 * (motion(a).speed + 4 * motion((a + b) / 2).speed + motion(b).speed);
  for (let i = 0; i < count; i++) distances.push(distances[i] + travel(i * step, (i + 1) * step));
  return time => {
    const t = clamp(time, 0, duration), p = motion(t), source = metadata(t), moving = Math.abs(p.speed) > .002;
    const explicit = controls(t, p), rawClutch = explicit.clutchState ?? source.clutchState;
    const clutchState = explicit.clutchState ?? (moving ? (Math.abs(p.speed) < .85 && p.acceleration > 0 ? 'bite' : 'up') : rawClutch ?? (source.clutch ? 'down' : 'up'));
    const brake = explicit.brake ?? (moving ? p.acceleration < -.06 : Boolean(source.brake));
    const gear = moving ? p.speed < 0 ? 'R' : ['N', 'R'].includes(source.gear) ? '1' : source.gear : source.gear;
    const i = Math.min(count - 1, Math.floor(t / step));
    const result = { ...source, ...p, gear, clutchState, clutch: clutchState === 'down', brake,
      parkingBrake: !moving && Boolean(source.parkingBrake),
      clutchValue: clutchState === 'down' ? 1 : clutchState === 'bite' ? .5 : 0,
      brakeValue: brake ? moving ? clamp(.15 - p.acceleration * .2, .15, .7) : 1 : 0,
      throttle: brake || clutchState === 'down' ? 0 : moving || clutchState === 'bite' ? clamp(.18 + Math.max(0, p.acceleration) * .12, .18, .5) : 0,
      distance: distances[i] + travel(i * step, t), ...explicit };
    for (const key of ['dx', 'dz', 'ddx', 'ddz']) delete result[key];
    result.heading = wrap(result.heading);
    return result;
  };
}
