import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAM_COURSES } from './exam-courses.js';
import { getCourseTeachingSteps } from './course-coaching.js';
import { getCourseObservationPlan, sampleCourseObservationPlan, courseObservationPlaybackRate } from './course-observation-plan.js';
import { courseCueGate } from './course-playback.js';
import { COURSE_GAZES } from './course-observation.js';

const chapters = Object.values(EXAM_COURSES).flatMap(course => course.chapters);
const getChapter = id => chapters.find(chapter => chapter.id === id);
const getStep = (id, step) => getCourseTeachingSteps(getChapter(id)).find(item => item.id === `${id}:${step}`);
const planFor = (id, step, phase) => getCourseObservationPlan(getChapter(id), getStep(id, step)).filter(item => item.phase === phase);
const targetAt = (id, step, options) => sampleCourseObservationPlan(getChapter(id), getStep(id, step), options);
const gazes = COURSE_GAZES;

test('all 22 chapters and 121 stable teaching IDs have authored reminder and action plans', () => {
  let count = 0;
  assert.equal(chapters.length, 22);
  for (const chapter of chapters) for (const step of getCourseTeachingSteps(chapter)) {
    count++;
    const slots = getCourseObservationPlan(chapter, step);
    assert.ok(slots.length >= 2, step.id);
    for (const phase of ['reminder', 'action']) assert.ok(slots.some(slot => slot.phase === phase), `${step.id}/${phase}`);
    for (const slot of slots) {
      assert.ok(['driver', 'orbit', 'controls'].includes(slot.view), step.id);
      assert.ok(gazes.includes(slot.gaze), step.id);
      assert.ok(slot.label && Number.isFinite(slot.duration) && slot.duration >= 1, step.id);
      if (slot.view !== 'driver') {
        assert.match(slot.label, /教学辅助/, step.id);
        assert.equal(slot.gaze, 'forward', 'teaching camera is never mislabeled as a mirror or shoulder view');
      }
    }
  }
  assert.equal(count, 121);
});

test('the ID metadata is independent of narration wording, operation direction and caller mutation', () => {
  const chapter = getChapter('reverse-parking'), step = getStep(chapter.id, 'right_center');
  const expected = getCourseObservationPlan(chapter, step);
  const changed = getCourseObservationPlan({ ...chapter, narration: '左左右右', look: '前方' }, {
    ...step, title: '相反文字', look: '左镜', action: '向左', text: '完全不同的口令', operation: { value: 'left' },
  });
  assert.deepEqual(changed, expected);
  changed[0].gaze = 'right-back'; changed.pop();
  assert.deepEqual(getCourseObservationPlan(chapter, step), expected);
  assert.deepEqual(getCourseObservationPlan('reverse-parking', 'right_center'), expected);
});

test('reverse entries start at the correct main mirror, compare both mirrors and return forward before driving out', () => {
  for (const id of ['straight_back', 'right_turn', 'approach_alignment', 'right_center', 'right_stop']) {
    assert.equal(planFor('reverse-parking', id, 'reminder')[0].gaze, 'right', id);
    assert.equal(planFor('reverse-parking', id, 'action')[0].gaze, 'right', id);
  }
  for (const id of ['left_straight_back', 'left_turn', 'left_center', 'left_stop']) {
    assert.equal(planFor('reverse-parking', id, 'reminder')[0].gaze, 'left', id);
    assert.equal(planFor('reverse-parking', id, 'action')[0].gaze, 'left', id);
  }
  assert.deepEqual(planFor('reverse-parking', 'right_center', 'action').map(slot => slot.gaze), ['right', 'left', 'right']);
  assert.deepEqual(planFor('reverse-parking', 'left_center', 'action').map(slot => slot.gaze), ['left', 'right', 'left']);
  for (const id of ['transfer', 'far_ready', 'return', 'finish']) {
    assert.ok(planFor('reverse-parking', id, 'action').every(slot => slot.view === 'driver' && slot.gaze === 'forward'), id);
  }
});

