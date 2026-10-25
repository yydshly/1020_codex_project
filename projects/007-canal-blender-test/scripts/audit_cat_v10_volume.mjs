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
const {createVolumeEvaluator}=await import(new URL('cat-v10-volume.js',web));
const cat=await createCat(THREE,{surfaceSkin:false});cat.setAttention({enabled:false});cat.setBlink({mode:'open'});
let mesh;cat.object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;});
const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,idx=mesh.geometry.index;
const vs=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i));
const evaluator=createVolumeEvaluator(THREE,mesh);
const variants=[0,.5,1].map(strength=>({strength,points:vs.map(v=>v.clone()),edges:[],areas:[],seams:[],maxDisplacement:0,protectedDifference:0,frames:0}));
const edges=[],seen=new Set(),triangles=[];
const ab=new THREE.Vector3(),ac=new THREE.Vector3();
for(let k=0;k<idx.count;k+=3){
 const tri=[idx.getX(k),idx.getX(k+1),idx.getX(k+2)];
 if(tri.some(i=>vs[i].y>.27||vs[i].y<.065))continue;
 const area=ab.subVectors(vs[tri[1]],vs[tri[0]]).cross(ac.subVectors(vs[tri[2]],vs[tri[0]])).length()*.5;
 if(area>1e-7)triangles.push({tri,area});
 for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);const length=vs[a].distanceTo(vs[b]);if(length>.001)edges.push({a,b,length});}
}
const pairs=[],grid=new Map(),radius=.00015;
for(let i=0;i<vs.length;i++){const v=vs[i];if(v.y<.065||v.y>.265)continue;const c=[v.x,v.y,v.z].map(x=>Math.floor(x/radius));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const ids=grid.get([c[0]+x,c[1]+y,c[2]+z].join(','));if(!ids)continue;for(const j of ids){const distance=v.distanceTo(vs[j]);if(distance<=radius&&Math.hypot(uv.getX(i)-uv.getX(j),uv.getY(i)-uv.getY(j))>.025)pairs.push({a:i,b:j,rest:distance});}}const key=c.join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}
for(const v of variants){v.edges=edges.map(()=>0);v.areas=triangles.map(()=>0);v.seams=pairs.map(()=>0);}
let time=0;
for(let frame=1;frame<=180;frame++){
 time+=1/60;const speed=Math.min(.9,time*1.4);cat.object.position.z+=speed/60;cat.update(1/60,{speed,moving:true,time,sampleHeight:()=>0});
 if(frame<60||frame%6)continue;evaluator.update();
 for(const variant of variants){variant.frames++;
  for(let i=0;i<vs.length;i++){evaluator.transformVertex(i,variant.points[i],variant.strength);const d=variant.points[i].distanceTo(variants[0].points[i]);variant.maxDisplacement=Math.max(variant.maxDisplacement,d);if(evaluator.masks[i]===0)variant.protectedDifference=Math.max(variant.protectedDifference,d);}
  for(let j=0;j<edges.length;j++){const e=edges[j];variant.edges[j]=Math.max(variant.edges[j],variant.points[e.a].distanceTo(variant.points[e.b])/e.length);}
  for(let j=0;j<triangles.length;j++){const {tri,area}=triangles[j];const value=ab.subVectors(variant.points[tri[1]],variant.points[tri[0]]).cross(ac.subVectors(variant.points[tri[2]],variant.points[tri[0]])).length()*.5/area;variant.areas[j]=Math.max(variant.areas[j],value);}
  for(let j=0;j<pairs.length;j++){const e=pairs[j];variant.seams[j]=Math.max(variant.seams[j],variant.points[e.a].distanceTo(variant.points[e.b]));}
  if(frame===66){const raw=new Float32Array(vs.length*3);variant.points.forEach((v,i)=>v.toArray(raw,i*3));await writeFile(new URL(`assets/cat-v10-volume-pose-${variant.strength}.bin`,project),new Uint8Array(raw.buffer));}
 }
}
const summary=values=>{const s=values.slice().sort((a,b)=>b-a);return{max:s[0],p99:s[Math.floor(s.length*.01)],p95:s[Math.floor(s.length*.05)]};};
const results=variants.map(v=>({strength:v.strength,frames:v.frames,edge:summary(v.edges),area:summary(v.areas),seamMm:summary(v.seams.map(x=>x*1000)),seamsOver1mm:v.seams.filter(x=>x>.001).length,maxDisplacement:v.maxDisplacement,protectedDifference:v.protectedDifference}));
const report={method:'Identical V9 poses, LBS versus regional DQ. Head/neck/tail and low paws excluded.',vertices:p.count,edges:edges.length,triangles:triangles.length,seams:pairs.length,results};
await writeFile(new URL('assets/cat-v10-volume-audit.json',project),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));cat.dispose();
