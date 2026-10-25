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
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const attrHash=a=>sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
const assetHash=()=>readFile(new URL('models/cat-v3-rig.glb',web)).then(sha);
const sourceHashBefore=await assetHash();
const {createCat}=await import(new URL('cat-v6-face.js',web));
const {prepareHeadSkin}=await import(new URL('cat-v7-head-skin.js',web));
const cat=await createCat(THREE);cat.setAttention({enabled:false});cat.setBlink({mode:'open'});cat.update(0,{reset:true,time:0});
let originalMesh;cat.object.traverse(node=>{if(node.isSkinnedMesh&&!originalMesh)originalMesh=node;});
const original=originalMesh.geometry;
originalMesh.skeleton.update();
const originalRestPositions=Array.from({length:original.attributes.position.count},(_,i)=>originalMesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(original.attributes.position,i)));
const oldJoints=Array.from(original.attributes.skinIndex.array),oldWeights=Array.from(original.attributes.skinWeight.array);
const checks={},failures=[];const check=(name,value)=>{checks[name]=Boolean(value);if(!value)failures.push(name);};
const bones=new Map();cat.object.traverse(node=>{if(node.isBone)bones.set(node.name,node);});
const beforeBones=Object.fromEntries([...bones].map(([name,bone])=>[name,[...bone.matrixWorld.elements]]));
const skin=prepareHeadSkin(THREE,cat.object),mesh=skin.source,newGeometry=mesh.geometry;
check('geometry_is_new_instance',newGeometry!==original);
for(const name of ['position','normal','uv'])check(`${name}_unchanged`,attrHash(original.attributes[name])===attrHash(newGeometry.attributes[name]));
check('index_unchanged',attrHash(original.index)===attrHash(newGeometry.index));
check('original_skin_arrays_unchanged',oldJoints.every((v,i)=>v===original.attributes.skinIndex.array[i])&&oldWeights.every((v,i)=>v===original.attributes.skinWeight.array[i]));
check('rest_bones_unchanged',[...bones].every(([name,bone])=>bone.matrixWorld.elements.every((value,i)=>value===beforeBones[name][i])));
const names=mesh.skeleton.bones.map(b=>b.name),headIndex=names.indexOf('head');
const pos=newGeometry.attributes.position,joints=newGeometry.attributes.skinIndex,weights=newGeometry.attributes.skinWeight;
const protectedNames=names.map(name=>/^(fore_|hind_|tail_)/.test(name));
let protectedUnchanged=true,finite=true,normalized=true,faceRigid=true,restMaxDelta=0,rigidFaceCount=0;const faceVertices=[];
mesh.skeleton.update();
for(let i=0;i<pos.count;i++){
  if([0,1,2,3].some(slot=>oldWeights[i*4+slot]>1e-6&&protectedNames[oldJoints[i*4+slot]]))
    for(let slot=0;slot<4;slot++)protectedUnchanged&&=joints.getComponent(i,slot)===oldJoints[i*4+slot]&&weights.getComponent(i,slot)===oldWeights[i*4+slot];
  let sum=0,hw=0;for(let slot=0;slot<4;slot++){const w=weights.getComponent(i,slot);sum+=w;finite&&=Number.isFinite(w)&&w>=0&&w<=1;if(joints.getComponent(i,slot)===headIndex)hw+=w;}
  normalized&&=Math.abs(sum-1)<1e-6;
  const rest=new THREE.Vector3().fromBufferAttribute(pos,i),deformed=mesh.applyBoneTransform(i,rest.clone());
  restMaxDelta=Math.max(restMaxDelta,originalRestPositions[i].distanceTo(deformed));
  const x=rest.x-.005,z=rest.z-.15,t=x*.8289901626607705+z*.5592631851031045,s=x*.5592631851031045-z*.8289901626607705;
  // Anatomical core: ears, eye/forehead shell, nose and central lower jaw.
  // The back of the cheek is deliberately part of the smooth nape transition.
  if(((rest.y>.38&&t>0)||(rest.y>.328&&t>.075)||(rest.y>.289&&t>.09))&&Math.abs(s)<.075){rigidFaceCount++;faceVertices.push(i);faceRigid&&=hw>1-1e-6;}
}
check('face_core_and_ears_are_rigid',faceRigid);check('limb_and_tail_vertices_unchanged',protectedUnchanged);check('weights_finite_in_range',finite);check('weights_normalized',normalized);check('rest_surface_unchanged',restMaxDelta<1e-7);check('rigid_face_region_exists',rigidFaceCount>1000);
// Apply the proposed root-frame correction at the original anatomical pivot.
const rootQ=cat.object.getWorldQuaternion(new THREE.Quaternion()),headQ=skin.head.getWorldQuaternion(new THREE.Quaternion());
const parentInv=skin.head.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
const yawQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-skin.calibration.sourceFaceYawDegrees*Math.PI/180);
skin.head.quaternion.copy(parentInv).multiply(rootQ).multiply(yawQ).multiply(rootQ.clone().invert()).multiply(headQ);
cat.object.updateMatrixWorld(true);mesh.skeleton.update();
check('all_nonhead_bones_unchanged',[...bones].filter(([name])=>name!=='head').every(([name,bone])=>bone.matrixWorld.elements.every((value,i)=>Math.abs(value-beforeBones[name][i])<1e-12)));
let maxPairDelta=0;
const selected=faceVertices.filter((_,i)=>i%Math.ceil(faceVertices.length/40)===0);
const rest=selected.map(i=>new THREE.Vector3().fromBufferAttribute(pos,i)),deformed=selected.map((i,k)=>mesh.applyBoneTransform(i,rest[k].clone()));
for(let a=0;a<selected.length;a++)for(let b=a+1;b<selected.length;b++)maxPairDelta=Math.max(maxPairDelta,Math.abs(rest[a].distanceTo(rest[b])-deformed[a].distanceTo(deformed[b])));
check('face_pair_distances_preserved_after_56_degree_yaw',maxPairDelta<1e-6);
let allFinite=true;for(let i=0;i<pos.count;i++)allFinite&&=mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(pos,i)).toArray().every(Number.isFinite);
check('all_deformed_positions_finite',allFinite);
check('source_glb_hash_preserved',sourceHashBefore===await assetHash()&&sourceHashBefore==='6c8d0f0133805e0727cc6cdfc558456d670e0d33a5158685084413e7786a77f1');
const report={checkedAt:new Date().toISOString(),passed:failures.length===0,checks,failures,stats:skin.stats,sourceHash:sourceHashBefore,calibration:skin.calibration,rigidFaceCount,restMaxDelta,maxPairDelta,scope:'CPU checks rigid face and preserves non-head bones; visual neck silhouette and deformed eyelid contact require browser review.'};
await writeFile(new URL('assets/cat-v7-head-skin-check.json',project),JSON.stringify(report,null,2)+'\n');
skin.dispose();cat.dispose();console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
