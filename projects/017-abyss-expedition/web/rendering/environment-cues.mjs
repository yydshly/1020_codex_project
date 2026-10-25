// SPDX-License-Identifier: GPL-3.0-only
// World-space teaching annotations. They do not steer the camera, move a real
// entity, modify its material, or estimate measured current/particle properties.
import * as THREE from 'three';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const KINDS=new Set(['wall','seabed','current','snow','biology','vent','sampling','rov','overview']);
const TEAL=0x74d7ce,GOLD=0xe5c882;
const FLOW_BOUNDS_OFFSETS=[[0,0,0],...[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[x,y,z])))];
const vector=value=>value?.isVector3?value.clone():Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)?V(...value):value&&['x','y','z'].every(key=>Number.isFinite(value[key]))?V(value.x,value.y,value.z):null;
function mesh(parent,geometry,material){const object=new THREE.Mesh(geometry,material);parent.add(object);return object;}
function line(parent,points,color=TEAL,opacity=.75){const g=new THREE.BufferGeometry().setFromPoints(points),m=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}),object=new THREE.Line(g,m);parent.add(object);return object;}
function disposeGroup(group){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const material of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(material);});group.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}

/**
 * All coordinates are world-space. Optional cue.flowPath supplies world points
 * for a different authored terrain; the fallback canyon tangent matches this
 * project's meander, but its flow direction and speed remain teaching symbols.
 */
