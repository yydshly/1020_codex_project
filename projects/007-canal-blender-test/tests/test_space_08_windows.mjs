import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url),web=new URL('web/',root);
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL);
const {GLTFLoader}=await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
const {applyWindowLights,windowLightPlan}=await import('../web/scene-space-08-windows.js');
const manifest=JSON.parse((await readFile(new URL('web/models/space-08-manifest.json',root),'utf8')).replace(/^\uFEFF/,''));
const digest=array=>array?createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex'):null;

function capture(model){
  const rows=[];model.updateMatrixWorld(true);
  model.traverse(part=>{if(part.isMesh)rows.push({part,geometry:part.geometry,material:part.material,
    matrix:[...part.matrixWorld.elements],attributes:Object.fromEntries(Object.entries(part.geometry.attributes).map(([key,a])=>[key,{ref:a,hash:digest(a.array)}])),
    index:part.geometry.index,indexHash:digest(part.geometry.index?.array),groups:JSON.stringify(part.geometry.groups)});});
  return rows;
}

function checkGeometry(rows){
  for(const row of rows){
    assert.equal(row.part.geometry,row.geometry);assert.deepEqual(row.part.matrixWorld.elements,row.matrix);
    assert.deepEqual(Object.keys(row.part.geometry.attributes),Object.keys(row.attributes));
    for(const [key,value]of Object.entries(row.attributes)){
      assert.equal(row.part.geometry.attributes[key],value.ref);assert.equal(digest(value.ref.array),value.hash);
    }
    assert.equal(row.part.geometry.index,row.index);assert.equal(digest(row.index?.array),row.indexHash);
    assert.equal(JSON.stringify(row.part.geometry.groups),row.groups);
  }
}

test('stable occupied-window plan covers both front and rear of every new house with dark neighbouring windows',()=>{
  const plan=windowLightPlan(manifest.neighbourhood);
  assert.deepEqual(plan,windowLightPlan(manifest.neighbourhood));
  const newCoverage=plan.coverage.filter(row=>!row.original),newWindows=plan.windows.filter(row=>!row.original);
  assert.equal(newCoverage.length,21);assert.equal(plan.coverage.length,24);
  for(const house of newCoverage){
    assert.ok(house.litWindows>=2&&house.litWindows<=3);assert.ok(house.litWindows<house.totalWindows);
    const houseWindows=newWindows.filter(window=>window.houseId===house.houseId);
    assert.ok(houseWindows.some(window=>window.face==='front'),house.houseId+' front coverage');
    assert.ok(houseWindows.some(window=>window.face==='rear'),house.houseId+' rear coverage');
    const source=manifest.neighbourhood.buildings.houses.find(item=>item.id===house.houseId);
    if(source.secondary_front)assert.ok(houseWindows.some(window=>window.face===source.secondary_front),house.houseId+' corner/courtyard facade coverage');
    for(const wall of source.party_walls)assert.ok(!houseWindows.some(window=>window.face===wall.side),house.houseId+' no light behind a party wall');
  }
  const existingWarm=manifest.neighbourhood.buildings.houses.flatMap(house=>house.windows).filter(window=>window.existing_warm).length;
  assert.equal(plan.windows.filter(window=>window.existingWarm&&!window.original).length,existingWarm);
  assert.equal(plan.windows.filter(window=>window.existingWarm&&window.original).length,2);
  assert.ok(newWindows.some(window=>window.face==='rear'));assert.ok(newWindows.some(window=>window.face==='right'));
  assert.ok(plan.windows.length>=50&&plan.windows.length<=71);
  assert.equal(new Set(plan.windows.map(window=>window.id)).size,plan.windows.length);
  for(const window of plan.windows){
    assert.ok(window.sourceBackDepth<window.depth&&window.depth<window.sourcePaneDepth);
    if(window.hasPhysicalCurtain)assert.ok(window.depth<window.clothDepth);
  }
});

