import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemonstration, createProgress, advanceProgress } from './lesson.js';
import { CAR, stepVehicle, crossesCourseLine, isParked } from './vehicle.js';
import { createVoiceTour, practiceVoiceCue, voiceGuidance, voiceTourObservation, VOICE_CUES } from './voice-guide.js';
import { mirrorObservation } from './mirror-observation.js';
import { NARRATION } from './narration.js';

const demo = createDemonstration();
const started = { ...createProgress(), started: true };
const live = (state, progress = started, options) => practiceVoiceCue(state, progress, demo.turnMarker, options).key;

test('full narrated tour primary views match the entry side and forward exit without forcing both mirrors', () => {
  const tour = createVoiceTour(demo);
  for (const segment of tour) {
    const side = [8, 9].includes(segment.lessonStep) ? 'left' : 'right';
    if (['intro', 'control_b', 'exit_left', 'exit_right', 'finish'].includes(segment.key)) assert.equal(voiceTourObservation(segment), 'forward');
    else assert.equal(voiceTourObservation(segment), side);
  }
  assert.equal(voiceTourObservation(null), 'forward');
});

test('early entry guidance recognizes body and ground without requiring a hidden corner or rear tire', () => {
  for (const side of ['right', 'left']) {
    const offset = side === 'left' ? demo.stops[7] : 0;
    for (const index of [offset, offset + demo.stops[1]]) {
      assert.equal(mirrorObservation(demo.frames[index], side).cornerVisible, false);
    }
    const keys = [side === 'left' ? 'left_straight' : 'straight', `prepare_${side}`, `${side}_turn`, `hold_${side}`];
    for (const key of keys) {
      const guidance = voiceGuidance(key);
      assert.match(guidance.look, /车身.*侧后地面/);
      assert.doesNotMatch(guidance.look, /后轮/);
      assert.match(guidance.next, /库角.*(?:入镜|进入镜面)后.*比较/);
      assert.doesNotMatch(VOICE_CUES[key].text, /后轮/);
    }
    assert.match(voiceGuidance(`${side}_align`).look, /库线入镜后/);
    for (const key of [`hold_${side}`, `${side}_align`]) {
      const text = NARRATION[key].text;
      assert.match(text, /车身和侧后地面/);
      assert.match(text, /库角进入镜面后再比较/);
      assert.doesNotMatch(text, /后轮/);
      assert.match(text, side === 'right' ? /右镜.*兼顾左镜/ : /左镜.*兼顾右镜/);
    }
  }
});

test('voice tour covers the full continuous path, with an observation cue before each action', () => {
  const tour = createVoiceTour(demo);
  assert.equal(tour.length, 21);
  assert.equal(tour[0].start, 0);
  assert.equal(tour.at(-1).end, demo.frames.length - 1);
  assert.equal(tour.reduce((sum, segment) => sum + segment.end - segment.start, 0), demo.frames.length - 1);
  for (let i = 0; i < tour.length; i++) {
    const segment = tour[i];
    assert.ok(VOICE_CUES[segment.key]);
    assert.ok(segment.title && demo.frames[segment.start] && demo.frames[segment.end]);
    assert.ok(segment.end >= segment.start);
    if (i > 0) assert.equal(segment.start, tour[i - 1].end);
  }
  assert.deepEqual(tour.filter(segment => segment.start === segment.end).map(segment => segment.key), ['intro', 'control_b', 'finish']);
});

test('the left tour separately teaches turn, alignment, centering, and parking at mirrored poses', () => {
  const tour = createVoiceTour(demo);
  for (let i = 0; i < 8; i++) {
    const right = tour[1 + i], left = tour[11 + i];
    assert.equal(right.end - right.start, left.end - left.start);
    for (const boundary of ['start', 'end']) {
      const r = demo.frames[right[boundary]], l = demo.frames[left[boundary]];
      assert.ok(Math.abs(r.x + l.x) < 1e-8);
      assert.ok(Math.abs(r.heading + l.heading) < 1e-8);
    }
  }
  assert.deepEqual(tour.slice(1, 9).map(segment => segment.key), ['straight', 'prepare_right', 'right_turn', 'hold_right', 'right_align', 'prepare_center_right', 'center', 'park']);
  assert.deepEqual(tour.slice(11, 19).map(segment => segment.key), ['left_straight', 'prepare_left', 'left_turn', 'hold_left', 'left_align', 'prepare_center_left', 'center', 'park']);
});

