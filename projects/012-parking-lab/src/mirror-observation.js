import { BAY, CAR, COURSE, localToWorld } from './vehicle.js';
import { createCockpitSettings, createMirrorFrame, projectMirrorPoint } from './cockpit.js';
import { GROUND_REFERENCE_Y, PAINT_SURFACE_Y } from './scene-geometry.js';

const project = (frame, point) => ({ ...projectMirrorPoint(frame, point), point: { ...point } });
export const LINE_READABILITY = Object.freeze({ minimumScreenSpan: 0.07, minimumWorldLength: 0.30 });

function recognitionFromFrame(state, side, frame, acceptReference = () => true) {
  const sign = side === 'left' ? 1 : -1;
  const localPoint = (x, y, z) => ({ ...localToWorld(state, x, z), y });
  const firstVisible = points => {
    let first;
    for (const point of points) {
      const result = project(frame, point);
      first ??= result;
      if (result.visible && acceptReference(result)) return result;
    }
    return { ...first, visible: false };
  };
  // Points remain on the actual side surface / adjacent ground. Never expose
  // the tire or move a marker into view to satisfy a teaching instruction.
  const body = firstVisible([0.50, 0.25, 0, -0.25, 0.75, 1.0].map(z => localPoint(sign * (CAR.width / 2 - 0.005), 0.65, z)));
  const ground = firstVisible([-0.35, -0.70, -1.20, -2.0].map(z => localPoint(sign * (CAR.width / 2 + 0.50), GROUND_REFERENCE_Y, z)));
  return { body, ground };
}

/** A stripe must expose a continuous run, not disconnected pinpricks, to be
 * described as readable. Coordinates are normalized to the physical mirror. */
function stripeReference(frame, start, end, acrossAxis, intervals, acceptReference) {
  const samples = [], runs = [];
  let run = [];
  const flush = () => { if (run.length) runs.push(run); run = []; };
  for (let index = 0; index <= intervals; index++) {
    let accepted = null;
    for (const across of [-0.05, 0, 0.05]) {
      const t = index / intervals;
      const point = { x: start.x + (end.x - start.x) * t, y: PAINT_SURFACE_Y, z: start.z + (end.z - start.z) * t };
      point[acrossAxis] += across;
      const sample = project(frame, point);
      samples.push(sample);
      if (sample.visible && acceptReference(sample)) { accepted = sample; break; }
    }
    if (accepted) run.push(accepted);
    else flush();
  }
  flush();
  const alongAxis = acrossAxis === 'x' ? 'z' : 'x';
  const measured = runs.map(points => {
    let screenSpan = 0;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      screenSpan = Math.max(screenSpan, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
    const worldLength = Math.abs(points.at(-1).point[alongAxis] - points[0].point[alongAxis]);
    return { points, screenSpan, worldLength,
      readable: screenSpan >= LINE_READABILITY.minimumScreenSpan && worldLength >= LINE_READABILITY.minimumWorldLength };
  }).sort((a, b) => Number(b.readable) - Number(a.readable) || b.screenSpan - a.screenSpan);
  const best = measured[0];
  const fallback = project(frame, { x: (start.x + end.x) / 2, y: PAINT_SURFACE_Y, z: (start.z + end.z) / 2 });
  return { samples, reference: best
    ? { ...best.points[Math.floor(best.points.length / 2)], readable: best.readable, screenSpan: best.screenSpan, worldLength: best.worldLength }
    : { ...fallback, visible: false, readable: false, screenSpan: 0, worldLength: 0 } };
}

/** Cheap per-frame recognition points; visible is aperture-only, not occlusion. */
export function mirrorRecognition(state, side, settings = createCockpitSettings()) {
  if (!['left', 'right'].includes(side)) throw new RangeError('Mirror side must be left or right.');
  return recognitionFromFrame(state, side, createMirrorFrame(state, side, settings));
}

/**
 * Describe references that fall inside the current finite mirror aperture.
 * This pure geometry query does NOT test scene occlusion, glass transparency,
 * contrast, or legibility. A visible reference still needs renderer occlusion
 * checks before drawing a marker. An optional acceptReference callback lets a
 * renderer reject an occluded line sample and continue checking the stripe.
 * Nothing is moved to make a reference visible.
 */
export function mirrorObservation(state, side, settings = createCockpitSettings(), { acceptReference = () => true } = {}) {
  if (!['left', 'right'].includes(side)) throw new RangeError('Mirror side must be left or right.');
  const frame = createMirrorFrame(state, side, settings);
  const lineX = side === 'left' ? BAY.right : BAY.left;
  const corner = project(frame, { x: lineX, y: PAINT_SURFACE_Y, z: BAY.entrance });
  // The bay entrance is OPEN: there is no painted cross-line between its two
  // corners. The same-side stripe is longitudinal; only the real back stripe
  // at BAY.back is transverse. Both keep the actual 0.10 m painted width.
  const sideStripe = stripeReference(frame, { x: lineX, z: BAY.entrance }, { x: lineX, z: BAY.back }, 'x', 32, acceptReference);
  const backStripe = stripeReference(frame, { x: BAY.left, z: BAY.back }, { x: BAY.right, z: BAY.back }, 'z', 16, acceptReference);
  // Only the two painted road-edge sections outside the open bay mouth.
  const entranceStripe = stripeReference(frame, { x: lineX, z: BAY.entrance },
    { x: side === 'left' ? COURSE.roadRight : COURSE.roadLeft, z: BAY.entrance }, 'z', 32, acceptReference);
  const { body, ground } = recognitionFromFrame(state, side, frame, acceptReference);
  return { side, occlusionChecked: false, visibility: 'mirror-aperture-only',
    lineVisible: sideStripe.reference.visible, lineReadable: sideStripe.reference.readable,
    sideLine: sideStripe.reference, backLine: backStripe.reference, entranceLine: entranceStripe.reference,
    cornerVisible: Boolean(corner.visible && acceptReference(corner)),
    corner, lineSamples: sideStripe.samples, backLineSamples: backStripe.samples, entranceLineSamples: entranceStripe.samples, body, ground };
}
