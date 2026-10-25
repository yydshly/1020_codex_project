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



const {prepareHockRig}=await import(new URL('cat-v8-hock-rig.js',web));
const {prepareLimbSkin:oldSkin}=await import(new URL('assets/cat-v8-limb-skin-before-knee.js',project));
const {prepareLimbSkin:newSkin}=await import(new URL('cat-v8-limb-skin.js',web));
async function make(prepare){const loaded=await new GLTFLoader().loadAsync(new URL('models/cat-v3-rig.glb',web));const object=new THREE.Group();object.add(loaded.scene);object.updateMatrixWorld(true);prepareHockRig(THREE,object);const result=prepare(THREE,object);let mesh;object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;});return {object,result,mesh};}
const before=await make(oldSkin),after=await make(newSkin),g0=before.mesh.geometry,g1=after.mesh.geometry,p=g1.attributes.position,names=after.mesh.skeleton.bones.map(b=>b.name);
const sums=(g,i,predicate)=>{let value=0;for(let s=0;s<4;s++){const name=names[g.attributes.skinIndex.getComponent(i,s)];if(predicate(name))value+=g.attributes.skinWeight.getComponent(i,s);}return value;};
let maxLegTotalDifference=0,maxPawDifference=0,maxNonLegDifference=0,lowPawUnchanged=true;
for(let i=0;i<p.count;i++){
 for(const key of ['fore_left','fore_right','hind_left','hind_right']){
  maxLegTotalDifference=Math.max(maxLegTotalDifference,Math.abs(sums(g0,i,n=>n.startsWith(key))-sums(g1,i,n=>n.startsWith(key))));
  maxPawDifference=Math.max(maxPawDifference,Math.abs(sums(g0,i,n=>n===key+'_paw')-sums(g1,i,n=>n===key+'_paw')));
 }
 for(const name of names.filter(n=>!n.startsWith('fore_')&&!n.startsWith('hind_')))maxNonLegDifference=Math.max(maxNonLegDifference,Math.abs(sums(g0,i,n=>n===name)-sums(g1,i,n=>n===name)));
 if(p.getY(i)<=.065)for(let slot=0;slot<4;slot++)lowPawUnchanged&&=g0.attributes.skinIndex.getComponent(i,slot)===g1.attributes.skinIndex.getComponent(i,slot)&&g0.attributes.skinWeight.getComponent(i,slot)===g1.attributes.skinWeight.getComponent(i,slot);
}
const checks={leg_total_preserved:maxLegTotalDifference<1e-6,paw_influences_preserved:maxPawDifference<1e-7,torso_head_neck_tail_preserved:maxNonLegDifference<1e-7,low_paws_unchanged:lowPawUnchanged};
for(const key of ['position','normal','uv'])checks[key+'_unchanged']=g0.attributes[key].array.every((v,i)=>v===g1.attributes[key].array[i]);
checks.indices_unchanged=g0.index.array.every((v,i)=>v===g1.index.array[i]);
const report={checkedAt:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,maxLegTotalDifference,maxPawDifference,maxNonLegDifference,stats:after.result.stats};
await writeFile(new URL('assets/cat-v8-knee-skin-check.json',project),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
