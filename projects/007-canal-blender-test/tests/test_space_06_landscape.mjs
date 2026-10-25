import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
import {applyLandscape,landscapeCategory,collectDirtBounds,riverSection} from '../web/scene-space-06-landscape.js';

const root=new URL('../',import.meta.url),web=new URL('web/',root);
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL);
const {GLTFLoader}=await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
const digest=array=>array?createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex'):null;
const readJSON=async path=>JSON.parse((await readFile(new URL(path,root),'utf8')).replace(/^\uFEFF/,''));

function capture(model){
  const rows=[];
  model.updateMatrixWorld(true);
  model.traverse(part=>{
    if(!part.isMesh)return;
    rows.push({part,geometry:part.geometry,material:part.material,matrix:[...part.matrixWorld.elements],
      attributes:Object.fromEntries(Object.entries(part.geometry.attributes).map(([key,value])=>[key,{reference:value,hash:digest(value.array)}])),
      index:part.geometry.index,indexHash:digest(part.geometry.index?.array),groups:JSON.stringify(part.geometry.groups)});
  });
  return rows;
}

function checkGeometry(rows){
  for(const row of rows){
    assert.equal(row.part.geometry,row.geometry);
    assert.deepEqual(row.part.matrixWorld.elements,row.matrix);
    assert.deepEqual(Object.keys(row.part.geometry.attributes),Object.keys(row.attributes));
    for(const [key,value]of Object.entries(row.attributes)){
      assert.equal(row.part.geometry.attributes[key],value.reference);
      assert.equal(digest(row.part.geometry.attributes[key].array),value.hash);
    }
    assert.equal(row.part.geometry.index,row.index);
    assert.equal(digest(row.part.geometry.index?.array),row.indexHash);
    assert.equal(JSON.stringify(row.part.geometry.groups),row.groups);
  }
}

function compileHook(material){
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  material.onBeforeCompile(shader,{testRenderer:true});
  assert.equal(shader.vertexShader.split('varying vec3 vSpace06LandWorld;').length-1,1);
  assert.equal(shader.fragmentShader.split('varying vec3 vSpace06LandWorld;').length-1,1);
  assert.ok(shader.vertexShader.includes('inverseTransformDirection(transformedNormal,viewMatrix)'));
  assert.ok(shader.fragmentShader.indexOf('s06SourceLuma')<shader.fragmentShader.indexOf('#include <lights_physical_fragment>')||
    material.userData.space06Landscape==='leaf'||material.userData.space06Landscape==='bark'||material.userData.space06Landscape==='reed');
  assert.ok(material.customProgramCacheKey().includes('/space06-landscape-'));
  return shader;
}

test('only complete earth and new landscape material tokens are selected',()=>{
  assert.equal(landscapeCategory('Space 02 / ROAM01_PBR / EXT_B02_DampMineralGround'),'earth');
  assert.equal(landscapeCategory('Space 02 / ROAM01_PBR / soil'),'earth');
  for(const name of ['SPACE06_Grass','SPACE06_GrassShade','SPACE06_GrassDry'])assert.equal(landscapeCategory('ROAM01_PBR / '+name),'grass');
  for(const name of ['paving','stone','mortar','plaster','plaster_alt','roof','SPACE06_DoorInset','SPACE06_WindowPane',
    'SPACE05_CourtyardPaving','Shop study 01 / scanned limestone','Refine ten metre street surface','my_soil_paint'])assert.equal(landscapeCategory(name),null,name);
});

test('actual final geometry metadata preserves all house footing and road dirt bands',async()=>{
  const landscape=await readJSON('artifacts/scene-space-06/landscape-build-audit.json');
  const buildings=await readJSON('artifacts/space-06-buildings-audit.json');
  const bounds=collectDirtBounds({metadata:landscape,neighbourhood:{buildings}});
  assert.equal(buildings.houses.length,17);
  for(const house of buildings.houses){
    const [x0,y0,x1,y1]=house.footprint;
    assert.ok(bounds.some(b=>b[0]===x0-.45&&b[1]===y0-.45&&b[2]===x1+.45&&b[3]===y1+.45),house.id);
  }
  for(const road of landscape.road_plan.road_rectangles)assert.ok(bounds.some(b=>JSON.stringify(b)===JSON.stringify(road.bounds)),road.id);
  const fallback=collectDirtBounds({metadata:landscape});
  for(const house of landscape.house_grounding){
    const [x0,y0,x1,y1]=house.support_bounds_xy;
    assert.ok(fallback.some(b=>b[0]===x0-.45&&b[1]===y0-.45&&b[2]===x1+.45&&b[3]===y1+.45));
  }
  const protectedPoint=(x,y)=>bounds.some(b=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]);
  assert.ok(protectedPoint(0,8),'old rear lane stays dirt if earth is exposed');
  assert.ok(protectedPoint(-7.05,-22),'SPACE05 narrow entrance stays protected');
  assert.ok(protectedPoint(-9,-24),'SPACE05 court has a defensive positional exclusion as well as material protection');
  assert.equal(protectedPoint(0,20),false,'unused old courtyard land is allowed to receive grass');
  assert.equal(protectedPoint(45,-29),false,'outer landscape is not frozen by the old core rectangle');
  assert.deepEqual(riverSection(0),{center:-6.15138,width:8.74812});
  assert.ok(riverSection(-35).center>-6.15138,'west river transition bends');
  assert.ok(riverSection(35).center<-6.15138,'east river transition bends');
});

