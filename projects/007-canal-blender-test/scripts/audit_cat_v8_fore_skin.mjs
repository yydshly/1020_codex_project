// CPU-only audit: actual preserved GLB, no GPU or changes to source assets.
import {readFile, writeFile} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
const project = new URL('../',import.meta.url), web = new URL('web/',project);
const threeURL = new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL = new URL('vendor/three/examples/jsm/',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE = await import(threeURL);
const {GLTFLoader} = await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,values){this.type=type;Object.assign(this,values);}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(resource,options)=>{const url=resource instanceof URL?resource:new URL(typeof resource==='string'?resource:resource.url);return url.protocol==='file:'?new Response(await readFile(url)):nativeFetch(resource,options);};
GLTFLoader.prototype.loadAsync=async function(url){
  const bytes=await readFile(new URL(url)),size=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+size).toString()),offset=20+size,binSize=bytes.readUInt32LE(offset);
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(offset+8,offset+8+binSize).toString('base64');
  delete json.images;delete json.textures;delete json.materials;delete json.samplers;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  const loaded=await this.parseAsync(JSON.stringify(json),'');
  loaded.scene.traverse(node=>{if(node.isMesh)node.material.map=new THREE.Texture();});return loaded;
};


const {createCat}=await import(new URL('cat-v7-head.js',web));
const cat=await createCat(THREE);cat.setAttention({enabled:false});cat.setBlink({mode:'open'});
let mesh;const boneMap=new Map();cat.object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;if(n.isBone)boneMap.set(n.name,n);});
const beforeGeometry=mesh.geometry;
const {prepareLimbSkin}=await import(new URL('cat-v8-limb-skin.js',web));
const correction=prepareLimbSkin(THREE,cat.object);
const g=mesh.geometry,p=g.attributes.position,sw=g.attributes.skinWeight,si=g.attributes.skinIndex,idx=g.index;
const vs=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i));
const ds=vs.map(v=>v.clone());
const edges=[],seen=new Set();
for(let k=0;k<idx.count;k+=3){const ids=[idx.getX(k),idx.getX(k+1),idx.getX(k+2)];for(let j=0;j<3;j++){
 const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);
 if(vs[a].y>.27||vs[b].y>.27||vs[a].z<.025||vs[b].z<.025)continue;
 const length=vs[a].distanceTo(vs[b]);if(length<.001)continue;
 edges.push({a,b,length,ratio:0,time:0,crossMidline:vs[a].x*vs[b].x<0});
}}
const runs=[];
for(const speed of [.4,.6]){
 cat.object.position.set(0,0,0);cat.update(0,{reset:true,time:0});
 const events=[],supportCounts={},footPrev={},jointRanges={},bob=[];
 for(const edge of edges){edge.ratio=0;edge.time=0;}
 for(let frame=1;frame<=240;frame++){
  const t=frame/60;cat.object.position.z+=speed/60;cat.update(1/60,{speed,moving:true,time:t,sampleHeight:()=>0});
  const state=cat.getDebugState();mesh.skeleton.update();
  if(frame>60){
   supportCounts[state.gait.stanceFeet]=(supportCounts[state.gait.stanceFeet]||0)+1;
   for(const f of state.feet){if(footPrev[f.name]===true&&!f.stance)events.push({time:t,foot:f.name,phase:state.gait.phase});footPrev[f.name]=f.stance;}
   for(const key of ['fore_left','fore_right','hind_left','hind_right']){
    const h=boneMap.get(key+'_upper').getWorldPosition(new THREE.Vector3()),k=boneMap.get(key+'_lower').getWorldPosition(new THREE.Vector3()),a=boneMap.get(key+'_paw').getWorldPosition(new THREE.Vector3());
    const angle=k.clone().sub(h).angleTo(a.clone().sub(k))*180/Math.PI;
    const upperAngle=Math.atan2(k.z-h.z,h.y-k.y)*180/Math.PI;
    const entry=jointRanges[key]??={bendMin:Infinity,bendMax:-Infinity,upperMin:Infinity,upperMax:-Infinity};
    entry.bendMin=Math.min(entry.bendMin,angle);entry.bendMax=Math.max(entry.bendMax,angle);entry.upperMin=Math.min(entry.upperMin,upperAngle);entry.upperMax=Math.max(entry.upperMax,upperAngle);
   }
   bob.push(boneMap.get('chest').getWorldPosition(new THREE.Vector3()).y);
  }
  if(frame%2===0&&frame>60){
   for(let i=0;i<vs.length;i++)if(vs[i].y<=.27&&vs[i].z>.025)mesh.applyBoneTransform(i,ds[i].copy(vs[i]));
   for(const edge of edges){const ratio=ds[edge.a].distanceTo(ds[edge.b])/edge.length;if(ratio>edge.ratio){edge.ratio=ratio;edge.time=t;edge.deformed=[ds[edge.a].toArray(),ds[edge.b].toArray()];}}
  }
 }
 const sorted=[...edges].sort((a,b)=>b.ratio-a.ratio),cross=sorted.filter(e=>e.crossMidline);
 const detail=edge=>({...edge,original:[vs[edge.a].toArray(),vs[edge.b].toArray()],weights:[edge.a,edge.b].map(i=>Array.from({length:4},(_,s)=>[mesh.skeleton.bones[si.getComponent(i,s)].name,sw.getComponent(i,s)]))});
 const perFoot=Object.fromEntries(['fore_left','fore_right','hind_left','hind_right'].map(key=>{const times=events.filter(e=>e.foot===key).map(e=>e.time),periods=times.slice(1).map((v,i)=>v-times[i]);return[key,{cycles:times.length,meanCycleSeconds:periods.reduce((a,b)=>a+b,0)/periods.length}];}));
 runs.push({speed,events,perFoot,supportCounts,jointRanges,chestVerticalPeakToPeak:Math.max(...bob)-Math.min(...bob),hindEdges:edges.length,crossMidlineEdges:cross.length,worst:sorted.slice(0,12).map(detail),worstCrossMidline:cross.slice(0,6).map(detail),p95:sorted[Math.floor(sorted.length*.05)].ratio,p99:sorted[Math.floor(sorted.length*.01)].ratio});
}
const arrayEqual=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const checks={geometry_is_new_instance:mesh.geometry!==beforeGeometry,
 positions_unchanged:arrayEqual(g.attributes.position.array,beforeGeometry.attributes.position.array),
 normals_unchanged:arrayEqual(g.attributes.normal.array,beforeGeometry.attributes.normal.array),
 uv_unchanged:arrayEqual(g.attributes.uv.array,beforeGeometry.attributes.uv.array),
 indices_unchanged:arrayEqual(g.index.array,beforeGeometry.index.array)};
