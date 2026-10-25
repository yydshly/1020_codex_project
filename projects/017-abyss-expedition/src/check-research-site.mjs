// SPDX-License-Identifier: GPL-3.0-only
// Integration checks for the public archive. This does not exercise browser UX.
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {getDirectorShots} from '../web/data/director-shots.mjs';
import {projectUrl,normalizeProjectUrl} from '../web/project-links.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),web=path.join(root,'web'),workspace=path.resolve(root,'../..');
const prefix='projects/017-abyss-expedition/';
const html=await readFile(path.join(web,'research.html'),'utf8'),script=await readFile(path.join(web,'research.js'),'utf8');
const archive=JSON.parse(await readFile(path.join(web,'research/content.json'),'utf8'));
const library=JSON.parse(await readFile(path.join(web,'research/library.json'),'utf8'));
const source=archive.source.source,exploration=archive.exploration;
assert.equal(archive.schema,'abyss-research-content/v1');
assert.equal(source.capabilities.length,8);assert.equal(source.patterns.length,8);
assert.equal(exploration.journey.length,12);assert.equal(exploration.reusableModules.length,9);assert.equal(exploration.promptTemplates.length,6);
assert.equal(new Set(exploration.reusableModules.map(module=>module.file)).size,9);
for(const item of source.capabilities)assert.ok(item.title&&item.effect&&item.mechanism&&item.boundary&&item.sourceUrl,'Capability needs a concrete effect, method, boundary and source');
for(const item of exploration.promptTemplates)assert.ok(item.id&&item.title&&typeof item.prompt==='string'&&item.prompt.length>80,'Prompt needs usable body text');

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,'Archive IDs must be unique');
let htmlReferences=0;
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  const reference=match[1].replaceAll('&amp;','&');
  if(/^(?:https?:|data:|mailto:)/.test(reference))continue;
  if(reference.startsWith('#')){assert.ok(ids.includes(reference.slice(1)),`Broken section anchor ${reference}`);continue;}
  const target=decodeURIComponent(reference.split(/[?#]/)[0]);if(!target)continue;
  await access(path.resolve(web,target));htmlReferences++;
}
for(const reference of ['research/content.json','research/library.json']){assert.ok(script.includes(reference));await access(path.join(web,reference));}

const documentsByOrigin=new Map(),documentsById=new Map(),mediaByOrigin=new Map();
for(const document of library.documents){
  assert.ok(!documentsById.has(document.id)&&!documentsByOrigin.has(document.origin),'Duplicate archive document');
  assert.ok(document.title&&document.content.length>30);await access(path.resolve(workspace,document.origin));
  documentsById.set(document.id,document);documentsByOrigin.set(document.origin,document);
}
for(const image of library.media){
  assert.ok(!mediaByOrigin.has(image.origin),'Duplicate media origin');await access(path.join(web,image.src));
  await access(path.resolve(workspace,image.origin));mediaByOrigin.set(image.origin,image);
}
const asOrigin=value=>value.startsWith('projects/')?value:prefix+value;
let curatedMedia=0;
for(const item of [...archive.source.gallery,...exploration.gallery]){
  assert.ok(mediaByOrigin.has(asOrigin(item.path)),`Curated picture has no published image: ${item.path}`);curatedMedia++;
}

// Evaluate only the real source helpers, with data passed explicitly. No page,
// hidden application state or browser automation is involved.
function realFunction(name){
  const start=script.indexOf('function '+name+'(');assert.ok(start>=0,`Missing reader helper ${name}`);
  const next=script.indexOf('\n',start);return script.slice(start,next<0?undefined:next);
}
const resolveReference=Function('return ('+realFunction('resolveReference')+')')();
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const reportReference=Function('prefix','escape','return ('+realFunction('reportReference')+')')(prefix,escape);
const externalFor=base=>Function('escape','normalizeProjectUrl','return ('+realFunction('external')+')')(escape,href=>normalizeProjectUrl(href,base));
const inlineFor=base=>Function('escape','mediaByOrigin','docsByOrigin','external','prefix','resolveReference','reportReference','projectUrl','return ('+realFunction('inline')+')')(escape,mediaByOrigin,documentsByOrigin,externalFor(base),prefix,resolveReference,reportReference,(id,file)=>projectUrl(id,file,base));
const inline=inlineFor('http://127.0.0.1:8017/research.html');
let renderedImageReferences=0;
for(const reference of library.imageReferences){
  assert.ok(documentsById.has(reference.documentId));
  if(reference.status!=='published')continue;
  const document=documentsById.get(reference.documentId),resolved=resolveReference(reference.reference,document),image=mediaByOrigin.get(resolved.origin);
  assert.equal(resolved.origin,reference.origin,'The reader must resolve the same origin as the archive builder');
  assert.ok(image,`Reader has no published image for ${reference.reference}`);
  const rendered=inline(`![archive integration](${reference.reference})`,document);
  assert.ok(rendered.includes(`src="${escape(image.src)}"`)&&rendered.includes('data-image='),'Image reference must reach the inline reader image entry');renderedImageReferences++;
}
for(const [file,report] of [['full-voyage-geometry.json','geometry'],['full-voyage-browser.json','browser']]){
  const rendered=inline(`[原始结果](notes/${file})`,documentsByOrigin.get(prefix+'README.md'));
  assert.ok(rendered.includes(`data-report="${report}"`)&&!rendered.includes('local-reference'),'Raw report links must open the result reader');
}
const projectPage=inline('[原作展示](web/index.html?scene=quiz#guide)',documentsByOrigin.get('projects/015-jiangshan-atlas/README.md'));
assert.ok(projectPage.includes('href="http://127.0.0.1:8015/index.html?scene=quiz#guide"')&&!projectPage.includes('local-reference'),'015 page links must use the real 8015 preview and retain query/hash');

// The same published files also run under a repository prefix, in nested map
// integrations, and in a single-server Pages preview. Preserve semantic inputs.
const publicRoot='https://yydshly.github.io/1020_codex_project/';
for(const [base,expectedRoot] of [
  [publicRoot+'projects/017-abyss-expedition/research.html',publicRoot],
  [publicRoot+'projects/017-abyss-expedition/integrations/atlas/?view=3d',publicRoot],
  ['http://127.0.0.1:8000/1020_codex_project/projects/017-abyss-expedition/research.html','http://127.0.0.1:8000/1020_codex_project/'],
  ['http://localhost:8000/projects/016-dongpo-journey/process.html','http://localhost:8000/'],
]){
  const expected=expectedRoot+'projects/015-jiangshan-atlas/index.html?scene=quiz#guide';
  assert.equal(projectUrl('015','index.html?scene=quiz#guide',base),expected);
  const rendered=inlineFor(base)('[原作展示](web/index.html?scene=quiz#guide)',documentsByOrigin.get('projects/015-jiangshan-atlas/README.md'));
  assert.ok(rendered.includes(`href="${expected}"`),'Reader project links must work under deployment prefixes');
  const legacy=inlineFor(base)('[历史记录中的本地入口](http://localhost:8015/index.html?scene=quiz#guide)',documentsByOrigin.get(prefix+'README.md'));
  assert.ok(legacy.includes(`href="${expected}"`),'Clickable local URLs in historical notes must map to the current deployment');
}
assert.equal(projectUrl('016','?view=3d&person=sushi#history','http://localhost:8017/research.html'),'http://localhost:8016/?view=3d&person=sushi#history');
assert.equal(projectUrl('017','research.html','http://127.0.0.1:8017/integrations/atlas/'),'http://127.0.0.1:8017/research.html');
assert.equal(normalizeProjectUrl('https://deanchen.me/jiangshan-map/',publicRoot),'https://deanchen.me/jiangshan-map/','Author attribution links must remain unchanged');
assert.throws(()=>projectUrl('017','../outside.html',publicRoot+'projects/017-abyss-expedition/research.html'));

let httpModules=0;
const urlOption=process.argv.find(argument=>argument.startsWith('--base-url='));
const baseURL=urlOption?new URL(urlOption.slice('--base-url='.length)):null;
if(baseURL)assert.ok(['127.0.0.1','localhost','[::1]'].includes(baseURL.hostname),'HTTP verification is restricted to a local preview');
for(const module of exploration.reusableModules){
  assert.ok(module.file.startsWith('web/'),'Module metadata must name its web-root-relative file');
  const file=module.file.replace(/^web\//,'');
  assert.match(file,/^(?:core|rendering|data)\/[a-zA-Z0-9_./-]+\.(?:mjs|js|json)$/);assert.ok(!file.includes('..'));
  const bytes=await readFile(path.join(web,file));assert.ok(bytes.length>30);
  if(baseURL){const response=await fetch(new URL(file,baseURL),{signal:AbortSignal.timeout(6000)});assert.equal(response.status,200,`Module URL must load from the web root: ${file}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes,`Preview serves a different module: ${file}`);httpModules++;}
}

const mediaFor=relative=>mediaByOrigin.get(prefix+relative);
const selectEvidence=Function('library','mediaFor','return ('+realFunction('evidenceForChapter')+')')(library,mediaFor);
const chapters=[];
for(const mission of library.reports.geometry.missions){
  const actualShots=getDirectorShots(mission.mission);assert.equal(mission.chapters.length,11);
  for(const [index,chapter] of mission.chapters.entries()){
    assert.equal(chapter.id,actualShots[index].id,'Geometry and runtime chapters must correspond');
    const evidence=selectEvidence(chapter.id,index);assert.ok(evidence,`No public DOM and image evidence for ${chapter.id}`);
    assert.equal(evidence.film,chapter.id);assert.equal(Number(evidence.chapter),index);assert.equal(evidence.title,actualShots[index].title);
    const image=mediaFor(`assets/full-voyages/${evidence.label}.jpg`);assert.ok(image);await access(path.join(web,image.src));
    // A stale URL can point at the requested film while the DOM is already in
    // another chapter. A superficially newer record must not win in that case.
    const adversarial={...library,reports:{...library.reports,browser:[...library.reports.browser,{...evidence,chapter:String((index+1)%11),app:'app.js?v=9999'}]}};
    const guarded=Function('library','mediaFor','return ('+realFunction('evidenceForChapter')+')')(adversarial,mediaFor)(chapter.id,index);
    assert.equal(Number(guarded.chapter),index,'Evidence must match DOM chapter, not only the URL film');
    chapters.push({id:chapter.id,chapter:index,label:evidence.label,app:evidence.app||'historical'});
  }
}
assert.equal(chapters.length,22);

const checkedModules=new Set();
async function visitRuntime(file){
  if(checkedModules.has(file))return;checkedModules.add(file);
  const code=await readFile(file,'utf8');
  assert.ok(!/\b(?:import|export)[^;]*['"][^'"]*(?:research\.js|research\/)/.test(code),'Scene runtime must not import the research archive');
  assert.ok(!/\bfetch\s*\(\s*['"][^'"]*research\//.test(code),'Scene runtime must not fetch research data');
  for(const match of code.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?['"]([^'"]+)['"]/g)){
    const specifier=match[1];if(!specifier.startsWith('.'))continue;
    const target=path.resolve(path.dirname(file),specifier.split(/[?#]/)[0]);
    const relative=path.relative(web,target);assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative),'Local runtime import must remain in the web root');
    if(/\.(?:mjs|js)$/.test(target))await visitRuntime(target);
  }
}
await visitRuntime(path.join(web,'app.js'));await visitRuntime(path.join(web,'scene.js'));
console.log(JSON.stringify({passed:true,htmlReferences,sourceCapabilities:source.capabilities.length,sourcePatterns:source.patterns.length,explorationStages:exploration.journey.length,reusableModules:exploration.reusableModules.length,promptTemplates:exploration.promptTemplates.length,documents:library.documents.length,mediaOrigins:library.media.length,curatedMedia,renderedImageReferences,reportReaderLinks:2,projectPageLinks:1,httpModules,chapters,sceneRuntimeModulesChecked:checkedModules.size,archiveRuntimeImportedByScene:false,browserUXVerified:false},null,2));
