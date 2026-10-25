// SPDX-License-Identifier: GPL-3.0-only
// Resolve shared project links for standalone preview ports and Pages subpaths.
const projectDirectories={
  '015':'015-jiangshan-atlas',
  '016':'016-dongpo-journey',
  '017':'017-abyss-expedition',
};
const previewPorts={'015':'8015','016':'8016','017':'8017'};
const loopback=new Set(['127.0.0.1','localhost','[::1]']);
const currentPage=()=>globalThis.location?.href||import.meta.url;

export function projectUrl(project,path='',pageURL=currentPage()){
  const id=String(project).padStart(3,'0'),directory=projectDirectories[id];
  if(!directory)throw new RangeError('Unknown research project: '+project);
  const page=new URL(pageURL),relative=String(path||'').replace(/^\/+/, '');
  if(/^[a-z][a-z\d+.-]*:/i.test(relative))throw new TypeError('Project paths must be relative');
  let base;
  if(loopback.has(page.hostname)&&Object.values(previewPorts).includes(page.port)){
    base=new URL('/',page);base.port=previewPorts[id];
  }else{
    const marker=page.pathname.match(/\/projects\/(?:015-jiangshan-atlas|016-dongpo-journey|017-abyss-expedition)(?:\/|$)/);
    base=marker?new URL(page.pathname.slice(0,marker.index)+'/projects/'+directory+'/',page):new URL('../'+directory+'/',page);
  }
  const result=new URL(relative,base);
  if(result.origin!==base.origin||!result.pathname.startsWith(base.pathname))throw new TypeError('Project path leaves its project');
  return result.href;
}

export function normalizeProjectUrl(href,pageURL=currentPage()){
  let target;try{target=new URL(href);}catch{return href;}
  if(!['http:','https:'].includes(target.protocol)||!loopback.has(target.hostname)||target.username||target.password)return href;
  const pair=Object.entries(previewPorts).find(([,port])=>port===target.port);
  return pair?projectUrl(pair[0],target.pathname.replace(/^\/+/, '')+target.search+target.hash,pageURL):href;
}

export function hydrateProjectLinks(root=globalThis.document,pageURL=currentPage()){
  for(const anchor of root.querySelectorAll('a[data-project-id]'))anchor.href=projectUrl(anchor.dataset.projectId,anchor.dataset.projectPath||'',pageURL);
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>hydrateProjectLinks(),{once:true});
  else hydrateProjectLinks();
}
