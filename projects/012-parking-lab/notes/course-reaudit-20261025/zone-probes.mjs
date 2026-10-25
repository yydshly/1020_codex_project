// Independent, read-only regressions for the three confirmed zone issues.
// From the project directory:
//   node notes/course-reaudit-20261025/zone-probes.mjs
//   node notes/course-reaudit-20261025/zone-probes.mjs --assert-fixed
// Each path runs the actual keyboard vehicle model and the safety evaluator.
// Import the exported probes to reuse them without running the CLI harness.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceNames = ['course-practice.js', 'course-driving.js', 'course-safety.js', 'exam-courses.js', 'vehicle.js'];
async function versions() {
  return Object.fromEntries(await Promise.all(sourceNames.map(async name => [name,
    createHash('sha256').update(await readFile(new URL(`../../src/${name}`, import.meta.url))).digest('hex').slice(0, 12)])));
}
export const sourceVersions = await versions();
const { EXAM_COURSES, sampleChapterPose } = await import('../../src/exam-courses.js');
const { createCourseDrivingSession, stepCourseDriving, courseDrivingPose } = await import('../../src/course-driving.js');
const { createCoursePractice, stepCoursePractice, recordCourseObservation, resumeCoursePractice, retryCoursePractice } = await import('../../src/course-practice.js');
const { evaluateCourseSafety } = await import('../../src/course-safety.js');

const DT = 1 / 60, frontViews = ['front-left', 'front-right', 'forward'];
const round = value => Number.isFinite(value) ? +value.toFixed(3) : value;
const chapter = id => EXAM_COURSES.subject3.chapters.find(item => item.id === id);
function start(id, initial = null) {
  const c = chapter(id), pose = initial || { ...sampleChapterPose(c, 0), speed: 0, gear: 'N', parkingBrake: false };
  const driving = createCourseDrivingSession(c, pose);
  return { chapter: c, driving, session: createCoursePractice(c, { driving, initialPose: courseDrivingPose(driving) }), blocking: null };
}
function observe(state, gazes = frontViews) {
  for (const gaze of gazes) state.session = recordCourseObservation(state.session, gaze, courseDrivingPose(state.driving));
}
function advance(state, input) {
  const previous = courseDrivingPose(state.driving);
  state.driving = stepCourseDriving(state.driving, input, DT);
  const pose = courseDrivingPose(state.driving), risk = evaluateCourseSafety({ chapter: state.chapter, previous, pose });
  if (risk.blocking || state.driving.stopReason) {
    state.blocking = { x: round(pose.x), z: round(pose.z), reason: state.driving.stopReason,
      events: risk.events.map(event => event.id) };
    return;
  }
  state.session = stepCoursePractice(state.session, { driving: state.driving, pose, input, dt: DT, events: risk.events });
}
function summary(state) {
  return { outcome: state.session.review?.outcome || null, position: { x: round(state.driving.x), z: round(state.driving.z) },
    errors: state.session.errors.map(error => error.id), missing: state.session.checks.filter(check => !check.done).map(check => check.id),
    blocking: state.blocking, zone: state.session.speedZone ? {
      entered: state.session.speedZone.entered, entryFromBefore: state.session.speedZone.entryFromBefore,
      complete: state.session.speedZone.complete, violated: state.session.speedZone.violated,
      coverageBroken: state.session.speedZone.coverageBroken ?? null, covered: round(state.session.speedZone.covered),
      observationClosed: state.session.speedZone.observationClosed ?? null, observedViews: state.session.speedZone.observedViews ?? null,
      peakKmh: round(state.session.speedZone.peakKmh),
    } : null };
}

/** Low-speed actual left turn, then acceleration after the entire car has
 * left the junction via its real cross-road. Stay within keyboard boundaries.
 * The straight-route objective can remain incomplete; the cross-road must not
 * inherit an infinitely wide Z-only junction speed zone. */