test('front swing checks use the windshield rather than the opposite rear-facing mirror while the main mirror stays dominant', () => {
  for (const [chapter, step, main, outside, duration] of [
    ['reverse-parking', 'right_turn', 'right', '左', 8.52],
    ['reverse-parking', 'left_turn', 'left', '右', 9.1],
    ['side-parking', 'right_turn', 'right', '左', 6],
  ]) {
    const action = planFor(chapter, step, 'action');
    assert.deepEqual(action.map(slot => slot.gaze), [main, 'forward', main]);
    assert.equal(action[1].view, 'driver');
    assert.match(action[1].label, new RegExp(`${outside}前方车头外摆`));
    assert.ok(planFor(chapter, step, 'reminder').some(slot => slot.view === 'driver' && slot.gaze === 'forward'));
    const first = targetAt(chapter, step, { phase: 'action', elapsed: 0, duration });
    const front = targetAt(chapter, step, { phase: 'action', elapsed: first.slotDuration + .01, duration });
    const last = targetAt(chapter, step, { phase: 'action', elapsed: duration - .01, duration });
    assert.equal(first.gaze, main); assert.equal(front.gaze, 'forward'); assert.equal(last.gaze, main);
    assert.ok(front.slotDuration <= 1.5, 'front swing is a brief check, not a replacement for the entry-side main mirror');
    assert.ok(first.slotDuration + last.slotDuration > duration * .6);
  }
  for (const step of ['exit', 'exit_countersteer', 'exit_center']) {
    assert.ok(planFor('side-parking', step, 'action').every(slot => slot.view === 'driver' && slot.gaze === 'forward'));
  }
  assert.deepEqual(planFor('side-parking', 'countersteer', 'action').map(slot => slot.gaze), ['right', 'left', 'right'], 'alignment still compares both mirrors');
});

test('entry reminders use the actual MiniMax duration to hold the main mirror until a brief final front-swing check', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/minimax/manifest.json', import.meta.url), 'utf8'));
  for (const [chapter, step, main] of [
    ['reverse-parking', 'right_turn', 'right'], ['reverse-parking', 'left_turn', 'left'], ['side-parking', 'right_turn', 'right'],
  ]) {
    const teaching = getStep(chapter, step), duration = manifest.clips[teaching.narrationKey].duration;
    const reminder = planFor(chapter, step, 'reminder');
    assert.deepEqual(reminder.map(slot => slot.gaze), [main, 'forward']);
    assert.equal(reminder[0].primary, true);
    const first = targetAt(chapter, step, { phase: 'reminder', elapsed: 0, duration });
    const middle = targetAt(chapter, step, { phase: 'reminder', elapsed: duration / 2, duration });
    const tail = targetAt(chapter, step, { phase: 'reminder', elapsed: duration - .01, duration });
    assert.equal(first.gaze, main); assert.equal(middle.gaze, main);
    assert.ok(first.slotDuration > duration / 2, `${chapter}/${step}: main mirror occupies most of the actual narration`);
    assert.equal(tail.gaze, 'forward'); assert.equal(tail.index, tail.count - 1);
    assert.ok(Math.abs(tail.slotDuration - 1.4) < 1e-9);
    assert.ok(Math.abs(tail.slotStart + tail.slotDuration - duration) < 1e-9);
    assert.equal(targetAt(chapter, step, { phase: 'reminder', elapsed: duration + 1, duration }).gaze, 'forward');
    assert.deepEqual(planFor(chapter, step, 'action').map(slot => slot.gaze), [main, 'forward', main]);
  }
});

test('spoken forward priorities start ahead, and road centering never sends a novice back to a side mirror', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/minimax/manifest.json', import.meta.url), 'utf8'));
  for (const [chapter, step] of [
    ['start', 'move'], ['hill-start', 'bite'], ['gears', 'first'], ['gears', 'down_second'],
    ['left-turn', 'signal'], ['right-turn', 'signal'], ['uturn', 'signal'], ['straight', 'scan'],
  ]) {
    const teaching = getStep(chapter, step), duration = manifest.clips[teaching.narrationKey].duration;
    const first = targetAt(chapter, step, { phase: 'reminder', duration, elapsed: 0 });
    const last = targetAt(chapter, step, { phase: 'reminder', duration, elapsed: duration - .01 });
    assert.deepEqual([first.view, first.gaze], ['driver', 'forward'], `${chapter}/${step}: first spoken road target is ahead, not a mirror or pedal close-up`);
    assert.deepEqual([last.view, last.gaze], ['driver', 'forward'], `${chapter}/${step}: return ahead before operating`);
  }
  for (const [chapter, step] of [
    ['start', 'move'], ['start', 'center'], ['gears', 'first'], ['hill-start', 'leave'],
    ['lane-change', 'left_center'], ['lane-change', 'right_center'], ['overtake', 'center'],
    ['side-parking', 'exit_center'], ['reverse-parking', 'finish'],
  ]) for (const phase of ['reminder', 'action']) {
    assert.ok(planFor(chapter, step, phase).every(slot => slot.view === 'driver' && slot.gaze === 'forward'), `${chapter}/${step}/${phase}: front-guided alignment stays ahead`);
  }
  const rightAngle = planFor('right-angle', 'left_turn', 'reminder');
  assert.equal(rightAngle[0].gaze, 'left', 'left rear wheel clearance keeps its real mirror');
  assert.ok(rightAngle.some(slot => slot.gaze === 'forward' && /右前方车头外摆/.test(slot.label)));
  assert.ok(!rightAngle.some(slot => slot.gaze === 'right'), 'the opposite rear-facing mirror cannot show right front swing');
});

