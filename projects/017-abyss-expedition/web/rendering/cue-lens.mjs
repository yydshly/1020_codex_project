// SPDX-License-Identifier: GPL-3.0-only
// A second, small 3D view of an actual station. The main camera, station and
// vehicle are never moved. Shared station geometry/materials remain external.
import * as THREE from 'three';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=Number.isFinite;
const point=p=>p?.isVector3?p.clone():p&&['x','y','z'].every(k=>finite(p[k]))?new THREE.Vector3(p.x,p.y,p.z):Array.isArray(p)&&p.length===3&&p.every(finite)?new THREE.Vector3(...p):null;
const PHYSICAL=new Set(['biology','vent','sampling']);
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

/** CSS-pixel rectangles. Return null rather than covering a driving control. */
export function findCueLensViewport({width,height,obstacles=[]}={}){
  if(!finite(width)||!finite(height)||width<=0||height<=0)return null;
  let free=[{x:12,y:62,width:Math.max(0,width-24),height:Math.max(0,height-74)}];
  for(const raw of obstacles){
    const o={x:raw.x-8,y:raw.y-8,width:raw.width+16,height:raw.height+16};
    if(!Object.values(o).every(finite))continue;
    const next=[];
    for(const r of free){
      if(!overlaps(r,o)){next.push(r);continue;}
      const top=Math.max(r.y,Math.min(r.y+r.height,o.y)),bottom=Math.max(r.y,Math.min(r.y+r.height,o.y+o.height));
      const left=Math.max(r.x,Math.min(r.x+r.width,o.x)),right=Math.max(r.x,Math.min(r.x+r.width,o.x+o.width));
      if(top>r.y)next.push({x:r.x,y:r.y,width:r.width,height:top-r.y});
      if(bottom<r.y+r.height)next.push({x:r.x,y:bottom,width:r.width,height:r.y+r.height-bottom});
      if(left>r.x)next.push({x:r.x,y:r.y,width:left-r.x,height:r.height});
      if(right<r.x+r.width)next.push({x:right,y:r.y,width:r.x+r.width-right,height:r.height});
    }
    free=next;
  }
  let best=null;
  for(const r of free){
    // Short phone stages can have only ~115px between the two control cards.
    // Keep the available width and fit the model to a shallower viewport.
    const w=Math.min(260,r.width),h=Math.min(w*.55+44,r.height);
    if(w<140||h<104)continue;
    const candidate={x:r.x+r.width-w,y:r.y,width:w,height:h},score=w*h*.02-candidate.y*.35+candidate.x*.03;
    if(!best||score>best.score)best={...candidate,score};
  }
  if(!best)return null;delete best.score;return best;
}

