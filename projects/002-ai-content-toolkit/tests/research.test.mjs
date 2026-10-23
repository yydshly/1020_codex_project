import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { tools } from '../src/content.mjs';

const evidence = JSON.parse(await readFile(new URL('../notes/sources.json', import.meta.url), 'utf8'));
test('every authored capability and flow stage resolves to inspected evidence', () => {
  for (const tool of tools) {
    const repo = evidence.repositories.find(item => item.repository === tool.repo);
    assert.ok(repo, `No repository evidence for ${tool.name}`);
    const paths = new Set(repo.inspected_files.map(file => file.path));
    for (const item of [...tool.capabilities, ...tool.stages, ...tool.insights]) {
      assert.ok(item.source === 'README' || item.source.startsWith('https://') || paths.has(item.source), `${tool.name}: unknown evidence ${item.source}`);
    }
  }
});
test('learning order is unique and supports sequential navigation', () => {
  assert.deepEqual(tools.map(tool => tool.level), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(tools.map(tool => tool.id)).size, 6);
  assert.deepEqual(tools.filter(tool => tool.depth === 'deep').map(tool => tool.id), ['kokoro', 'digup', 'podcastfy', 'video-factory', 'shorts', 'ldr']);
});
test('built content preserves six tools, pinned commits and untested runtime status', async () => {
  const code = await readFile(new URL('../web/data.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(code, context);
  const built = context.window.RESEARCH.tools;
  assert.equal(built.length, 6);
  for (const tool of built) {
    assert.equal(tool.runtime, 'not-run');
    assert.match(tool.evidence.commit, /^[a-f0-9]{40}$/);
    assert.ok(tool.evidence.inspected_files.every(file => file.url.includes(tool.evidence.commit)));
    assert.ok(tool.stages.length >= 3);
    assert.ok(tool.experiment.metrics.length >= 3);
  }
});
test('site resources remain relative for project subpath and offline file use', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('src="./data.js"'));
  assert.ok(html.includes('src="./app.js"'));
  assert.ok(html.includes('href="./styles.css"'));
  assert.ok(!html.includes('type="module"'), 'File preview should not need module fetch');
});
