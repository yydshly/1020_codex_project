// SPDX-License-Identifier: GPL-3.0-only
// Screen projection and uncluttered labels. Annotation never steers the camera.
export function createCueLabels({container,camera,getSize,isOccluded,getViewerPosition}){
  const root=document.createElement('div');root.id='environment-cue-overlay';root.className='environment-cue-overlay';root.setAttribute('aria-label','讲解对象位置提示');(container.parentElement||container).append(root);
  const svgNS='http://www.w3.org/2000/svg',leaders=document.createElementNS(svgNS,'svg');leaders.classList.add('environment-cue-leaders');leaders.setAttribute('aria-hidden','true');root.append(leaders);
  const nodes=new Map();let active=null,lastStatus=[];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const overlap=(a,b)=>a.x<b.x+b.w+8&&a.x+a.w+8>b.x&&a.y<b.y+b.h+6&&a.y+a.h+6>b.y;
  function clear(){active=null;lastStatus=[];leaders.replaceChildren();root.replaceChildren(leaders);nodes.clear();root.hidden=true;}
  function setCue(cue){active=cue;if(!cue)clear();else{root.hidden=false;root.dataset.cue=cue.id;root.dataset.kind=cue.kind;}}
  function update(targets,{observation}={}){
    if(!active){root.hidden=true;return;}root.hidden=false;
    const {width,height}=getSize(),base=container.getBoundingClientRect(),occupied=[];
    for(const selector of ['#environment-guide','#pilot-console','.scene-toolbar','.environment-cue-lens']){
      const element=document.querySelector(selector);if(!element||element.hidden||!element.getClientRects().length)continue;
      const r=element.getBoundingClientRect();occupied.push({x:r.x-base.x,y:r.y-base.y,w:r.width,h:r.height});
    }
    leaders.replaceChildren();const seen=new Set();
    const records=targets.filter(t=>!seen.has(t.id)&&seen.add(t.id)).map(target=>{
      const point=target.position,local=point.clone().applyMatrix4(camera.matrixWorldInverse),q=point.clone().project(camera),x=(q.x*.5+.5)*width,y=(-q.y*.5+.5)*height;
      const behind=local.z>=0,inside=!behind&&q.z>-1&&q.z<1&&x>18&&x<width-18&&y>58&&y<height-18;
      const occluded=inside&&isOccluded(point),covered=inside&&occupied.some(o=>overlap({x:x-5,y:y-5,w:10,h:10},o)),far=camera.position.distanceTo(point)>(target.kind==='biology'?250:500);
      const visibility=behind?'身后':occluded?'岩壁遮挡':far?'远处':!inside?'画面外':covered?'界面遮挡':'画面中';
      return {target,x,y,local,visibility,distance:Math.round(getViewerPosition().distanceTo(point)),labelVisible:false};
    });
    const visible=records.filter(r=>r.visibility==='画面中').sort((a,b)=>Number(Boolean(b.target.primary))-Number(Boolean(a.target.primary))||Number(b.target.kind===active.kind)-Number(a.target.kind===active.kind));
    // One primary focus and, at most, one visible supporting object. Remote
    // labels no longer crowd the screen when a matching local object is visible.
    const chosen=visible.length?visible.slice(0,2):observation?.visible?[]:records.slice(0,1),ids=new Set();
    for(const record of chosen){
      const {target,visibility,local}=record,off=visibility!=='画面中';ids.add(target.id);let node=nodes.get(target.id);
      if(!node){node=document.createElement('span');node.className='environment-world-label';node.dataset.target=target.id;root.append(node);nodes.set(target.id,node);}
      node.dataset.visibility=visibility;node.dataset.kind=target.kind||active.kind;node.classList.toggle('is-direction',off);node.classList.toggle('is-occluded',visibility==='岩壁遮挡');
      let dx=visibility==='身后'?local.x:record.x-width/2,dy=visibility==='身后'?-local.y:record.y-height/2;if(Math.abs(dx)+Math.abs(dy)<.001)dx=1;
      const arrow=Math.abs(dx)>Math.abs(dy)*1.7?(dx<0?'←':'→'):Math.abs(dy)>Math.abs(dx)*1.7?(dy<0?'↑':'↓'):dy<0?(dx<0?'↖':'↗'):(dx<0?'↙':'↘');
      node.textContent=off?`${arrow} ${target.label} · 点“看清当前对象”`:`看这里 · ${target.label}`;
      node.setAttribute('aria-label',`${target.label}，${visibility}，距潜器约${record.distance}模型单位`);node.title=`${visibility}，距潜器约${record.distance}模型单位`;node.style.display='block';
      const rect=node.getBoundingClientRect(),w=Math.min(rect.width||180,width-28),h=rect.height||30,margin=w/2+12;
      let x=record.x,y=record.y-40;
      if(off){const scale=Math.min((width/2-margin)/Math.max(.001,Math.abs(dx)),(height/2-35)/Math.max(.001,Math.abs(dy)));x=width/2+dx*scale;y=height/2+dy*scale;}
      const options=[];for(const [ox,oy]of [[0,0],[0,80],[0,-44],[75,0],[-75,0],[0,124],[0,-88],[-100,60],[100,60]])options.push({x:clamp(x+ox,margin,width-margin),y:clamp(y+oy,72,height-24)});
      if(off)for(let sy=84;sy<height-30;sy+=38)options.push({x:margin,y:sy},{x:width-margin,y:sy});
      const place=options.find(p=>!occupied.some(o=>overlap({x:p.x-w/2,y:p.y-h/2,w,h},o)));
      if(!place){node.style.display='none';continue;}
      node.style.left=place.x+'px';node.style.top=place.y+'px';occupied.push({x:place.x-w/2,y:place.y-h/2,w,h});record.labelVisible=true;
      if(!off){
        const path=document.createElementNS(svgNS,'path');path.setAttribute('d',`M${place.x},${place.y+h/2}L${record.x},${record.y}`);leaders.append(path);
        const ring=document.createElementNS(svgNS,'circle');ring.setAttribute('cx',record.x);ring.setAttribute('cy',record.y);ring.setAttribute('r',String(11+Math.sin((active.elapsed||0)*1.8)*1.5));ring.classList.add('cue-target-reticle');leaders.append(ring);
        const dot=document.createElementNS(svgNS,'circle');dot.setAttribute('cx',record.x);dot.setAttribute('cy',record.y);dot.setAttribute('r','3');leaders.append(dot);
      }
    }
    for(const [id,node]of nodes)if(!ids.has(id)){node.remove();nodes.delete(id);}
    lastStatus=records.map(r=>({id:r.target.id,label:r.target.label,kind:r.target.kind,primary:Boolean(r.target.primary),visibility:r.visibility,distance:r.distance,labelVisible:r.labelVisible,screen:{x:r.x,y:r.y}}));
  }
  return {setCue,update,clear,getStatus:()=>lastStatus.map(item=>({...item,screen:{...item.screen}})),destroy(){clear();root.remove();}};
}
