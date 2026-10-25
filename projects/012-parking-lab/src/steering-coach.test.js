import test from 'node:test';
import assert from 'node:assert/strict';
import { crossesCourseLine, isParked, stepVehicle } from './vehicle.js';
import { createDemonstration, createProgress, advanceProgress, practiceCue } from './lesson.js';
import { practiceVoiceCue } from './voice-guide.js';
import { analyzeSteering, assessCentering, centerWindow, predictStraightReverse } from './steering-coach.js';

const demo = createDemonstration(), dt = demo.dt;
const radians = degrees => degrees * Math.PI / 180;
const forSide = (state, side) => side === 'left' ? { ...state, x: -state.x, heading: -state.heading, steer: -state.steer } : { ...state };
const seed = side => ({ ...createProgress(), phase: side === 'left' ? 2 : 0, checkedA: side === 'left', passedB: side === 'left' });
const reverse = (state, extra = {}) => stepVehicle(state, { reverse: true, forward: false, left: false, right: false, speedLimit: 0.7, ...extra }, dt);
function earlyReturn(angle, side) {
  const start = forSide(demo.frames.find(frame => frame.heading > -radians(angle) && frame.steer < -0.5), side);
  let end = { ...start };
  while (Math.abs(end.steer) > 1e-7) end = reverse(end, { center: true });
  return { start, end };
}

test('ordinary and narrated coaching give the same actions and complete both sides at selectable speeds', () => {
  for (const side of ['right', 'left']) for (const speedLimit of [1.2 / 3.6, 2.5 / 3.6, 1]) for (const delay of [0, 0.25]) {
    let state = forSide(demo.frames[0], side), progress = seed(side), centering = false;
    const options = { speedLimit, speechRate: 1 }, keys = [];
    const initialPhase = progress.phase;
    for (let i = 0; i < 6500 && progress.phase === initialPhase; i++) {
      const ordinary = practiceCue(state, progress, demo.turnMarker, options);
      const spoken = practiceVoiceCue(state, progress, demo.turnMarker, options);
      assert.equal(ordinary.key, spoken.key, `${side} ${speedLimit} ${delay}: same decision`);
      assert.equal(ordinary.requiresStop, false, `${side} ${speedLimit} ${delay}: ${ordinary.key}`);
      keys.push(ordinary.key);
      const acted = keys[Math.max(0, i - Math.round(delay / dt))];
      centering ||= acted === 'center';
      const next = reverse(state, { speedLimit, left: acted === 'left_turn', right: acted === 'right_turn', center: centering, brake: acted === 'brake' });
      assert.equal(crossesCourseLine(next), false, `${side} ${speedLimit} ${delay}: actual path`);
      progress = advanceProgress(progress, state, next); state = next;
    }
    assert.equal(isParked(state), true);
    assert.equal(progress.phase, initialPhase + 1);
    assert.equal(keys.filter((key, i) => key === 'brake' && keys[i - 1] !== 'brake').length, 1, 'braking stays a single continuous instruction');
  }
});

test('the previous five-degree ordinary cue now prepares, then uses the shared physical return window', () => {
  for (const side of ['right', 'left']) {
    const { start } = earlyReturn(5, side);
    const options = { side, turnMarker: demo.turnMarker, speedLimit: 0.7 };
    assert.equal(analyzeSteering(start, options).key, `prepare_center_${side}`);
    const atReturn = { ...start, heading: (side === 'left' ? 1 : -1) * centerWindow(start).act };
    assert.equal(analyzeSteering(atReturn, options).key, 'center');
  }
});

