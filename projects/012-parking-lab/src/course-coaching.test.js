import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { COURSE_CUE_NARRATION, getCourseTeachingSteps } from './course-coaching.js';

const chapters = Object.values(EXAM_COURSES).flatMap(course => course.chapters);
const chapter = id => chapters.find(item => item.id === id);
const steps = id => getCourseTeachingSteps(chapter(id));
const text = step => COURSE_CUE_NARRATION[step.narrationKey].text;
const byId = (id, step) => steps(id).find(item => item.id === `${id}:${step}`);

test('all 22 chapters bind every cue to one unique short narration at the actual animation time', () => {
  assert.equal(chapters.length, 22);
  const narrationKeys = [];
  for (const item of chapters) {
    const teaching = getCourseTeachingSteps(item);
    assert.equal(teaching.length, item.cues.length, item.id);
    assert.ok(teaching.length >= 3, item.id);
    for (let i = 0; i < teaching.length; i++) {
      const step = teaching[i];
      assert.equal(step.t, item.cues[i].t, `${step.id}: cues use animation time, not voice duration`);
      assert.equal(step.title, item.cues[i].title);
      assert.equal(step.look, item.cues[i].look);
      assert.ok(step.t >= 0 && step.t <= item.duration, step.id);
      if (i) assert.ok(step.t > teaching[i - 1].t, `${step.id}: no simultaneous competing narration`);
      const expectedSubject = item.narrationKey.startsWith('course2_') ? 2 : 3;
      assert.match(step.narrationKey, new RegExp(`^coursecue${expectedSubject}_[a-z0-9_]+$`));
      assert.ok(COURSE_CUE_NARRATION[step.narrationKey], `${step.id}: audio source exists`);
      assert.ok([...text(step)].length >= 12 && [...text(step)].length <= 32, `${step.id}: concise spoken instruction`);
      assert.ok(step.action && step.operation.label);
      narrationKeys.push(step.narrationKey);
    }
  }
  assert.equal(narrationKeys.length, 121);
  assert.equal(new Set(narrationKeys).size, narrationKeys.length);
  assert.deepEqual(new Set(narrationKeys), new Set(Object.keys(COURSE_CUE_NARRATION)), 'no unplayed or missing generated clips');
  assert.equal(new Set(Object.values(COURSE_CUE_NARRATION).map(item => item.text)).size, narrationKeys.length);
});

test('physical operations use supported kinds and targets, while observation stays separate from control operation', () => {
  const targets = {
    prepare: ['door', 'seat', 'mirrors', 'belt'],
    pedal: ['clutch', 'brake', 'throttle'],
    gear: ['gear'],
    light: ['turn-signal', 'headlight', 'hazard'],
    steering: ['steering'],
    observe: ['check', 'road', 'mirrors'],
  };
  for (const item of chapters) for (const step of getCourseTeachingSteps(item)) {
    assert.ok(targets[step.operation.kind]?.includes(step.operation.target), step.id);
    assert.ok(step.operation.value && step.operation.label, step.id);
    assert.equal('view' in step, false, 'teaching never forces a camera change');
  }
});

test('both reverse entries teach opposite return-wheel directions and preserve stops and forward transfer', () => {
  const right = byId('reverse-parking', 'right_turn'), rightCenter = byId('reverse-parking', 'right_center');
  const left = byId('reverse-parking', 'left_turn'), leftCenter = byId('reverse-parking', 'left_center');
  assert.equal(right.operation.value, 'right');
  assert.equal(left.operation.value, 'left');
  assert.equal(rightCenter.operation.value, 'center');
  assert.equal(leftCenter.operation.value, 'center');
  assert.match(text(right), /右.*左前方外摆/);
  assert.match(text(left), /左.*右前方外摆/);
  assert.match(text(rightCenter), /向左回轮至前轮回中/);
  assert.match(text(leftCenter), /向右回轮至前轮回中/);
  assert.ok(right.t < rightCenter.t && rightCenter.t < byId('reverse-parking', 'right_stop').t);
  assert.ok(left.t < leftCenter.t && leftCenter.t < byId('reverse-parking', 'left_stop').t);
  for (const id of ['right_stop', 'left_stop', 'finish']) assert.equal(byId('reverse-parking', id).operation.target, 'brake');
  for (const id of ['transfer', 'return']) assert.equal(byId('reverse-parking', id).operation.value, '1');
  assert.equal(byId('reverse-parking', 'left_straight_back').operation.value, 'R');
});

test('preparation demonstrates door closure, seating, mirrors and belt before final checks', () => {
  const preparation = steps('prepare');
  assert.deepEqual(preparation.map(step => step.t), [0, 7, 9, 11, 14, 17, 20]);
  assert.deepEqual(preparation.map(step => [step.operation.target, step.operation.value]), [
    ['check', 'walkaround'], ['door', 'open'], ['door', 'close'], ['seat', 'adjust'],
    ['mirrors', 'adjust'], ['belt', 'fasten'], ['check', 'controls'],
  ]);
  assert.match(text(preparation[1]), /先看后方.*确认安全/);
  assert.match(text(preparation[3]), /离合能踩到底/);
  assert.match(text(preparation[4]), /保持坐姿再调镜/);
  assert.match(text(preparation[5]), /扣牢.*没有扭转/);
});

