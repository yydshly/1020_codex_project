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



const loaded=await new GLTFLoader().loadAsync(new URL('models/cat-v3-rig.glb',web));
const object=new THREE.Group();object.add(loaded.scene);object.updateMatrixWorld(true);
let source;object.traverse(n=>{if(n.isSkinnedMesh&&!source)source=n;});source.skeleton.update();
const original=source.geometry,bones=source.skeleton.bones,positions=original.attributes.position;
const previousPose=Array.from({length:positions.count},(_,i)=>source.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(positions,i)));
const previousBonePositions=bones.map(b=>b.getWorldPosition(new THREE.Vector3()));
const previousBoneRotations=bones.map(b=>b.getWorldQuaternion(new THREE.Quaternion()));
const {prepareHockRig}=await import(new URL('cat-v8-hock-rig.js',web));
const result=prepareHockRig(THREE,object),geometry=source.geometry;
source.skeleton.update();
let restMax=0,finite=true,validSkin=true,protectedUnchanged=true;
for(let i=0;i<positions.count;i++){
 const actual=source.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i));
 restMax=Math.max(restMax,actual.distanceTo(previousPose[i]));finite&&=actual.toArray().every(Number.isFinite);
 const weights=geometry.attributes.skinWeight,joints=geometry.attributes.skinIndex;let sum=0;
 for(let j=0;j<4;j++){const weight=weights.getComponent(i,j);sum+=weight;validSkin&&=Number.isFinite(weight)&&weight>=0&&weight<=1;}
 validSkin&&=Math.abs(sum-1)<1e-6;
 const shouldProtect=positions.getY(i)>=.105||positions.getZ(i)>=-.03;
 if(shouldProtect)for(let j=0;j<4;j++)protectedUnchanged&&=weights.getComponent(i,j)===original.attributes.skinWeight.getComponent(i,j)&&joints.getComponent(i,j)===original.attributes.skinIndex.getComponent(i,j);
}
const checks={neutral_surface_preserved:restMax<1e-6,finite,skin_valid:validSkin,geometry_is_new:geometry!==original,protected_skin_unchanged:protectedUnchanged,bone_count_unchanged:bones.length===21,non_hock_bone_positions_unchanged:bones.every((b,i)=>b.name==='hind_left_paw'||b.name==='hind_right_paw'||b.getWorldPosition(new THREE.Vector3()).distanceTo(previousBonePositions[i])<1e-10),all_bone_world_orientations_unchanged:bones.every((b,i)=>Math.abs(b.getWorldQuaternion(new THREE.Quaternion()).normalize().dot(previousBoneRotations[i].clone().normalize()))>1-1e-10)};
for(const name of ['position','normal','uv'])checks[name+'_unchanged']=original.attributes[name].array.every((v,i)=>v===geometry.attributes[name].array[i]);
checks.indices_unchanged=original.index.array.every((v,i)=>v===geometry.index.array[i]);
const report={checkedAt:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,restMax,stats:result.stats};
await writeFile(new URL('assets/cat-v8-hock-rig-check.json',project),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
result.dispose();geometry.dispose();