test('real Three material clones preserve source callbacks, shared maps and disposal lifecycle',()=>{
  const scene=new THREE.Scene(),model=new THREE.Group();scene.add(model);
  const texture=new THREE.Texture(),environment=new THREE.Texture();scene.environment=environment;
  let textureDisposals=0,environmentDisposals=0,originalDisposals=0,cloneDisposals=0,compileCalls=0;
  texture.addEventListener('dispose',()=>textureDisposals++);
  environment.addEventListener('dispose',()=>environmentDisposals++);
  const earth=new THREE.MeshPhysicalMaterial({name:'Space 02 / ROAM01_PBR / EXT_B02_DampMineralGround',vertexColors:true,
    map:texture,normalMap:texture,roughnessMap:texture,envMap:environment,color:0xffffff,roughness:.95});
  earth.onBeforeCompile=function(shader,renderer){
    assert.equal(renderer.testRenderer,true);assert.equal(this.map,texture);compileCalls++;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n// inherited earth chroma and scan');
    shader.uniforms.inherited={value:.75};
  };
  earth.customProgramCacheKey=()=> 'inherited-earth-key';earth.addEventListener('dispose',()=>originalDisposals++);
  const protectedMaterial=new THREE.MeshStandardMaterial({name:'Space 02 / ROAM01_PBR / paving'});
  const array=[earth,protectedMaterial];
  const a=new THREE.Mesh(new THREE.BoxGeometry(2,.5,2),array),b=new THREE.Mesh(a.geometry,earth);
  a.position.set(-12,.855,-8);b.position.set(-30,.69,3);model.add(a,b);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(8,8),protectedMaterial);model.add(ground);
  const planting=[];
  for(const suffix of ['Grass','GrassShade','GrassDry','Leaf','LeafLight','LeafShade','Bark','Reed']){
    const source=new THREE.MeshStandardMaterial({name:'ROAM01_PBR / SPACE06_'+suffix,vertexColors:true,color:0xffffff,roughness:.88});
    const part=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),source);model.add(part);planting.push(part);
  }
  const light=new THREE.HemisphereLight(0xffffff,0x555555,.27);scene.add(light);
  scene.userData.space06Landscape={prior:'preserve'};
  const oldMetadata=scene.userData.space06Landscape,rows=capture(model),children=[...scene.children];
  const result=applyLandscape(scene,model);
  assert.notEqual(a.material,array);assert.equal(a.material[0],b.material);assert.equal(a.material[1],protectedMaterial);
  assert.equal(ground.material,protectedMaterial);assert.equal(earth.name,'Space 02 / ROAM01_PBR / EXT_B02_DampMineralGround');
  const replacement=b.material;replacement.addEventListener('dispose',()=>cloneDisposals++);
  assert.equal(replacement.map,texture);assert.equal(replacement.normalMap,texture);assert.equal(replacement.envMap,environment);
  assert.equal(replacement.vertexColors,true);assert.deepEqual(replacement.color.toArray(),[1,1,1]);
  const shader=compileHook(replacement);
  assert.ok(shader.fragmentShader.includes('// inherited earth chroma and scan'));
  assert.equal(shader.uniforms.inherited.value,.75);assert.equal(compileCalls,1);
  assert.ok(replacement.customProgramCacheKey().startsWith('inherited-earth-key/'));
  for(const part of planting){compileHook(part.material);assert.equal(part.material.vertexColors,true);assert.deepEqual(part.material.color.toArray(),[1,1,1]);}
  assert.deepEqual(result.metadata.materialCounts,{earth:1,grass:3,leaf:3,bark:1,reed:1});
  for(const time of [0,.1,2,30])result.update(time);
  checkGeometry(rows);assert.deepEqual(scene.children,children);assert.equal(light.intensity,.27);
  assert.equal(scene.environment,environment);
  result.dispose();result.dispose();
  for(const row of rows)assert.equal(row.part.material,row.material);
  assert.equal(scene.userData.space06Landscape,oldMetadata);
  assert.equal(cloneDisposals,1);assert.equal(originalDisposals,0);
  assert.equal(textureDisposals,0);assert.equal(environmentDisposals,0);checkGeometry(rows);
});

test('real GLB buffers and every protected material stay unchanged during landscape calls',async()=>{
  const selected=process.env.SPACE06_GLB??'web/models/space-05.glb';
  const bytes=await readFile(new URL(selected,root));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scene=new THREE.Scene();scene.add(gltf.scene);
  const rows=capture(gltf.scene),landscape=await readJSON('artifacts/scene-space-06/landscape-build-audit.json');
  const buildings=await readJSON('artifacts/space-06-buildings-audit.json');
  const result=applyLandscape(scene,gltf.scene,{metadata:landscape,neighbourhood:{buildings}});
  assert.ok(result.metadata.sourceMaterials.some(name=>name.includes('EXT_B02_DampMineralGround')));
  let protectedCount=0,changed=0;
  const compiled=new Set();
  for(const row of rows){
    const previous=Array.isArray(row.material)?row.material:[row.material];
    const next=Array.isArray(row.part.material)?row.part.material:[row.part.material];
    for(let i=0;i<previous.length;i++){
      if(!landscapeCategory(previous[i].name)){assert.equal(next[i],previous[i]);protectedCount++;}
      else{assert.notEqual(next[i],previous[i]);changed++;
        if(!compiled.has(next[i])){compileHook(next[i]);compiled.add(next[i]);}
      }
    }
  }
  assert.ok(protectedCount>20);assert.ok(changed>0);
  checkGeometry(rows);result.update(99);checkGeometry(rows);result.dispose();
  for(const row of rows)assert.equal(row.part.material,row.material);
  checkGeometry(rows);
  console.log(JSON.stringify({glb:selected,meshes:rows.length,protectedMaterialSlots:protectedCount,changedMaterialSlots:changed,
    shaderCallbacks:compiled.size,geometryAndUVBuffers:'all hashes and references preserved',gpuCompilation:'not performed'}));
});
