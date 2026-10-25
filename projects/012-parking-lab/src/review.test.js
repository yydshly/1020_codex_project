import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, stepVehicle, isParked, crossesCourseLine } from './vehicle.js';
import { createDemonstration, createProgress, advanceProgress, clearance } from './lesson.js';
import { practiceVoiceCue } from './voice-guide.js';
import { alignmentStart } from './alignment.js';
import { analyzePractice, canReviewPractice } from './review.js';
import { assessCentering } from './steering-coach.js';

const demonstration = createDemonstration();
const dt = demonstration.dt;
test('stationary steering recordings can open review, but idle snapshots cannot', () => {
  const pose = { ...demonstration.frames[1495], speed: 0, distance: 0 };
  assert.equal(canReviewPractice([pose, { ...pose }, { ...pose }]), false);
  assert.equal(canReviewPractice([pose, { ...pose, steer: -.3 }, { ...pose, steer: 0 }]), true);
  assert.equal(canReviewPractice([pose, { ...pose, distance: .02 }, { ...pose, distance: .04 }]), true);
  assert.equal(canReviewPractice([pose, { ...pose, steer: 0 }]), false);
});
const seedFor = side => ({ ...createProgress(), phase: side === 'left' ? 2 : 0, checkedA: side === 'left', passedB: side === 'left' });
const signFor = side => side === 'left' ? 1 : -1;
function startFor(side) {
  const state = demonstration.frames[0], mirror = side === 'left' ? -1 : 1;
  return { ...state, x: state.x * mirror, heading: state.heading * mirror };
}
function sampled(frames) {
  return frames.filter((_, index) => index === 0 || index % 9 === 0 || index === frames.length - 1);
}
function drive({ side = 'right', turnGap = 0, centerAt = 1.2, follow = false, kph = 2.5, reaction = 0, start = startFor(side), steps = 6000, wrong = false, missingTurn = false, missingCenter = false } = {}) {
  let state = { ...start }, progress = seedFor(side), turning = false, centering = false, braking = false;
  const frames = [{ ...state }], cues = [];
  const speedLimit = kph / 3.6;
  for (let i = 0; i < steps; i++) {
    const gap = state.x * signFor(side) - Math.abs(demonstration.turnMarker);
    const angle = state.heading * signFor(side) * 180 / Math.PI;
    const voice = practiceVoiceCue(state, progress, demonstration.turnMarker, { speedLimit }).key;
    cues.push(voice);
    const acted = cues[Math.max(0, i - Math.round(reaction / dt))];
    turning ||= follow ? acted === `${side}_turn` : gap <= turnGap;
    centering ||= follow ? acted === 'center' : turning && angle <= centerAt;
    const gapToStop = clearance(state);
    braking ||= follow ? acted === 'brake' : !missingCenter && centering && gapToStop.front > 0.10 && gapToStop.rear < 0.65;
    const brake = braking;
    const wantTurn = turning && !centering && !missingTurn;
    const input = { reverse: true, forward: false, left: wantTurn && (wrong ? side === 'right' : side === 'left'), right: wantTurn && (wrong ? side === 'left' : side === 'right'), center: centering && !missingCenter, brake, speedLimit };
    const next = stepVehicle(state, input, dt);
    progress = advanceProgress(progress, state, next);
    frames.push(next); state = next;
    if (brake && Math.abs(state.speed) < 0.001) break;
  }
  return sampled(frames);
}
const review = (frames, side = 'right') => analyzePractice(frames, demonstration, seedFor(side)).attempts[0];
function returnRecording({ side = 'right', frame = 1495, speed = 0, input = { center: true }, initialInput, metadata = true, steps = 45, x } = {}) {
  const mirror = side === 'left' ? -1 : 1, source = demonstration.frames[frame];
  let state = { ...source, x: (x ?? source.x) * mirror, heading: source.heading * mirror, steer: source.steer * mirror, speed };
  const frames = [{ ...state, ...(metadata && initialInput ? { reviewInput: { ...initialInput } } : {}) }];
  for (let i = 0; i < steps; i++) {
    state = stepVehicle(state, input, dt);
    frames.push({ ...state, ...(metadata ? { reviewCenter: Boolean(input.center), reviewInput: { ...input } } : {}) });
  }
  return sampled(frames);
}
function straightContinuationCrosses(start) {
  let state = { ...start };
  for (let i = 0; i < 1800; i++) {
    if (crossesCourseLine(state)) return true;
    if (clearance(state).rear <= 0.55) return false;
    state = stepVehicle(state, { reverse: true, speedLimit: 0.7 }, dt);
  }
  return null;
}

