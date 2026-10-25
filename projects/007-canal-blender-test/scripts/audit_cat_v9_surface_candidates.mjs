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


const {createCat}=await import(new URL('cat-v9.js',web));
const {prepareSurfaceSkin}=await import(new URL('cat-v9-skin.js',web));
const results=[];
for(const tolerance of [0,.00005,.0001]){
 const cat=await createCat(THREE,{surfaceSkin:false});cat.setAttention({enabled:false});cat.setBlink({mode:'open'});
 let mesh;cat.object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;});
 const helper=tolerance?prepareSurfaceSkin(THREE,cat.object,{iterations:48,weldTolerance:tolerance}):null;
 const p=mesh.geometry.attributes.position,idx=mesh.geometry.index;
 const vs=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i)),ds=vs.map(v=>v.clone());
 const edges=[],seen=new Set();
 for(let k=0;k<idx.count;k+=3){const tri=[idx.getX(k),idx.getX(k+1),idx.getX(k+2)];for(let j=0;j<3;j++){
  const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);
  if(vs[a].y>.27||vs[b].y>.27||vs[a].y<.065||vs[b].y<.065)continue;
  const length=vs[a].distanceTo(vs[b]);if(length>.001)edges.push({a,b,length,max:0});
 }}
 let time=0;
 for(let frame=1;frame<=180;frame++){
  time+=1/60;const speed=Math.min(.9,time*1.4);cat.object.position.z+=speed/60;cat.update(1/60,{speed,moving:true,time,sampleHeight:()=>0});
  if(frame<60||frame%6)continue;mesh.skeleton.update();
  for(let i=0;i<vs.length;i++)mesh.applyBoneTransform(i,ds[i].copy(vs[i]));
  for(const e of edges){const r=ds[e.a].distanceTo(ds[e.b])/e.length;if(r>e.max){e.max=r;e.frame=frame;}}
 }
 const sorted=edges.sort((a,b)=>b.max-a.max),weight=i=>Array.from({length:4},(_,s)=>[mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(i,s)].name,mesh.geometry.attributes.skinWeight.getComponent(i,s)]);
 const worst=sorted.slice(0,3).map(e=>({...e,original:[vs[e.a].toArray(),vs[e.b].toArray()],weights:[weight(e.a),weight(e.b)]}));
 results.push({tolerance,stats:helper?.stats,edges:edges.length,max:sorted[0].max,p99:sorted[Math.floor(sorted.length*.01)].max,p95:sorted[Math.floor(sorted.length*.05)].max,worst});
 helper?.dispose();cat.dispose();
}
await writeFile(new URL('assets/cat-v9-surface-candidate-audit.json',project),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