test('manual observation cues follow actual poses on both sides, independently of elapsed time', () => {
  for (const left of [false, true]) {
    const offset = left ? demo.stops[7] : 0;
    const progress = { ...started, phase: left ? 2 : 0 };
    assert.equal(live(demo.frames[offset], progress), left ? 'left_straight' : 'straight');
    assert.equal(live(demo.frames[offset + demo.stops[1]], progress), left ? 'left_turn' : 'right_turn');
    const observing = demo.frames.slice(offset, offset + demo.stops[3]).find(s => Math.abs(s.heading) < 48 * Math.PI / 180);
    assert.equal(live(observing, progress), left ? 'left_align' : 'right_align');
    const approaching = demo.frames.slice(offset, offset + demo.stops[3]).find(s => Math.abs(s.heading) < 35 * Math.PI / 180);
    assert.equal(live(approaching, progress), left ? 'prepare_center_left' : 'prepare_center_right');
    assert.equal(live(demo.frames[offset + demo.stops[3]], progress), 'center');
    assert.equal(live(demo.frames[offset + demo.stops[4]], progress), 'park');
    assert.equal(live(demo.frames[offset + demo.stops[5]], progress), 'brake');
    assert.equal(live({ ...demo.frames[offset + demo.stops[1]], time: 100 }, progress), left ? 'left_turn' : 'right_turn');
  }
});

test('turn preparation allows about four seconds of observation at actual reverse speeds on either side', () => {
  for (const left of [false, true]) {
    const offset = left ? demo.stops[7] : 0;
    const sign = left ? 1 : -1;
    const progress = { ...started, phase: left ? 2 : 0 };
    for (const speed of [1.2 / 3.6, 0.7, 1]) {
      const atDistance = distance => ({ ...demo.frames[offset], x: sign * (Math.abs(demo.turnMarker) + distance), speed: -speed });
      assert.equal(live(atDistance(0.15 + speed * 4.1), { ...progress, started: false }), left ? 'left_straight' : 'straight');
      assert.equal(live(atDistance(speed * 3.7), { ...progress, started: false }), left ? 'prepare_left' : 'prepare_right');
      assert.equal(live(atDistance(0.3), progress), left ? 'prepare_left' : 'prepare_right');
      assert.equal(live(atDistance(0), progress), left ? 'left_turn' : 'right_turn');
      assert.equal(live({ ...atDistance(1.5), time: 10 }, progress), live({ ...atDistance(1.5), time: 90 }, progress));
    }
    const stopped = { ...demo.frames[offset], x: sign * (Math.abs(demo.turnMarker) + 1.9) };
    assert.equal(live(stopped, progress), left ? 'prepare_left' : 'prepare_right');
  }
});

test('selected speed gives preparation before starting and slower speech extends the observation window', () => {
  for (const left of [false, true]) {
    const pose = demo.frames[left ? demo.stops[7] : 0];
    const progress = { ...createProgress(), phase: left ? 2 : 0 };
    const prepareKey = left ? 'prepare_left' : 'prepare_right';
    assert.equal(live(pose, progress, { speedLimit: 2.5 / 3.6 }), prepareKey);
    assert.equal(live(pose, progress, { speedLimit: 1 }), prepareKey);
    assert.equal(live(pose, progress, { speedLimit: 2.5 / 3.6, speechRate: 1.5 }), left ? 'left_straight' : 'straight');
    const far = { ...pose, x: (left ? 1 : -1) * (Math.abs(demo.turnMarker) + 4), speed: -0.7 };
    assert.equal(live(far, progress, { speechRate: 1 }), left ? 'left_straight' : 'straight');
    assert.equal(live(far, progress, { speechRate: 0.65 }), prepareKey);
    const approaching = { ...pose, heading: (left ? 1 : -1) * 50 * Math.PI / 180, steer: (left ? 1 : -1) * CAR.maxSteer, speed: -0.7 };
    assert.equal(live(approaching, progress), left ? 'left_align' : 'right_align');
    assert.equal(live(approaching, progress, { speechRate: 0.65 }), left ? 'prepare_center_left' : 'prepare_center_right');
  }
});