test('left-turn and u-turn keep their spoken front-road priority, then perform side checks at an observable action rate', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/minimax/manifest.json', import.meta.url), 'utf8'));
  for (const chapter of ['left-turn', 'uturn']) {
    const teaching = getStep(chapter, 'signal'), audioDuration = manifest.clips[teaching.narrationKey].duration;
    const steps = getCourseTeachingSteps(getChapter(chapter)), duration = courseCueGate(steps[1]) - teaching.t;
    for (const rate of [.5, 1, 2, 4]) {
      for (let elapsed = 0; elapsed < audioDuration; elapsed += .025) {
        const target = targetAt(chapter, 'signal', { phase: 'reminder', elapsed, duration: audioDuration, rate });
        assert.deepEqual([target.view, target.gaze], ['driver', 'forward'], 'the front-road sentence never tours rear mirrors');
      }
      const effective = courseObservationPlaybackRate(chapter, teaching, { duration, rate });
      assert.ok(effective <= rate);
      const seen = [];
      for (let elapsed = 0; elapsed < duration; elapsed += .025) {
        const target = targetAt(chapter, 'signal', { phase: 'action', elapsed, duration, rate: effective });
        if (target.gaze !== seen.at(-1)) seen.push(target.gaze);
        if (['left', 'left-back'].includes(target.gaze)) {
          assert.ok(target.slotDuration / effective >= 1 && target.slotDuration / effective <= 1.25, 'the additional glance remains brief in real time');
        }
      }
      assert.deepEqual(seen, ['left', 'left-back', 'forward'], `${chapter}/${rate}x`);
    }
  }
});

test('automatic observation rate preserves every authored action slot within actual cue gates, while one-view steps retain user speed', () => {
  for (const chapter of chapters) {
    const steps = getCourseTeachingSteps(chapter);
    for (const [index, step] of steps.entries()) for (const voiced of [true, false]) for (const rate of [.5, 1, 2, 4]) {
      const next = steps[index + 1], end = next ? voiced ? courseCueGate(next) : next.t : chapter.duration;
      const duration = Math.max(.1, end - step.t), action = getCourseObservationPlan(chapter, step).filter(slot => slot.phase === 'action');
      const effective = courseObservationPlaybackRate(chapter, step, { duration, rate });
      assert.ok(Number.isFinite(effective) && effective > 0 && effective <= rate, step.id);
      if (action.length === 1) { assert.equal(effective, rate); continue; }
      const seen = new Set();
      for (let elapsed = 0; elapsed < duration; elapsed += duration / 400) {
        const target = sampleCourseObservationPlan(chapter, step, { phase: 'action', elapsed, duration, rate: effective });
        seen.add(target.index);
        assert.equal(target.count, action.length, `${step.id}/${rate}: no required view is collapsed`);
        assert.ok(target.slotDuration / effective >= 1 - 1e-7, `${step.id}/${rate}: a full real second per visible slot`);
      }
      assert.equal(seen.size, action.length, step.id);
    }
  }
  assert.equal(courseObservationPlaybackRate('missing', 'missing', { duration: 1, rate: 4 }), 4);
  for (const duration of [0, -1, NaN, Infinity, undefined]) assert.equal(courseObservationPlaybackRate('left-turn', 'signal', { duration, rate: 4 }), 4);
});

