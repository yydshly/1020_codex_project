import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const cases = JSON.parse(await readFile(new URL('showcase/cases.json', root), 'utf8'));
const raw = await readFile(new URL('.runtime/showcase/results.json', root));
const results = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
if (!Array.isArray(results.results) || results.results.length !== cases.length) throw Error('Incomplete run');
const ids = new Set();
for (const row of results.results) {
  if (!cases.some(c => c.id === row.id) || ids.has(row.id) || typeof row.answer !== 'string' || !row.answer.trim()) throw Error('Invalid result');
  ids.add(row.id);
}
const events = (await readFile(new URL('.runtime/showcase/events.jsonl', root), 'utf8')).replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => JSON.parse(line));
const sessionId = events.find(e => e.type === 'thread.started')?.thread_id;
if (!sessionId || !events.some(e => e.type === 'turn.completed')) throw Error('Run did not complete');
await copyFile(new URL('.runtime/showcase/results.json', root), new URL('showcase/results.json', root));
await copyFile(new URL('.runtime/showcase/sources.json', root), new URL('showcase/sources.json', root));
const meta = { date: '2026-10-20', host: 'Codex CLI 0.152.1 / 本机登录的模型服务', commit: '19496aaba767bc6b594d1e32f51eda3ee038ef5a', sessionId, outputSha256: createHash('sha256').update(raw).digest('hex'), cases: cases.length, method: 'Single batch model call; original Skill + reference texts supplied verbatim; synthetic inputs; no control group.' };
await writeFile(new URL('showcase/meta.json', root), JSON.stringify(meta, null, 2));
console.log(`Verified and copied ${cases.length} unchanged model outputs. Session ${sessionId}`);
