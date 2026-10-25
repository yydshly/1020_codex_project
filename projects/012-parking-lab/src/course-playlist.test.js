import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAM_COURSES, EXAM_NARRATION, courseDuration, sampleChapterPose } from './exam-courses.js';
import { COURSE_CUE_NARRATION, getCourseTeachingSteps } from './course-coaching.js';
import { createFullCoursePlaylist, getPlaylistChapterSubject } from './course-playlist.js';
import { createCoursePlayback, beginCourseChapter, finishCourseNarration, advanceCoursePlayback,
  courseCueGate, courseTimeline, seekCourseTimeline, toggleCoursePlayback, isCourseOverview } from './course-playback.js';
import { validateSpeechCatalog } from './speech-catalog.js';

const sourceChapters = [...EXAM_COURSES.subject2.chapters, ...EXAM_COURSES.subject3.chapters];
const coachedCourses = Object.fromEntries(Object.entries(EXAM_COURSES).map(([id, course]) => [id, {
  ...course, chapters: course.chapters.map(chapter => ({ ...chapter, teachingSteps: getCourseTeachingSteps(chapter) })),
}]));

test('the complete playlist preserves all 22 chapters in subject order without copying any sampler-backed data', () => {
  const playlist = createFullCoursePlaylist(EXAM_COURSES);
  assert.equal(playlist.id, 'all');
  assert.equal(playlist.chapters.length, 22);
  assert.deepEqual(playlist.chapters.map(chapter => chapter.id), [
    'reverse-parking', 'hill-start', 'side-parking', 'curve-driving', 'right-angle',
    'prepare', 'lights', 'start', 'straight', 'gears', 'lane-change', 'intersection',
    'left-turn', 'right-turn', 'crosswalk', 'school', 'bus', 'meeting', 'overtake', 'uturn', 'night', 'pull-over',
  ]);
  assert.notEqual(playlist.chapters, EXAM_COURSES.subject2.chapters);
  for (const [index, chapter] of playlist.chapters.entries()) {
    assert.equal(chapter, sourceChapters[index]);
    assert.equal(chapter.poses, sourceChapters[index].poses);
    assert.equal(chapter.cues, sourceChapters[index].cues);
    assert.equal(chapter.narrationKey, sourceChapters[index].narrationKey);
    assert.equal(chapter.transition, sourceChapters[index].transition);
  }
  assert.equal(EXAM_COURSES.subject2.chapters.length, 5);
  assert.equal(EXAM_COURSES.subject3.chapters.length, 17);
  assert.equal(courseDuration(playlist), courseDuration(EXAM_COURSES.subject2) + courseDuration(EXAM_COURSES.subject3));
  assert.match(playlist.name, /科目二.*科目三.*全量/);
  assert.match(playlist.summary, /5 项.*17 项/);
  assert.match(playlist.scope, /独立教学位置.*不是.*实考里程/);
});

test('section and per-chapter metadata identify both subjects with local and complete numbering', () => {
  const playlist = createFullCoursePlaylist(EXAM_COURSES);
  assert.deepEqual(playlist.sections.map(({ id, label, startIndex, endIndex, count }) => ({ id, label, startIndex, endIndex, count })), [
    { id: 'subject2', label: '科目二', startIndex: 0, endIndex: 5, count: 5 },
    { id: 'subject3', label: '科目三', startIndex: 5, endIndex: 22, count: 17 },
  ]);
  for (const section of playlist.sections) {
    assert.equal(section.name, EXAM_COURSES[section.id].name);
    assert.equal(section.duration, courseDuration(EXAM_COURSES[section.id]));
    for (let i = section.startIndex; i < section.endIndex; i++) {
      const metadata = getPlaylistChapterSubject(playlist, playlist.chapters[i]);
      assert.equal(metadata.id, section.id);
      assert.equal(metadata.label, section.label);
      assert.equal(metadata.index, i - section.startIndex);
      assert.equal(metadata.number, i - section.startIndex + 1);
      assert.equal(metadata.total, section.count);
      assert.equal(metadata.playlistIndex, i);
      assert.equal(metadata.playlistNumber, i + 1);
      assert.equal(getPlaylistChapterSubject(playlist, playlist.chapters[i].id), metadata);
    }
  }
  assert.equal(getPlaylistChapterSubject(playlist, 'prepare').number, 1);
  assert.equal(getPlaylistChapterSubject(playlist, 'pull-over').number, 17);
  assert.equal(getPlaylistChapterSubject(playlist, 'missing'), null);
  assert.equal(getPlaylistChapterSubject(playlist, '__proto__'), null);
  assert.equal(getPlaylistChapterSubject(null, null), null);
});

