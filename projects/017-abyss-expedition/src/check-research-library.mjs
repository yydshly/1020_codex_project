// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),web=path.join(root,'web');
const raw=await readFile(path.join(web,'research/library.json'),'utf8'),library=JSON.parse(raw);
assert.equal(library.schema,'abyss-research-library/v1');
assert.equal(library.projects.length,3);
assert.ok(library.documents.length>=20,'Archive should include the research, not just overview summaries');
assert.ok(library.media.length>15&&library.media.length<=260,'Unexpected screenshot scope');
const ids=new Set(),origins=new Set();
for(const document of library.documents){
  assert.ok(/^[a-z0-9-]+$/.test(document.id)&&!ids.has(document.id),'Document ID must be stable and unique');ids.add(document.id);
  assert.ok(['015','016','017'].includes(document.project));
  assert.ok(['总览','验收','方法','来源','原作'].includes(document.category));
  assert.ok(document.content.length>30&&document.title&&/^projects\/(?:015-|016-|017-)/.test(document.origin));
  assert.ok(!origins.has(document.origin));origins.add(document.origin);
}
const mediaIds=new Set(),mediaOrigins=new Set();
for(const image of library.media){
  assert.ok(!mediaIds.has(image.id));mediaIds.add(image.id);mediaOrigins.add(image.origin);
  assert.match(image.src,/^research\/media\/[a-f0-9]{20}\.(?:png|jpe?g|svg|webp)$/);
  assert.ok(!/(?:terrain-source|atlas-terrain-source)\//.test(image.origin),'Do not publish raw tiles');
  const bytes=await readFile(path.join(web,image.src));assert.equal(createHash('sha256').update(bytes).digest('hex'),image.sha256);
  assert.ok(['source','work','diagram'].includes(image.kind));
  if(image.origin.startsWith('projects/015-jiangshan-atlas/assets/'))assert.notEqual(image.kind,'source','015 wrapper screenshots must not be mislabeled as the original live site');
  if(image.kind==='source')assert.ok((image.capturedAt||image.snapshotSHA)&&image.sourceUrl&&image.notice);
}
for(const reference of library.imageReferences){
  assert.ok(ids.has(reference.documentId));
  assert.ok(['published','external','invalid','outside-image-scope','missing'].includes(reference.status));
  if(reference.status==='published')assert.ok(mediaOrigins.has(reference.origin),'Published image reference must map to a copied asset');
  else assert.ok(reference.reference,'Unpublished references must be explicit');
}
assert.ok(library.reports.geometry.passed);
assert.equal(library.reports.geometry.frames,14664);
assert.ok(Array.isArray(library.reports.browser)&&library.reports.browser.length>=40);
assert.ok(!/(?<![a-zA-Z])[a-zA-Z]:[\\/]/.test(raw),'Archive must not expose absolute local paths');
assert.ok(!/(?:sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9_.-]{25,}|"(?:api_key|access_token|secret_key)"\s*:\s*"[^"<>]{15,}")/i.test(raw),'Archive resembles an embedded credential');
for(const file of ['library.json'])await access(path.join(web,'research',file));
console.log(JSON.stringify({passed:true,documents:library.documents.length,media:library.media.length,sourceImages:library.media.filter(item=>item.kind==='source').length,publishedImageReferences:library.imageReferences.filter(item=>item.status==='published').length,unpublishedImageReferences:library.imageReferences.filter(item=>!['published','external'].includes(item.status)),publicBrowserRecords:library.reports.browser.length,reportFrames:library.reports.geometry.frames},null,2));