export function probeIntersectionBranch() {
  const state = start('intersection'); let stage = 'approach', firstSpeedError = null;
  for (let frame = 0; frame < 4000 && !state.blocking; frame++) {
    const d = state.driving;
    if (stage === 'approach' && d.z >= 16.8) stage = 'turn';
    else if (stage === 'turn' && d.heading >= 1.43) stage = 'center';
    else if (stage === 'center' && Math.abs(d.steer) < .001) stage = 'branch';
    if (frame % 60 === 0) observe(state);
    advance(state, { forward: stage === 'branch' && d.x > 8 || d.speed < 3,
      left: stage === 'turn', center: stage === 'center' || stage === 'branch', leftSignal: d.z > 10 });
    if (!firstSpeedError && state.session.errors.some(error => error.id === 'speed-zone:intersection')) {
      firstSpeedError = { x: round(state.driving.x), z: round(state.driving.z), kmh: round(state.driving.speed * 3.6) };
    }
    if (state.driving.x > 13 || state.session.phase === 'review') break;
  }
  const result = { ...summary(state), firstSpeedError };
  return { ...result, fixed: !result.blocking && result.position.x > 12 && !firstSpeedError && !result.zone.complete };
}

/** A mid-zone takeover really backs the entire car before the entrance, stops
 * and then drives the complete low-speed span. This must differ from merely
 * starting halfway through and continuing to the exit. */
export function probeSchoolReentry() {
  const c = chapter('school'), state = start('school', { ...sampleChapterPose(c, 6), x: -1.75, z: 1,
    speed: 0, steer: 0, heading: 0, parkingBrake: false });
  let stage = 'reverse', minimumZ = 1;
  observe(state);
  for (let frame = 0; frame < 3600 && !state.blocking && state.session.phase !== 'review'; frame++) {
    const d = state.driving;
    if (stage === 'reverse' && d.z < -4.5) stage = 'brake';
    if (stage === 'brake' && Math.abs(d.speed) < .001) { stage = 'forward'; observe(state); }
    advance(state, stage === 'reverse' ? { reverse: true } : stage === 'brake' ? { brake: true } : { forward: d.speed < 3.2 });
    minimumZ = Math.min(minimumZ, state.driving.z);
  }
  const result = { ...summary(state), minimumZ: round(minimumZ) };
  return { ...result, fixed: !result.blocking && result.minimumZ < -4.5 && result.outcome === 'complete'
    && result.zone.complete && !result.zone.violated && result.errors.length === 0 };
}

/** Omitting front-side scans during the whole school approach/traversal and
 * only clicking them after the finish must not wash the omitted observation.
 * A retry from the valid pre-exit snapshot must allow correcting that error. */
export function probeSchoolLateObservation() {
  const state = start('school'); observe(state, ['forward']);
  for (let frame = 0; frame < 3000 && !state.blocking && state.session.phase !== 'review'; frame++) {
    advance(state, { forward: state.driving.speed < 3.2 });
  }
  const beforeLate = summary(state);
  state.session = resumeCoursePractice(state.session); observe(state);
  const afterLate = summary(state);
  let corrected = null;
  const retry = retryCoursePractice(state.session, { gaze: 'front-right' });
  if (retry) {
    const correction = { chapter: state.chapter, driving: retry.driving, session: retry.session, blocking: null };
    observe(correction);
    for (let frame = 0; frame < 1800 && !correction.blocking && correction.session.phase !== 'review'; frame++) {
      advance(correction, { forward: correction.driving.speed < 3.2 });
    }
    corrected = summary(correction);
  }
  return { beforeLate, afterLate, corrected, fixed: !beforeLate.blocking
    && beforeLate.errors.includes('zone-observation:school') && afterLate.outcome !== 'complete'
    && corrected?.outcome === 'complete' && corrected.errors.length === 0 && !corrected.blocking };
}

export async function runZoneProbes() {
  const probes = { intersectionBranch: probeIntersectionBranch(), schoolReentry: probeSchoolReentry(),
    schoolLateObservation: probeSchoolLateObservation() };
  const endVersions = await versions(), stableSources = JSON.stringify(sourceVersions) === JSON.stringify(endVersions);
  return { sourceVersions, endVersions, stableSources, probes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runZoneProbes();
  console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes('--assert-fixed')) {
    assert.equal(result.stableSources, true, 'sources changed during this run; rerun against one stable version');
    for (const [name, probe] of Object.entries(result.probes)) assert.equal(probe.fixed, true, `${name} regression remains; see JSON output`);
  }
}
