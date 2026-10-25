#!/usr/bin/env node
// Check the public progress page against the real curriculum and built files.
// Optional local preview check: --base=http://127.0.0.1:4312
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSE_DIRECTORY, PARKING_ENTRIES, ROADMAP, resolveParkingEntry, courseHref, parkingHref } from '../src/progress-catalog.js';
import { EXAM_COURSES } from '../src/exam-courses.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const builtRoot = resolve(root, 'web');
const localOrigin = new URL('http://progress-check.local/');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assets = new Map();
let base = null;

function attrs(tag) {
  const values = {};
  for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  return values;
}
async function read(path, label = relative(root, path)) {
  try {
    const value = await readFile(path);
    check(value.length > 0, `${label}: file is empty`);
    return value;
  } catch (error) {
    failures.push(`${label}: ${error.code || error.message}`);
    return null;
  }
}
async function collectBuiltAsset(href, parent = new URL('progress.html', localOrigin)) {
  let url;
  try { url = new URL(href, parent); } catch { failures.push(`Invalid built asset URL: ${href}`); return; }
  if (url.origin !== localOrigin.origin) { failures.push(`Progress asset is not local: ${href}`); return; }
  const key = url.pathname;
  if (assets.has(key)) return;
  const path = resolve(builtRoot, `.${decodeURIComponent(key)}`), inside = relative(builtRoot, path);
  if (inside.startsWith('..') || isAbsolute(inside)) { failures.push(`Asset leaves web directory: ${href}`); return; }
  const bytes = await read(path);
  if (!bytes) return;
  assets.set(key, bytes);
  if (extname(path) === '.js') {
    const source = bytes.toString('utf8');
    // Vite emits evidence image references relative to the current JS module.
    for (const match of source.matchAll(/new URL\(\s*([`'"])([^`'"]+\.(?:png|webp|jpe?g))\1\s*,\s*import\.meta\.url\s*\)/g)) {
      await collectBuiltAsset(match[2], url);
    }
    for (const match of source.matchAll(/\b(?:from\s*|import\s*)([`'"])(\.[^`'"]+\.js)\1/g)) await collectBuiltAsset(match[2], url);
  }
}
function destination(href, ids, label) {
  if (!nonempty(href)) return;
  let url;
  try { url = new URL(href, new URL('progress.html', localOrigin)); } catch { check(false, `${label}: invalid destination`); return; }
  check(url.origin === localOrigin.origin, `${label}: external destination is not an existing local feature`);
  if (href.startsWith('#')) { check(ids.has(decodeURIComponent(url.hash.slice(1))), `${label}: missing section ${href}`); return; }
  if (url.pathname === '/courses.html') {
    const id = url.searchParams.get('course'), chapter = url.searchParams.get('chapter');
    check(id === 'all' || Boolean(EXAM_COURSES[id]), `${label}: unknown course ${id}`);
    if (chapter) check(Boolean(EXAM_COURSES[id]?.chapters.some(item => item.id === chapter)), `${label}: unknown chapter ${chapter}`);
    check(!url.searchParams.has('mode') || url.searchParams.get('mode') === 'drive', `${label}: unknown practice mode`);
  } else if (url.pathname === '/' || url.pathname === '/index.html') {
    check(Boolean(resolveParkingEntry(url.search)), `${label}: unavailable parking entry`);
  } else check(false, `${label}: unsupported local destination ${url.pathname}`);
}

try {
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith('--base=') || base) throw new Error('Usage: node scripts/verify-project-progress.mjs [--base=http://127.0.0.1:4312]');
    base = new URL(arg.slice('--base='.length));
    if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
      || base.username || base.password || base.search || base.hash) throw new Error('--base must be a loopback HTTP(S) URL without credentials, query or fragment');
    if (!base.pathname.endsWith('/')) base.pathname += '/';
  }

  const courses = COURSE_DIRECTORY.map(item => item.id);
  check(new Set(courses).size === courses.length, 'Duplicate course IDs');
  check(courses.length === Object.keys(EXAM_COURSES).length && courses.every(id => EXAM_COURSES[id]), 'Course directory differs from actual courses');
  let chapters = 0;
  for (const course of COURSE_DIRECTORY) {
    const actual = EXAM_COURSES[course.id]?.chapters || [];
    check(JSON.stringify(course.chapters) === JSON.stringify(actual.map(item => [item.id, item.title])), `${course.id}: chapter IDs, titles or order differ from actual curriculum`);
    for (const [id] of course.chapters) for (const drive of [false, true]) {
      const href = new URL(courseHref(course.id, id, drive), localOrigin);
      check(href.pathname === '/courses.html' && href.searchParams.get('course') === course.id && href.searchParams.get('chapter') === id,
        `${course.id}/${id}: wrong chapter destination`);
      check(drive ? href.searchParams.get('mode') === 'drive' : !href.searchParams.has('mode'), `${course.id}/${id}: demo/drive mode mismatch`);
      check([...href.searchParams.keys()].length === (drive ? 3 : 2), `${course.id}/${id}: unexpected query parameter`);
    }
    chapters += course.chapters.length;
  }
  check(chapters === 22, `Expected 22 curriculum chapters, got ${chapters}`);

  const whitelist = ['beginner', 'voice', 'practice', 'judgment', 'correction'];
  check(PARKING_ENTRIES.length === 5 && new Set(PARKING_ENTRIES.map(item => item.id)).size === 5
    && whitelist.every(id => PARKING_ENTRIES.some(item => item.id === id)), 'Parking entry whitelist must contain the five real training modes');
  for (const entry of PARKING_ENTRIES) {
    for (const key of ['id', 'title', 'text', 'action']) check(nonempty(entry[key]), `${entry.id}: missing parking ${key}`);
    const href = new URL(parkingHref(entry.id), localOrigin);
    check(href.pathname === '/' && resolveParkingEntry(href.search) === entry.id, `${entry.id}: parking destination does not resolve`);
  }
  for (const search of ['', '?entry=', '?entry=unknown', '?entry=__proto__', '?entry=constructor', '?entry=VOICE', '?entry=%2e%2e%2f', '?entry=javascript%3Aalert(1)']) {
    check(resolveParkingEntry(search) === null, `Illegal parking entry accepted: ${search || '(empty)'}`);
  }

  const page = await read(resolve(root, 'progress.html'));
  const ids = new Set([...(page?.toString('utf8') || '').matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
  for (const item of ROADMAP) ids.add(item.id);
  check(ROADMAP.length > 0 && new Set(ROADMAP.map(item => item.id)).size === ROADMAP.length, 'Roadmap is empty or has duplicate IDs');
  for (const item of ROADMAP) {
    for (const key of ['id', 'priority', 'category', 'title', 'status', 'current', 'next', 'acceptance', 'dependency', 'href', 'link']) check(nonempty(item[key]), `${item.id || 'roadmap'}: missing ${key}`);
    check(['next', 'later', 'future'].includes(item.priority), `${item.id}: unknown priority`);
    destination(item.href, ids, item.id);
  }
  for (const name of ['index.html', 'courses.html']) {
    const source = (await read(resolve(root, name)))?.toString('utf8') || '';
    const links = [...source.matchAll(/<a\b[^>]*>/gi)].map(match => attrs(match[0])).filter(item => item.href && new URL(item.href, localOrigin).pathname === '/progress.html');
    check(links.length > 0, `${name}: missing progress page link`);
    check(links.every(item => item.target === '_blank'), `${name}: progress link must open a new tab to preserve the active practice`);
  }

  const progressSource = (await read(resolve(root, 'src/progress.js')))?.toString('utf8') || '';
  const evidence = [...progressSource.matchAll(/\bimport\s+\w+\s+from\s+['"]([^'"]+\.(md|png)(?:\?raw)?)['"]/g)];
  check(evidence.filter(match => match[2] === 'md').length === 4, 'Progress source must include four original verification records');
  check(evidence.filter(match => match[2] === 'png').length === 2, 'Progress source must include two screenshot artifacts');
  for (const match of evidence) {
    const path = resolve(root, 'src', match[1].split('?')[0]);
    const bytes = await read(path);
    // The browser screenshot tool can return JPEG bytes under a .png artifact
    // filename; both are browser-readable. Reject an empty/HTML impostor, not
    // a valid captured screenshot solely because its filename differs.
    if (bytes && match[2] === 'png') check(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])), `${relative(root, path)}: screenshot is not PNG/JPEG data`);
  }
  const built = await read(resolve(builtRoot, 'progress.html'));
  if (built) {
    assets.set('/progress.html', built);
    const tags = [...built.toString('utf8').matchAll(/<(?:script|link)\b[^>]*>/gi)].map(match => attrs(match[0]));
    const references = tags.map(item => item.src || item.href).filter(href => href && /\.(?:js|css)(?:[?#]|$)/.test(href));
    check(references.some(href => /\.js(?:[?#]|$)/.test(href)) && references.some(href => /\.css(?:[?#]|$)/.test(href)), 'Built progress page is missing its JavaScript or CSS');
    for (const href of references) await collectBuiltAsset(href);
  }

  if (base) {
    for (const path of ['index.html', 'courses.html']) {
      const bytes = await read(resolve(builtRoot, path)); if (bytes) assets.set(`/${path}`, bytes);
    }
    await Promise.all([...assets].map(async ([path, expected]) => {
      const url = new URL(path.slice(1), base);
      try {
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
        check(response.ok, `HTTP ${response.status}: ${url.pathname}`);
        if (response.ok) check(digest(Buffer.from(await response.arrayBuffer())) === digest(expected), `Served file differs from built artifact: ${url.pathname}`);
      } catch (error) { check(false, `HTTP ${url.pathname}: ${error.message}`); }
    }));
  }
  if (failures.length) throw new Error(failures.join('\n- '));
  console.log(`Progress verified: ${chapters} chapters / 44 demo-drive links, ${PARKING_ENTRIES.length} parking entries, ${ROADMAP.length} complete roadmap items.`);
  console.log(`Sources: 2 new-tab links, 4 records, 2 PNGs; built page and ${assets.size - (base ? 3 : 1)} static assets valid${base ? `; ${assets.size} loopback HTTP responses match built bytes` : ''}.`);
} catch (error) {
  console.error(`Progress verification failed:\n- ${error.message}`);
  process.exitCode = 1;
}
