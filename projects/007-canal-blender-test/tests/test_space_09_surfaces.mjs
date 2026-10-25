// Actual GLB + production base environment, with GPU/image decoding stubbed.
// Browser visual checks are separately required for GLSL compilation and pixels.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url),web=new URL('web/',root);
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL=new URL('vendor/three/examples/jsm/',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL);
const {GLTFLoader}=await import(new URL('loaders/GLTFLoader.js',addonsURL));
const {HDRLoader}=await import(new URL('loaders/HDRLoader.js',addonsURL));
const {setupEnvironment}=await import('../web/scene-space-06-environment.js');
const {applySurfaces,surfaceTarget,surfaceRegions,regionAtWorldPoint}=await import('../web/scene-space-09-surfaces.js');
const manifest=JSON.parse((await readFile(new URL('models/space-08-manifest.json',web),'utf8')).replace(/^\uFEFF/,''));
const digest=array=>array?createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex'):null;
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,value){this.type=type;Object.assign(this,value);}};
globalThis.fetch=async input=>new Response(await readFile(new URL(input.url??input,web)));
const localTextureFiles=new Set();
async function localTexture(url,hdr=false){
  const resolved=new URL(url,web);assert.equal(resolved.protocol,'file:');assert.ok((await readFile(resolved)).length>0);localTextureFiles.add(resolved.href);
  const texture=new THREE.DataTexture(hdr?new Float32Array([.5,.5,.5,1]):new Uint8Array([128,128,255,255]),1,1,THREE.RGBAFormat,hdr?THREE.FloatType:THREE.UnsignedByteType);
  texture.name=resolved.pathname;texture.needsUpdate=true;return texture;
}
THREE.TextureLoader.prototype.loadAsync=function(url){return localTexture(url);};
HDRLoader.prototype.loadAsync=function(url){return localTexture(url,true);};
THREE.CubeCamera.prototype.update=function(){};
for(const method of ['fromEquirectangular','fromCubemap'])THREE.PMREMGenerator.prototype[method]=function(){const texture=new THREE.Texture();return{texture,dispose(){texture.dispose();}};};
const renderer={capabilities:{getMaxAnisotropy:()=>8},shadowMap:{},toneMappingExposure:1,outputColorSpace:THREE.SRGBColorSpace,compile(){}};
const shaderOf=material=>{const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};material.onBeforeCompile(shader,renderer);return shader;};
function state(material){return {name:material.name,color:material.color?.toArray(),emissive:material.emissive?.toArray(),
  emissiveIntensity:material.emissiveIntensity,roughness:material.roughness,metalness:material.metalness,
  opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,vertexColors:material.vertexColors,
  normalScale:material.normalScale?.toArray(),maps:['map','normalMap','roughnessMap','aoMap','envMap'].map(name=>material[name]),
  compile:material.onBeforeCompile,key:material.customProgramCacheKey};}
function capture(model){
  const rows=[];model.updateMatrixWorld(true);
  model.traverse(part=>{if(part.isMesh)rows.push({part,geometry:part.geometry,material:part.material,matrix:[...part.matrixWorld.elements],
    attributes:Object.fromEntries(Object.entries(part.geometry.attributes).map(([key,a])=>[key,{ref:a,hash:digest(a.array)}])),
    index:part.geometry.index,indexHash:digest(part.geometry.index?.array)});});return rows;
}
function unchangedGeometry(rows){for(const row of rows){assert.equal(row.part.geometry,row.geometry);assert.deepEqual(row.part.matrixWorld.elements,row.matrix);
  assert.deepEqual(Object.keys(row.part.geometry.attributes),Object.keys(row.attributes));
  for(const [name,item]of Object.entries(row.attributes)){assert.equal(row.part.geometry.attributes[name],item.ref);assert.equal(digest(item.ref.array),item.hash);}
  assert.equal(row.part.geometry.index,row.index);assert.equal(digest(row.index?.array),row.indexHash);}}