test('a held turn gives mirror observation rather than repeating the steering command', () => {
  for (const left of [false, true]) {
    const pose = { ...demo.frames[demo.stops[1]], heading: (left ? 1 : -1) * 70 * Math.PI / 180, steer: (left ? 1 : -1) * CAR.maxSteer, speed: -0.7 };
    const progress = { ...createProgress(), phase: left ? 2 : 0 };
    assert.equal(live(pose, progress), left ? 'hold_left' : 'hold_right');
    assert.equal(live({ ...pose, steer: pose.steer * 0.5 }, progress), left ? 'left_turn' : 'right_turn');
    assert.equal(live({ ...pose, steer: -pose.steer }, progress), 'recovery_wrong_direction');
  }
});

test('the complete two-sided motion produces ordered look, prepare, act, hold, and parking cues', () => {
  const transitions = [];
  let progress = createProgress();
  for (let i = 0; i < demo.frames.length; i++) {
    if (i) progress = advanceProgress(progress, demo.frames[i - 1], demo.frames[i]);
    const key = live(demo.frames[i], progress);
    if (transitions.at(-1)?.key !== key) transitions.push({ key, index: i });
  }
  assert.deepEqual(transitions.map(item => item.key), ['straight', 'prepare_right', 'right_turn', 'hold_right', 'right_align', 'prepare_center_right', 'center', 'park', 'brake', 'exit_left', 'control_b', 'left_straight', 'prepare_left', 'left_turn', 'hold_left', 'left_align', 'prepare_center_left', 'center', 'park', 'brake', 'exit_right', 'finish']);
  for (const side of ['right', 'left']) {
    const prepare = transitions.find(item => item.key === `prepare_${side}`);
    const turn = transitions.find(item => item.key === `${side}_turn`);
    // Acceleration from rest shortens the speed-based horizon slightly.
    assert.ok((turn.index - prepare.index) * demo.dt >= 2.9);
    const beforeCenter = transitions.findIndex(item => item.key === `prepare_center_${side}`);
    assert.ok((transitions[beforeCenter + 1].index - transitions[beforeCenter].index) * demo.dt >= 3.7);
  }
});

test('centering cues scale with reverse speed and stay active while the front wheels unwind', () => {
  for (const left of [false, true]) {
    const progress = { ...createProgress(), phase: left ? 2 : 0 };
    const sign = left ? 1 : -1;
    const pose = { ...demo.frames[demo.stops[3]], heading: sign * 3 * Math.PI / 180, steer: sign * CAR.maxSteer };
    assert.equal(live({ ...pose, speed: -1 }, progress), 'center');
    assert.equal(live({ ...pose, speed: -0.33 }, progress), left ? 'prepare_center_left' : 'prepare_center_right');
    assert.equal(live({ ...pose, speed: -1, steer: pose.steer * 0.4 }, progress), 'center');
    assert.equal(live({ ...pose, speed: -1, steer: 0 }, progress), 'park');
  }
});

test('both sides park without crossing lines at every selectable speed extreme with immediate or delayed reactions', () => {
  for (const speedLimit of [1.2 / 3.6, 2.5 / 3.6, 3.6 / 3.6]) for (const delay of [0, 0.25]) for (const left of [false, true]) {
    const sign = left ? -1 : 1;
    let state = { ...demo.frames[0], x: demo.frames[0].x * sign, heading: demo.frames[0].heading * sign };
    let progress = { ...createProgress(), phase: left ? 2 : 0, checkedA: left, passedB: left };
    let centering = false;
    const cues = [], transitions = [];
    const options = { speedLimit, speechRate: 1 };
    for (let i = 0; i < 6000 && progress.phase === (left ? 2 : 0); i++) {
      const key = live(state, progress, options);
      cues.push(key);
      if (transitions.at(-1)?.key !== key) transitions.push({ key, index: i });
      assert.ok(!key.startsWith('warning'), `${left ? 'left' : 'right'}: ${key}`);
      const acted = cues[Math.max(0, i - Math.round(delay / demo.dt))];
      centering ||= acted === 'center';
      const input = { reverse: true, forward: false, left: acted === 'left_turn', right: acted === 'right_turn', center: centering, brake: acted === 'brake', speedLimit };
      const next = stepVehicle(state, input, demo.dt);
      assert.equal(crossesCourseLine(next), false);
      progress = advanceProgress(progress, state, next);
      state = next;
    }
    assert.equal(progress.phase, left ? 3 : 1);
    assert.equal(isParked(state), true);
    assert.ok(Math.abs(state.steer) < 0.001);
    const side = left ? 'left' : 'right';
    const prepare = transitions.find(item => item.key === `prepare_${side}`);
    const turn = transitions.find(item => item.key === `${side}_turn`);
    assert.equal(transitions.filter(item => item.key === `prepare_${side}`).length, 1);
    assert.equal(transitions.filter(item => item.key === (left ? 'left_straight' : 'straight')).length, speedLimit < 0.5 ? 1 : 0);
    assert.ok(prepare.index < turn.index);
    // At the highest speed the entire initial run-up is shorter than the clip.
    // The paused ready state must offer the initial prepare cue before driving.
    if (speedLimit >= 0.5) assert.equal(cues[0], `prepare_${side}`);
    else assert.ok((turn.index - prepare.index) * demo.dt >= 3.7);
  }
});

