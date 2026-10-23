import {mkdir,copyFile,readdir,writeFile,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('web/files/',root),{recursive:true});
for(const f of ['index.html','style.css','app.js','compare.js','compare.css','v3-compare.js','v3-compare.css','hub.js','hub.css','controlled.js','controlled.css','current-preview.html'])await copyFile(new URL(`src/${f}`,root),new URL(`web/${f}`,root));
let html=await readFile(new URL('src/index.html',root),'utf8');
for(const [token,file] of [['V3_PANEL','v3-section.html'],['RESEARCH_CONTEXT','research-context.html'],['RESEARCH_ANALYSIS','research-analysis.html'],['RESEARCH_EVIDENCE','research-evidence.html'],['CONTROLLED_PANEL','controlled-section.html'],['PROMPT_UNDERSTANDING','research-understanding.html']])html=html.replace(`<!-- ${token} -->`,await readFile(new URL(`src/${file}`,root),'utf8'));
await writeFile(new URL('web/index.html',root),html);
await mkdir(new URL('web/files/v3/',root),{recursive:true});
async function copyNotes(from,to){
  for(const entry of await readdir(from,{withFileTypes:true})){
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory()){await mkdir(new URL(`${entry.name}/`,to),{recursive:true});await copyNotes(new URL(`${entry.name}/`,from),new URL(`${entry.name}/`,to));}
    else if(/\.(md|json)$/.test(entry.name))await copyFile(new URL(entry.name,from),new URL(entry.name,to));
  }
}
await copyNotes(new URL('notes/v3/',root),new URL('web/files/v3/',root));
await mkdir(new URL('web/files/controlled/',root),{recursive:true});
await copyNotes(new URL('notes/controlled/',root),new URL('web/files/controlled/',root));
for(const f of await readdir(new URL('notes/',root)))if(/\.(md|json)$/.test(f))await copyFile(new URL(`notes/${f}`,root),new URL(`web/files/${f}`,root));
await copyFile(new URL('src/timing.json',root),new URL('web/files/timing.json',root));
await copyFile(new URL('src/timing-v2.json',root),new URL('web/files/timing-v2.json',root));
const groups=[{label:'V3 · 原文执行实验 / 尚未验收',items:[]},{label:'V2 · 另写指令的历史记录',items:[]},{label:'V1 与总体研究记录',items:[]},{label:'公平对照 · 同预算匿名评测',items:[]}];
async function catalog(from,prefix=''){
 for(const entry of await readdir(from,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  const name=prefix+entry.name;
  if(entry.isDirectory())await catalog(new URL(`${entry.name}/`,from),name+'/');
  else if(/\.(md|json)$/.test(entry.name)&&entry.name!=='web-summary.json')groups[name.startsWith('controlled/')?3:name.startsWith('v3/')?0:entry.name.startsWith('v2-')?1:2].items.push({label:name,href:'files/'+name});
 }
}
await catalog(new URL('notes/',root));
await writeFile(new URL('web/files/hub-artifacts.json',root),JSON.stringify(groups,null,2)+'\n');
const meta=JSON.parse(await readFile(new URL('project.json',root),'utf8'));
Object.assign(meta,{status:'研究中',web:true,source_post:'https://x.com/CarsonYangk8s/status/2111520795575116016',research_date:'2026-10-20',updated_date:'2026-10-23'});
await writeFile(new URL('project.json',root),JSON.stringify(meta,null,2)+'\n');
console.log('Built static research website. Publication not performed.');
