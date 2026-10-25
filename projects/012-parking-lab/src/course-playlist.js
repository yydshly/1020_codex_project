const SUBJECTS = [
  { id: 'subject2', label: '科目二' },
  { id: 'subject3', label: '科目三' },
];

/** Join the existing teaching courses without cloning their chapters.
 *
 * Call after attaching teachingSteps when synchronized coaching is wanted.
 * Chapter/poses/cue references and narration keys remain the originals, so the
 * WeakMap-backed physical samplers and the existing MiniMax clips are reused.
 * Section endIndex is exclusive; chapter subject indexes are zero-based and
 * their number fields are one-based for display.
 */
export function createFullCoursePlaylist(courses) {
  const chapters = [], sections = [], subjects = [];
  const ids = new Set();
  for (const subject of SUBJECTS) {
    const course = courses?.[subject.id];
    if (!course || !Array.isArray(course.chapters) || !course.chapters.length) {
      throw new TypeError(`完整演示缺少${subject.label}课程。`);
    }
    const startIndex = chapters.length;
    let duration = 0;
    for (const [index, chapter] of course.chapters.entries()) {
      if (!chapter || typeof chapter.id !== 'string' || !chapter.id || !Number.isFinite(chapter.duration) || chapter.duration <= 0) {
        throw new TypeError(`${subject.label}章节数据不完整。`);
      }
      if (ids.has(chapter.id)) throw new TypeError(`完整演示章节重复：${chapter.id}。`);
      ids.add(chapter.id);
      const playlistIndex = chapters.length;
      chapters.push(chapter);
      duration += chapter.duration;
      subjects.push([chapter.id, {
        id: subject.id, name: course.name || subject.label, label: subject.label,
        index, number: index + 1, total: course.chapters.length,
        playlistIndex, playlistNumber: playlistIndex + 1,
      }]);
    }
    sections.push({ id: subject.id, name: course.name || subject.label, label: subject.label,
      startIndex, endIndex: chapters.length, count: course.chapters.length, duration });
  }
  return {
    id: 'all', name: '科目二 + 科目三 · C1 全量演示',
    summary: `按科目二 ${sections[0].count} 项、科目三 ${sections[1].count} 项连续演示，从倒车入库到靠边停车与安全结束。`,
    scope: '科二、科三通用项目连续教学；各章切换独立教学位置，不是某地实测考场路线、完整实考里程或安全文明理论题库。',
    chapters, sections, chapterSubjects: Object.fromEntries(subjects),
  };
}

/** Find the source subject without guessing from a chapter's name or scene. */
export function getPlaylistChapterSubject(playlist, chapterOrId) {
  const id = typeof chapterOrId === 'string' ? chapterOrId : chapterOrId?.id;
  return typeof id === 'string' && Object.hasOwn(playlist?.chapterSubjects || {}, id)
    ? playlist.chapterSubjects[id] : null;
}
