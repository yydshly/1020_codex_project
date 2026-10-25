import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),threeURL=pathToFileURL(path.join(root,'web/vendor/three/build/three.module.min.js')).href;
const THREE=await import(threeURL);
const source=fs.readFileSync(path.join(root,'web/scene-space-09-landscape.js'),'utf8').replace("from 'three'",`from '${threeURL}'`);
const {applyLandscape}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const metadata=JSON.parse(fs.readFileSync(path.join(root,'web/models/space-08-manifest.json'))).neighbourhood;
const canvasFactory=()=>({width:256,height:256,getContext:()=>new Proxy({getImageData:()=>({width:256,height:256,data:new Uint8ClampedArray(256*256*4)})},
  {get:(target,key)=>key in target?target[key]:()=>{}})});
const renderer={domElement:{ownerDocument:{createElement:canvasFactory}},capabilities:{getMaxAnisotropy:()=>4}};
const scene=new THREE.Scene(),model=new THREE.Group();scene.add(model);
for(const token of ['Bark','Leaf','LeafLight','LeafShade']){
  const material=new THREE.MeshStandardMaterial();material.name='ROAM01_PBR / SPACE06_'+token;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.name='ROAM01_Surface / SPACE06_'+token;model.add(mesh);
}
const material=new THREE.MeshStandardMaterial();material.name='ROAM01_PBR / soil';
let inherited=0;material.onBeforeCompile=()=>{inherited++;};material.customProgramCacheKey=()=> 'old-ground-shader';
const soil=new THREE.Mesh(new THREE.PlaneGeometry(5,5),material);model.add(soil);
const originals=model.children.map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,visible:mesh.visible,positions:mesh.geometry.attributes.position.array.slice()}));
const handle=await applyLandscape(renderer,scene,model,metadata);
assert.equal(await applyLandscape(renderer,scene,model,metadata),handle);
assert.equal(handle.metadata.treeCount,23);assert.equal(handle.metadata.oldHiddenMeshes.length,4);
assert(handle.metadata.totalTriangles<=50000);assert.equal(handle.metadata.drawCalls,2);
for(const before of originals){assert.equal(before.mesh.geometry,before.geometry);assert.deepEqual(before.mesh.geometry.attributes.position.array,before.positions);}
assert.notEqual(soil.material,material);
const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
soil.material.onBeforeCompile(shader,{});assert.equal(inherited,1);assert.match(soil.material.customProgramCacheKey(),/^old-ground-shader/);
for(const tree of handle.metadata.trees){assert(tree.baseTrunkRadius<tree.trunkCircle.radius);
  assert(tree.leafBounds.min[1]-tree.baseWorld[1]>=2.35);assert(tree.leafInstances.count>100);}
const resources=[];scene.getObjectByName('SPACE09_ReplacementTrees').traverse(o=>{if(o.isMesh)resources.push(o.geometry,o.material);});
resources.push(scene.getObjectByName('SPACE09_IndividualLeafSprigs').material.map,soil.material);
const counts=new Map();resources.forEach(r=>r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)??0)+1)));
handle.update(2,{});const result=structuredClone(handle.metadata);handle.dispose();handle.dispose();
for(const before of originals){assert.equal(before.mesh.material,before.material);assert.equal(before.mesh.visible,before.visible);}
resources.forEach(r=>assert.equal(counts.get(r),1));
assert.equal(scene.getObjectByName('SPACE09_ReplacementTrees'),undefined);
const second=await applyLandscape(renderer,scene,model,metadata);assert.notEqual(second,handle);second.dispose();
const report={passed:true,trees:23,drawCalls:result.drawCalls,triangles:result.totalTriangles,
  branchTriangles:result.branchTriangles,leafTriangles:result.leafTriangles,leafInstances:result.leafInstances,
  minimumLeafClearance:Math.min(...result.trees.map(t=>t.leafBounds.min[1]-t.baseWorld[1])),
  minimumCardsPerTree:Math.min(...result.trees.map(t=>t.leafInstances.count)),
  resourcesDisposedOnce:resources.length,geometryPreserved:true,visibilityRestored:true,materialReferenceRestored:true,
  note:'CPU ownership/geometry validation. Canvas draw operations are stubbed; parent validates actual alpha texture and GPU image.'};
fs.writeFileSync(path.join(root,'artifacts/scene-space-09/landscape-module-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
