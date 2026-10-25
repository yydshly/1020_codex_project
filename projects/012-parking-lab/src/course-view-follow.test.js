import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourseViewFollow, stepCourseViewFollow, overrideCourseViewFollow, setCourseViewFollowEnabled } from './course-view-follow.js';

const target = (gaze, view = 'driver', label = gaze) => ({ view, gaze, label });
const input = (extra = {}) => ({ mode: 'demo', chapterId: 'reverse-parking', stepId: 'reverse-parking:right_turn', generation: 0,
  phase: 'reminder', paused: false, mirrorPanelOpen: false, target: target('right'), ...extra });
const start = () => stepCourseViewFollow(createCourseViewFollow(), input());

test('default following applies the externally sampled reminder before action, without any clock or timer', () => {
  let state = start();
  assert.equal(state.enabled, true); assert.equal(state.changed, true); assert.equal(state.gaze, 'right'); assert.equal(state.following, true);
  state = stepCourseViewFollow(state, input({ phase: 'action', target: target('left') }));
  assert.equal(state.gaze, 'left'); assert.equal(state.changed, true); assert.equal(state.target.phase, 'action');
  const same = stepCourseViewFollow(state, input({ phase: 'action', target: target('left', 'driver', '同镜核对') }));
  assert.equal(same.changed, false); assert.equal(same.label, '同镜核对');
});

test('same-key paused frames freeze the slot even if a caller supplies changing targets and large dt', () => {
  let state = start();
  for (let index = 0; index < 50; index++) state = stepCourseViewFollow(state, input({ paused: true, dt: 3600, target: target(index % 2 ? 'rear' : 'left') }));
  assert.equal(state.gaze, 'right'); assert.equal(state.label, 'right'); assert.equal(state.changed, false);
  assert.equal(state.following, true); assert.equal(state.reason, 'paused');
  state = stepCourseViewFollow(state, input({ paused: false, target: target('rear') }));
  assert.equal(state.gaze, 'rear'); assert.equal(state.changed, true);
});

test('explicit seeks and same-step replay generations reset a paused step while ordinary phase/token changes do not unlock manual choice', () => {
  let state = overrideCourseViewFollow(start(), { view: 'top', gaze: 'right-back' });
  for (const phase of ['action', 'reminder', 'action']) state = stepCourseViewFollow(state, input({ paused: true, phase, token: 99, target: target('left') }));
  assert.equal(state.view, 'top'); assert.equal(state.gaze, 'right-back'); assert.equal(state.manualOverride, true); assert.equal(state.changed, false);
  state = stepCourseViewFollow(state, input({ generation: 1, paused: true, target: target('right') }));
  assert.equal(state.view, 'driver'); assert.equal(state.gaze, 'right'); assert.equal(state.manualOverride, false); assert.equal(state.changed, true);
  const firstKey = state.key;
  state = stepCourseViewFollow(state, input({ generation: 2, paused: true, target: target('left') }));
  assert.notEqual(state.key, firstKey); assert.equal(state.gaze, 'left');
});

test('every manual gaze and auxiliary view wins for this step, then the next step automatically resumes', () => {
  for (const camera of [target('left'), target('right'), target('forward'), target('rear'), target('left-back'), target('right-back'),
    target('right', 'top'), target('rear', 'orbit'), target('forward', 'controls')]) {
    let state = overrideCourseViewFollow(start(), camera);
    state = stepCourseViewFollow(state, input({ target: target('left'), phase: 'action' }));
    assert.equal(state.view, camera.view); assert.equal(state.gaze, camera.gaze); assert.equal(state.manualOverride, true); assert.equal(state.changed, false);
    state = stepCourseViewFollow(state, input({ stepId: 'reverse-parking:right_center', target: target('right') }));
    assert.equal(state.view, 'driver'); assert.equal(state.gaze, 'right'); assert.equal(state.manualOverride, false); assert.equal(state.following, true);
  }
});

test('choosing an already active camera still locks the step, and changing only view preserves gaze', () => {
  let state = overrideCourseViewFollow(start(), { gaze: 'right' });
  state = stepCourseViewFollow(state, input({ target: target('left') }));
  assert.equal(state.gaze, 'right'); assert.equal(state.manualOverride, true);
  state = overrideCourseViewFollow(state, { view: 'controls' });
  assert.equal(state.gaze, 'right'); assert.equal(state.view, 'controls'); assert.equal(state.changed, false);
});

