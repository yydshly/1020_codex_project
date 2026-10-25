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
const sha=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const results=[];
for(const tolerance of [.00005,.0001]){
const cat=await createCat(THREE,{surfaceSkin:false});let mesh;cat.object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;});
const source=mesh.geometry;
const metadata={version:1,sourceAsset:'cat-v3-rig.glb',sourceAssetSHA256:createHash('sha256').update(await readFile(new URL('models/cat-v3-rig.glb',web))).digest('hex'),vertices:source.attributes.position.count,bones:mesh.skeleton.bones.length,boneOrder:mesh.skeleton.bones.map(b=>b.name),input:{skinWeightSHA256:sha(source.attributes.skinWeight.array),skinIndexSHA256:sha(source.attributes.skinIndex.array),triangleIndexSHA256:sha(source.index.array)}};
const helper=prepareSurfaceSkin(THREE,cat.object,{iterations:48,weldTolerance:tolerance}),indices=new Uint16Array(mesh.geometry.attributes.skinIndex.array),weights=new Float32Array(mesh.geometry.attributes.skinWeight.array),buffer=new ArrayBuffer(16+indices.byteLength+weights.byteLength),header=new DataView(buffer);
header.setUint32(0,0x31535343,true);header.setUint32(4,1,true);header.setUint32(8,metadata.vertices,true);header.setUint32(12,metadata.bones,true);
new Uint8Array(buffer,16,indices.byteLength).set(new Uint8Array(indices.buffer));new Uint8Array(buffer,16+indices.byteLength,weights.byteLength).set(new Uint8Array(weights.buffer));
metadata.stats=helper.stats;metadata.output={skinWeightSHA256:sha(weights),skinIndexSHA256:sha(indices)};metadata.binarySHA256=sha(new Uint8Array(buffer));metadata.binaryByteLength=buffer.byteLength;
const stem=`cat-v9-surface-skin-candidate-${Math.round(tolerance*1e6)}um`;
await writeFile(new URL(`models/${stem}.bin`,web),new Uint8Array(buffer));await writeFile(new URL(`models/${stem}.json`,web),JSON.stringify(metadata,null,2)+'\n');
const checks={};for(const name of ['position','normal','uv'])checks[name+'_unchanged']=source.attributes[name].array.every((v,i)=>v===mesh.geometry.attributes[name].array[i]);checks.triangle_indices_unchanged=source.index.array.every((v,i)=>v===mesh.geometry.index.array[i]);
let protectedChanged=0,maxSumError=0;
for(let i=0;i<metadata.vertices;i++){let protectedRegion=source.attributes.position.getY(i)<=.065||source.attributes.position.getY(i)>=.265;for(let s=0;s<4;s++)if(source.attributes.skinWeight.getComponent(i,s)>1e-6&&/^(head|neck|tail)/.test(metadata.boneOrder[source.attributes.skinIndex.getComponent(i,s)]))protectedRegion=true;let sum=0;for(let s=0;s<4;s++){sum+=weights[4*i+s];if(protectedRegion&&(weights[4*i+s]!==source.attributes.skinWeight.getComponent(i,s)||indices[4*i+s]!==source.attributes.skinIndex.getComponent(i,s)))protectedChanged++;}maxSumError=Math.max(maxSumError,Math.abs(1-sum));}
checks.protected_weights_unchanged=protectedChanged===0;checks.normalized=maxSumError<1e-6;results.push({tolerance,stem,checks,maxSumError});helper.dispose();cat.dispose();
}
await writeFile(new URL('assets/cat-v9-surface-candidate-protection.json',project),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
