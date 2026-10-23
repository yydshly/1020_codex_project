import { readFile, writeFile, mkdir, copyFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tools, glossary } from './content.mjs';
import { summary, summarySvg } from './summary.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadataPath = path.join(root, 'project.json');
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.repositories = tools.map(tool => `https://github.com/${tool.repo}`);
metadata.repo = metadata.repositories[0];
metadata.tool_summaries = tools.map(tool => ({name: tool.name, repo: `https://github.com/${tool.repo}`, summary: tool.summary}));
await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
const output = path.join(root, 'web');
const stat = await lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
if (stat?.isSymbolicLink()) throw new Error('web must be a real project directory');
const evidence = JSON.parse(await readFile(path.join(root, 'notes/sources.json'), 'utf8'));
const lessonTracks = JSON.parse(await readFile(path.join(root, 'src/narration.json'), 'utf8'));
const data = tools.map(tool => {
  const source = evidence.repositories.find(item => item.repository === tool.repo);
  if (!source) throw new Error(`Missing evidence: ${tool.repo}`);
  return { ...tool, evidence: source, runtime: 'not-run' };
});
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'kokoro-learning.js', 'digup-learning.js', 'podcastfy-learning.js', 'video-factory-learning.js', 'shorts-learning.js', 'ldr-learning.js', 'summary-page.js']) {
  await copyFile(path.join(root, 'src', name), path.join(output, name));
}
await writeFile(path.join(output, 'data.js'), `window.RESEARCH = ${JSON.stringify({
  date: evidence.checked_on, tools: data, glossary, lessonTracks, summary
}, null, 2)};\n`, 'utf8');
const poster = summarySvg(data);
await writeFile(path.join(root, 'assets/six-tools-summary.svg'), poster, 'utf8');
await writeFile(path.join(output, 'six-tools-summary.svg'), poster, 'utf8');
await writeFile(path.join(output, 'summary-poster.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>六个 AI 工具 · 理解总图</title><style>html,body{margin:0;padding:0;background:#f6f5f0}img{display:block;width:1920px;height:auto}</style></head><body><img src="./six-tools-summary.svg" alt="六个工具的作用、能力、原理、理解、意义、使用场景与个人价值总图"></body></html>', 'utf8');
// The JPG is a reviewed export of the SVG; refresh it after changing summary content.
await copyFile(path.join(root, 'assets/six-tools-summary.jpg'), path.join(output, 'six-tools-summary.jpg')).catch(error => { if (error.code !== 'ENOENT') throw error; });
await copyFile(path.join(root, 'assets/tool-map.svg'), path.join(output, 'tool-map.svg'));
await mkdir(path.join(output, 'audio'), { recursive: true });
for (const track of lessonTracks) {
  await copyFile(path.join(root, 'assets/audio', `${track.id}.mp3`), path.join(output, 'audio', `${track.id}.mp3`));
}
console.log(`Built six-library research site; ${data.filter(t => t.depth === 'deep').length} deep dive, no claimed runtime results.`);
