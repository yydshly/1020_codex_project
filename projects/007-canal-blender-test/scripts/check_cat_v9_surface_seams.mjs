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
const reports=[];
for(const variant of ['baseline','1um','50um','100um']){
const cat=await createCat(THREE,{surfaceSkin:false});let mesh;cat.object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;});
if(variant!=='baseline'){const name=variant==='1um'?'cat-v9-surface-skin':`cat-v9-surface-skin-candidate-${variant}`;const raw=await readFile(new URL(`models/${name}.bin`,web)),buf=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),count=mesh.geometry.attributes.position.count*4;mesh.geometry.attributes.skinIndex.array.set(new Uint16Array(buf,16,count));mesh.geometry.attributes.skinWeight.array.set(new Float32Array(buf,16+count*2,count));}
const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,vertices=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i)),points=vertices.map(v=>v.clone()),grid=new Map(),pairs=[],radius=.00015;
for(let i=0;i<vertices.length;i++){const v=vertices[i];if(v.y<.065||v.y>.265)continue;const c=[v.x,v.y,v.z].map(x=>Math.floor(x/radius));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const ids=grid.get([c[0]+x,c[1]+y,c[2]+z].join(','));if(!ids)continue;for(const j of ids){const distance=v.distanceTo(vertices[j]);if(distance<=radius&&Math.hypot(uv.getX(i)-uv.getX(j),uv.getY(i)-uv.getY(j))>.025)pairs.push({a:i,b:j,rest:distance,max:0});}}const key=c.join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}
const ids=[...new Set(pairs.flatMap(p=>[p.a,p.b]))];let time=0;
for(let frame=1;frame<=180;frame++){time+=1/60;const speed=Math.min(.9,time*1.4);cat.object.position.z+=speed/60;cat.update(1/60,{speed,moving:true,time,sampleHeight:()=>0});if(frame<60||frame%6)continue;mesh.skeleton.update();for(const i of ids)mesh.applyBoneTransform(i,points[i].copy(vertices[i]));for(const pair of pairs)pair.max=Math.max(pair.max,points[pair.a].distanceTo(points[pair.b]));}
pairs.sort((a,b)=>b.max-a.max);reports.push({variant,pairs:pairs.length,maxMm:pairs[0]?.max*1000,p99Mm:pairs[Math.floor(pairs.length*.01)]?.max*1000,p95Mm:pairs[Math.floor(pairs.length*.05)]?.max*1000,over1mm:pairs.filter(p=>p.max>.001).length,worst:pairs.slice(0,3)});cat.dispose();}
await writeFile(new URL('assets/cat-v9-surface-seam-check.json',project),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