let paws=true,protectedSkin=true,valid=true;const names=mesh.skeleton.bones.map(b=>b.name);
for(let i=0;i<p.count;i++){
 const protectedVertex=[0,1,2,3].some(s=>beforeGeometry.attributes.skinWeight.getComponent(i,s)>0&&/^(head|neck|tail_)/.test(names[beforeGeometry.attributes.skinIndex.getComponent(i,s)]));
 let sum=0;
 for(let s=0;s<4;s++){
  const w=sw.getComponent(i,s),j=si.getComponent(i,s);sum+=w;valid&&=Number.isFinite(w)&&w>=0&&w<=1&&j>=0&&j<names.length;
  const equal=w===beforeGeometry.attributes.skinWeight.getComponent(i,s)&&j===beforeGeometry.attributes.skinIndex.getComponent(i,s);
  if(p.getY(i)<=.065)paws&&=equal;if(protectedVertex)protectedSkin&&=equal;
 }
 valid&&=Math.abs(sum-1)<1e-6;
}
checks.low_paws_unchanged=paws;checks.head_neck_tail_unchanged=protectedSkin;checks.skin_weights_valid=valid;
const oldReport=JSON.parse(await readFile(new URL('assets/cat-v8-fore-gait-audit.json',project),'utf8'));
const comparison=runs.map((r,i)=>({speed:r.speed,oldWorst:oldReport.runs[i].worst[0].ratio,newWorst:r.worst[0].ratio,oldP95:oldReport.runs[i].p95,newP95:r.p95,oldP99:oldReport.runs[i].p99,newP99:r.p99,oldMidline:oldReport.runs[i].worstCrossMidline[0].ratio,newMidline:r.worstCrossMidline[0].ratio}));
checks.fore_edges_measured=runs.every(r=>r.hindEdges>1000);

const report={checkedAt:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,stats:correction.stats,method:'CPU same V7 gait and geometry; only new limb weights changed',comparison,runs};
await writeFile(new URL('assets/cat-v8-fore-skin-check.json',project),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks,stats:report.stats,comparison,worst:runs[1].worst[0]},null,2));
correction.dispose();cat.dispose();