test('lane changes and overtaking preview same-side mirror then shoulder and return to the front for every action', () => {
  for (const chapter of ['lane-change', 'overtake']) {
    for (const side of ['left', 'right']) for (const operation of ['signal', 'move']) {
      const key = `${side}_${operation}`;
      assert.deepEqual(planFor(chapter, key, 'reminder').map(slot => slot.gaze), [side, `${side}-back`, 'forward'], `${chapter}/${key}`);
    }
    for (const step of getCourseTeachingSteps(getChapter(chapter))) {
      assert.ok(getCourseObservationPlan(getChapter(chapter), step).filter(slot => slot.phase === 'action')
        .every(slot => slot.view === 'driver' && slot.gaze === 'forward'), step.id);
    }
    assert.deepEqual(planFor(chapter, 'left_countersteer', 'reminder').map(slot => slot.gaze), ['forward']);
    assert.deepEqual(planFor(chapter, 'right_countersteer', 'reminder').map(slot => slot.gaze), ['forward']);
  }
});

test('preparation and stationary lamps distinguish teaching aids from actual driver mirror and shoulder views', () => {
  assert.ok(getCourseObservationPlan('prepare', 'walkaround').every(slot => slot.view === 'orbit' && /教学辅助/.test(slot.label)));
  assert.deepEqual(planFor('prepare', 'open_door', 'reminder').map(slot => [slot.view, slot.gaze]), [['driver', 'left'], ['driver', 'left-back']]);
  assert.deepEqual(planFor('prepare', 'mirrors', 'action').map(slot => slot.gaze), ['left', 'right', 'forward']);
  for (const step of getCourseTeachingSteps(getChapter('lights'))) {
    assert.ok(getCourseObservationPlan('lights', step).every(slot => slot.view === 'controls' && /教学辅助/.test(slot.label)), step.id);
  }
  for (const step of getCourseTeachingSteps(getChapter('gears'))) {
    assert.ok(getCourseObservationPlan('gears', step).filter(slot => slot.phase === 'action')
      .every(slot => slot.view === 'driver' && slot.gaze === 'forward'), 'moving gear changes never teach looking down at the lever');
  }
});

test('front-road risks are never represented as rear-facing side-mirror observations', () => {
  for (const chapter of ['intersection', 'crosswalk', 'school', 'bus', 'night']) {
    for (const step of getCourseTeachingSteps(getChapter(chapter))) {
      assert.ok(getCourseObservationPlan(chapter, step).every(slot => slot.view === 'driver' && ['forward', 'front-left', 'front-right'].includes(slot.gaze)), step.id);
    }
  }
  assert.equal(planFor('straight', 'scan', 'reminder')[0].gaze, 'forward', 'far/near road observation comes before the incidental mirror scan');
  assert.equal(planFor('straight', 'scan', 'reminder')[1].gaze, 'rear', 'rear is the real interior mirror');
  assert.deepEqual(planFor('right-turn', 'blind_spot', 'reminder').map(slot => slot.gaze), ['right', 'right-back', 'front-left', 'front-right', 'forward']);
  assert.deepEqual(planFor('pull-over', 'leave', 'reminder').map(slot => slot.gaze), ['left', 'left-back', 'forward']);
});

test('intersection, crossing, school and bus conflicts explicitly scan the forward sides, then face forward to drive', () => {
  for (const [chapter, step] of [
    ['intersection', 'check'], ['crosswalk', 'approach'], ['crosswalk', 'restart'],
    ['school', 'slow'], ['school', 'scan'], ['left-turn', 'yield'], ['uturn', 'check'],
  ]) {
    assert.deepEqual(planFor(chapter, step, 'reminder').map(slot => slot.gaze), ['front-left', 'front-right', 'forward'], `${chapter}/${step}`);
    assert.ok(planFor(chapter, step, 'action').every(slot => slot.view === 'driver' && slot.gaze === 'forward'));
    const left = targetAt(chapter, step, { phase: 'reminder', elapsed: 0, duration: 4 });
    const right = targetAt(chapter, step, { phase: 'reminder', elapsed: left.slotDuration + .01, duration: 4 });
    assert.equal(left.gaze, 'front-left'); assert.equal(right.gaze, 'front-right');
    assert.match(left.label, /前方左侧扫视/); assert.match(right.label, /前方右侧扫视/);
  }
  assert.deepEqual(planFor('bus', 'occlusion', 'reminder').map(slot => slot.gaze), ['front-right', 'front-left', 'forward']);
  assert.deepEqual(planFor('bus', 'approach', 'reminder').map(slot => slot.gaze), ['forward', 'front-right', 'front-left', 'forward'], 'recognize the stop ahead, then check the actual stop side before the other forward conflict');
  assert.deepEqual(planFor('intersection', 'cross', 'reminder').map(slot => slot.gaze), ['forward', 'front-left', 'front-right', 'forward'], 'the spoken instruction first checks the direction of travel');
  assert.deepEqual(planFor('crosswalk', 'wait', 'action').map(slot => slot.gaze), ['front-left', 'front-right', 'forward'], 'the stopped yielding vehicle can continue scanning both forward-side crossing approaches');
  assert.ok(planFor('crosswalk', 'stop', 'action').every(slot => slot.gaze === 'forward'), 'braking still watches the actual stop line and pedestrian path');
});