test('switching following off leaves all chapters fully manual; explicit enable resumes the current sampled target', () => {
  let state = setCourseViewFollowEnabled(start(), false);
  state = stepCourseViewFollow(state, input({ chapterId: 'meeting', stepId: 'meeting:pass', generation: 5,
    view: 'top', gaze: 'rear', target: target('forward') }));
  assert.equal(state.view, 'top'); assert.equal(state.gaze, 'rear'); assert.equal(state.changed, false); assert.equal(state.following, false); assert.equal(state.reason, 'disabled');
  state = overrideCourseViewFollow(state, { view: 'controls' });
  state = setCourseViewFollowEnabled(state, true);
  state = stepCourseViewFollow(state, input({ chapterId: 'meeting', stepId: 'meeting:pass', generation: 5, paused: true, target: target('forward') }));
  assert.equal(state.view, 'driver'); assert.equal(state.gaze, 'forward'); assert.equal(state.manualOverride, false); assert.equal(state.changed, true);
});

test('self-driving never applies an automatic target and preserves the actual takeover view and gaze', () => {
  let state = start();
  for (const camera of [target('right-back', 'driver'), target('right', 'top'), target('forward', 'controls')]) {
    state = stepCourseViewFollow(state, input({ mode: 'drive', chapterId: 'lane-change', stepId: 'lane-change:check', generation: 12,
      view: camera.view, gaze: camera.gaze, target: target('left') }));
    assert.equal(state.view, camera.view); assert.equal(state.gaze, camera.gaze); assert.equal(state.changed, false);
    assert.equal(state.following, false); assert.equal(state.reason, 'driving');
  }
});

test('an open mirror panel is a hard gate, defers a new paused step, and respects a manual choice made inside it', () => {
  let state = start();
  state = stepCourseViewFollow(state, input({ stepId: 'reverse-parking:right_center', paused: true, mirrorPanelOpen: true,
    view: 'driver', gaze: 'right-back', target: target('left') }));
  assert.equal(state.gaze, 'right-back'); assert.equal(state.changed, false); assert.equal(state.reason, 'mirror-panel');
  assert.equal(state.pendingAuto, true);
  state = stepCourseViewFollow(state, input({ stepId: 'reverse-parking:right_center', paused: true, target: target('left') }));
  assert.equal(state.gaze, 'left'); assert.equal(state.changed, true);
  state = stepCourseViewFollow(state, input({ mirrorPanelOpen: true, target: target('right') }));
  state = overrideCourseViewFollow(state, { gaze: 'rear' });
  state = stepCourseViewFollow(state, input({ paused: true, target: target('right') }));
  assert.equal(state.gaze, 'rear'); assert.equal(state.manualOverride, true); assert.equal(state.changed, false);
});

test('step identity cannot collide at separator characters and a missing/invalid target never invents a camera move', () => {
  let state = stepCourseViewFollow(createCourseViewFollow(), input({ chapterId: 'a:b', stepId: 'c', target: target('left') }));
  state = overrideCourseViewFollow(state, { view: 'top' });
  state = stepCourseViewFollow(state, input({ chapterId: 'a', stepId: 'b:c', target: target('right') }));
  assert.equal(state.manualOverride, false); assert.equal(state.view, 'driver'); assert.equal(state.gaze, 'right');
  state = stepCourseViewFollow(state, input({ generation: 4, target: { view: 'driver', gaze: 'unknown' }, paused: true }));
  assert.equal(state.gaze, 'right'); assert.equal(state.changed, false); assert.equal(state.reason, 'no-target'); assert.equal(state.pendingAuto, true);
  state = stepCourseViewFollow(state, input({ generation: 4, paused: true, target: target('rear') }));
  assert.equal(state.gaze, 'rear'); assert.equal(state.changed, true);
});

test('manual input before the first keyed sync belongs to that step rather than being immediately stolen', () => {
  let state = overrideCourseViewFollow(createCourseViewFollow(), { view: 'orbit', gaze: 'left-back' });
  state = stepCourseViewFollow(state, input());
  assert.equal(state.view, 'orbit'); assert.equal(state.gaze, 'left-back'); assert.equal(state.manualOverride, true);
  state = stepCourseViewFollow(state, input({ generation: 1 }));
  assert.equal(state.view, 'driver'); assert.equal(state.gaze, 'right'); assert.equal(state.manualOverride, false);
});