test('sampled steering changes distinguish early, late, and appropriate turns on both sides', () => {
  for (const side of ['right', 'left']) for (const [turnGap, expected] of [[0.9, 'early'], [-0.9, 'late'], [0, 'good']]) {
    const attempt = review(drive({ side, turnGap }), side);
    assert.equal(attempt.turn.kind, expected, `${side} ${turnGap}`);
    assert.equal(attempt.turn.executed, true);
    assert.ok(Number.isInteger(attempt.turn.index));
  }
});

test('actual completed returns retain early, late, and appropriate timing feedback symmetrically', () => {
  for (const side of ['right', 'left']) for (const [centerAt, expected] of [[18, 'early'], [-8, 'late'], [1.2, 'good']]) {
    const attempt = review(drive({ side, centerAt }), side);
    assert.equal(attempt.center.kind, expected, `${side} ${centerAt}`);
    assert.equal(attempt.center.executed, true);
    assert.ok(Number.isFinite(attempt.center.predictedResidual));
  }
});

test('the previous five-degree return advice is reviewed as early when its resulting straight path is unsafe', () => {
  for (const side of ['right', 'left']) {
    const attempt = review(drive({ side, centerAt: 5 }), side);
    assert.equal(attempt.center.kind, 'early');
    assert.equal(attempt.center.prediction.safe, false);
    assert.ok(attempt.center.predictedResidual > 3);
  }
});

test('a turn begun toward the wrong side is identified separately from timing', () => {
  for (const side of ['right', 'left']) {
    const attempt = review(drive({ side, wrong: true, steps: 600 }), side);
    assert.equal(attempt.turn.kind, 'wrong');
    assert.equal(attempt.turn.executed, true);
  }
});

test('taking over partway through a turn does not invent its missing start', () => {
  for (const side of ['right', 'left']) {
    const offset = side === 'left' ? demonstration.stops[7] : 0;
    const frames = sampled(demonstration.frames.slice(offset + demonstration.stops[2], offset + demonstration.stops[5] + 1));
    const attempt = review(frames, side);
    assert.equal(attempt.turn.kind, 'unobserved');
    assert.equal(attempt.turn.index, null);
    assert.equal(attempt.center.kind, 'good');
    assert.equal(attempt.referenceStartIndex, offset);
    assert.equal(attempt.referenceFrames.length, demonstration.stops[5] + 1);
  }
});

test('a takeover after centering leaves both unavailable operations unobserved', () => {
  const frames = sampled(demonstration.frames.slice(demonstration.stops[4] + 20, demonstration.stops[5] + 1));
  const attempt = review(frames);
  assert.equal(attempt.turn.kind, 'unobserved');
  assert.equal(attempt.center.kind, 'unobserved');
  assert.equal(attempt.issueIndex, null);
  assert.equal(attempt.retryIndex, 0);
});

test('taking over while the wheels are already unwinding cannot establish the missing return start', () => {
  for (const side of ['right', 'left']) {
    const offset = side === 'left' ? demonstration.stops[7] : 0;
    const frames = sampled(demonstration.frames.slice(offset + demonstration.stops[3] + 10, offset + demonstration.stops[5] + 1));
    const attempt = review(frames, side);
    assert.equal(attempt.center.kind, 'unobserved');
    assert.equal(attempt.center.index, null);
  }
});