test('all road turns demonstrate mirror, shoulder and three forward conflict views before the actual turn using the real clip duration', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/minimax/manifest.json', import.meta.url), 'utf8'));
  for (const [id, mirror, check] of [['left-turn', 'left', 'yield'], ['right-turn', 'right', 'blind_spot'], ['uturn', 'left', 'check']]) {
    const chapter = getChapter(id), signal = getStep(id, 'signal'), beforeTurn = getStep(id, check), turn = getStep(id, 'turn');
    assert.ok(signal.t < beforeTurn.t && beforeTurn.t < turn.t, id);
    const seen = [];
    for (const [step, phase, duration] of [[signal, 'reminder', manifest.clips[signal.narrationKey].duration],
      [signal, 'action', courseCueGate(beforeTurn) - signal.t], [beforeTurn, 'reminder', manifest.clips[beforeTurn.narrationKey].duration]]) {
      const rate = phase === 'action' ? courseObservationPlaybackRate(chapter, step, { duration, rate: 4 }) : 1;
      for (let t = 0; t <= duration + .1; t += .05) {
        const target = sampleCourseObservationPlan(chapter, step, { phase, elapsed: t, duration, rate });
        if (seen.at(-1) !== target.gaze) seen.push(target.gaze);
        assert.ok(target.slotDuration / rate >= 1 - 1e-9, `${id}: no rapid slot flashes`);
      }
    }
    const mirrorIndex = seen.indexOf(mirror), shoulderIndex = seen.indexOf(`${mirror}-back`);
    const leftIndex = seen.lastIndexOf('front-left'), rightIndex = seen.lastIndexOf('front-right'), forwardIndex = seen.lastIndexOf('forward');
    assert.ok(mirrorIndex >= 0 && shoulderIndex > mirrorIndex, `${id}: actual mirror and shoulder observation retained`);
    assert.ok(leftIndex > shoulderIndex && rightIndex > leftIndex && forwardIndex > rightIndex, `${id}: all three conflict views really sampled before turning`);
    assert.equal(targetAt(id, 'turn', { phase: 'action', elapsed: 0, duration: 10 }).gaze, 'forward');
  }
});

test('short reminders preserve the main mirror and then the shoulder without rapid forward flashes', () => {
  const common = { phase: 'reminder', duration: 2.6 };
  const first = targetAt('lane-change', 'left_signal', { ...common, elapsed: 0 });
  const second = targetAt('lane-change', 'left_signal', { ...common, elapsed: 1.21 });
  const held = targetAt('lane-change', 'left_signal', { ...common, elapsed: 2.59 });
  assert.equal(first.gaze, 'left'); assert.equal(first.count, 2);
  assert.equal(second.gaze, 'left-back'); assert.equal(held.gaze, 'left-back');
  assert.ok(first.slotDuration >= 1 && second.slotDuration >= 1);
  const action = targetAt('lane-change', 'left_signal', { phase: 'action', elapsed: 0, duration: 5 });
  assert.equal(action.gaze, 'forward');
  for (const elapsed of [0, .3, .8, 1.59]) assert.equal(targetAt('lane-change', 'right_signal', { phase: 'reminder', elapsed, duration: 1.6 }).gaze, 'right');
});

