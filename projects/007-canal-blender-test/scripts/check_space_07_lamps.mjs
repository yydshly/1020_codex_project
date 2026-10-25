import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const threeURL=pathToFileURL(path.join(root,'web/vendor/three/build/three.module.min.js')).href;
const THREE=await import(threeURL);
const code=fs.readFileSync(path.join(root,'web/scene-space-07-lamps.js'),'utf8').replace("from 'three'",`from '${threeURL}'`);
const {applyStreetLights,planStreetLights}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const neighbourhood=JSON.parse(fs.readFileSync(path.join(root,'web/models/space-06-manifest.json'))).neighbourhood;
const scene=new THREE.Scene(),model=new THREE.Group();scene.add(model);
const source=new THREE.MeshStandardMaterial({color:0x554433});source.name='Space 06 / paving';
let inheritedCalls=0;source.onBeforeCompile=shader=>{inheritedCalls++;shader.uniforms.precedingLayer={value:.5};};
source.customProgramCacheKey=()=> 'preceding-layer';
const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,.1,4),source);model.add(mesh);
const glowing=new THREE.MeshStandardMaterial({emissive:0xff8822,emissiveIntensity:2});glowing.name='SPACE07_window';
const glowingMesh=new THREE.Mesh(mesh.geometry,glowing);model.add(glowingMesh);
const originalGeometry=mesh.geometry,originalPositions=mesh.geometry.attributes.position.array.slice();
const sourceJSON=JSON.stringify(source.toJSON()),oldLight=new THREE.PointLight(0xffffff,4,6);scene.add(oldLight);
const handle=applyStreetLights(scene,model,neighbourhood),same=applyStreetLights(scene,model,neighbourhood);
assert.equal(handle,same);assert.equal(handle.metadata.fixtureCount,29);assert.equal(handle.metadata.newPointLights,6);
assert.equal(mesh.geometry,originalGeometry);assert.deepEqual(mesh.geometry.attributes.position.array,originalPositions);
assert.equal(glowingMesh.material,glowing);assert.notEqual(mesh.material,source);
const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
mesh.material.onBeforeCompile(shader,{});
assert.equal(inheritedCalls,1);assert.equal(shader.uniforms.s07LampPositions.value.length,29);
assert.match(mesh.material.customProgramCacheKey(),/^preceding-layer\/space07/);
assert.equal((shader.vertexShader.match(/varying vec3 vSpace07LampWorld/g)||[]).length,1);
assert.equal((shader.fragmentShader.match(/varying vec3 vSpace07LampWorld/g)||[]).length,1);
assert.match(shader.fragmentShader,/outgoingLight\+=diffuseColor.rgb\*s07Sum/);
const camera=new THREE.PerspectiveCamera();
for(let frame=0;frame<600;frame++){
  camera.position.set(frame<300?-28:28,2.4,frame<300?35.5:-25.2);handle.update(frame/60,{camera});
  const lights=[];scene.traverse(o=>{if(o.isPointLight&&o!==oldLight)lights.push(o);});
  assert.equal(lights.length,6);assert(lights.every(l=>l.visible&&!l.castShadow&&Number.isFinite(l.intensity)&&l.intensity>=0));
  assert(lights.every(l=>l.position.toArray().every(Number.isFinite)));
}
assert.equal(oldLight.intensity,4);assert.equal(JSON.stringify(source.toJSON()),sourceJSON);
const beforeDisposal=structuredClone(handle.metadata);
handle.dispose();handle.dispose();assert.equal(mesh.material,source);assert.equal(glowingMesh.material,glowing);
assert.equal(scene.getObjectByName('SPACE07_StreetLamps'),undefined);assert.equal(scene.userData.space07StreetLights,undefined);
const second=applyStreetLights(scene,model,neighbourhood);assert.notEqual(second,handle);second.dispose();
const report={ok:true,fixtureCount:29,pointLightCount:6,geometryUnchanged:true,sourceMaterialUnchanged:true,
  inheritedShaderPreserved:true,idempotentSetup:true,idempotentDispose:true,reentryAfterDispose:true,
  animatedFrames:600,zones:beforeDisposal.zones,triangles:beforeDisposal.addedTriangles,
  note:'CPU module/ownership/shader-hook validation; parent separately validates actual WebGL output and complete GLB.'};
fs.writeFileSync(path.join(root,'artifacts/scene-space-07/lamps-module-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