test('a partial steering correction followed by restoring the turn is not judged as early centering', () => {
  for (const side of ['right', 'left']) {
    const offset = side === 'left' ? demonstration.stops[7] : 0;
    const frames = [{ ...demonstration.frames[offset + demonstration.stops[2]] }];
    for (let i = 0; i < 12; i++) frames.push(stepVehicle(frames.at(-1), { reverse: true, center: true, speedLimit: 0.7 }, dt));
    const partial = review(sampled(frames), side);
    assert.equal(partial.center.kind, 'pending');
    assert.equal(partial.center.index, null);
    for (let i = 0; i < 60; i++) frames.push(stepVehicle(frames.at(-1), { reverse: true, left: side === 'left', right: side === 'right', speedLimit: 0.7 }, dt));
    const correctionEnd = frames.length - 1;
    const corrected = review(sampled(frames), side);
    assert.equal(corrected.center.kind, 'pending');
    assert.equal(corrected.center.index, null);
    while (frames.at(-1).heading * signFor(side) > 1.2 * Math.PI / 180) frames.push(stepVehicle(frames.at(-1), { reverse: true, speedLimit: 0.7 }, dt));
    while (Math.abs(frames.at(-1).steer) > 0) frames.push(stepVehicle(frames.at(-1), { reverse: true, center: true, speedLimit: 0.7 }, dt));
    const sample = sampled(frames);
    const completed = review(sample, side);
    assert.equal(completed.center.kind, 'good');
    assert.ok(sample[completed.center.index].time > frames[correctionEnd].time);
  }
});

test('explicit centering input is pending until neutral, while retaining its recorded start for review', () => {
  for (const side of ['right', 'left']) {
    const frames = [alignmentStart(demonstration, side)];
    for (let i = 0; i < 8; i++) frames.push({ ...stepVehicle(frames.at(-1), { reverse: true, center: true, speedLimit: 0.7 }, dt), reviewCenter: true });
    const pending = review(frames, side);
    assert.equal(pending.center.kind, 'pending');
    assert.match(pending.center.title, /进行中/);
    assert.equal(pending.center.executed, true);
    const recordedStart = pending.center.index;
    while (Math.abs(frames.at(-1).steer) > 0) frames.push({ ...stepVehicle(frames.at(-1), { reverse: true, center: true, speedLimit: 0.7 }, dt), reviewCenter: true });
    const complete = review(frames, side);
    assert.equal(complete.center.kind, 'early');
    assert.equal(complete.center.index, recordedStart);
  }
});

test('a stopped X return uses the actual unchanged body pose instead of inventing reverse movement', () => {
  for (const side of ['right', 'left']) for (const metadata of [false, true]) {
    const frames = returnRecording({ side, metadata });
    const completed = frames.at(-1), attempt = review(frames, side);
    // This is the old false-positive fixture: simulating reverse from the start
    // predicts a safe result, but the recorded car never moved during its return.
    assert.equal(assessCentering(frames[0], side).prediction.safe, true);
    assert.equal(completed.distance, frames[0].distance);
    assert.equal(completed.heading, frames[0].heading);
    assert.equal(straightContinuationCrosses(completed), true);
    assert.equal(attempt.center.kind, 'wrong');
    assert.equal(attempt.center.process.kind, 'stationary');
    assert.equal(attempt.center.prediction.safe, false);
    assert.equal(attempt.center.outcomeKind, 'early');
    assert.ok(Math.abs(attempt.center.predictedResidual - 3.1041143712223405) < 1e-9);
    assert.match(attempt.center.text, /停住时回正/);
    assert.equal(attempt.center.index, 1);
    assert.equal(attempt.center.startIndex, 0);
    assert.equal(attempt.center.completedIndex, 4);
  }
});

test('changing to 1.2 km/h while returning cannot inherit a safe verdict at the previous speed', () => {
  for (const side of ['right', 'left']) for (const metadata of [false, true]) {
    const frames = returnRecording({ side, frame: 1484, speed: -2.5 / 3.6, metadata,
      initialInput: { reverse: true, center: false, speedLimit: 2.5 / 3.6 },
      input: { reverse: true, center: true, speedLimit: 1.2 / 3.6 } });
    const attempt = review(frames, side);
    assert.equal(assessCentering(frames[0], side).prediction.safe, true);
    assert.equal(straightContinuationCrosses(frames.at(-1)), true);
    assert.equal(attempt.center.kind, 'wrong');
    assert.equal(attempt.center.prediction.safe, false);
    assert.ok(Math.abs(attempt.center.predictedResidual - 3.4778115743322564) < 1e-9);
    assert.equal(attempt.center.process.kind, metadata ? 'speed-change' : 'slowing');
    assert.match(attempt.center.text, metadata ? /低速设定发生变化/ : /车速下降/);
  }
});