test('subsecond parking steps keep the primary mirror and the following centering step explicitly resumes it', () => {
  for (const [step, duration] of [['ready', .6], ['approach_alignment', .6], ['right_stop', .4167]]) {
    for (const elapsed of [0, duration / 2, duration]) {
      const target = targetAt('reverse-parking', step, { phase: 'action', elapsed, duration });
      assert.equal(target.gaze, 'right'); assert.equal(target.count, 1);
    }
  }
  assert.equal(targetAt('reverse-parking', 'right_center', { phase: 'action', elapsed: 0, duration: 5.18 }).gaze, 'right');
  assert.equal(targetAt('reverse-parking', 'left_center', { phase: 'action', elapsed: 0, duration: 5.2 }).gaze, 'left');
  assert.equal(targetAt('reverse-parking', 'left_stop', { phase: 'action', elapsed: .2, duration: .25 }).gaze, 'left');
});

test('road action glances stay brief even on long steps, and high playback rates collapse short actions', () => {
  const normal = targetAt('hill-start', 'approach', { phase: 'action', elapsed: 8.5, duration: 18 });
  assert.equal(normal.gaze, 'right'); assert.ok(normal.slotDuration <= 1.21);
  assert.equal(targetAt('hill-start', 'approach', { phase: 'action', elapsed: 10, duration: 18 }).gaze, 'forward');
  const fast = targetAt('hill-start', 'approach', { phase: 'action', elapsed: 7, duration: 18, rate: 4 });
  assert.equal(fast.gaze, 'right'); assert.ok(fast.slotDuration / 4 >= 1);
  for (const elapsed of [0, 1, 3, 5.9]) {
    const short = targetAt('side-parking', 'right_turn', { phase: 'action', elapsed, duration: 6, rate: 4 });
    assert.equal(short.gaze, 'right'); assert.equal(short.count, 1);
  }
});

test('sampling uses only the supplied phase clock so cue holds, pause and long audio cannot advance or cycle the view', () => {
  const input = { phase: 'reminder', elapsed: 1.3, duration: 4 };
  const paused = targetAt('lane-change', 'left_move', input);
  for (let i = 0; i < 50; i++) assert.deepEqual(targetAt('lane-change', 'left_move', input), paused);
  assert.equal(paused.gaze, 'left-back');
  assert.equal(targetAt('lane-change', 'left_move', { phase: 'action', elapsed: -.35, duration: 3 }).gaze, 'forward', 'post-reminder gate stays in the selected step');
  assert.equal(targetAt('lane-change', 'left_move', { phase: 'reminder', elapsed: 30, duration: 4 }).gaze, 'forward', 'finished reminder never loops back through blind views');
  assert.equal(targetAt('lane-change', 'left_move', { phase: 'action', elapsed: 30, duration: 3 }).gaze, 'forward');
});

test('all real MiniMax durations and action intervals sample valid targets without subsecond slot changes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/minimax/manifest.json', import.meta.url), 'utf8'));
  let sampled = 0;
  for (const chapter of chapters) {
    const steps = getCourseTeachingSteps(chapter);
    for (const [index, step] of steps.entries()) {
      for (const phase of ['reminder', 'action']) for (const rate of [1, 4]) {
        const duration = phase === 'reminder' ? manifest.clips[step.narrationKey].duration : (steps[index + 1]?.t ?? chapter.duration) - step.t;
        const scale = phase === 'action' ? rate : 1;
        const targets = new Map();
        for (let t = 0; t <= duration + .1; t += .1) {
          const target = sampleCourseObservationPlan(chapter, step, { phase, elapsed: t, duration, rate });
          assert.ok(gazes.includes(target.gaze) && ['driver', 'orbit', 'controls'].includes(target.view), step.id);
          targets.set(target.index, target);
        }
        for (const target of targets.values()) {
          assert.ok(target.count === 1 || target.slotDuration / scale >= 1 - 1e-9, `${step.id}/${phase}/${rate}`);
        }
        sampled++;
      }
    }
  }
  assert.equal(sampled, 121 * 4);
});

test('unknown or invalid data safely stays forward without inherited object properties becoming plans', () => {
  for (const chapter of ['missing', 'constructor', 'prepare']) for (const step of ['missing', '__proto__', 'constructor']) {
    assert.deepEqual(getCourseObservationPlan(chapter, step), []);
    const target = sampleCourseObservationPlan(chapter, step, { elapsed: NaN, duration: Infinity, rate: NaN });
    assert.equal(target.view, 'driver'); assert.equal(target.gaze, 'forward');
    assert.ok(Number.isFinite(target.slotStart) && Number.isFinite(target.slotDuration));
  }
  assert.deepEqual(getCourseObservationPlan(null, null), []);
});