test('every simulated-light command names the corresponding operation, including position and hazard lamps', () => {
  const lighting = steps('lights');
  assert.deepEqual(lighting.map(step => step.operation.value), ['off', 'low', 'high', 'low', 'flash', 'low', 'hazard', 'off']);
  assert.deepEqual(lighting.map(step => step.t), [0, 4, 8, 12, 16, 20, 24, 28]);
  assert.match(text(lighting[1]), /照明良好.*近光/);
  assert.match(text(lighting[2]), /不影响他人.*远光/);
  assert.match(text(lighting[3]), /会车.*近光/);
  assert.match(text(lighting[5]), /跟车.*近光/);
  assert.equal(lighting[6].operation.target, 'hazard');
  assert.match(text(lighting[6]), /示廓灯和危险报警闪光灯/);
  assert.deepEqual(steps('night').map(step => step.operation.value), ['high', 'low', 'flash', 'low']);
});

test('C1 sequences teach clutch and braking order, hill hold before release, and secure parking before door opening', () => {
  const hold = byId('hill-start', 'hold'), bite = byId('hill-start', 'bite');
  assert.ok(hold.t < bite.t);
  assert.match(text(hold), /踩离合和制动停稳.*驻车制动/);
  assert.match(text(bite), /建立驱动力再松驻车/);
  assert.match(text(byId('hill-start', 'leave')), /向前走稳.*抬离合/);
  assert.match(text(byId('gears', 'second')), /先松油门.*离合踩到底.*挂二挡.*抬离合/);
  assert.match(text(byId('gears', 'down_second')), /先.*减速.*踩离合换二挡/);
  const secure = byId('pull-over', 'secure'), leave = byId('pull-over', 'leave');
  assert.ok(secure.t < leave.t);
  assert.match(text(secure), /停稳.*驻车制动.*空挡/);
  assert.match(text(leave), /先看左镜和左后方.*确认安全.*解安全带开门/);
});

test('turning, blind spots and returning to a lane have distinct actionable guidance', () => {
  assert.equal(byId('right-angle', 'left_turn').operation.value, 'left', 'this 90-degree corner is a left turn');
  assert.equal(byId('side-parking', 'right_turn').operation.value, 'right');
  assert.equal(byId('side-parking', 'countersteer').operation.value, 'left');
  assert.equal(byId('side-parking', 'entry_center').operation.value, 'center');
  assert.match(text(byId('side-parking', 'entry_center')), /向右回轮至前轮回中/);
  assert.equal(byId('side-parking', 'exit_countersteer').operation.value, 'right');
  assert.equal(byId('side-parking', 'exit_center').operation.value, 'center');
  assert.equal(byId('lane-change', 'right_signal').operation.target, 'turn-signal', 'return cue prepares a later manoeuvre');
  assert.equal(byId('overtake', 'right_signal').operation.target, 'turn-signal');
  for (const id of ['lane-change', 'overtake']) {
    const manoeuvre = steps(id);
    assert.deepEqual(manoeuvre.map(step => step.operation.value), ['left', 'left', 'right', 'center', 'right', 'right', 'left', 'center'], id);
    assert.ok(byId(id, 'left_move').t < byId(id, 'left_countersteer').t);
    assert.ok(byId(id, 'left_countersteer').t < byId(id, 'pass')?.t || byId(id, 'left_countersteer').t < byId(id, 'left_center')?.t);
    assert.ok(byId(id, 'right_move').t < byId(id, 'right_countersteer').t);
    assert.match(text(byId(id, 'left_countersteer')), /向右回轮修直/);
    assert.match(text(byId(id, 'right_countersteer')), /向左回轮修直/);
    for (const stepId of ['left_move', 'left_countersteer', 'right_move', 'right_countersteer']) {
      const step = byId(id, stepId), steer = sampleChapterPose(chapter(id), step.t + .2).steer;
      assert.equal(Math.sign(steer), step.operation.value === 'left' ? 1 : -1, `${id}/${stepId}: spoken steering agrees with animated curvature`);
    }
  }
  const parking = steps('pull-over');
  assert.equal(parking.length, 8);
  assert.equal(byId('pull-over', 'signal').t, 1, 'signal and observation precede steering');
  assert.equal(byId('pull-over', 'right_move').t, 4);
  assert.equal(byId('pull-over', 'right_move').operation.value, 'right');
  assert.equal(byId('pull-over', 'countersteer').operation.value, 'left');
  assert.equal(byId('pull-over', 'center').operation.value, 'center');
  assert.match(text(byId('right-turn', 'blind_spot')), /右镜.*右后方盲区.*先让/);
  assert.match(text(byId('bus', 'occlusion')), /车前后遮挡/);
  assert.match(text(byId('school', 'slow')), /儿童.*遮挡处/);
  assert.match(text(byId('crosswalk', 'restart')), /行人安全通过.*前方畅通/);
  for (const narration of Object.values(COURSE_CUE_NARRATION)) {
    assert.doesNotMatch(narration.text, /打死|一圈半|固定秒数|左窄就向右|右窄就向左/);
  }
});

test('bindings are independent, preserve stable keys when cue time changes, and reject unreviewed cue count changes', () => {
  const item = chapter('lights'), first = getCourseTeachingSteps(item);
  first[0].operation.value = 'broken';
  assert.equal(getCourseTeachingSteps(item)[0].operation.value, 'off');
  const retimed = { ...item, cues: item.cues.map(cue => ({ ...cue, t: cue.t + .1 })) };
  const second = getCourseTeachingSteps(retimed);
  assert.equal(second[2].t, item.cues[2].t + .1);
  assert.equal(second[2].narrationKey, first[2].narrationKey);
  assert.throws(() => getCourseTeachingSteps({ ...item, cues: item.cues.slice(1) }), /Teaching cues for lights/);
  assert.deepEqual(getCourseTeachingSteps({ id: 'unknown' }), []);
});
