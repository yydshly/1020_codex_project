// SPDX-License-Identifier: GPL-3.0-only
// Interpolates a generic 2D track and numeric channels; no ocean-specific keys.
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function validateTrack(frames) {
  if (!Array.isArray(frames) || !frames.length) throw new TypeError('轨迹至少需要一个采样帧');
  let previous = -Infinity;
  const channels = Object.keys(frames[0] || {}).filter(key => !['time', 'position'].includes(key)).sort();
  for (const frame of frames) {
    if (!frame || !finite(frame.time) || frame.time <= previous) throw new TypeError('轨迹时间必须为有限数并严格递增');
    if (!Array.isArray(frame.position) || frame.position.length !== 2 || frame.position.some(value => !finite(value) || value < 0 || value > 1)) throw new TypeError('轨迹坐标必须为两个 0–1 数值');
    const keys = Object.keys(frame).filter(key => !['time', 'position'].includes(key)).sort();
    if (keys.join('\0') !== channels.join('\0') || channels.some(key => !finite(frame[key]))) throw new TypeError('每帧必须包含相同的有限数值通道');
    previous = frame.time;
  }
  return true;
}

/** Endpoint clamping is intentional. Returned time is the clamped sample time. */
export function interpolateTrack(frames, time) {
  validateTrack(frames);
  if (!finite(time)) throw new TypeError('插值时间必须为有限数');
  const clamped = Math.max(frames[0].time, Math.min(frames.at(-1).time, time));
  let left = 0, right = frames.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (frames[mid].time < clamped) left = mid + 1;
    else right = mid;
  }
  const end = frames[left], start = frames[Math.max(0, left - 1)];
  const fraction = start === end ? 0 : (clamped - start.time) / (end.time - start.time);
  const lerp = (a,b) => fraction === 0 ? a : fraction === 1 ? b : a + (b - a) * fraction;
  const result = {time:clamped, position:Object.freeze(start.position.map((value,i) => lerp(value,end.position[i])))};
  for (const key of Object.keys(start)) if (!['time','position'].includes(key)) result[key] = lerp(start[key], end[key]);
  return Object.freeze(result);
}