test('decorated playlist chapters retain continuous physical sampling at keyframes and between frames', () => {
  const playlist = createFullCoursePlaylist(coachedCourses);
  for (const [index, chapter] of playlist.chapters.entries()) {
    const original = sourceChapters[index];
    const decorated = coachedCourses[getPlaylistChapterSubject(playlist, chapter).id].chapters[getPlaylistChapterSubject(playlist, chapter).index];
    assert.equal(chapter, decorated);
    assert.equal(chapter.poses, original.poses);
    assert.equal(chapter.teachingSteps, decorated.teachingSteps);
    for (const time of [-1, 0, .137, chapter.duration * .237, chapter.duration * .5167, chapter.duration, chapter.duration + 1]) {
      assert.deepEqual(sampleChapterPose(chapter, time), sampleChapterPose(original, time), `${chapter.id} at ${time}`);
    }
  }
});

test('continuous playback voices exactly 22 chapter intros and all 121 operation cues once in order at normal and fast speed', () => {
  const playlist = createFullCoursePlaylist(coachedCourses);
  const expected = playlist.chapters.flatMap(chapter => chapter.teachingSteps.map(step => `${chapter.id}:${step.narrationKey}`));
  const expectedIntros = playlist.chapters.map(chapter => `${chapter.id}:${chapter.narrationKey}`);
  const expectedSequence = playlist.chapters.flatMap(chapter => [`intro:${chapter.narrationKey}`, ...chapter.teachingSteps.map(step => `cue:${step.narrationKey}`)]);
  assert.equal(expected.length, 121);
  for (const rate of [1, 4]) {
    let state = beginCourseChapter({ ...createCoursePlayback(playlist), rate });
    const narrated = [], introduced = [], sequence = [], visited = [];
    for (let i = 0; i < 12000 && state.phase !== 'ended'; i++) {
      if (visited.at(-1) !== state.index) visited.push(state.index);
      if (state.phase === 'narrating') {
        const chapter = state.course.chapters[state.index];
        assert.equal(advanceCoursePlayback(state, .25), state);
        if (state.speechKind === 'intro') {
          assert.equal(isCourseOverview(state), true); assert.equal(state.chapterBriefed, false);
          assert.equal(state.time, 0); assert.equal(state.cueIndex, -1); assert.equal(state.pendingCue, null);
          assert.ok(EXAM_NARRATION[chapter.narrationKey]?.text);
          introduced.push(`${chapter.id}:${chapter.narrationKey}`); sequence.push(`intro:${chapter.narrationKey}`);
        } else {
          assert.equal(state.speechKind, 'cue'); assert.equal(state.chapterBriefed, true);
          const step = chapter.teachingSteps[state.pendingCue];
          assert.equal(state.time, courseCueGate(step), `${chapter.id}/${step.id}: movement waits before the operation`);
          assert.equal(introduced.at(-1), `${chapter.id}:${chapter.narrationKey}`, 'each chapter intro precedes its operation cues');
          narrated.push(`${chapter.id}:${step.narrationKey}`); sequence.push(`cue:${step.narrationKey}`);
        }
        state = finishCourseNarration(state, state.token, 'ended');
      } else state = advanceCoursePlayback(state, .25);
    }
    assert.equal(state.phase, 'ended', `rate ${rate}`);
    assert.equal(state.index, 21);
    assert.deepEqual(visited, Array.from({ length: 22 }, (_, index) => index));
    assert.deepEqual(narrated, expected, `rate ${rate}: no lost, extra or duplicated cues`);
    assert.deepEqual(introduced, expectedIntros, `rate ${rate}: exactly one overview per chapter`);
    assert.equal(introduced.length, 22); assert.equal(narrated.length, 121);
    assert.deepEqual(sequence, expectedSequence, `rate ${rate}: no movement/cue stage can bypass or repeat its opening`);
    assert.deepEqual(courseTimeline(state), { total: courseDuration(playlist), elapsed: courseDuration(playlist) });
  }
});