export function createEnvironmentCues({heightAt,toWorld,entities=[],missionId,texture,terrainMeshes=[]}={}){
  if(typeof heightAt!=='function')throw new TypeError('Environment cues require the rendered terrain heightAt');
  const group=new THREE.Group();group.name='environment-cues';group.visible=false;
  const staticGroup=new THREE.Group(),currentGroup=new THREE.Group(),snowGroup=new THREE.Group(),localSurfaceGroup=new THREE.Group(),rovGroup=new THREE.Group();group.add(staticGroup,currentGroup,snowGroup,localSurfaceGroup,rovGroup);
  const entityMap=new Map(entities.map(entity=>[entity.id,entity]));
  const defaultCourse=missionId==='canyon'?new THREE.CatmullRomCurve3([
    [-450,610],[-280,350],[-190,210],[-71,75],[-15,-60],[30,-177],
    [106,-203],[175,-105],[187,61],[115,243],[210,450],[400,620]
  ].map(([x,z])=>V(x,0,z)),false,'centripetal').getPoints(112):null;
  let cue=null,signature='',destroyed=false,staticTargets=[],localTargets=[],pulses=[],flowArrows=[],flowCentre=null,flowAnchor=null,flowSelectionKey='',surfaceCentre=null,snow=null,rovMarker=null,waterCentre=null,activeCamera=null,activeRegions=[];
  const entityMarkers=new Map(),surfaceRay=new THREE.Raycaster();
  const surfaceMaterials=[];
  function world(entity){const p=typeof toWorld==='function'?vector(toWorld(entity.position)):V((entity.position[0]-.5)*620,0,(entity.position[1]-.5)*620);if(!p)return null;p.y=heightAt(p.x,p.z);return p;}
  const target=(id,label,position,kind,entityId)=>({id,label,position:position.clone(),focusPosition:position.clone(),kind,entityId,detail:cue?.detail||'',primary:false,teaching:['current','snow'].includes(kind)});
  function addPole(parent,p,height,color=GOLD){const end=p.clone().add(V(0,height+7,0));line(parent,[p.clone().add(V(0,height+18,0)),end],color,.83);const cone=mesh(parent,new THREE.ConeGeometry(1.3,3.8,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false}));cone.position.copy(end).add(V(0,-2,0));cone.rotation.z=Math.PI;return end;}
  function drapedRing(parent,p,radius,color=GOLD){const points=[];for(let i=0;i<=80;i++){const a=i/80*Math.PI*2,x=p.x+Math.cos(a)*radius,z=p.z+Math.sin(a)*radius;points.push(V(x,heightAt(x,z)+1,z));}const ring=line(parent,points,color,.65);pulses.push({material:ring.material,base:.58,amount:.19});return ring;}
  function entityMarker(entity,kind,compact=false){const p=world(entity);if(!p)return;const vent=kind==='vent',biology=kind==='biology',sampling=kind==='sampling',height=vent?48:biology?22:sampling?15:20,radius=vent?28:biology?20:sampling?11:13;
    const marker=new THREE.Group();staticGroup.add(marker);entityMarkers.set(entity.id,marker);
    drapedRing(marker,p,radius,kind==='sampling'?GOLD:TEAL);if(!compact)drapedRing(marker,p,radius+3,GOLD);
    addPole(marker,p,height);const focus=p.clone().add(V(0,vent?24:biology?8:sampling?6:10,0)),entry=target(entity.id,entity.label,focus,kind,entity.id);entry.focusHalfSize=radius;staticTargets.push(entry);
  }
  function surfacePatch(parent,p,kind,radius=66){
    // Align with terrain.js's actual 1320 / 320 lattice and diagonal. Querying
    // the same triangle vertices avoids a generic flat "wall highlight" plane.
    const cell=4.125,x0=Math.floor((p.x-radius+660)/cell)*cell-660,z0=Math.floor((p.z-radius+660)/cell)*cell-660,n=Math.ceil(radius*2/cell),edge=n+1,positions=new Float32Array(edge*edge*3),weights=new Float32Array(edge*edge),indices=[];
    for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++){const x=x0+ix*cell,z=z0+iz*cell,h=heightAt(x,z),dx=(heightAt(x+2,z)-heightAt(x-2,z))/4,dz=(heightAt(x,z+2)-heightAt(x,z-2))/4,normal=V(-dx,1,-dz).normalize(),exposure=1-1/Math.sqrt(1+dx*dx+dz*dz),r=Math.hypot((x-p.x)/radius,(z-p.z)/radius),fade=1-smooth(.72,1.1,r),i=iz*edge+ix;positions.set([x+normal.x*.8,h+normal.y*.8,z+normal.z*.8],i*3);weights[i]=fade*(kind==='wall'?.03+.97*smooth(.20,.65,exposure):1-smooth(.12,.58,exposure));}
    for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){const a=iz*edge+ix,b=a+1,c=a+edge,d=c+1;indices.push(a,c,b,c,d,b);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aWeight',new THREE.BufferAttribute(weights,1));geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(kind==='wall'?TEAL:GOLD)},uOpacity:{value:kind==='wall'?.42:.26}},transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      vertexShader:'attribute float aWeight;varying float vWeight;void main(){vWeight=aWeight;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 uColor;uniform float uOpacity;varying float vWeight;void main(){float a=uOpacity*vWeight;if(a<.006)discard;gl_FragColor=vec4(uColor,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    });material.userData.baseOpacity=kind==='wall'?.42:.26;mesh(parent,geometry,material);surfaceMaterials.push(material);
    // Actual height contours on the selected face make the wall's vertical
    // relief readable, rather than drawing an unrelated rectangular grid.
    const contour=[];
    for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3);if(ids.reduce((sum,id)=>sum+weights[id],0)<.55)continue;const hs=ids.map(id=>positions[id*3+1]),min=Math.min(...hs),max=Math.max(...hs);for(let h=Math.ceil(min/18)*18;h<max;h+=18){const hits=[];for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3],ha=positions[a*3+1],hb=positions[b*3+1];if((ha<=h&&hb>h)||(hb<=h&&ha>h)){const t=(h-ha)/(hb-ha);hits.push(V(THREE.MathUtils.lerp(positions[a*3],positions[b*3],t),h+.25,THREE.MathUtils.lerp(positions[a*3+2],positions[b*3+2],t)));}}if(hits.length===2)contour.push(...hits);}}
    if(contour.length){const contours=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(contour),new THREE.LineBasicMaterial({color:GOLD,transparent:true,opacity:.92,depthWrite:false}));parent.add(contours);}
    const border=[];for(let i=0;i<=84;i++){const a=i/84*Math.PI*2,x=p.x+Math.cos(a)*radius*.84,z=p.z+Math.sin(a)*radius*.84;border.push(V(x,heightAt(x,z)+1.1,z));}line(parent,border,TEAL,.93);
    return p.clone().add(V(0,kind==='wall'?32:7,0));
  }
  function resolveEntities(kind){
    const explicit=cue.targetIds.map(id=>entityMap.get(id)).filter(Boolean),source=cue.targetIds.length?explicit:entities;
    if(kind==='biology')return source.filter(e=>e.kind==='coral'||['tube-worms','sponges'].includes(e.appearance));
    if(kind==='vent')return source.filter(e=>e.kind==='vent');
    if(kind==='sampling')return source.filter(e=>e.kind==='sampling'&&(!e.appearance||e.appearance==='water-sampler'));
    if(kind==='wall'||kind==='seabed')return explicit;
    if(kind==='overview')return explicit.length?explicit:source.filter(e=>missionId==='canyon'?['c-wall','c-channel','c-coral','c-sponge'].includes(e.id):['basalt','chimney','garden','plume'].includes(e.id));
    return [];
  }
  function reset(){for(const part of [staticGroup,currentGroup,snowGroup,localSurfaceGroup,rovGroup])disposeGroup(part);staticTargets=[];localTargets=[];pulses=[];flowArrows=[];flowCentre=null;flowAnchor=null;flowSelectionKey='';surfaceCentre=null;snow=null;rovMarker=null;waterCentre=null;entityMarkers.clear();surfaceMaterials.length=0;}
  function setCue(next){
    if(destroyed)return;if(!next){cue=null;signature='';reset();group.visible=false;return;}
    const kind=KINDS.has(next.kind)?next.kind:'overview',targetIds=[...new Set((Array.isArray(next.targetIds)?next.targetIds:[]).filter(id=>typeof id==='string'))],secondaryKinds=[...new Set((Array.isArray(next.secondaryKinds)?next.secondaryKinds:[]).filter(k=>KINDS.has(k)&&k!==kind))],position=vector(next.position),flowPath=(Array.isArray(next.flowPath)?next.flowPath:[]).map(vector).filter(Boolean),key=JSON.stringify([next.id||kind,kind,targetIds,secondaryKinds,position?.toArray(),flowPath.map(p=>p.toArray())]);
    cue={...next,id:String(next.id||kind),kind,targetIds,secondaryKinds,position,flowPath};group.visible=true;
    if(key===signature){for(const t of staticTargets)if(t.id===cue.id){t.label=cue.label||t.label;t.detail=cue.detail||'';}return;}
    reset();signature=key;
    for(const active of [kind,...secondaryKinds]){
      if(['biology','vent','sampling','overview'].includes(active))for(const entity of resolveEntities(active))entityMarker(entity,active==='overview'?(entity.kind==='coral'?'biology':entity.kind==='vent'?'vent':entity.kind==='sampling'?'sampling':'overview'):active,active==='overview');
      if(active==='wall'||active==='seabed')for(const entity of resolveEntities(active)){const p=world(entity),anchor=surfacePatch(staticGroup,p,active,active==='wall'?72:62);addPole(staticGroup,p,active==='wall'?35:8);staticTargets.push(target(entity.id,entity.label,anchor,active,entity.id));}
    }
  }
  function tangentAt(p){
    const path=cue.flowPath.length>=2?cue.flowPath:defaultCourse;
    if(!path)return V(1,0,-.75).normalize();let best=Infinity,direction=V(0,0,1);for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],d=b.clone().sub(a);d.y=0;const len=d.lengthSq();if(len<.001)continue;const t=clamp(((p.x-a.x)*d.x+(p.z-a.z)*d.z)/len,0,1),distance=Math.hypot(p.x-a.x-d.x*t,p.z-a.z-d.z*t);if(distance<best){best=distance;direction.copy(d).normalize();}}return direction;
  }
  function currentPointSafe(point){
    if(!activeCamera?.isCamera)return point.y>heightAt(point.x,point.z)+3;
    if(point.distanceTo(activeCamera.position)<19.2||!sightline(activeCamera.position,point))return false;
    // The complete arrow head fits inside the clear projected stage and water;
    // testing only the centre allowed a long lane to approach the camera and
    // grow into a bright tube across the whole viewport.
    const q=V();for(const [x,y,z]of FLOW_BOUNDS_OFFSETS){q.set(point.x+x,point.y+y,point.z+z);if(!inFocus(q,activeRegions,.008)||q.y<heightAt(q.x,q.z)+.6)return false;}
    return true;
  }
  function buildCurrent(p,selectionKey){
    disposeGroup(currentGroup);flowArrows=[];flowCentre=p.clone();flowAnchor=null;flowSelectionKey=selectionKey;const forward=tangentAt(p),normal=V(-forward.z,0,forward.x);
    const arrowMaterial=new THREE.MeshBasicMaterial({color:0x2bc5be,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}),arrowGeometry=new THREE.ConeGeometry(.42,1.65,8);let longest=0;
    for(const lane of [-.5,.5]){
      let points=[],best=[];
      for(let j=-10;j<=10;j++){const s=j,x=p.x+forward.x*s+normal.x*lane*5,z=p.z+forward.z*s+normal.z*lane*5,y=p.y+lane*.9+Math.sin(s*.07)*.35,q=V(x,y,z);if(currentPointSafe(q))points.push(q);else{if(points.length>best.length)best=points;points=[];}}
      if(points.length>best.length)best=points;if(best.length<4)continue;
      const curve=new THREE.CatmullRomCurve3(best,false,'centripetal');
      // Reject a rare spline overshoot at the bounds; depth-tested artwork is
      // kept in the same small water volume as its anchor throughout its path.
      if(!Array.from({length:41},(_,i)=>curve.getPoint(i/40)).every(currentPointSafe))continue;
      const trail=mesh(currentGroup,new THREE.TubeGeometry(curve,32,.075,5,false),new THREE.MeshBasicMaterial({color:0x24aea9,transparent:true,opacity:.68,depthWrite:false,toneMapped:false}));trail.userData.cueFlow=true;
      if(best.length>longest){longest=best.length;flowAnchor=curve.getPoint(.5);}
      for(let i=0;i<2;i++){const arrow=mesh(currentGroup,arrowGeometry,arrowMaterial);arrow.userData.cueFlow=true;flowArrows.push({arrow,curve,phase:.22+i*.5+lane*.04});}
    }
    if(!flowArrows.length){arrowGeometry.dispose();arrowMaterial.dispose();}
  }
  function buildSnow(){
    const count=280,positions=new Float32Array(count*3),opacities=new Float32Array(count),sizes=new Float32Array(count),seeds=[];for(let i=0;i<count;i++){seeds.push({x:((i*.61803398875)%1-.5)*26,z:((i*.41421356237+.19)%1-.5)*30,y:(i*.73205080757+.13)%1,opacity:.5+(i%7)*.075});sizes[i]=.65+(i%9)*.085;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aOpacity',new THREE.BufferAttribute(opacities,1));geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
    const material=new THREE.ShaderMaterial({uniforms:{uOpacity:{value:.94}},transparent:true,depthWrite:false,depthTest:true,
      vertexShader:'attribute float aOpacity;attribute float aSize;varying float vOpacity;void main(){vOpacity=aOpacity;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(235.*aSize/max(1.,-mv.z),1.8,6.5);gl_Position=projectionMatrix*mv;}',
      fragmentShader:'uniform float uOpacity;varying float vOpacity;void main(){float r=length(gl_PointCoord-vec2(.5));float a=(1.-smoothstep(.1,.5,r))*vOpacity*uOpacity;if(a<.008)discard;gl_FragColor=vec4(.83,.90,.83,a);}'
    });const points=new THREE.Points(geometry,material);points.frustumCulled=false;snowGroup.add(points);
    const arrows=[];for(const p of [V(-5,3,-2),V(6,5,-4)]){const g=new THREE.Group();g.position.copy(p);snowGroup.add(g);line(g,[V(0,3,0),V(0,-2,0)],GOLD,.85);const arrow=mesh(g,new THREE.ConeGeometry(.75,2.2,7),new THREE.MeshBasicMaterial({color:GOLD,transparent:true,opacity:.95,depthWrite:false}));arrow.rotation.z=Math.PI;arrow.position.y=-3;arrows.push({group:g,original:p.y});}
    snow={geometry,seeds,arrows};
  }
  function sightline(from,to){const distance=from.distanceTo(to),steps=Math.max(12,Math.ceil(distance/2.5));for(let i=1;i<steps;i++){const t=i/steps,x=THREE.MathUtils.lerp(from.x,to.x,t),z=THREE.MathUtils.lerp(from.z,to.z,t),y=THREE.MathUtils.lerp(from.y,to.y,t);if(y<heightAt(x,z)+.35)return false;}return true;}
  function regionsOf(focusRegion,focusRegions){
    const regions=(Array.isArray(focusRegions)?focusRegions:focusRegion?[focusRegion]:[]).filter(r=>r&&['left','top','right','bottom'].every(k=>Number.isFinite(r[k]))&&r.right>r.left&&r.bottom>r.top).map(r=>({left:clamp(r.left,.025,.975),top:clamp(r.top,.025,.975),right:clamp(r.right,.025,.975),bottom:clamp(r.bottom,.025,.975)})).filter(r=>r.right-r.left>.04&&r.bottom-r.top>.04);
    return regions.length?regions:[{left:.12,top:.15,right:.88,bottom:.80}];
  }
  function screen(point,camera=activeCamera){if(!camera?.isCamera)return null;const q=point.clone().project(camera),local=point.clone().applyMatrix4(camera.matrixWorldInverse);return {x:q.x*.5+.5,y:.5-q.y*.5,front:local.z<0&&q.z>-1&&q.z<1};}
  function inFocus(point,regions=activeRegions,inset=0){const q=screen(point);return Boolean(q?.front&&regions.some(r=>q.x>=r.left+inset&&q.x<=r.right-inset&&q.y>=r.top+inset&&q.y<=r.bottom-inset));}
  function screenRay(camera,x,y){surfaceRay.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);return {origin:surfaceRay.ray.origin.clone(),direction:surfaceRay.ray.direction.clone()};}
  function heightfieldHit(ray,maxDistance=360){
    // Walk the actual piecewise-linear height field, then refine the first
    // crossing. The final chosen ray is confirmed against the rendered mesh.
    let previous=.5,point=ray.origin.clone().addScaledVector(ray.direction,previous),above=point.y-heightAt(point.x,point.z);if(above<0)return null;
    for(let distance=previous+1.5;distance<=maxDistance;distance+=1.5){point.copy(ray.origin).addScaledVector(ray.direction,distance);const gap=point.y-heightAt(point.x,point.z);if(gap<=0){let low=previous,high=distance;for(let i=0;i<20;i++){const mid=(low+high)*.5,q=ray.origin.clone().addScaledVector(ray.direction,mid);if(q.y>heightAt(q.x,q.z))low=mid;else high=mid;}return ray.origin.clone().addScaledVector(ray.direction,(low+high)*.5);}previous=distance;above=gap;}return null;
  }
  function surfaceNormal(point){const dx=(heightAt(point.x+.6,point.z)-heightAt(point.x-.6,point.z))/1.2,dz=(heightAt(point.x,point.z+.6)-heightAt(point.x,point.z-.6))/1.2;return V(-dx,1,-dz).normalize();}
  function findLocalSurface(p,kind,camera){
    if(!camera?.isCamera)return null;let best=null,bestScore=-Infinity;
    for(const region of activeRegions)for(const fy of [.25,.5,.75])for(const fx of [.2,.4,.6,.8]){
      const sx=THREE.MathUtils.lerp(region.left,region.right,fx),sy=THREE.MathUtils.lerp(region.top,region.bottom,fy),ray=screenRay(camera,sx,sy),point=heightfieldHit(ray);if(!point)continue;
      const normal=surfaceNormal(point),slope=Math.sqrt(Math.max(0,1-normal.y*normal.y))/Math.max(.001,normal.y),facing=normal.dot(camera.position.clone().sub(point).normalize());if(kind==='wall'?slope<.58:slope>1.05)continue;if(facing<.12)continue;
      const anchor=point.clone().addScaledVector(normal,1.5);if(!inFocus(anchor)||!sightline(camera.position,anchor))continue;
      const distance=point.distanceTo(p),score=70-Math.hypot(fx-.5,fy-.5)*35+facing*22+(kind==='wall'?Math.min(3,slope)*5:-slope*12)-distance*.055;
      if(score>bestScore){bestScore=score;best={point,normal,anchor,ray};}
    }
    if(!best)return null;
    if(terrainMeshes.length){surfaceRay.set(best.ray.origin,best.ray.direction);surfaceRay.near=.4;surfaceRay.far=500;const hit=surfaceRay.intersectObjects(terrainMeshes,false)[0];if(!hit)return null;best.point.copy(hit.point);if(hit.face)best.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();best.anchor.copy(best.point).addScaledVector(best.normal,1.5);if(!inFocus(best.anchor)||!sightline(camera.position,best.anchor))return null;}
    return best;
  }
  function visibleWater(camera,p){
    if(!camera?.isCamera)return p.clone().add(V(0,8,0));let best=null,score=-Infinity;
    for(const region of activeRegions)for(const [fx,fy] of [[.5,.5],[.35,.4],[.65,.5],[.5,.65]]){
      const ray=screenRay(camera,THREE.MathUtils.lerp(region.left,region.right,fx),THREE.MathUtils.lerp(region.top,region.bottom,fy));
      for(const distance of [38,30,23,17,11]){const point=ray.origin.clone().addScaledVector(ray.direction,distance),gap=point.y-heightAt(point.x,point.z);if(gap<8||!sightline(ray.origin,point))continue;const quality=distance*.7+Math.min(22,gap)*.35-Math.hypot(fx-.5,fy-.5)*10;if(quality>score){best=point;score=quality;}}
    }
    return best;
  }
  function surfaceFocusMarker(selected){const marker=new THREE.Group();marker.position.copy(selected.anchor);marker.quaternion.setFromUnitVectors(V(0,0,1),selected.normal);localSurfaceGroup.add(marker);const ring=mesh(marker,new THREE.RingGeometry(3.4,3.85,40),new THREE.MeshBasicMaterial({color:GOLD,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false}));ring.renderOrder=2;for(const [x,y]of [[-5,0],[5,0],[0,-5],[0,5]])line(marker,[V(x*.74,y*.74,.06),V(x,y,.06)],GOLD,.95);}
  function clearLocalSurface(){const removed=new Set();localSurfaceGroup.traverse(o=>{if(o.material)removed.add(o.material);});for(let i=surfaceMaterials.length-1;i>=0;i--)if(removed.has(surfaceMaterials[i]))surfaceMaterials.splice(i,1);disposeGroup(localSurfaceGroup);}
  function update({elapsed=0,viewerPosition,camera,focusRegion,focusRegions}={}){
    if(destroyed||!cue)return;const p=vector(viewerPosition);if(!p)return;const time=Number.isFinite(elapsed)?Math.max(0,elapsed):0,kinds=[cue.kind,...cue.secondaryKinds];localTargets=[];activeCamera=camera;activeRegions=regionsOf(focusRegion,focusRegions);camera?.updateMatrixWorld?.(true);
    for(const pulse of pulses)pulse.material.opacity=pulse.base+Math.sin(time*1.8)*pulse.amount;
    // Symbols occupy clear water already visible through the actual projected
    // camera, including its viewOffset. They stay world anchored while readable.
    if(kinds.includes('current')||kinds.includes('snow')){
      if(!waterCentre||!inFocus(waterCentre,activeRegions,.015)||!sightline(camera.position,waterCentre)||waterCentre.distanceTo(camera.position)>85)waterCentre=visibleWater(camera,p);
    }
    if(kinds.includes('current')){
      const workCentre=waterCentre,flowKey=[...(camera?.position?.toArray()||[]).map(v=>Math.round(v/2)),...(camera?.projectionMatrix?.elements||[]).map(v=>Math.round(v*40)),...(typeof camera?.getWorldDirection==='function'?camera.getWorldDirection(V()).toArray():[]).map(v=>Math.round(v*40)),...activeRegions.flatMap(r=>Object.values(r).map(v=>Math.round(v*100)))].join('/'),readable=flowArrows.length&&flowArrows.every(({curve})=>[0,.25,.5,.75,1].every(t=>currentPointSafe(curve.getPoint(t))));
      if(workCentre&&(!flowCentre||flowCentre.distanceTo(workCentre)>3||flowSelectionKey!==flowKey&&!readable))buildCurrent(workCentre,flowKey);
      for(const {arrow,curve,phase} of flowArrows){const t=((time*.045+phase)%1+1)%1;arrow.position.copy(curve.getPoint(t));arrow.quaternion.setFromUnitVectors(V(0,1,0),curve.getTangent(t).normalize());}
      currentGroup.visible=Boolean(workCentre&&flowArrows.length);if(workCentre&&flowArrows.length){const entry=target(`${cue.id}:current`,'眼前水流 · 箭头为流动示意',flowAnchor||flowCentre,'current');entry.primary=cue.kind==='current';entry.focusHalfSize=12;localTargets.push(entry);}
    }
    if(kinds.includes('snow')){
      if(!snow)buildSnow();const centre=waterCentre;snowGroup.visible=Boolean(centre);if(centre){snowGroup.position.copy(centre);
      const position=snow.geometry.attributes.position,alpha=snow.geometry.attributes.aOpacity;
      for(let i=0;i<snow.seeds.length;i++){const seed=snow.seeds[i],life=((seed.y-time*.023)%1+1)%1,x=seed.x+Math.sin(time*.11+i)*.7,z=seed.z+Math.sin(time*.09+i*2)*.6,y=(life-.5)*26,visible=centre.y+y>heightAt(centre.x+x,centre.z+z)+.8;position.setXYZ(i,x,y,z);alpha.setX(i,visible?seed.opacity*smooth(0,.15,life)*smooth(0,.15,1-life):0);}position.needsUpdate=true;alpha.needsUpdate=true;
      snow.arrows.forEach(({group,original},i)=>{group.position.y=original-((time*.2+i*.5)%1)*4;group.visible=centre.y+group.position.y-5>heightAt(centre.x+group.position.x,centre.z+group.position.z)+1;});
      const entry=target(`${cue.id}:snow`,'眼前海洋雪 · 亮点向下沉降',centre,'snow');entry.primary=cue.kind==='snow';entry.focusHalfSize=15;localTargets.push(entry);}
    }
    if(kinds.includes('wall')||kinds.includes('seabed')||kinds.includes('overview')&&missionId==='canyon'){
      const kind=kinds.includes('seabed')&&!kinds.includes('wall')?'seabed':'wall',cameraPoint=vector(camera?.position),direction=typeof camera?.getWorldDirection==='function'?camera.getWorldDirection(V()):V(),selectionKey=[...(cameraPoint||p).toArray().map(v=>Math.round(v/8)),...direction.toArray().map(v=>Math.round(v*14)),...(camera?.projectionMatrix?.elements||[]).map(v=>Math.round(v*20)),...activeRegions.flatMap(r=>Object.values(r).map(v=>Math.round(v*100)))].join('/'),stillVisible=surfaceCentre?.anchor&&inFocus(surfaceCentre.anchor,activeRegions,.01)&&(!cameraPoint||sightline(cameraPoint,surfaceCentre.anchor));
      if(!surfaceCentre||!stillVisible&&surfaceCentre.selectionKey!==selectionKey||surfaceCentre.anchor&&p.distanceTo(surfaceCentre.point)>250){clearLocalSurface();surfaceCentre={selectionKey,anchor:null,point:null};const selected=findLocalSurface(p,kind,camera);if(selected){surfacePatch(localSurfaceGroup,selected.point,kind,kind==='wall'?32:28);surfaceFocusMarker(selected);surfaceCentre.anchor=selected.anchor;surfaceCentre.point=selected.point;surfaceCentre.normal=selected.normal;}}
      if(surfaceCentre.anchor){const entry=target(`${cue.id}:local-${kind}`,kind==='wall'?'眼前岩壁 · 金色圈选处':'眼前海床 · 金色圈选处',surfaceCentre.anchor,kind);entry.primary=['wall','seabed','overview'].includes(cue.kind);entry.surfacePoint=surfaceCentre.point.clone();entry.normal=surfaceCentre.normal.clone();entry.focusHalfSize=22;localTargets.push(entry);}
    }
    if(kinds.includes('rov')){
      if(!rovMarker){const ring=mesh(rovGroup,new THREE.TorusGeometry(16,.2,6,64),new THREE.MeshBasicMaterial({color:GOLD,transparent:true,opacity:.7,depthWrite:false}));ring.rotation.x=Math.PI/2;const pole=addPole(rovGroup,V(),18);rovMarker={ring,pole};}rovGroup.position.copy(p);rovMarker.ring.material.opacity=.55+.15*Math.sin(time*1.8);localTargets.push(target(`${cue.id}:rov`,'正在驾驶的无人潜器',p.clone().add(V(0,25,0)),'rov'));
    }
    // Include surfaces created during this very update in the media-time pulse.
    for(const material of surfaceMaterials)material.uniforms.uOpacity.value=material.userData.baseOpacity+.025*Math.sin(time*1.3);
    // Keep biology attached to the real authored colony. Prefer an already
    // visible colony; otherwise expose the nearest true target for the user's
    // explicit focus/lens action rather than creating a fake animal nearby.
    const sorted=staticTargets.map(entry=>({...entry,visibleInFocus:inFocus(entry.position)&&sightline(camera?.position||p,entry.position)})).sort((a,b)=>Number(b.visibleInFocus)-Number(a.visibleInFocus)||a.position.distanceTo(p)-b.position.distanceTo(p));
    const relevant=sorted.filter(entry=>cue.kind==='overview'?['overview','wall','seabed'].includes(entry.kind):entry.kind===cue.kind),primary=relevant[0]||sorted[0];for(const entry of staticTargets){entry.primary=entry.id===primary?.id&&!localTargets.some(t=>t.primary);entry.visibleInFocus=inFocus(entry.position)&&sightline(camera?.position||p,entry.position);const marker=entityMarkers.get(entry.id);if(marker)marker.visible=entry.id===primary?.id||entry.visibleInFocus;}staticTargets.sort((a,b)=>Number(b.primary)-Number(a.primary)||Number(b.visibleInFocus)-Number(a.visibleInFocus));
  }
  function getTargets(){return [...localTargets,...staticTargets].map(t=>({...t,position:t.position.clone(),focusPosition:t.focusPosition?.clone()||t.position.clone(),surfacePoint:t.surfacePoint?.clone(),normal:t.normal?.clone(),visibleInFocus:inFocus(t.position)&&(!activeCamera||sightline(activeCamera.position,t.position))})).sort((a,b)=>Number(b.primary)-Number(a.primary)||Number(b.visibleInFocus)-Number(a.visibleInFocus));}
  function destroy(){if(destroyed)return;reset();cue=null;group.visible=false;group.removeFromParent();destroyed=true;/* external texture belongs to the scene */}
  return {group,setCue,update,getTargets,destroy};
}
