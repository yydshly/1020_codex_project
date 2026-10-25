import './progress.css';
import { PARKING_ENTRIES, COURSE_DIRECTORY, FEATURES, LEARNING_LOOP, ROADMAP, MILESTONES, courseHref, parkingHref } from './progress-catalog.js';
import noviceRecord from '../notes/novice-flow-20261025/verification.md?raw';
import accuracyRecord from '../notes/course-reaudit-20261025/verification.md?raw';
import mirrorRecord from '../notes/mirror-contact-full-demo-20261025/verification.md?raw';
import courseRecord from '../notes/full-courses-20261024/verification.md?raw';
import mirrorEvidence from '../notes/novice-flow-20261025/10-final-parking-auto-left.png';
import reviewEvidence from '../notes/novice-flow-20261025/12-final-review-guidance.png';

const $ = id => document.getElementById(id);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const link = (text, href, className = 'text-link') => {
  const node = element('a', className, text); node.href = href; return node;
};
for (const entry of PARKING_ENTRIES) {
  const card = element('article', 'parking-card');
  card.append(element('span', 'pill', '可体验'), element('h4', '', entry.title), element('p', '', entry.text), link(`${entry.action} ↗`, parkingHref(entry.id)));
  $('parking-entries').append(card);
}
let chapterNumber = 0;
for (const course of COURSE_DIRECTORY) {
  const group = element('section', 'directory-group'), heading = element('div', 'directory-heading');
  heading.append(element('h3', '', `${course.name} · ${course.chapters.length} 章`), element('span', '', course.description));
  group.append(heading);
  const list = element('ol', 'chapter-list'); list.start = chapterNumber + 1;
  for (const [id, title] of course.chapters) {
    chapterNumber++;
    const item = element('li'), name = element('div', 'chapter-name');
    name.append(element('span', '', String(chapterNumber).padStart(2, '0')), element('strong', '', title));
    const actions = element('div', 'chapter-links');
    actions.append(link('看示范 ↗', courseHref(course.id, id)), link('自己驾驶 ↗', courseHref(course.id, id, true)));
    for (const a of actions.children) a.setAttribute('aria-label', `${title} · ${a.textContent}`);
    item.append(name, actions); list.append(item);
  }
  group.append(list); $('course-directory').append(group);
}
for (const feature of FEATURES) {
  const card = element('article', 'feature-card'), top = element('div', 'feature-top');
  top.append(element('span', 'feature-number', feature.no), element('span', 'pill', '已可体验'));
  card.append(top, element('h3', '', feature.title), element('p', '', feature.text), element('p', 'feature-scope', feature.scope), link(`${feature.link} →`, feature.href));
  $('feature-grid').append(card);
}
MILESTONES.forEach(([title, text], i) => {
  const item = element('li'); item.append(element('span', '', String(i + 1).padStart(2, '0')), element('strong', '', title), element('p', '', text)); $('milestone-list').append(item);
});
LEARNING_LOOP.forEach((step, i) => {
  const item = element('li'); item.append(element('span', 'loop-number', String(i + 1).padStart(2, '0')), element('h3', '', step.title), element('p', '', step.text)); $('loop-list').append(item);
});
const priorityName = { next: '优先补强', later: '后续建设', future: '远期扩展' };
for (const item of ROADMAP) {
  const card = element('details', 'roadmap-card'); card.id = item.id; card.dataset.priority = item.priority;
  const summary = element('summary'), title = element('div', 'roadmap-title'), meta = element('div', 'roadmap-meta');
  meta.append(element('span', `priority priority-${item.priority}`, priorityName[item.priority]), element('span', '', item.category));
  title.append(meta, element('h3', '', item.title), element('span', 'roadmap-status', item.status));
  summary.append(title, element('span', 'expand-mark', '+')); card.append(summary);
  const body = element('div', 'roadmap-body'), definition = element('dl');
  for (const [label, text] of [['现在到哪里', item.current], ['接下来怎么做', item.next], ['怎样才算完成', item.acceptance], ['接入条件', item.dependency]]) {
    const row = element('div'); row.append(element('dt', '', label), element('dd', '', text)); definition.append(row);
  }
  body.append(definition, link(`${item.link} →`, item.href)); card.append(body); $('roadmap-list').append(card);
}
function filterRoadmap(filter) {
  let count = 0;
  for (const card of $('roadmap-list').children) { card.hidden = filter !== 'all' && card.dataset.priority !== filter; if (!card.hidden) count++; }
  document.querySelectorAll('[data-roadmap-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.roadmapFilter === filter)));
  $('roadmap-result').textContent = `显示 ${count} / ${ROADMAP.length} 项`;
}
document.querySelectorAll('[data-roadmap-filter]').forEach(button => button.addEventListener('click', () => filterRoadmap(button.dataset.roadmapFilter)));
filterRoadmap('all');

const records = [
  ['novice-record', '新手五步流程复查 · 最新训练验收', noviceRecord],
  ['accuracy-record', '路口、低速区域、镜面与示范返回复查', accuracyRecord],
  ['mirror-record', '外镜壳／支架擦碰与全量入口验收', mirrorRecord],
  ['course-record', '科二科三全项目初版 · 历史基线', courseRecord],
];
for (const [id, title, text] of records) {
  const details = element('details', 'record-panel'); details.id = id;
  details.append(element('summary', '', title));
  const content = element('div', 'record-content');
  content.append(element('p', 'record-note', '原始验收文字；测试数与资源版本以该次记录为准，历史状态不代表当前所有限制。'), element('pre', '', text));
  details.append(content); $('verification-records').append(details);
}
$('evidence-mirror').src = mirrorEvidence; $('evidence-review').src = reviewEvidence;

function revealAnchor() {
  let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = id && document.getElementById(id); if (!target) return;
  const roadmapCard = target.closest('.roadmap-card');
  if (roadmapCard) { filterRoadmap('all'); roadmapCard.open = true; }
  if (target.matches('details')) target.open = true;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.matches('details')) parent.open = true;
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}
addEventListener('hashchange', revealAnchor); if (location.hash) revealAnchor();
