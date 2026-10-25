import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCoursePracticeView, restoreCoursePracticeView, captureCoursePracticeReturn, resolveCoursePracticeReturn, practiceDemoTime } from './course-practice-view.js';
import { COURSE_GAZES } from './course-observation.js';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { createCoursePractice, recordCourseObservation, finishCoursePractice } from './course-practice.js';
import { createCourseDrivingSession } from './course-driving.js';
import { createCoursePlayback, selectCourseChapter } from './course-playback.js';

test('practice left mirror survives a demonstration that looks right and adjusts its mirrors', () => {
  const current = { view: 'driver', gaze: 'left', mirrorZoom: 'left', mirrorZoomProjection: 'driver', mirrorProfile: 'parking',
    mirrorSettings: { seatHeight: 1.25, parking: { left: { yaw: 10, pitch: -19 } } }, interior: { yaw: 1, pitch: -2 } };
  const saved = captureCoursePracticeView(current);
  current.gaze = 'right'; current.mirrorZoom = 'right'; current.mirrorSettings.parking.left.yaw = 22; current.interior.yaw = 8;
  const returned = restoreCoursePracticeView(saved);
  assert.equal(returned.gaze, 'left'); assert.equal(returned.mirrorZoom, 'left');
  assert.equal(returned.mirrorSettings.parking.left.yaw, 10); assert.equal(returned.interior.yaw, 1);
});

test('repeated returns cannot mutate the saved seat, both mirror profiles or interior adjustment', () => {
  const saved = captureCoursePracticeView({ mirrorSettings: { road: { left: { yaw: 3 } }, parking: { right: { yaw: 12 } }, seatFore: 1.1 }, interior: { pitch: 2 } });
  const returned = restoreCoursePracticeView(saved); returned.mirrorSettings.road.left.yaw = 99; returned.mirrorSettings.parking.right.yaw = -99;
  returned.mirrorSettings.seatFore = .9; returned.interior.pitch = 10;
  assert.deepEqual(restoreCoursePracticeView(saved).mirrorSettings, saved.mirrorSettings);
  assert.equal(restoreCoursePracticeView(saved).interior.pitch, 2);
});

test('all actual observation directions, scene views and optional zoom projection round trip', () => {
  for (const gaze of COURSE_GAZES) for (const view of ['driver', 'orbit', 'top', 'controls']) {
    const saved = captureCoursePracticeView({ view, gaze, mirrorZoom: 'right', mirrorZoomProjection: 'unfolded', mirrorProfile: 'parking' });
    assert.equal(restoreCoursePracticeView(saved).gaze, gaze); assert.equal(restoreCoursePracticeView(saved).view, view);
    assert.equal(restoreCoursePracticeView(saved).mirrorZoomProjection, 'unfolded');
  }
});

test('missing or stale camera values fail safely without inventing progress or observation events', () => {
  assert.deepEqual(restoreCoursePracticeView(null), { view: 'driver', gaze: 'forward', mirrorZoom: null, mirrorZoomProjection: 'driver', mirrorProfile: 'road', mirrorSettings: null, interior: null });
  const restored = restoreCoursePracticeView({ view: 'fly', gaze: 'mirror-left', mirrorZoom: 'rear', progress: 1, observationCount: 99 });
  assert.equal(restored.view, 'driver'); assert.equal(restored.gaze, 'forward'); assert.equal(restored.mirrorZoom, null);
  assert.equal('progress' in restored, false); assert.equal('observationCount' in restored, false);
});

test('a review detour keeps its original course, chapter, metrics and view after the demo moves to a different course', () => {
  const course = EXAM_COURSES.subject2, chapter = course.chapters[0], pose = sampleChapterPose(chapter, 55);
  const driving = createCourseDrivingSession(chapter, pose);
  let session = createCoursePractice(chapter, { driving, initialPose: pose });
  session = recordCourseObservation(session, 'right', pose);
  session = recordCourseObservation(session, 'left', pose);
  session = finishCoursePractice(session);
  const playback = selectCourseChapter(createCoursePlayback(course), 0, 55);
  const observation = { view: 'driver', gaze: 'left', mirrorZoom: 'left', mirrorZoomProjection: 'unfolded', mirrorSettings: { parking: { right: { yaw: 6.1 } } } };
  const saved = captureCoursePracticeReturn({ playback, session, driving, observation, recentRisk: { title: '需核对库侧线' } });
  const unrelatedDemo = selectCourseChapter(createCoursePlayback(EXAM_COURSES.subject3), 8, 20);
  observation.gaze = 'right'; observation.mirrorSettings.parking.right.yaw = 20;
  const target = resolveCoursePracticeReturn(saved, EXAM_COURSES);
  assert.equal(unrelatedDemo.course.id, 'subject3');
  assert.equal(target.course.id, 'subject2'); assert.equal(target.index, 0); assert.equal(target.time, 55);
  assert.strictEqual(saved.session, session); assert.strictEqual(saved.driving, driving);
  assert.equal(saved.session.review.metrics.observations, 2);
  assert.equal(saved.observation.gaze, 'left'); assert.equal(saved.observation.mirrorZoomProjection, 'unfolded');
  assert.equal(saved.observation.mirrorSettings.parking.right.yaw, 6.1);
  assert.equal(saved.recentRisk.title, '需核对库侧线');
});

test('missing destinations cannot silently redirect a saved drive to a different chapter', () => {
  assert.equal(resolveCoursePracticeReturn(null, EXAM_COURSES), null);
  assert.equal(resolveCoursePracticeReturn({ courseId: 'subject2', chapterId: 'removed', session: {}, driving: {} }, EXAM_COURSES), null);
  assert.equal(captureCoursePracticeReturn({ playback: createCoursePlayback(EXAM_COURSES.subject2) }), null);
});

test('revisiting the same bay and returning to the start choose the current route leg rather than the first overlapping XY point', () => {
  const chapter = EXAM_COURSES.subject2.chapters[0];
  for (const t of [55, 65, 69]) {
    const pose = sampleChapterPose(chapter, t), session = createCoursePractice(chapter, { initialPose: pose });
    const oldNearest = session.reference.reduce((a, b) => Math.hypot(b.x - pose.x, b.z - pose.z) < Math.hypot(a.x - pose.x, a.z - pose.z) ? b : a);
    assert.ok(oldNearest.t < 20, 'the old positional match really returns to the wrong leg');
    assert.ok(Math.abs(practiceDemoTime(session) - (t - 2.5)) < .3);
  }
  assert.equal(practiceDemoTime(createCoursePractice(chapter, { initialPose: sampleChapterPose(chapter, 0) })), 0);
  assert.equal(practiceDemoTime(null, 12), 12);
});
