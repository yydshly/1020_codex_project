import { BAY, CAR, clamp, corners, localToWorld } from './vehicle.js';

const WIDTH = 520, HEIGHT = 260;
const PLOT = { x: 20, y: 39, width: 480, height: 169 };
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = { user: '#237f91', reference: '#b38a36', bay: '#809779', issue: '#b75d35', text: '#486151', faint: '#7c8f7c' };
const ids = new WeakMap();
let nextId = 0;
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const validPose = state => state && Number.isFinite(state.x) && Number.isFinite(state.z);

function track(frames) {
  const result = [];
  let distance = 0;
  for (const [index, frame] of (Array.isArray(frames) ? frames : []).entries()) {
    if (!validPose(frame)) continue;
    const state = { ...frame, heading: Number.isFinite(frame.heading) ? frame.heading : 0 };
    const previous = result.at(-1)?.state;
    if (previous) distance += Math.hypot(state.x - previous.x, state.z - previous.z);
    result.push({ state, index, distance });
  }
  return result;
}

function poseAtDistance(entries, distance) {
  if (!entries.length) return null;
  const target = clamp(distance, entries[0].distance, entries.at(-1).distance);
  let next = entries.findIndex(entry => entry.distance >= target);
  if (next <= 0) return { ...entries[0].state };
  const a = entries[next - 1], b = entries[next];
  const span = b.distance - a.distance;
  const amount = span > 1e-8 ? (target - a.distance) / span : 0;
  return {
    ...a.state,
    x: a.state.x + (b.state.x - a.state.x) * amount,
    z: a.state.z + (b.state.z - a.state.z) * amount,
    heading: a.state.heading + angleDelta(b.state.heading, a.state.heading) * amount,
  };
}

// Pure geometry is exported so distance matching can be checked independently
// of the DOM. Both tracks stay in their original world coordinates.
export function buildReviewMapGeometry({ frames = [], referenceFrames = [], selectedIndex, turnIndex, centerIndex, issueIndex } = {}) {
  const user = track(frames), reference = track(referenceFrames);
  const requested = Number.isFinite(selectedIndex) ? Math.floor(selectedIndex) : Infinity;
  const selected = user.findLast(entry => entry.index <= requested) ?? user[0] ?? null;
  let referenceStart = null;
  if (user.length && reference.length) {
    const first = user[0].state;
    let bestScore = Infinity;
    // Find the reference origin once, from the attempt's first pose. Do not
    // chase the nearest reference position every frame: that hides mistakes.
    for (const entry of reference) {
      const angle = angleDelta(first.heading, entry.state.heading);
      const score = (first.x - entry.state.x) ** 2 + (first.z - entry.state.z) ** 2 + (CAR.wheelbase * angle / 2) ** 2;
      if (score < bestScore) { bestScore = score; referenceStart = entry; }
    }
  }
  const distance = selected?.distance ?? 0;
  const referenceDistance = (referenceStart?.distance ?? 0) + distance;
  const referenceCurrent = referenceStart ? poseAtDistance(reference.slice(reference.indexOf(referenceStart)), referenceDistance) : null;
  const events = [
    { index: turnIndex, label: '打', name: '开始打方向', color: COLORS.user },
    { index: centerIndex, label: '正', name: '开始回正', color: '#628351' },
    { index: issueIndex, label: '!', name: '需要复盘的位置', color: COLORS.issue },
  ].flatMap(event => {
    if (!Number.isInteger(event.index) || event.index < 0) return [];
    const entry = user.find(item => item.index === event.index);
    return entry ? [{ ...event, state: entry.state }] : [];
  });
  const bay = [
    { x: BAY.left, z: BAY.entrance }, { x: BAY.left, z: BAY.back },
    { x: BAY.right, z: BAY.back }, { x: BAY.right, z: BAY.entrance },
  ];
  let minX = BAY.left, maxX = BAY.right, minZ = BAY.back, maxZ = BAY.entrance;
  const include = point => {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  };
  for (const { state } of [...user, ...reference]) for (const point of corners(state)) include(point);
  if (referenceCurrent) for (const point of corners(referenceCurrent)) include(point);
  // Equal scale on both axes preserves distances, vehicle shape and errors.
  const padding = 0.6;
  minX -= padding; maxX += padding; minZ -= padding; maxZ += padding;
  const scale = Math.min(PLOT.width / (maxX - minX), PLOT.height / (maxZ - minZ));
  const offsetX = PLOT.x + (PLOT.width - (maxX - minX) * scale) / 2;
  const offsetY = PLOT.y + (PLOT.height - (maxZ - minZ) * scale) / 2;
  const project = point => ({ x: offsetX + (point.x - minX) * scale, y: offsetY + (maxZ - point.z) * scale });
  return {
    user, reference, selected, referenceStart, referenceCurrent, referenceDistance,
    distance, events, bay, project, scale,
    referenceEnded: Boolean(referenceStart && referenceDistance > reference.at(-1).distance + 0.01),
  };
}

function compactPath(entries) {
  const points = [];
  for (const { state } of entries) {
    const previous = points.at(-1);
    if (!previous || Math.hypot(state.x - previous.x, state.z - previous.z) > 0.025) points.push(state);
  }
  const last = entries.at(-1)?.state;
  if (last && points.at(-1) !== last) points.push(last);
  return points;
}

