// SPDX-License-Identifier: GPL-3.0-only
// Verify the published map's provenance, payload and local dependency closure.
// Browser rendering, gestures and lifecycle acceptance are documented separately.
import assert from 'node:assert/strict';
import {readFile, readdir, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.resolve(project, '../..');
const runtime = path.join(project, 'web/integrations/atlas');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const forward = value => value.split(path.sep).join('/');
const within = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const safePath = (root, relative) => {
  assert.ok(typeof relative === 'string' && relative && !relative.includes('\\') && !path.isAbsolute(relative), `Unsafe path: ${relative}`);
  assert.ok(!relative.split('/').some(segment => segment === '..' || segment === '.'), `Unsafe path: ${relative}`);
  const target = path.resolve(root, relative);
  assert.ok(within(root, target), `Path escaped root: ${relative}`);
  return target;
};
const manifest = JSON.parse(await readFile(path.join(runtime, 'integration-source.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'Missing published file inventory');
assert.equal(manifest.totalFiles, manifest.files.length);
const runtimeReal = await realpath(runtime);
const workspaceReal = await realpath(workspace);
const entries = new Map();
let totalBytes = 0, sourceFiles = 0, changedFiles = 0;
for (const entry of manifest.files) {
  assert.ok(!entries.has(entry.path), `Duplicate published file: ${entry.path}`);
  const absolute = safePath(runtime, entry.path);
  assert.ok(within(runtimeReal, await realpath(absolute)), `Linked runtime file escaped package: ${entry.path}`);
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, entry.bytes, `Size mismatch: ${entry.path}`);
  assert.equal(digest(bytes), entry.sha256, `Published checksum mismatch: ${entry.path}`);
  totalBytes += bytes.length;
  if (entry.source) {
    const source = safePath(workspace, entry.source);
    assert.ok(within(workspaceReal, await realpath(source)), `Linked source escaped workspace: ${entry.source}`);
    const sourceBytes = await readFile(source);
    assert.equal(digest(sourceBytes), entry.sourceSha256, `Source changed since packaging: ${entry.source}`);
    if (entry.reviewedSha256) assert.equal(entry.sourceSha256, entry.reviewedSha256, `Reviewed source differs: ${entry.source}`);
    if (!entry.modified) assert.equal(entry.sha256, entry.sourceSha256, `Unreported modification: ${entry.path}`);
    sourceFiles++;
  } else assert.equal(entry.generated, true, `File has neither source nor generation record: ${entry.path}`);
  if (entry.modified) {
    assert.ok(entry.source && entry.sha256 !== entry.sourceSha256, `Modified file lacks different source: ${entry.path}`);
    assert.ok(Array.isArray(entry.modifications) && entry.modifications.every(value => typeof value === 'string' && value.length > 15), `Modification lacks explanation: ${entry.path}`);
    changedFiles++;
  }
  entries.set(entry.path, {entry, bytes});
}
assert.equal(totalBytes, manifest.totalPayloadBytes, 'Payload size is inconsistent');
assert.deepEqual([...manifest.integration.modifiedFiles].sort(), manifest.files.filter(entry => entry.modified).map(entry => entry.path).sort());

async function walk(folder) {
  const output = [];
  for (const item of await readdir(folder, {withFileTypes: true})) {
    const absolute = path.join(folder, item.name);
    if (item.isDirectory()) output.push(...await walk(absolute));
    else { assert.ok(item.isFile(), `Unexpected non-file in runtime: ${absolute}`); output.push(forward(path.relative(runtime, absolute))); }
  }
  return output;
}
assert.deepEqual((await walk(runtime)).sort(), [...entries.keys(), 'integration-source.json'].sort(), 'Published folder includes stale or unrecorded files');

const required = ['index.html', 'atlas-workbench.js', 'atlas-workbench.css', 'atlas-terrain.js', 'integration-bridge.mjs', 'integration-api-suffix.mjs', 'js/app.js', 'js/atlas_boot.js', 'js/atlas_snapshots.js', 'js/i18n_dict.js', 'js/lore_data.js', 'js/china_geo_data.js', 'js/map_data.js', 'js/zh_hant.js', 'css/style.css', 'assets/atlas-elevation.json', 'assets/atlas-elevation-source.json', 'UPSTREAM-LICENSE', 'UPSTREAM-README_ZH.md', 'UPSTREAM-CONTRIBUTING_ZH.md', 'NOTICE-016.md', 'INTEGRATION-NOTICE.md', 'integration-source.html', 'vendor/three/LICENSE', 'vendor/three/source.json'];
for (const relative of required) assert.ok(entries.has(relative), `Missing full-runtime dependency: ${relative}`);
for (const relative of ['app-3d.js', 'scenes.js', 'story.js', 'miniatures.html']) assert.ok(!entries.has(relative), `Obsolete demo leaked into runtime: ${relative}`);

const upstream = JSON.parse(entries.get('atlas-source.json').bytes);
assert.equal(upstream.commit, '53059f1c7fed305807b19365857a5f135daf3ac6');
assert.equal(upstream.files.length, 54);
for (const file of upstream.files) {
  const published = entries.get(file.path)?.entry;
  assert.ok(published, `Missing upstream capability asset: ${file.path}`);
  assert.equal(published.reviewedSha256, file.sha256);
  assert.equal(published.origin, 'jiangshan-map');
  if (!file.path.startsWith('topics/')) assert.equal(published.modified, false, `Historical engine/data was changed: ${file.path}`);
}
const three = JSON.parse(entries.get('vendor/three/source.json').bytes);
assert.equal(three.version, '0.180.0');
for (const file of three.files) assert.equal(entries.get('vendor/three/' + file.path)?.entry.sha256, file.sha256, `Three.js differs from reviewed input: ${file.path}`);
const dem = JSON.parse(entries.get('assets/atlas-elevation.json').bytes);
assert.ok(Number.isInteger(dem.width) && dem.width > 1 && Number.isInteger(dem.height) && dem.height > 1);
assert.equal(dem.heights.length, dem.width * dem.height, 'DEM has missing terrain samples');
assert.ok(dem.heights.every(Number.isFinite), 'DEM contains non-numeric heights');

// Resolve actual loadable resources, not arbitrary prose links or source strings.
// Bare Three.js imports are resolved through the page's real import map.
const html = entries.get('index.html').bytes.toString('utf8');
const importMapMatch = html.match(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
assert.ok(importMapMatch, 'No local Three.js import map');
const imports = JSON.parse(importMapMatch[1]).imports;
assert.ok(imports.three && imports['three/addons/']);
let dependencyReferences = 0;
function verifyResource(reference, from, kind) {
  const clean = reference.replaceAll('&amp;', '&').split(/[?#]/)[0];
  if (!clean || clean.startsWith('#') || clean.startsWith('data:') || clean.startsWith('blob:')) return;
  assert.ok(!/^(?:https?:)?\/\//i.test(clean), `Remote ${kind} dependency: ${from} -> ${reference}`);
  let mapped = clean;
  if (kind === 'module' && !clean.startsWith('.') && !clean.startsWith('/')) {
    const prefix = Object.keys(imports).sort((a, b) => b.length - a.length).find(key => key.endsWith('/') ? clean.startsWith(key) : clean === key);
    assert.ok(prefix, `Unresolved bare module: ${from} -> ${reference}`);
    mapped = imports[prefix] + clean.slice(prefix.length);
    from = 'index.html';
  }
  assert.ok(!mapped.startsWith('/'), `Root-absolute dependency breaks relocatable package: ${from} -> ${mapped}`);
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), decodeURIComponent(mapped)));
  assert.ok(entries.has(target), `Missing ${kind} dependency: ${from} -> ${reference} (${target})`);
  dependencyReferences++;
}
for (const [relative, {bytes}] of entries) {
  if (relative.endsWith('.html')) {
    const text = bytes.toString('utf8');
    for (const match of text.matchAll(/<(?:script|img|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) verifyResource(match[1], relative, 'HTML');
    for (const match of text.matchAll(/<link\b[^>]*>/gi)) {
      if (!/\brel=["'](?:stylesheet|icon|apple-touch-icon|manifest)["']/i.test(match[0])) continue;
      const href = match[0].match(/\bhref=["']([^"']+)["']/i);
      if (href) verifyResource(href[1], relative, 'HTML');
    }
  } else if (/\.(?:m?js)$/.test(relative)) {
    const text = bytes.toString('utf8');
    for (const match of text.matchAll(/\bimport\s+(?:[\w*{},\s]+\s+from\s*)?["']([^"']+)["']/g)) verifyResource(match[1], relative, 'module');
    for (const match of text.matchAll(/\bimport\(\s*["']([^"']+)["']/g)) verifyResource(match[1], relative, 'module');
    for (const match of text.matchAll(/\bfetch\(\s*["']([^"']+)["']/g)) verifyResource(match[1], relative, 'fetch');
    for (const match of text.matchAll(/\b_loadScriptOnce\(\s*["']([^"']+)["']/g)) verifyResource(match[1], 'index.html', 'lazy script');
  } else if (relative.endsWith('.css')) {
    for (const match of bytes.toString('utf8').matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) verifyResource(match[1], relative, 'CSS');
  }
}
assert.match(html, /src="integration-bridge\.mjs(?:\?[^\"]*)?"/, 'Published page does not load the bridge');
assert.ok(!html.includes('http://127.0.0.1:8016'), 'Integrated entry still requires the old service');

// Check cross-file wiring at the parent/iframe boundary. These are static
// contracts, not assertions that a browser has rendered or safely paused WebGL.
const parentHtml = await readFile(path.join(project, 'web/research.html'), 'utf8');
const parentScript = await readFile(path.join(project, 'web/atlas-demo.js'), 'utf8');
const bridgeScript = entries.get('integration-bridge.mjs').bytes.toString('utf8');
const apiScript = entries.get('integration-api-suffix.mjs').bytes.toString('utf8');
const parentIds = [...parentHtml.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
assert.equal(parentIds.length, new Set(parentIds).size, 'Research DOM IDs are not unique');
const referencedParentIds = new Set([...parentScript.matchAll(/\$\(["']([^"']+)["']\)/g)].map(match => match[1]));
for (const id of referencedParentIds) assert.ok(parentIds.includes(id), `Map parent references a missing DOM control: ${id}`);
for (const id of ['atlas-demo', 'atlas-frame-slot', 'atlas-start', 'atlas-retry', 'atlas-error', 'atlas-pause-cover']) assert.ok(parentIds.includes(id), `Missing map lifecycle element: ${id}`);
assert.match(parentHtml, /<script\b[^>]*type="module"[^>]*src="atlas-demo\.js(?:\?[^\"]*)?"/, 'Research page does not start the parent module');
const presetKeys = [...parentHtml.matchAll(/\bdata-atlas-preset=["']([^"']+)["']/g)].map(match => match[1]);
assert.deepEqual(presetKeys.sort(), ['qin', 'changan', 'sushi', 'dufu', 'compare', 'quiz'].sort(), 'Parent preset controls do not expose the six map demonstrations');
assert.deepEqual([...parentHtml.matchAll(/\bdata-atlas-view=["']([^"']+)["']/g)].map(match => match[1]).sort(), ['2d', '3d']);
assert.deepEqual([...parentHtml.matchAll(/\bdata-atlas-step=["']([^"']+)["']/g)].map(match => Number(match[1])).sort(), [-1, 1]);
const channelValues = text => [...text.matchAll(/\bchannel\s*:\s*["']([^"']+)["']/g)].map(match => match[1]);
const parentChannels = channelValues(parentScript), childChannels = channelValues(bridgeScript);
assert.equal(new Set([...parentChannels, ...childChannels]).size, 1, 'Parent and child postMessage channels differ');
assert.ok(parentChannels.length && childChannels.length, 'Missing parent or child postMessage sender');
for (const [name, code, sourceCheck] of [
  ['parent', parentScript, /event\.source\s*!==\s*frame\?\.contentWindow/],
  ['child', bridgeScript, /event\.source\s*!==\s*parent/],
]) {
  assert.match(code, /event\.origin\s*!==\s*location\.origin/, `${name} is missing its same-origin message guard`);
  assert.match(code, sourceCheck, `${name} is missing its expected-window guard`);
  assert.match(code, /data\.session\s*!==\s*session/, `${name} is missing its current-instance message guard`);
}
// Derive the callable actions from the receiver branches, rather than maintaining
// an independent second implementation of the API.
const receiverActions = new Set([...`${apiScript}\n${bridgeScript}`.matchAll(/(?:data\.)?action\s*===\s*["']([^"']+)["']/g)].map(match => match[1]));
const sentActions = new Set([...parentScript.matchAll(/\bpost\(["']([^"']+)["']/g)].map(match => match[1]));
for (const action of sentActions) assert.ok(receiverActions.has(action), `Parent sends an action the runtime cannot receive: ${action}`);
assert.match(apiScript, /export\s+const\s+atlasIntegration\b/, 'Lifecycle API is not exported');
assert.ok(entries.get('atlas-workbench.js').bytes.toString('utf8').includes(apiScript.trim()), 'Published workbench lacks the recorded API suffix');
const workbenchEntry = html.match(/<script\b[^>]*src="([^\"]*atlas-workbench\.js[^\"]*)"/)?.[1];
const bridgeWorkbench = bridgeScript.match(/from\s+["']\.\/([^"']*atlas-workbench\.js[^"']*)["']/)?.[1];
assert.ok(workbenchEntry && bridgeWorkbench && workbenchEntry === bridgeWorkbench, 'Bridge and entry must import the same workbench module URL, avoiding duplicate controllers');

let httpResources = 0;
const baseArgument = process.argv.find(argument => argument.startsWith('--base-url='));
if (baseArgument) {
  const base = new URL(baseArgument.slice('--base-url='.length));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'HTTP verification is restricted to the local preview');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const atlasBase = new URL('integrations/atlas/', base);
  for (const [relative, {entry}] of entries) {
    const response = await fetch(new URL(relative, atlasBase));
    assert.ok(response.ok, `HTTP ${response.status}: ${relative}`);
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), entry.sha256, `HTTP does not serve the packaged bytes: ${relative}`);
    httpResources++;
  }
}
console.log(JSON.stringify({ok: true, checks: 'static provenance, payload integrity, local resource closure and parent/iframe wiring; optional HTTP bytes', files: entries.size, sourceFiles, modifiedFiles: changedFiles, payloadBytes: totalBytes, upstreamFiles: upstream.files.length, terrainSamples: dem.heights.length, dependencyReferences, parentDomReferences: referencedParentIds.size, bridgeActions: [...sentActions].sort(), httpResources, browserLifecycleVerified: false}, null, 2));