test('real SPACE08 runtime selects ten roof/wall meshes; preserves source materials, buffers and prior shader chain',async()=>{
  const bytes=await readFile(new URL('models/space-08.glb',web));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scene=new THREE.Scene();scene.add(gltf.scene);
  const facade=manifest.refinements.facades;
  const base=await setupEnvironment(renderer,scene,gltf.scene,{mobile:true,neighbourhood:manifest.neighbourhood,
    materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials});
  const rows=capture(gltf.scene),allRows=capture(scene),sourceStates=new Map();
  for(const row of allRows)for(const material of Array.isArray(row.material)?row.material:[row.material])sourceStates.set(material,state(material));
  const world={environment:scene.environment,background:scene.background,fog:scene.fog,exposure:renderer.toneMappingExposure,children:[...scene.children]};
  const handle=await applySurfaces(renderer,scene,gltf.scene,manifest.neighbourhood);
  assert.equal(handle.metadata.changedMeshes,10);assert.equal(handle.metadata.changedMaterials,10);
  assert.equal(handle.metadata.targets.filter(row=>row.scope==='new').length,6);
  assert.equal(handle.metadata.targets.filter(row=>row.scope==='opposite').length,4);
  assert.equal(handle.metadata.newTextures,0);assert.equal(handle.metadata.addedTriangles,0);
  assert.deepEqual(scene.children,world.children);assert.equal(scene.environment,world.environment);assert.equal(scene.background,world.background);
  assert.equal(scene.fog,world.fog);assert.equal(renderer.toneMappingExposure,world.exposure);
  let maps=0,protectedMeshes=0;const ownMaterials=[];
  for(const row of allRows){
    const target=surfaceTarget(row.part.name);
    if(!target){assert.equal(row.part.material,row.material,row.part.name);protectedMeshes++;continue;}
    const material=row.part.material;ownMaterials.push(material);assert.notEqual(material,row.material);
    for(const name of ['map','normalMap','roughnessMap','aoMap','envMap']){assert.equal(material[name],row.material[name]);if(material[name])maps++;}
    assert.equal(material.vertexColors,row.material.vertexColors);
    assert.deepEqual(material.color.toArray(),row.material.color.toArray());
    const oldShader=shaderOf(row.material),shader=shaderOf(material);
    for(const [name,uniform]of Object.entries(oldShader.uniforms))assert.equal(shader.uniforms[name],uniform);
    assert.ok(shader.fragmentShader.includes('spaceScanLuma'),'keeps inherited local scan shader');
    assert.ok(shader.fragmentShader.includes('s09BeforeScanNormal'));
    assert.equal(shader.uniforms.s09Bounds.value.length,target.scope==='new'?21:3);
    assert.ok(material.customProgramCacheKey().startsWith(row.material.customProgramCacheKey()));
    assert.ok(shader.vertexShader.includes('vSpace09WorldNormal=inverseTransformDirection'));
    assert.ok(shader.fragmentShader.indexOf('varying vec3 vViewPosition;')<shader.fragmentShader.indexOf('vec3 s09BumpNormal'));
    if(target.kind==='roof'){assert.ok(shader.fragmentShader.includes('const vec2 tileSize=vec2(.30,.22)'));assert.ok(shader.fragmentShader.includes('s09BeforeScanNormal,s09Mask'));}
    else assert.ok(shader.fragmentShader.includes('float s09Runoff'));
  }
  assert.ok(maps>=30);assert.ok(protectedMeshes>=50);
  assert.ok([...localTextureFiles].some(path=>path.includes('worn_plaster_wall')));
  assert.ok([...localTextureFiles].some(path=>path.includes('cobblestone')));
  unchangedGeometry(allRows);
  for(const [material,before]of sourceStates)assert.deepEqual(state(material),before,material.name+' source mutated');

  // Apply the actual world-region predicates to real vertices, rather than
  // trusting names or synthetic house centres. Core roof vertices must remain
  // outside the old-opposite mask even though they share a material.
  const regions=surfaceRegions(manifest.neighbourhood),coverage=new Set(),oldCoverage=new Set();
  let coreExcluded=0,oldSelected=0,newSelected=0;
  const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
  for(const row of rows){
    const target=surfaceTarget(row.part.name);if(!target)continue;
    const position=row.geometry.attributes.position,normals=row.geometry.attributes.normal;normalMatrix.getNormalMatrix(row.part.matrixWorld);
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(row.part.matrixWorld);
      normal.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
      const region=regionAtWorldPoint(regions[target.scope],point,target.kind);
      if(target.scope==='opposite'&&point.z<10){assert.equal(region,null);coreExcluded++;}
      const face=target.kind==='roof'?normal.y>=.60:Math.abs(normal.y)<=.22;
      if(region&&face){if(target.scope==='new'){coverage.add(region.id);newSelected++;}else{oldCoverage.add(region.id);oldSelected++;}}
    }
  }
  assert.equal(coverage.size,21);assert.equal(oldCoverage.size,3);assert.ok(coreExcluded>500);assert.ok(oldSelected>1000);assert.ok(newSelected>1000);
  let ownDisposed=0,borrowedDisposed=0;ownMaterials.forEach(material=>material.addEventListener('dispose',()=>ownDisposed++));
  const borrowed=new Set(ownMaterials.flatMap(material=>['map','normalMap','roughnessMap','aoMap','envMap'].map(name=>material[name])).filter(Boolean));
  borrowed.forEach(texture=>texture.addEventListener('dispose',()=>borrowedDisposed++));
  handle.dispose();handle.dispose();assert.equal(ownDisposed,10);assert.equal(borrowedDisposed,0);
  for(const row of allRows)assert.equal(row.part.material,row.material);unchangedGeometry(allRows);
  for(const [material,before]of sourceStates)assert.deepEqual(state(material),before);
  assert.equal(scene.userData.space09Surfaces,undefined);
  console.log(JSON.stringify({selectedMeshes:handle.metadata.changedMeshes,newHouseCoverage:coverage.size,oldHouseCoverage:oldCoverage.size,
    coreVerticesExcluded:coreExcluded,newSelected,oldSelected,protectedMeshes,sharedMaps:borrowed.size,localTextureFiles:localTextureFiles.size}));
  base.dispose();
});

test('actual exported roof colours are not re-multiplied and coarse roof-alt albedo contrast is bounded',async()=>{
  const bytes=await readFile(new URL('models/space-08.glb',web));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const values={};
  gltf.scene.traverse(part=>{
    if(!part.isMesh||!/^ROAM01_Surface__SPACE08_Roof(?:Alt)?$/.test(part.name))return;
    const attribute=part.geometry.attributes.color;let luma=0;
    for(let i=0;i<attribute.count;i++)luma+=attribute.getX(i)*.2126+attribute.getY(i)*.7152+attribute.getZ(i)*.0722;
    values[part.name.endsWith('Alt')?'alt':'main']=luma/attribute.count;
    assert.deepEqual(part.material.color.toArray(),[1,1,1]);assert.equal(part.material.vertexColors,true);
  });
  const originalRatio=values.alt/values.main;
  const compressedRatio=(.061+Math.min(values.alt,.14)*.075)/(.061+Math.min(values.main,.14)*.075);
  assert.ok(originalRatio>1.8&&originalRatio<2.0);assert.ok(compressedRatio>1.02&&compressedRatio<1.09);
  console.log(JSON.stringify({sourceRoofLuma:values,originalRatio,compressedRatio,tileWorldMetres:[.30,.22]}));
});
