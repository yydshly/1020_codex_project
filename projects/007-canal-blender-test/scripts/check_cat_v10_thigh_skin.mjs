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


const {createCat}=await import(new URL('cat-v10.js',web));
const {prepareThighSkin}=await import(new URL('cat-v10-thigh-skin.js',web));
const reports=[];
for(const sigma of [0,1]){
 const cat=await createCat(THREE,{variant:'current'});cat.setAttention({enabled:false});cat.setBlink({mode:'open'});let mesh;cat.object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;});
 const original=mesh.geometry, oldWeights=original.attributes.skinWeight.array.slice(),oldJoints=original.attributes.skinIndex.array.slice();
 const helper=sigma?prepareThighSkin(THREE,cat.object):null;
 const region=()=>{
 const names=mesh.skeleton.bones.map(b=>b.name),out={};
 for(const key of ['hind_left','hind_right']){const lo=names.indexOf(key+'_lower'),up=names.indexOf(key+'_upper');let count=0,over10=0,over30=0,over50=0,sumLo=0,sumTotal=0;const samples=[];
 for(let i=0;i<mesh.geometry.attributes.position.count;i++){const pos=mesh.geometry.attributes.position,x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);if(y<=.165||z>=-.12||(key.endsWith('left')?x>=0:x<=0))continue;let l=0,u=0;for(let slot=0;slot<4;slot++){const b=mesh.geometry.attributes.skinIndex.getComponent(i,slot),w=mesh.geometry.attributes.skinWeight.getComponent(i,slot);if(b===lo)l+=w;if(b===up)u+=w;}if(l+u<=.01)continue;count++;sumLo+=l;sumTotal+=l+u;if(l>.1)over10++;if(l>.3)over30++;if(l>.5)over50++;samples.push({id:i,position:[x,y,z],upper:u,lower:l});}
 samples.sort((a,b)=>b.lower-a.lower);out[key]={count,over10,over30,over50,meanLower:sumLo/count,weightedLowerFraction:sumLo/sumTotal,samples:samples.slice(0,5)};
 }return out;};
 const thighRegion=region();
 const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,idx=mesh.geometry.index;
 const vertices=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i)),points=vertices.map(v=>v.clone()),grid=new Map(),pairs=[],radius=.00015,edges=[],seen=new Set();
 for(let i=0;i<vertices.length;i++){const v=vertices[i];if(v.y<.065||v.y>.265)continue;const c=[v.x,v.y,v.z].map(x=>Math.floor(x/radius));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const ids=grid.get([c[0]+x,c[1]+y,c[2]+z].join(','));if(!ids)continue;for(const j of ids){const distance=v.distanceTo(vertices[j]);if(distance<=radius&&Math.hypot(uv.getX(i)-uv.getX(j),uv.getY(i)-uv.getY(j))>.025)pairs.push({a:i,b:j,rest:distance,max:0});}}const key=c.join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}
 for(let k=0;k<idx.count;k+=3){const tri=[idx.getX(k),idx.getX(k+1),idx.getX(k+2)];for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);if(vertices[a].y>.27||vertices[b].y>.27||vertices[a].y<.065||vertices[b].y<.065)continue;const length=vertices[a].distanceTo(vertices[b]);if(length>.001)edges.push({a,b,length,max:0});}}
 let time=0;
 for(let frame=1;frame<=180;frame++){time+=1/60;const speed=Math.min(.9,time*1.4);cat.object.position.z+=speed/60;cat.update(1/60,{speed,moving:true,time,sampleHeight:()=>0});if(frame<60||frame%6)continue;mesh.skeleton.update();for(let i=0;i<vertices.length;i++)mesh.applyBoneTransform(i,points[i].copy(vertices[i]));for(const pair of pairs)pair.max=Math.max(pair.max,points[pair.a].distanceTo(points[pair.b]));for(const edge of edges)edge.max=Math.max(edge.max,points[edge.a].distanceTo(points[edge.b])/edge.length);}
 pairs.sort((a,b)=>b.max-a.max);edges.sort((a,b)=>b.max-a.max);
 const checks={};for(const name of ['position','normal','uv'])checks[name+'_unchanged']=original.attributes[name].array.every((v,i)=>v===mesh.geometry.attributes[name].array[i]);checks.index_unchanged=original.index.array.every((v,i)=>v===idx.array[i]);
 let protectedChanged=0,maxSumError=0;
 for(let i=0;i<p.count;i++){let protect=p.getY(i)<=.065,sum=0;for(let s=0;s<4;s++)if(oldWeights[i*4+s]>1e-6&&/^(head|neck|tail)/.test(mesh.skeleton.bones[oldJoints[i*4+s]].name))protect=true;for(let s=0;s<4;s++){const w=mesh.geometry.attributes.skinWeight.array[4*i+s];sum+=w;if(protect&&(oldWeights[4*i+s]!==w||oldJoints[4*i+s]!==mesh.geometry.attributes.skinIndex.array[4*i+s]))protectedChanged++;}maxSumError=Math.max(maxSumError,Math.abs(sum-1));}
 let nonLegChanged=0,legTotalError=0;
 const nms=mesh.skeleton.bones.map(b=>b.name);
 for(let i=0;i<p.count;i++){const a=new Map(),b=new Map();for(let q=0;q<4;q++){a.set(oldJoints[4*i+q],(a.get(oldJoints[4*i+q])||0)+oldWeights[4*i+q]);b.set(mesh.geometry.attributes.skinIndex.array[4*i+q],(b.get(mesh.geometry.attributes.skinIndex.array[4*i+q])||0)+mesh.geometry.attributes.skinWeight.array[4*i+q]);}for(let n=0;n<nms.length;n++)if(!/^hind_(left|right)_(upper|lower)$/.test(nms[n])&&Math.abs((a.get(n)||0)-(b.get(n)||0))>1e-7)nonLegChanged++;for(const side of ['left','right']){const u=nms.indexOf('hind_'+side+'_upper'),l=nms.indexOf('hind_'+side+'_lower');legTotalError=Math.max(legTotalError,Math.abs((a.get(u)||0)+(a.get(l)||0)-(b.get(u)||0)-(b.get(l)||0)));}}
 checks.non_leg_weights_unchanged=nonLegChanged===0;checks.hind_leg_totals_preserved=legTotalError<1e-6;
 checks.protected_unchanged=protectedChanged===0;checks.normalized=maxSumError<1e-6;
 const report={candidate:!!sigma,thighRegion,stats:helper?.stats,checks,maxSumError,seams:{pairs:pairs.length,maxMm:pairs[0]?.max*1000,p99Mm:pairs[Math.floor(pairs.length*.01)]?.max*1000,p95Mm:pairs[Math.floor(pairs.length*.05)]?.max*1000,over1mm:pairs.filter(p=>p.max>.001).length,worst:pairs.slice(0,3)},edges:{count:edges.length,max:edges[0].max,p99:edges[Math.floor(edges.length*.01)].max,p95:edges[Math.floor(edges.length*.05)].max,worst:edges.slice(0,3)}};
 reports.push(report);console.log(JSON.stringify(report));
 if(sigma){const count=p.count*4,buffer=new ArrayBuffer(16+count*6),view=new DataView(buffer);view.setUint32(0,0x31535343,true);view.setUint32(4,1,true);view.setUint32(8,p.count,true);view.setUint32(12,mesh.skeleton.bones.length,true);new Uint16Array(buffer,16,count).set(mesh.geometry.attributes.skinIndex.array);new Float32Array(buffer,16+count*2,count).set(mesh.geometry.attributes.skinWeight.array);await writeFile(new URL('assets/cat-v10-thigh-skin.bin',project),new Uint8Array(buffer));}
 helper?.dispose();cat.dispose();
}
await writeFile(new URL('assets/cat-v10-thigh-skin-check.json',project),JSON.stringify({checkedAt:new Date().toISOString(),reports},null,2)+'\n');