test('early returns at five or six degrees request observation before a predicted and actual line crossing', () => {
  for (const side of ['right', 'left']) for (const angle of [5, 6]) {
    const { start, end } = earlyReturn(angle, side);
    const progress = { ...seed(side), started: true };
    assert.equal(crossesCourseLine(end), false);
    assert.equal(assessCentering(start, side).kind, 'early');
    const decision = analyzeSteering(end, { side, turnMarker: demo.turnMarker });
    assert.equal(decision.key, 'recovery_early');
    assert.equal(decision.requiresStop, true);
    assert.equal(practiceCue(end, progress, demo.turnMarker).key, decision.key);
    assert.equal(practiceVoiceCue(end, progress, demo.turnMarker).key, decision.key);
    assert.equal(decision.prediction.safe, false);
    let ignored = { ...end };
    for (let i = 0; i < 1500 && !crossesCourseLine(ignored); i++) ignored = reverse(ignored);
    assert.equal(crossesCourseLine(ignored), true);
    assert.ok(Math.abs(ignored.distance - end.distance - decision.prediction.crossingDistance) < 0.05);
    let obeyed = { ...end };
    for (let i = 0; i < 30; i++) obeyed = reverse(obeyed); // 0.25 s response delay.
    while (Math.abs(obeyed.speed) > 0) {
      obeyed = reverse(obeyed, { brake: true });
      assert.equal(crossesCourseLine(obeyed), false);
    }
  }
});

test('a neutral wheel midway through a badly started turn is recovery, not a fresh full-lock instruction', () => {
  for (const side of ['right', 'left']) {
    let state = forSide(demo.frames[0], side);
    for (let i = 0; i < 624; i++) state = reverse(state, { speedLimit: 2.5 / 3.6 });
    for (let i = 0; i < 96; i++) state = stepVehicle(state, { reverse: false, forward: false, left: side === 'left', right: side === 'right', speedLimit: 2.5 / 3.6 }, dt);
    for (let i = 0; i < 216; i++) state = reverse(state, { speedLimit: 2.5 / 3.6 });
    while (Math.abs(state.steer) > 1e-7) state = reverse(state, { center: true, speedLimit: 2.5 / 3.6 });
    assert.equal(crossesCourseLine(state), false);
    const result = analyzeSteering(state, { side, turnMarker: demo.turnMarker });
    assert.equal(result.key, 'recovery_early');
    assert.equal(result.requiresStop, true);
  }
});

test('small residual angle with poor lateral clearance is unsafe without inventing early or late timing', () => {
  const base = { ...demo.frames[demo.stops[4]], x: 0.18, z: -2, heading: -radians(1), steer: 0, speed: -0.7 };
  for (const side of ['right', 'left']) {
    const state = forSide(base, side);
    assert.equal(crossesCourseLine(state), false);
    assert.equal(assessCentering(state, side, { completed: true }).kind, 'unsafe');
    const result = analyzeSteering(state, { side });
    assert.equal(result.key, 'recovery_clearance');
    assert.ok(result.prediction.crossingDistance > 0);
    const centred = { ...state, x: 0, heading: 0 };
    assert.equal(predictStraightReverse(centred).safe, true);
    assert.equal(analyzeSteering(centred, { side }).key, 'park');
  }
});

test('wrong steering and passing parallel give distinct stop instructions on either side', () => {
  for (const side of ['right', 'left']) {
    const pose = forSide(demo.frames[demo.stops[2]], side);
    assert.equal(analyzeSteering({ ...pose, steer: -pose.steer }, { side }).key, 'recovery_wrong_direction');
    const past = { ...forSide(demo.frames[demo.stops[3]], side), heading: (side === 'left' ? -1 : 1) * radians(4) };
    assert.equal(analyzeSteering(past, { side }).key, 'alignment_late');
    const correcting = { ...past, heading: past.heading / 4, steer: -past.steer };
    assert.equal(analyzeSteering(correcting, { side }).key, 'center', 'a small counter-steer toward parallel is not an opposite-direction mistake');
  }
});

test('straight prediction is pure and preserves safe demonstration and paused poses', () => {
  for (const side of ['right', 'left']) {
    const offset = side === 'left' ? demo.stops[7] : 0;
    for (const index of [demo.stops[4], demo.stops[4] + 100, demo.stops[5]]) {
      const state = Object.freeze({ ...demo.frames[offset + index] });
      assert.equal(predictStraightReverse(state).safe, true);
      assert.equal(assessCentering(state, side, { completed: true }).kind, 'good');
      assert.equal(assessCentering({ ...state, speed: 0, time: 999 }, side, { completed: true }).kind, 'good');
    }
  }
});