export function createCueLens({container,getSize,heightAt,getEntityRoot,getEntity=()=>null}={}){
  if(!container||typeof getSize!=='function'||typeof heightAt!=='function'||typeof getEntityRoot!=='function')throw new TypeError('Cue lens needs its container, size, terrain and actual station lookup');
  if(typeof getEntity!=='function')throw new TypeError('Cue lens entity metadata lookup must be a function');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x12303b);
  scene.add(new THREE.HemisphereLight(0xc8e9e6,0x334d4d,2.4));
  const light=new THREE.DirectionalLight(0xffe8bf,3.2);light.position.set(-45,70,55);scene.add(light);
  const rim=new THREE.DirectionalLight(0x8fcada,1.1);rim.position.set(50,25,-40);scene.add(rim);
  const content=new THREE.Group();scene.add(content);
  const camera=new THREE.PerspectiveCamera(42,1,.2,1000);
  const groundMaterial=new THREE.MeshStandardMaterial({color:0x687e76,roughness:1,metalness:0});
  const highlightMaterial=new THREE.LineBasicMaterial({color:0xf2cf79,transparent:true,opacity:.83,depthTest:false,depthWrite:false,toneMapped:false});
  const frame=document.createElement('aside');frame.className='environment-cue-lens';frame.setAttribute('aria-label','当前讲解对象的独立三维观察窗');frame.hidden=true;
  Object.assign(frame.style,{position:'absolute',pointerEvents:'none',zIndex:'8',border:'1px solid #dfc78bc7',borderRadius:'7px',overflow:'hidden',boxShadow:'0 8px 26px #00151c80',color:'#e4efe9',font:'10px/1.4 ui-sans-serif,system-ui,sans-serif'});
  const title=document.createElement('strong'),subtitle=document.createElement('span'),footer=document.createElement('span');
  title.className='environment-cue-lens-title';subtitle.className='environment-cue-lens-context';footer.className='environment-cue-lens-distance';
  Object.assign(title.style,{position:'absolute',top:'0',left:'0',right:'0',padding:'4px 8px 0',height:'16px',fontSize:'11px',fontWeight:'600',color:'#f4dfa8',background:'#102a35f0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
  Object.assign(subtitle.style,{position:'absolute',top:'18px',left:'0',right:'0',height:'12px',padding:'0 8px',fontSize:'9px',background:'#102a35f0',color:'#f1d89c',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
  Object.assign(footer.style,{position:'absolute',bottom:'0',left:'0',right:'0',height:'17px',padding:'2px 8px',fontSize:'8px',background:'#102a35f0',color:'#b9d3d3',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
  frame.append(title,subtitle,footer);(container.parentElement||container).append(frame);
  let destroyed=false,clone=null,ground=null,highlight=null,openingCentre=null,lookFor='',key='',entityCentre=null,focusBounds=null,radius=20,viewport=null,visible=false,drawn=false,visibleFrames=0,status={visible:false,reason:'no-target'};
  function release(){
    if(clone){clone.traverse(o=>{if(o.isInstancedMesh)o.dispose();});clone.removeFromParent();clone=null;}
    if(ground){ground.geometry.dispose();ground.removeFromParent();ground=null;}
    if(highlight){highlight.traverse(o=>o.geometry?.dispose());highlight.removeFromParent();highlight=null;}
    key='';entityCentre=null;focusBounds=null;openingCentre=null;lookFor='';
  }
  function clear(){visible=false;drawn=false;viewport=null;frame.hidden=true;status={visible:false,reason:'no-target'};visibleFrames=0;release();}
  function buildHighlight(source,bounds,entity,kind){
    highlight=new THREE.Group();highlight.name='cue-lens-part-highlight';content.add(highlight);
    const add=(points,loop=false)=>{const geometry=new THREE.BufferGeometry().setFromPoints(points),line=loop?new THREE.LineLoop(geometry,highlightMaterial):new THREE.LineSegments(geometry,highlightMaterial);line.userData.cueLensHighlight=true;line.renderOrder=5;highlight.add(line);};
    const size=bounds.getSize(new THREE.Vector3()),length=clamp(Math.min(size.x,size.z)*.15,1.5,5),corners=[];
    for(const [x,sx]of [[bounds.min.x-.7,1],[bounds.max.x+.7,-1]])for(const [z,sz]of [[bounds.min.z-.7,1],[bounds.max.z+.7,-1]]){
      const p=(x,z)=>new THREE.Vector3(x,heightAt(x,z)+.35,z),corner=p(x,z);corners.push(p(x+sx*length,z),corner,corner.clone(),p(x,z+sz*length));
    }
    add(corners);
    if(entity?.appearance==='sponges'){
      // Follow one actual top-rim vertex row, including its deformed shape and
      // complete instance/world transform. The source mesh stays untouched.
      let best=null;const instance=new THREE.Matrix4(),world=new THREE.Matrix4();
      source.traverse(mesh=>{
        const geometry=mesh.geometry,profile=geometry?.parameters?.points,segments=geometry?.parameters?.segments,positions=geometry?.attributes?.position;
        if(!mesh.isMesh||geometry.type!=='LatheGeometry'||!Array.isArray(profile)||!Number.isInteger(segments)||!positions)return;
        let row=0;for(let i=1;i<profile.length;i++)if(profile[i].y>profile[row].y)row=i;
        for(let j=0;j<(mesh.isInstancedMesh?mesh.count:1);j++){
          if(mesh.isInstancedMesh){mesh.getMatrixAt(j,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
          const axis=new THREE.Vector3(0,1,0).transformDirection(world),points=[];
          for(let i=0;i<segments;i++){const index=i*profile.length+row;if(index>=positions.count)continue;points.push(new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(world).addScaledVector(axis,.16));}
          if(points.length<6)continue;const centre=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
          if(!best||centre.y>best.centre.y)best={points,centre};
        }
      });
      if(best){add(best.points,true);openingCentre=best.centre.clone();}
    }
    lookFor=entity?.appearance==='sponges'?'看杯／管状身体与顶部开口':entity?.appearance==='tube-worms'?'看白色硬管与红色冠部':kind==='biology'?'看分枝和附着岩面':kind==='vent'?'看烟囱顶部与热液出口':entity?.appearance==='sediment-corer'?'看取样管与固定支架':'看采水瓶、瓶盖与固定支架';
  }
  function loadEntity(source,id,kind){
    if(key===source.uuid+'/'+id)return;
    release();source.updateWorldMatrix(true,true);clone=source.clone(true);clone.matrix.copy(source.matrixWorld);clone.matrixAutoUpdate=false;clone.visible=true;
    clone.traverse(o=>{if(o.isLight)o.visible=false;});content.add(clone);content.position.set(0,0,0);content.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(clone),size=bounds.getSize(new THREE.Vector3());entityCentre=bounds.getCenter(new THREE.Vector3());
    if(bounds.isEmpty()||!entityCentre.toArray().every(finite)){release();return;}
    focusBounds=bounds.clone().translate(entityCentre.clone().negate());
    radius=clamp(size.length()*.5,8,90);
    // A finite cut-out of the real terrain gives roots a surface, without
    // bringing a remote cliff into the close-up or changing original terrain.
    const sourceOrigin=new THREE.Vector3().setFromMatrixPosition(source.matrixWorld),r=clamp(Math.max(size.x,size.z)*.58,12,30),n=16,positions=[],indices=[],floor=heightAt(sourceOrigin.x,sourceOrigin.z),limit=floor+Math.max(5,size.y*.6);
    for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++){const x=sourceOrigin.x-r+ix*r*2/n,z=sourceOrigin.z-r+iz*r*2/n;positions.push(x,heightAt(x,z),z);}
    for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){const a=iz*(n+1)+ix,b=a+1,c=a+n+1,d=c+1;for(const tri of [[a,c,b],[c,d,b]])if(tri.every(i=>positions[i*3+1]<=limit))indices.push(...tri);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();ground=new THREE.Mesh(geometry,groundMaterial);content.add(ground);
    buildHighlight(source,bounds,getEntity(id),kind);
    content.position.copy(entityCentre).negate();key=source.uuid+'/'+id;
  }
  function collectObstacles(){
    const base=container.getBoundingClientRect(),result=[];
    for(const selector of ['#environment-guide','#pilot-console','.scene-toolbar']){
      const element=document.querySelector(selector);if(!element||element.hidden||!element.getClientRects().length)continue;
      const r=element.getBoundingClientRect();result.push({x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height});
    }
    return result;
  }
  function projectedVisible(target,mainCamera){
    if(!mainCamera)return false;const p=target.position.clone().project(mainCamera);return p.z>-1&&p.z<1&&Math.abs(p.x)<.87&&Math.abs(p.y)<.87;
  }
  function update({cue,targets=[],viewerPosition,elapsed=0,mainCamera,mainStatus=[]}={}){
    if(destroyed)return;
    const viewer=point(viewerPosition),states=new Map(mainStatus.map(s=>[s.id,s]));
    const candidates=PHYSICAL.has(cue?.kind)?targets.map(t=>({...t,position:point(t.position)})).filter(t=>t.kind===cue.kind&&t.entityId&&t.position&&getEntityRoot(t.entityId)):[];
    candidates.sort((a,b)=>(a.kind===cue?.kind?0:1)-(b.kind===cue?.kind?0:1)+(viewer?a.position.distanceTo(viewer)-b.position.distanceTo(viewer):0)*.001);
    const chosen=candidates.find(t=>{const s=states.get(t.id);return s?s.visibility!=='画面中'||s.labelVisible===false:!projectedVisible(t,mainCamera);});
    if(!cue||!chosen){visibleFrames++;if(cue?.kind===status.kind&&visibleFrames<5&&visible)return;visible=false;frame.hidden=true;status={visible:false,reason:'main-view-visible'};return;}
    visibleFrames=0;const root=getEntityRoot(chosen.entityId);loadEntity(root,chosen.entityId,chosen.kind);if(!clone){clear();return;}
    const size=getSize();viewport=findCueLensViewport({...size,obstacles:collectObstacles()});
    if(!viewport){visible=false;frame.hidden=true;status={visible:false,entityId:chosen.entityId,reason:'no-unobstructed-space'};return;}
    const renderHeight=viewport.height-52;camera.aspect=(viewport.width-2)/renderHeight;camera.updateProjectionMatrix();
    const phase=finite(elapsed)?elapsed*.025:0,back=new THREE.Vector3(Math.sin(-.85+phase),.50,Math.cos(-.85+phase)).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),back).normalize(),up=new THREE.Vector3().crossVectors(back,right),tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)),tanX=tanY*camera.aspect;
    let distance=12;
    for(const x of [focusBounds.min.x,focusBounds.max.x])for(const y of [focusBounds.min.y,focusBounds.max.y])for(const z of [focusBounds.min.z,focusBounds.max.z]){const corner=new THREE.Vector3(x,y,z),depth=corner.dot(back);distance=Math.max(distance,depth+Math.abs(corner.dot(right))/tanX,depth+Math.abs(corner.dot(up))/tanY);}
    camera.position.copy(back).multiplyScalar(Math.max(radius*1.05,distance*1.12));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
    highlightMaterial.opacity=.74+.16*Math.sin((finite(elapsed)?elapsed:0)*1.7);
    const modelDistance=viewer?Math.round(viewer.distanceTo(point(chosen.position))):null,reason=states.get(chosen.id)?.visibility||'画面外';
    title.textContent='对象观察窗 · '+(chosen.label||chosen.entityId);subtitle.textContent=lookFor;footer.textContent='真实站点 · '+(modelDistance===null?'':`距潜器约 ${modelDistance} 模型单位 · `)+'镜头独立';
    Object.assign(frame.style,{left:viewport.x+'px',top:viewport.y+'px',width:viewport.width+'px',height:viewport.height+'px'});frame.hidden=false;frame.dataset.entity=chosen.entityId;frame.dataset.cue=cue.id||'';frame.dataset.kind=chosen.kind;
    visible=true;drawn=false;status={visible:true,kind:chosen.kind,entityId:chosen.entityId,label:chosen.label||chosen.entityId,lookFor,highlight:'terrain-corner-brackets'+(openingCentre?'+actual-top-opening':''),openingCentre:openingCentre?.toArray()||null,reason,distance:modelDistance,viewport:{...viewport},drawn:false};
  }
  function render(renderer){
    if(destroyed||!visible||!viewport||!clone)return false;
    const size=getSize(),savedViewport=renderer.getViewport(new THREE.Vector4()),savedScissor=renderer.getScissor(new THREE.Vector4()),savedTest=renderer.getScissorTest(),savedAutoClear=renderer.autoClear,savedColor=renderer.getClearColor(new THREE.Color()),savedAlpha=renderer.getClearAlpha(),savedAutoReset=renderer.info?.autoReset;
    try{
      renderer.autoClear=false;if(renderer.info)renderer.info.autoReset=false;
      const x=viewport.x+1,y=size.height-(viewport.y+viewport.height-22),w=viewport.width-2,h=viewport.height-52;
      renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);renderer.setClearColor(0x12303b,1);renderer.clear(true,true,false);renderer.render(scene,camera);drawn=true;status.drawn=true;return true;
    }finally{
      renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(savedTest);renderer.setClearColor(savedColor,savedAlpha);renderer.autoClear=savedAutoClear;if(renderer.info)renderer.info.autoReset=savedAutoReset;
    }
  }
  return {scene,camera,update,render,clear,getViewport:()=>viewport?{...viewport}:null,getStatus:()=>({...status,viewport:status.viewport?{...status.viewport}:undefined,openingCentre:status.openingCentre?[...status.openingCentre]:status.openingCentre}),destroy(){if(destroyed)return;clear();destroyed=true;groundMaterial.dispose();highlightMaterial.dispose();frame.remove();}};
}
