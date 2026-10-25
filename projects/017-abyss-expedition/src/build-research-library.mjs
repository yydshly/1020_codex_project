// SPDX-License-Identifier: GPL-3.0-only
// Publish a portable, local-only research archive from explicit project sources.
import {readFile,readdir,mkdir,writeFile,access,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const workspace=path.resolve(projectRoot,'../..');
const publication=path.join(projectRoot,'web/research');
const definitions=[
  {id:'015',directory:'015-jiangshan-atlas',title:'江山时序研究与能力展示',entry:'https://yydshly.github.io/1020_codex_project/projects/015-jiangshan-atlas/',extra:['web/upstream/README_ZH.md','web/upstream/CONTRIBUTING_ZH.md']},
  {id:'016',directory:'016-dongpo-journey',title:'整库集成与三维扩展实验',entry:'https://yydshly.github.io/1020_codex_project/projects/016-dongpo-journey/',extra:['web/UPSTREAM-README_ZH.md']},
  {id:'017',directory:'017-abyss-expedition',title:'深蓝航迹：独立主题迁移',entry:'https://yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/',extra:['web/core/README.md']}
];
const excludedAssetDirectories=new Set(['terrain-source','atlas-terrain-source']);
const imageExtension=/\.(?:png|jpe?g|svg)$/i;
const referencedImageExtension=/\.(?:png|jpe?g|svg|webp)$/i;
const forward=value=>value.split(path.sep).join('/');
const stableId=(project,relative)=>project+'-'+relative.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function within(root,target){const relative=path.relative(root,target);return relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
async function safeSource(root,target){
  if(!within(root,target))throw new Error('Source is outside the selected project');
  const resolved=await realpath(target),resolvedRoot=await realpath(root);
  if(!within(resolvedRoot,resolved))throw new Error('Linked source is outside the selected project');
  return resolved;
}
function publicText(text){
  // These documents may name a developer's private configuration location.
  // Keep public workspace references portable and redact other local paths.
  let count=0;
  const content=text.replace(/(?<![a-zA-Z])[a-zA-Z]:[\\/][^\r\n`"'<>\s)]+/g,value=>{
    count++;const portable=value.replaceAll('\\','/'),start=portable.indexOf('/projects/');
    return start>=0?portable.slice(start+1):'[本地路径已隐去]';
  });
  return {content,redactedLocalPaths:count};
}
function category(relative){
  if(relative==='NOTICE.md')return '来源';
  if(relative.includes('UPSTREAM-')||relative.startsWith('web/upstream/'))return '原作';
  if(relative==='README.md')return '总览';
  if(/(?:verification|acceptance)/.test(relative))return '验收';
  return '方法';
}
function titleOf(content,fallback){
  const title=content.match(/^#\s+(.+)$/m)?.[1]||fallback;
  return title.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replaceAll('`','').trim();
}
const sourceTitles=new Map([
  ['quality/02-source-overview.jpg','源作者在线作品：地图概览'],
  ['quality/03-source-stage.jpg','源作者在线作品：历史阶段与事件'],
  ['quality/04-source-story.jpg','源作者在线作品：苏轼人物路线'],
  ['quality/05-source-event-1280.jpg','源作者在线作品：地图事件画面']
]);
const upstreamPreviewTitles=new Map([
  ['preview_1415_ming_yingtian.webp','固定源库自带预览：明代应天府与图层'],
  ['preview_741_tang_trace.webp','固定源库自带预览：唐代长安点地溯源'],
  ['preview_journey_sushi.webp','固定源库自带预览：苏轼人物路线'],
  ['preview_quiz_challenge.webp','固定源库自带预览：古地名寻址挑战']
]);

const documents=[],media=[],imageReferences=[],sourceFiles=new Map();
let redactedLocalPaths=0;
await mkdir(path.join(publication,'media'),{recursive:true});
const resolvedPublication=await realpath(publication),resolvedProject=await realpath(projectRoot);
if(!within(resolvedProject,resolvedPublication)||!within(resolvedPublication,await realpath(path.join(publication,'media'))))throw new Error('Publication path must remain in this project');
for(const definition of definitions){
  const root=path.join(workspace,'projects',definition.directory);
  const noteEntries=await readdir(path.join(root,'notes'),{withFileTypes:true});
  const documentPaths=['README.md','NOTICE.md',...noteEntries.filter(entry=>entry.isFile()&&entry.name.endsWith('.md')).map(entry=>'notes/'+entry.name),...definition.extra].sort();
  for(const relative of documentPaths){
    const source=await safeSource(root,path.join(root,relative));
    const original=(await readFile(source,'utf8')).replace(/^\uFEFF/,'');
    const sanitized=publicText(original);redactedLocalPaths+=sanitized.redactedLocalPaths;
    const origin=forward(path.relative(workspace,source));
    documents.push({id:stableId(definition.id,relative),project:definition.id,title:titleOf(sanitized.content,path.basename(relative)),origin,category:category(relative),content:sanitized.content,...(sanitized.redactedLocalPaths?{redactedLocalPaths:sanitized.redactedLocalPaths}:{})});
  }
  async function walkImages(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory()){
        if(!excludedAssetDirectories.has(entry.name))await walkImages(path.join(directory,entry.name));
      }else if(entry.isFile()&&imageExtension.test(entry.name)){
        const source=await safeSource(root,path.join(directory,entry.name));
        sourceFiles.set(forward(path.relative(workspace,source)),{source,definition});
      }
    }
  }
  await walkImages(path.join(root,'assets'));
}

// Supplement only images explicitly referenced by one of the selected documents.
// This does not recursively publish web textures, raw elevation or upstream data.
for(const document of documents){
  const definition=definitions.find(item=>item.id===document.project);
  const root=path.join(workspace,'projects',definition.directory);
  for(const match of document.content.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g)){
    const reference=match[1]||match[2];
    if(/^(?:https?:|data:)/i.test(reference)){imageReferences.push({documentId:document.id,reference,status:'external'});continue;}
    let target;
    try{target=path.resolve(workspace,path.dirname(document.origin),decodeURIComponent(reference.split(/[?#]/)[0]));}catch{imageReferences.push({documentId:document.id,reference,status:'invalid'});continue;}
    const origin=forward(path.relative(workspace,target));
    if(!within(root,target)||!referencedImageExtension.test(target)){imageReferences.push({documentId:document.id,reference,status:'outside-image-scope'});continue;}
    try{
      await access(target);const source=await safeSource(root,target);
      sourceFiles.set(origin,{source,definition});imageReferences.push({documentId:document.id,reference,origin,status:'published'});
    }catch{imageReferences.push({documentId:document.id,reference,origin,status:'missing'});}
  }
}
for(const [origin,{source,definition}] of [...sourceFiles.entries()].sort(([a],[b])=>a.localeCompare(b))){
  const bytes=await readFile(source),sha256=digest(bytes),extension=path.extname(source).toLowerCase(),filename=sha256.slice(0,20)+extension;
  const destination=path.join(publication,'media',filename);
  if(!within(publication,destination))throw new Error('Publication target is outside research');
  // Immutable content names: reuse matching files; never overwrite or remove.
  let exists=false;try{const old=await readFile(destination);if(digest(old)!==sha256)throw new Error('Published image hash collision');exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!exists)await writeFile(destination,bytes,{flag:'wx'});
  const relativeAsset=origin.split('/assets/').slice(1).join('/assets/');
  const liveSourceTitle=sourceTitles.get(relativeAsset),upstreamTitle=upstreamPreviewTitles.get(path.basename(source)),sourceTitle=liveSourceTitle||upstreamTitle,kind=sourceTitle?'source':extension==='.svg'?'diagram':'work';
  media.push({id:stableId(definition.id,forward(path.relative(path.join(workspace,'projects',definition.directory),source))),project:definition.id,src:'research/media/'+filename,origin,title:sourceTitle||path.basename(source,extension),kind,bytes:bytes.length,sha256,...(liveSourceTitle?{evidenceType:'live-source-capture',capturedAt:'2026-10-24',sourceUrl:'https://deanchen.me/jiangshan-map/',notice:'在线版效果截图；不将其等同于固定源码版本。'}:upstreamTitle?{evidenceType:'upstream-preview',snapshotSHA:'53059f1c7fed305807b19365857a5f135daf3ac6',sourceUrl:'https://github.com/DeanChensj/jiangshan-map/blob/53059f1c7fed305807b19365857a5f135daf3ac6/assets/'+path.basename(source),notice:'固定源库自带预览图；不是本轮浏览器截图，也不是015封装演示截图。'}:{})});
}
const reportRoot=path.join(projectRoot,'notes');
const reports={
  geometry:JSON.parse(await readFile(await safeSource(projectRoot,path.join(reportRoot,'full-voyage-geometry.json')),'utf8')),
  browser:JSON.parse(await readFile(await safeSource(projectRoot,path.join(reportRoot,'full-voyage-browser.json')),'utf8'))
};
const library={schema:'abyss-research-library/v1',generatedAt:'2026-10-25',projects:definitions.map(({id,title,entry})=>({id,title,entry})),documents,media,reports,imageReferences,privacy:{scope:'Explicit project research documents and images only; no environment files or private application data.',redactedLocalPaths}};
const output=JSON.stringify(library,null,2)+'\n';
await writeFile(path.join(publication,'library.json'),output,'utf8');
console.log(JSON.stringify({published:true,documents:documents.length,media:media.length,bytes:Buffer.byteLength(output),sourceImages:media.filter(item=>item.kind==='source').length,redactedLocalPaths,unpublishedImageReferences:imageReferences.filter(item=>!['published','external'].includes(item.status))},null,2));
