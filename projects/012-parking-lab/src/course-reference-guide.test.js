import test from 'node:test';
import assert from 'node:assert/strict';
import { courseMirrorReferenceGuide, courseMirrorRecognitionSummary } from './course-reference-guide.js';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { getCourseTeachingSteps } from './course-coaching.js';
import { mirrorObservation } from './mirror-observation.js';
import { recommendCourseMirrorSettings, resolveCourseMirrorSettings, restoreCourseMirrorSettings } from './course-mirror-settings.js';

test('the actual default parking mirrors cannot promise the invisible turn reference', () => {
  const chapter = EXAM_COURSES.subject2.chapters.find(c => c.id === 'reverse-parking');
  const settings = resolveCourseMirrorSettings(recommendCourseMirrorSettings(restoreCourseMirrorSettings(null), 'parking').settings, 'parking');
  for (const [id, side, direction] of [['right_turn', 'right', '右'], ['left_turn', 'left', '左']]) {
    const step = getCourseTeachingSteps(chapter).find(s => s.id === `reverse-parking:${id}`);
    const observation = mirrorObservation(sampleChapterPose(chapter, step.t), side, settings);
    assert.equal(observation.cornerVisible, false);
    assert.equal(observation.lineVisible, false);
    const guide = courseMirrorReferenceGuide({ chapterId: chapter.id, stepId: step.id, side, observation });
    assert.equal(guide.kind, 'line-missing');
    assert.match(guide.see, /尚未/); assert.match(guide.act, new RegExp(`向${direction}转向`));
    assert.match(guide.act, /不按播放秒数/); assert.match(guide.caution, /不等于实车/);
  }
});

test('reference loss, short stripes and unavailable corners have distinct guidance', () => {
  const base = { chapterId: 'reverse-parking', stepId: 'reverse-parking:right_turn', side: 'right' };
  assert.equal(courseMirrorReferenceGuide({ ...base, observation: { body: { visible: false } } }).kind, 'body-missing');
  assert.equal(courseMirrorReferenceGuide({ ...base, observation: { body: { visible: true }, lineVisible: true, lineReadable: false } }).kind, 'line-short');
  assert.equal(courseMirrorReferenceGuide({ ...base, observation: { body: { visible: true }, lineVisible: true, lineReadable: true, cornerVisible: false } }).kind, 'corner-missing');
});

test('positive aperture checks never claim renderer visibility; other yards are not treated as the bay', () => {
  const input = { chapterId: 'reverse-parking', stepId: 'reverse-parking:right_center', side: 'left', observation: { body: { visible: true }, lineVisible: true, lineReadable: true, cornerVisible: true } };
  assert.equal(courseMirrorReferenceGuide(input), null);
  assert.equal(courseMirrorReferenceGuide({ ...input, chapterId: 'side-parking', observation: { lineVisible: false } }), null);
  assert.equal(courseMirrorReferenceGuide({ ...input, side: 'rear' }), null);
  assert.equal(courseMirrorReferenceGuide({ ...input, observation: {} }), null);
});

test('real occlusion and a too-fine displayed body edge are distinguished from a missing bay line', () => {
  const base = { chapterId: 'reverse-parking', stepId: 'reverse-parking:right_turn', side: 'right' };
  const tested = { occlusionChecked: true, visibility: 'scene-tested', body: { visible: true, readable: false, pixelSpan: 1.2 }, lineVisible: false };
  const small = courseMirrorReferenceGuide({ ...base, observation: tested });
  assert.equal(small.kind, 'body-small'); assert.match(small.see, /同视野放大/);
  const blocked = courseMirrorReferenceGuide({ ...base, observation: { ...tested, body: { visible: false, readable: false } } });
  assert.equal(blocked.kind, 'body-missing'); assert.match(blocked.see, /遮挡/);
  const partial = { ...tested, body: { visible: true, readable: false, readabilityUncertain: true } };
  assert.equal(courseMirrorReferenceGuide({ ...base, observation: partial }).kind, 'body-obscured');
  assert.match(courseMirrorRecognitionSummary({ ...base, observation: partial }), /部分遮挡/);
  const line = courseMirrorReferenceGuide({ ...base, observation: { ...tested, body: { visible: true, readable: true } } });
  assert.equal(line.kind, 'line-missing'); assert.match(line.see, /车体遮住/);
});

test('manual and road mirror hints can describe a tested body without inventing a parking bay', () => {
  const result = courseMirrorReferenceGuide({ chapterId: 'school', side: 'right', observation: {
    occlusionChecked: true, visibility: 'scene-tested', body: { visible: true, readable: false },
  } });
  assert.equal(result.kind, 'body-small'); assert.doesNotMatch(result.see, /库角|库侧线/);
  assert.equal(result.act, null);
});

test('missing physical paint is described as a scene reference problem instead of asking the learner to keep adjusting mirrors', () => {
  const observation = { visibility: 'scene-tested', occlusionChecked: true, body: { visible: true, readable: true }, lineVisible: false, lineReadable: false, line: { reason: 'surface-missing' } };
  const input = { chapterId: 'reverse-parking', side: 'right', observation };
  const guide = courseMirrorReferenceGuide(input);
  assert.equal(guide.kind, 'line-unavailable'); assert.match(guide.see, /真实库侧线/);
  assert.match(guide.caution, /不是靠反复调镜/);
  assert.match(courseMirrorRecognitionSummary(input), /场景参照不可用/);
  assert.equal(courseMirrorRecognitionSummary({ chapterId: 'reverse-parking', observation: { body: { visible: true, readable: true }, lineVisible: true, lineReadable: true } }), '');
  assert.equal(courseMirrorRecognitionSummary({ chapterId: 'school', observation }), '车身：内缘窄条可辨');
  assert.match(courseMirrorRecognitionSummary({ ...input, observation: { ...observation, line: { reason: 'too-small' }, lineVisible: true } }), /片段过短/);
});