test('braking during the return is described as an observed process problem, not invented start timing', () => {
  for (const side of ['right', 'left']) {
    const frames = returnRecording({ side, frame: 1484, speed: -2.5 / 3.6,
      input: { reverse: true, center: true, brake: true, speedLimit: 2.5 / 3.6 } });
    const attempt = review(frames, side);
    assert.equal(attempt.center.kind, 'wrong');
    assert.equal(attempt.center.process.kind, 'braking');
    assert.equal(attempt.center.prediction.safe, false);
    assert.match(attempt.center.text, /刹车操作/);
    assert.match(attempt.center.text, /不能只把结果归因于开始时机/);
  }
});

test('a safe stationary return is judged from its actual pose without claiming moving-return timing', () => {
  for (const side of ['right', 'left']) {
    const frames = returnRecording({ side, frame: demonstration.stops[3] });
    const attempt = review(frames, side);
    assert.equal(straightContinuationCrosses(frames.at(-1)), false);
    assert.equal(attempt.center.kind, 'good');
    assert.equal(attempt.center.process.kind, 'stationary');
    assert.equal(attempt.center.prediction.safe, true);
    assert.match(attempt.center.text, /停住时把前轮回正/);
    assert.doesNotMatch(attempt.center.title, /时机接近/);
  }
});

test('one or two degrees of remaining steering stay pending until the recorded wheels actually reach zero', () => {
  for (const side of ['right', 'left']) {
    const frames = returnRecording({ side, steps: 27 });
    assert.ok(Math.abs(frames.at(-1).steer) < 2 * Math.PI / 180);
    assert.ok(Math.abs(frames.at(-1).steer) > 0);
    const pending = review(frames, side);
    assert.equal(pending.center.kind, 'pending');
    assert.equal(pending.center.index, 1);
    assert.equal(pending.center.completedIndex, undefined);
    const completed = review(returnRecording({ side }), side);
    assert.equal(completed.center.index, pending.center.index);
    assert.equal(completed.center.assessmentSource, 'recorded-completion');
  }
});

test('a return that begins outside a line cannot pass just because its neutral ending is safe', () => {
  for (const side of ['right', 'left']) {
    const frames = returnRecording({ side, frame: demonstration.stops[3], speed: -0.7, x: 0.214,
      input: { reverse: true, center: true, speedLimit: 0.7 } });
    assert.equal(crossesCourseLine(frames[0]), true);
    assert.equal(assessCentering(frames.at(-1), side, { completed: true }).prediction.safe, true);
    const attempt = review(frames, side);
    assert.equal(attempt.center.kind, 'wrong');
    assert.equal(attempt.center.reason, 'actual_return_crossing');
    assert.equal(attempt.center.prediction.returnCrossedLine, true);
    assert.equal(attempt.center.prediction.safe, false);
  }
});

test('new input metadata can identify a pending return without requiring the legacy explicit field', () => {
  const frames = returnRecording({ steps: 9 }).map(({ reviewCenter, ...state }) => state);
  const attempt = review(frames);
  assert.equal(attempt.center.kind, 'pending');
  assert.equal(attempt.center.executed, true);
  assert.equal(attempt.center.index, 1);
});

test('outbound turns in phases one and three are excluded from parking attempts', () => {
  for (const [phase, start, end] of [[1, demonstration.stops[5], demonstration.stops[7]], [3, demonstration.stops[9], demonstration.stops[10]]]) {
    const frames = demonstration.frames.slice(start, end + 1);
    const result = analyzePractice(frames, demonstration, { ...createProgress(), phase, started: true, checkedA: true });
    assert.equal(result.attempts.length, 0);
    assert.equal(result.activeAttemptIndex, null);
  }
});