test('the complete playlist reuses the existing MiniMax cue and overview catalog without requiring new speech', () => {
  const playlist = createFullCoursePlaylist(coachedCourses);
  const keys = playlist.chapters.flatMap(chapter => chapter.teachingSteps.map(step => step.narrationKey));
  assert.equal(new Set(keys).size, 121);
  assert.deepEqual(new Set(keys), new Set(Object.keys(COURSE_CUE_NARRATION)));
  assert.deepEqual(new Set(playlist.chapters.map(chapter => chapter.narrationKey)), new Set(Object.keys(EXAM_NARRATION)));
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/minimax/manifest.json', import.meta.url), 'utf8'));
  const catalog = validateSpeechCatalog(manifest, { ...EXAM_NARRATION, ...COURSE_CUE_NARRATION });
  assert.equal(catalog.provider, 'minimax');
  assert.equal(Object.keys(catalog.clips).length, 143);
  for (const key of keys) {
    assert.equal(catalog.clips[key].text, COURSE_CUE_NARRATION[key].text);
    assert.equal(catalog.clips[key].file, manifest.clips[key].file);
  }
});

test('muting still traverses both subjects and seeking the subject boundary lands on subject three preparation', () => {
  const playlist = createFullCoursePlaylist(coachedCourses);
  let state = beginCourseChapter({ ...createCoursePlayback(playlist), voice: false, rate: 4 });
  const visited = [];
  for (let i = 0; i < 1500 && state.phase !== 'ended'; i++) {
    if (visited.at(-1) !== state.index) visited.push(state.index);
    assert.equal(state.phase, 'playing');
    state = advanceCoursePlayback(state, .25);
  }
  assert.equal(state.phase, 'ended');
  assert.deepEqual(visited, Array.from({ length: 22 }, (_, index) => index));
  const boundary = courseDuration(EXAM_COURSES.subject2);
  const selected = seekCourseTimeline(createCoursePlayback(playlist), boundary);
  assert.equal(selected.index, 5);
  assert.equal(selected.time, 0);
  assert.equal(selected.phase, 'paused');
  assert.equal(getPlaylistChapterSubject(playlist, selected.course.chapters[selected.index]).id, 'subject3');
  assert.equal(toggleCoursePlayback(selected).pendingCue, 0);
});

test('partial or ambiguous input cannot silently produce an incomplete full-course entry', () => {
  assert.throws(() => createFullCoursePlaylist(), /缺少科目二/);
  assert.throws(() => createFullCoursePlaylist({ subject2: EXAM_COURSES.subject2 }), /缺少科目三/);
  assert.throws(() => createFullCoursePlaylist({ ...EXAM_COURSES, subject3: { chapters: [] } }), /缺少科目三/);
  const duplicate = { ...EXAM_COURSES.subject3, chapters: [EXAM_COURSES.subject2.chapters[0]] };
  assert.throws(() => createFullCoursePlaylist({ ...EXAM_COURSES, subject3: duplicate }), /章节重复/);
  const invalid = { ...EXAM_COURSES.subject3, chapters: [{ id: 'invalid', duration: NaN }] };
  assert.throws(() => createFullCoursePlaylist({ ...EXAM_COURSES, subject3: invalid }), /章节数据不完整/);
});
