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
const results=[];
for(const rates of [[1/60],[1/30],[.0166,.0167,.0168,.0155,.018,.0333,.0083]]) {
 const cat=await createCat(THREE);let time=0,speed=0,frame=0,maxError=0,air=0,runFrames=0,counts={},contacts=[],last={};
 const phases=[{duration:1,speed:0},{duration:4,speed:.36},{duration:5,speed:.9},{duration:3,speed:.36},{duration:4,speed:.9},{duration:2,speed:0}];
 for(let segment=0;segment<phases.length;segment++){
  let local=0;const item=phases[segment];
  while(local<item.duration){const dt=rates[frame++%rates.length];local+=dt;time+=dt;speed+=Math.sign(item.speed-speed)*Math.min(Math.abs(item.speed-speed),(item.speed>speed?1:1.8)*dt);cat.object.position.z+=speed*dt;cat.update(dt,{speed,moving:speed>.001,time,sampleHeight:()=>0});const s=cat.getDebugState();maxError=Math.max(maxError,s.gait.maxReachError);
   if(item.speed>.5&&local>2){runFrames++;const support=s.feet.filter(f=>f.stance).length;counts[support]=(counts[support]||0)+1;if(s.feet.every(f=>f.renderedWorld[1]>.003))air++;for(const f of s.feet){if(f.stance&&last[f.name]===false)contacts.push({segment,foot:f.name,time});}}
   for(const f of s.feet)last[f.name]=f.stance;
  }
 }
 results.push({rates,maxError,air,runFrames,counts,contacts});cat.dispose();
}
const checks={finite:results.every(r=>Number.isFinite(r.maxError)),actual_airborne:results.every(r=>r.air>3),reachable:results.every(r=>r.maxError<.015)};const report={passed:Object.values(checks).every(Boolean),checks,results};await writeFile(new URL('assets/cat-v10-transition-jitter-check.json',project),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:results.map(({contacts,...r})=>r)},null,2));process.exitCode=report.passed?0:1;