test('the complete demonstration separates two entries and treats both as appropriate', () => {
  const result = analyzePractice(demonstration.frames, demonstration, createProgress());
  assert.deepEqual(result.attempts.map(attempt => attempt.side), ['right', 'left']);
  assert.equal(result.activeAttemptIndex, null);
  for (const attempt of result.attempts) {
    assert.equal(attempt.turn.kind, 'good');
    assert.equal(attempt.center.kind, 'good');
    assert.equal(attempt.complete, true);
    assert.equal(attempt.lineIndex, null);
    assert.equal(attempt.issueIndex, null);
  }
  assert.ok(result.attempts[0].endIndex < result.attempts[1].startIndex);
  assert.ok(result.attempts[1].endIndex <= demonstration.stops[9]);
});

test('normal guided actions including a quarter-second reaction delay do not get false timing errors', () => {
  for (const side of ['right', 'left']) for (const kph of [1.2, 2.5, 3.6]) for (const reaction of [0, 0.25]) {
    const frames = drive({ side, follow: true, kph, reaction });
    assert.equal(isParked(frames.at(-1)), true, `${side}, ${kph}, ${reaction}: parked`);
    const attempt = review(frames, side);
    assert.equal(attempt.turn.kind, 'good', `${side}, ${kph}, ${reaction}: turn`);
    assert.equal(attempt.center.kind, 'good', `${side}, ${kph}, ${reaction}: center`);
    assert.equal(attempt.lineIndex, null);
  }
});

test('missing actions are distinguished from completed late actions', () => {
  const missedTurn = review(drive({ missingTurn: true, steps: 650 }));
  assert.equal(missedTurn.turn.kind, 'late');
  assert.equal(missedTurn.turn.executed, false);
  const state = alignmentStart(demonstration, 'right');
  const frames = [state];
  for (let i = 0; i < 400; i++) frames.push(stepVehicle(frames.at(-1), { reverse: true, speedLimit: 0.7 }, dt));
  const missedCenter = review(sampled(frames));
  assert.equal(missedCenter.center.kind, 'late');
  assert.equal(missedCenter.center.executed, false);
  assert.equal(missedCenter.turn.kind, 'unobserved');
});

test('crossing a line alone never establishes early or late steering', () => {
  const state = { ...demonstration.frames[demonstration.stops[4]], x: 1.4, speed: 0 };
  const attempt = review([state, { ...state, time: state.time + 1 }]);
  assert.equal(attempt.turn.kind, 'unobserved');
  assert.equal(attempt.center.kind, 'unobserved');
  assert.equal(attempt.lineIndex, 0);
  assert.equal(attempt.issueIndex, 0);
  assert.equal(attempt.retryIndex, 0);
  assert.match(attempt.retryNote, /没有更早/);
});

test('retry picks an existing pose before the earliest issue and stays inside the entry recording', () => {
  const frames = drive({ turnGap: 0.9 });
  const attempt = review(frames);
  assert.ok(attempt.issueIndex > 0);
  assert.ok(attempt.retryIndex < attempt.issueIndex);
  assert.ok(attempt.retryIndex >= attempt.startIndex);
  const lookback = frames[attempt.issueIndex].time - frames[attempt.retryIndex].time;
  assert.ok(lookback >= 1.5 && lookback <= 2, `${lookback}`);
  assert.ok(Math.abs(frames[attempt.retryIndex].steer) < 0.001);
});

test('re-recording from the recommended pose does not inherit discarded mistakes', () => {
  const original = drive({ turnGap: 0.9 });
  const first = review(original);
  assert.equal(first.turn.kind, 'early');
  const retryState = { ...original[first.retryIndex], speed: 0 };
  const replacement = drive({ start: retryState });
  const retained = original.slice(0, first.retryIndex);
  const second = review([...retained, ...replacement]);
  assert.equal(second.turn.kind, 'good');
  assert.equal(second.center.kind, 'good');
  assert.equal(second.issueIndex, null);
});

test('duplicate paused snapshots and elapsed-time changes cannot create steering events', () => {
  const state = demonstration.frames[0];
  const attempt = review([state, { ...state }, { ...state, time: 180 }]);
  assert.equal(attempt.turn.kind, 'pending');
  assert.equal(attempt.center.kind, 'pending');
  assert.equal(attempt.issueIndex, null);
  assert.equal(analyzePractice([], demonstration).attempts.length, 0);
});