export function renderReviewMap(svgElement, options = {}) {
  if (!svgElement?.ownerDocument) return;
  const geometry = buildReviewMapGeometry(options);
  const document = svgElement.ownerDocument;
  if (!ids.has(svgElement)) ids.set(svgElement, ++nextId);
  const prefix = `parking-review-${ids.get(svgElement)}`;
  const node = (name, attributes = {}, text) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const group = node('g', { 'font-family': 'system-ui, sans-serif', 'font-size': 10, fill: COLORS.text });
  const add = (name, attributes, text) => { const element = node(name, attributes, text); group.appendChild(element); return element; };
  const screenPoints = points => points.map(point => {
    const p = geometry.project(point); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(' ');
  const path = (points, attributes) => add('polyline', { points: screenPoints(points), fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...attributes });
  const text = (x, y, value, attributes = {}) => add('text', { x, y, ...attributes }, value);
  add('rect', { x: 0.5, y: 0.5, width: WIDTH - 1, height: HEIGHT - 1, rx: 9, fill: '#f7faf4', stroke: '#d8e2d1' });
  text(16, 23, '轨迹与姿态对照', { 'font-size': 12, 'font-weight': 600 });
  text(WIDTH - 16, 23, '从接手位置按行驶距离对照', { 'text-anchor': 'end', fill: COLORS.faint, 'font-size': 9 });
  add('polygon', { points: screenPoints(geometry.bay), fill: '#e9f0e4' });
  path(geometry.bay, { stroke: COLORS.bay, 'stroke-width': 2 });
  path([geometry.bay[0], geometry.bay[3]], { stroke: COLORS.bay, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.75 });
  const entrance = geometry.project({ x: 0, z: BAY.entrance });
  text(entrance.x, entrance.y - 5, '库口', { 'text-anchor': 'middle', fill: COLORS.faint, 'font-size': 9 });
  path(compactPath(geometry.reference), { stroke: COLORS.reference, 'stroke-width': 1.8, 'stroke-dasharray': '5 4', opacity: 0.9 });
  path(compactPath(geometry.user), { stroke: COLORS.user, 'stroke-width': 2.4 });

  const car = (state, color, dashed) => {
    if (!state) return;
    const points = corners(state);
    add('polygon', {
      points: screenPoints([points[0], points[1], points[3], points[2]]),
      fill: color, 'fill-opacity': dashed ? 0.04 : 0.11,
      stroke: color, 'stroke-width': dashed ? 1.3 : 1.8,
      ...(dashed ? { 'stroke-dasharray': '3 3' } : {}),
    });
    const front = CAR.length - CAR.rearOverhang - 0.3;
    path([localToWorld(state, -CAR.width * 0.33, front), localToWorld(state, CAR.width * 0.33, front)], { stroke: color, 'stroke-width': 2 });
    const axle = geometry.project(state);
    add('circle', { cx: axle.x, cy: axle.y, r: dashed ? 2 : 2.6, fill: color });
  };
  car(geometry.referenceCurrent, COLORS.reference, true);
  car(geometry.selected?.state, COLORS.user, false);
  for (const event of geometry.events) {
    const point = geometry.project(event.state);
    const marker = add('g');
    marker.appendChild(node('title', {}, event.name));
    marker.appendChild(node('circle', { cx: point.x, cy: point.y, r: 7, fill: '#fbfcf8', stroke: event.color, 'stroke-width': 1.5 }));
    marker.appendChild(node('text', { x: point.x, y: point.y + 3, 'text-anchor': 'middle', fill: event.color, 'font-size': 9, 'font-weight': 650 }, event.label));
  }
  if (!geometry.user.length) text(WIDTH / 2, 112, '完成一段练习后，在这里对照轨迹', { 'text-anchor': 'middle', fill: COLORS.faint });
  add('line', { x1: 17, x2: 39, y1: 224, y2: 224, stroke: COLORS.user, 'stroke-width': 2.4 });
  text(45, 227, '本次后轴轨迹');
  add('line', { x1: 143, x2: 165, y1: 224, y2: 224, stroke: COLORS.reference, 'stroke-width': 1.8, 'stroke-dasharray': '5 4' });
  text(171, 227, '同侧示范后轴轨迹');
  text(WIDTH - 16, 227, geometry.referenceEnded ? '示范轮廓已到路径终点' : '轮廓：本车 / 距离对应的示范车', { 'text-anchor': 'end', fill: COLORS.faint, 'font-size': 9 });
  for (const [x, label, name, color] of [[22, '打', '打方向', COLORS.user], [111, '正', '回正', '#628351'], [185, '!', '注意点', COLORS.issue]]) {
    add('circle', { cx: x, cy: 246, r: 6, fill: '#fbfcf8', stroke: color });
    text(x, 249, label, { 'text-anchor': 'middle', fill: color, 'font-size': 8 });
    text(x + 11, 249, name, { 'font-size': 9 });
  }
  text(WIDTH - 16, 249, '真实场地坐标 · 不按时间同步', { 'text-anchor': 'end', fill: COLORS.faint, 'font-size': 9 });
  const title = node('title', { id: `${prefix}-title` }, '本次倒库与同侧示范的轨迹对照');
  const description = node('desc', { id: `${prefix}-desc` }, `青色实线为本次后轴轨迹，金色虚线为完整同侧示范。车库和两条轨迹使用相同的实际世界坐标，没有平移或旋转校正。示范轮廓从接手初始姿态附近定位起点，然后按本次累计行驶距离对照，不按时钟同步，也不逐帧追随最近位置。当前从接手位置行驶 ${geometry.distance.toFixed(2)} 米。打、正、感叹号分别标记开始打方向、开始回正和需要复盘的位置。`);
  svgElement.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svgElement.setAttribute('width', '100%');
  svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgElement.setAttribute('role', 'img');
  svgElement.setAttribute('aria-labelledby', `${prefix}-title ${prefix}-desc`);
  svgElement.replaceChildren(title, description, group);
}