test('guidance metadata supports every cue and safely handles unknown keys', () => {
  for (const key of [...Object.keys(VOICE_CUES), 'takeover_short']) {
    const guide = voiceGuidance(key);
    assert.ok(['left', 'right', 'both', 'front'].includes(guide.mirror), key);
    assert.ok(['observe', 'prepare', 'act', 'hold', 'review'].includes(guide.stage), key);
    assert.ok(guide.look && guide.action && guide.next, key);
  }
  assert.equal(voiceGuidance('prepare_right').mirror, 'right');
  assert.equal(voiceGuidance('prepare_left').mirror, 'left');
  assert.equal(voiceGuidance('hold_left').stage, 'hold');
  assert.equal(voiceGuidance('prepare_center_right').stage, 'prepare');
  assert.equal(voiceGuidance('center').mirror, 'both');
  assert.equal(voiceGuidance('center').stage, 'act');
  assert.equal(voiceGuidance('warning_line').stage, 'review');
  assert.match(voiceGuidance('left_turn').action, /A/);
  assert.match(voiceGuidance('right_turn').action, /D/);
  assert.match(voiceGuidance('prepare_center_right').look, /先看右镜.*左镜/);
  assert.match(voiceGuidance('prepare_center_left').look, /先看左镜.*右镜/);
  assert.doesNotMatch(voiceGuidance('right_turn').look, /模型转向参照/);
  for (const key of [undefined, null, Symbol('unknown'), 'not-a-cue']) assert.equal(voiceGuidance(key).stage, 'observe');
});

test('passing parallel never tells the driver to keep the same turn', () => {
  for (const left of [false, true]) {
    const state = { ...demo.frames[demo.stops[3]], heading: (left ? -1 : 1) * 4 * Math.PI / 180 };
    assert.equal(live(state, { ...createProgress(), phase: left ? 2 : 0 }), 'alignment_late');
  }
});

test('manual cues recognize exits, the B control line, and the completed route', () => {
  assert.equal(live(demo.frames[demo.stops[5]], { ...started, phase: 1 }), 'exit_left');
  assert.equal(live(demo.frames[demo.stops[7]], { ...started, phase: 1 }), 'control_b');
  assert.equal(live(demo.frames[demo.stops[9]], { ...started, phase: 3 }), 'exit_right');
  assert.equal(live(demo.frames.at(-1), { ...started, phase: 4 }), 'finish');
});

test('line, sequence, and time warnings have priority after a practice actually starts', () => {
  const pose = demo.frames[0];
  assert.equal(live({ ...pose, x: 15 }, { ...started, wrongSequence: true, overTime: true }), 'warning_line');
  assert.equal(live(pose, { ...started, wrongSequence: true, overTime: true }), 'warning_sequence');
  assert.equal(live(pose, { ...started, overTime: true }), 'warning_time');
  assert.equal(live({ ...pose, time: 211 }), 'warning_time');
  assert.equal(live(pose, { ...createProgress(), crossedLine: true, wrongSequence: true, overTime: true }), 'straight');
  assert.equal(live(pose, { ...started, crossedLine: true }), 'straight');
});

test('short drill preparation and results give specific feedback instead of full-route directions', () => {
  const pose = demo.frames[demo.stops[3]];
  assert.equal(live(pose, started, { alignmentDrill: { side: 'right', status: 'ready' } }), 'alignment_intro');
  for (const [kind, key] of [['early', 'alignment_early'], ['late', 'alignment_late'], ['aligned', 'alignment_good'], ['line', 'warning_line']]) {
    assert.equal(live(pose, started, { alignmentDrill: { status: 'finished', result: { kind } } }), key);
  }
});