test('real SPACE08 GLB places each added light between its pane and closed back, preserving all source buffers',async()=>{
  const bytes=await readFile(new URL('web/models/space-08.glb',root));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scene=new THREE.Scene();scene.add(gltf.scene);scene.add(new THREE.HemisphereLight());
  const rows=capture(gltf.scene),oldChildren=[...scene.children];
  const sourceStates=new Map();
  gltf.scene.traverse(part=>{if(!part.isMesh)return;for(const material of(Array.isArray(part.material)?part.material:[part.material])){
    sourceStates.set(material,{name:material.name,emissive:material.emissive?.toArray(),intensity:material.emissiveIntensity,
      compile:material.onBeforeCompile,key:material.customProgramCacheKey,map:material.map});
  }});
  const result=applyWindowLights(scene,gltf.scene,manifest.neighbourhood),metadata=result.metadata;
  scene.updateMatrixWorld(true);
  const group=scene.getObjectByName('SPACE08_RecessedWindowLights');
  assert.ok(group.userData.space08WindowLights);assert.equal(group.children.length,3);
  assert.equal(metadata.addedDrawCalls,3);assert.ok(metadata.addedTriangles<=700);assert.equal(metadata.addedLights,0);
  assert.equal(scene.children.filter(child=>child.isLight).length,1);
  const windows=metadata.windows.filter(window=>!window.existingWarm),hits=[];
  for(const window of windows){
    // A point inside the upper-right pane avoids the unchanged crossing bars
    // and the physical side curtains, so the measured depth order is useful.
    const normal=new THREE.Vector3(...window.normal),target=new THREE.Vector3(...window.worldCenter);
    target.addScaledVector(new THREE.Vector3(...window.tangent),window.width*.17);target.y+=window.height*.18;
    const ray=new THREE.Raycaster(target.clone().addScaledVector(normal,.60),normal.clone().negate(),0,1.0);
    const sourceHits=ray.intersectObject(gltf.scene,true);
    const pane=sourceHits.find(hit=>/SPACE0[38]_WindowPane/.test(hit.object.material.name));
    const back=sourceHits.find(hit=>/SPACE08_WindowBack|SPACE03_WindowRecess/.test(hit.object.material.name));
    const emission=ray.intersectObject(group,true).find(hit=>hit.object.userData.windowIds.includes(window.id));
    assert.ok(pane,window.id+' must have an original pane');assert.ok(back,window.id+' must have a closed original back');
    assert.ok(emission,window.id+' must have a correctly oriented added light face');
    assert.ok(pane.distance<emission.distance&&emission.distance<back.distance,window.id+' depth ordering');
    assert.ok(Math.abs(emission.distance-.60)<.00002,window.id+' emitted sheet position');
    hits.push({id:window.id,pane:pane.distance,light:emission.distance,back:back.distance});
  }
  for(const row of rows){
    const before=Array.isArray(row.material)?row.material:[row.material],after=Array.isArray(row.part.material)?row.part.material:[row.part.material];
    for(let i=0;i<before.length;i++){
      if(/SPACE0[38]_WindowWarm$/.test(before[i].name)){
        assert.notEqual(after[i],before[i]);assert.ok(after[i].emissiveIntensity>=1.0);assert.equal(after[i].map,before[i].map);
      }else assert.equal(after[i],before[i],before[i].name+' must retain its original material reference');
    }
  }
  for(const [material,state]of sourceStates){
    assert.equal(material.name,state.name);assert.deepEqual(material.emissive?.toArray(),state.emissive);
    assert.equal(material.emissiveIntensity,state.intensity);assert.equal(material.onBeforeCompile,state.compile);
    assert.equal(material.customProgramCacheKey,state.key);assert.equal(material.map,state.map);
  }
  for(const mesh of group.children){
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
    mesh.material.onBeforeCompile(shader,{});
    assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance*=vSpace08WindowParameters.x'));
    assert.ok(shader.fragmentShader.includes('if(openingUV.x<hem+.035||openingUV.x>.83)discard;'));
    assert.ok(shader.vertexShader.includes('attribute vec3 space08WindowParameters;'));
    assert.equal(mesh.castShadow,false);assert.equal(mesh.geometry.groups.length,0);
  }
  checkGeometry(rows);
  console.log(JSON.stringify({glb:'space-08.glb',litWindows:metadata.litWindowCount,addedSheets:windows.length,existingWarm:metadata.existingWarmWindows,
    addedDrawCalls:metadata.addedDrawCalls,addedTriangles:metadata.addedTriangles,verifiedPaneLightBackRays:hits.length,
    sourceMeshes:rows.length,sourceGeometryAndProtectedMaterials:'unchanged',gpuCompilation:'not performed'}));
  result.dispose();result.dispose();
  assert.deepEqual(scene.children,oldChildren);assert.equal(scene.getObjectByName('SPACE08_RecessedWindowLights'),undefined);
  for(const row of rows)assert.equal(row.part.material,row.material);checkGeometry(rows);
});
