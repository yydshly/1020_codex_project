// SPDX-License-Identifier: GPL-3.0-only
// CPU checks of actual ROV vertices and world instance transforms; no renderer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const threeURL=new URL('../web/vendor/three/build/three.module.min.js',import.meta.url);
const THREE=await import(threeURL.href);
async function loadBrowserModule(relative){
  const source=await readFile(new URL(relative,import.meta.url),'utf8');
  assert.ok(source.includes("from 'three'"));
  return import('data:text/javascript;base64,'+Buffer.from(source.replace("from 'three'",'from '+JSON.stringify(threeURL.href))).toString('base64'));
}
const {snapshotSolidColliders,ROV_COLLISION_PROFILE:profile,ROV_BODY_RADIUS:radius}=await loadBrowserModule('../web/rendering/collision-assets.mjs');
const {createRovSystem}=await loadBrowserModule('../web/rendering/rov-system.mjs');
const {createVentLife}=await loadBrowserModule('../web/rendering/benthic-life.mjs');
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const vector=object=>new THREE.Vector3(object.x,object.y,object.z);
const mat=new THREE.MeshBasicMaterial(),glass=new THREE.MeshPhysicalMaterial({transparent:true,opacity:.12});
const boxMesh=(x=0,y=0,z=0,material=mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,6),material);mesh.position.set(x,y,z);return mesh;};
function assertBox(collider,box,padding=0){for(const axis of ['x','y','z']){close(collider.min[axis],box.min[axis]-padding);close(collider.max[axis],box.max[axis]+padding);}}
function resources(group){const all=new Set();group.traverse(object=>{if(object.geometry)all.add(object.geometry);for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[])all.add(material);});return all;}
function dispose(group){resources(group).forEach(resource=>resource.dispose());}

assert.deepEqual(profile,{min:{x:-10.4,y:-9.2,z:-19},max:{x:10.4,y:11.8,z:8.9}});
assert.ok(Object.isFrozen(profile)&&Object.isFrozen(profile.min)&&Object.isFrozen(profile.max));assert.throws(()=>{profile.min.x=0;},TypeError);close(radius,Math.hypot(10.4,19));
for(const x of [profile.min.x,profile.max.x])for(const z of [profile.min.z,profile.max.z])assert.ok(Math.hypot(x,z)<=radius+1e-10);

// Independent transformed mesh boxes must not fill the empty gap between props.
const root=new THREE.Group(),first=boxMesh(-30),second=boxMesh(30);root.add(first,second);
let snapshots=snapshotSolidColliders(root);assert.equal(snapshots.length,2);assert.equal(snapshots[0].id,first.uuid);assert.ok(snapshots[0].max.x<-20&&snapshots[1].min.x>20);
assert.ok(Object.isFrozen(snapshots)&&Object.isFrozen(snapshots[0])&&Object.isFrozen(snapshots[0].min));assert.throws(()=>{snapshots[0].min.x=999;},TypeError);
const savedX=snapshots[0].min.x;first.position.x=-40;const moved=snapshotSolidColliders(root);assert.equal(snapshots[0].min.x,savedX);assert.notEqual(moved[0].min.x,savedX,'Snapshots must own their bounds');
const padded=snapshotSolidColliders(root,{padding:.8});close(padded[0].min.x,moved[0].min.x-.8);close(padded[0].max.y,moved[0].max.y+.8);
assert.deepEqual(snapshotSolidColliders(root,{filter:mesh=>mesh===second}).map(c=>c.id),[second.uuid]);

// Hidden ancestors outside the supplied root count too. Transparency never
// silently changes collision, while semantic opt-out applies to descendants.
const visibilityRoot=new THREE.Group(),glassMesh=boxMesh(0,0,0,glass),ring=new THREE.Mesh(new THREE.RingGeometry(2,3,12),mat),hiddenGroup=new THREE.Group(),hiddenMesh=boxMesh(10),optOut=new THREE.Group(),optOutMesh=boxMesh(20),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,1,1)]),new THREE.LineBasicMaterial());
hiddenGroup.visible=false;hiddenGroup.add(hiddenMesh);optOut.userData.collision=false;optOut.add(optOutMesh);visibilityRoot.add(glassMesh,ring,hiddenGroup,optOut,line);
assert.deepEqual(snapshotSolidColliders(visibilityRoot).map(c=>c.id),[glassMesh.uuid]);
glassMesh.visible=false;assert.equal(snapshotSolidColliders(visibilityRoot).length,0);glassMesh.visible=true;glassMesh.userData.collision=false;assert.equal(snapshotSolidColliders(visibilityRoot).length,0);delete glassMesh.userData.collision;
const outside=new THREE.Group();outside.visible=false;outside.add(visibilityRoot);assert.equal(snapshotSolidColliders(visibilityRoot).length,0);outside.visible=true;outside.userData.collision=false;assert.equal(snapshotSolidColliders(visibilityRoot).length,0);delete outside.userData.collision;
// Skipping a ring's geometry must not drop a physical child mounted on it.
const ringChild=boxMesh();ring.add(ringChild);assert.ok(snapshotSolidColliders(visibilityRoot).some(c=>c.id===ringChild.uuid));

// Every instance uses matrixWorld * instanceMatrix, including nested rotations,
// nonuniform scales and geometry whose centre is offset from its own origin.
const parent=new THREE.Group();parent.position.set(12,-7,29);parent.rotation.set(.2,-.6,.13);parent.scale.set(1.5,.75,2);
const nested=new THREE.Group();nested.position.set(-3,5,4);nested.rotation.set(-.3,.5,0);parent.add(nested);
const geometry=new THREE.BoxGeometry(2,3,5);geometry.translate(.7,-.3,1.1);geometry.computeBoundingBox();
const instanced=new THREE.InstancedMesh(geometry,glass,3);instanced.position.set(4,2,-1);instanced.rotation.set(.1,.23,-.18);nested.add(instanced);
const transforms=[];
for(let index=0;index<3;index++){
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(index*18-15,index-2,index*3),new THREE.Quaternion().setFromEuler(new THREE.Euler(index*.27,-index*.43,index*.11)),new THREE.Vector3(1+index*.2,.5+index*.3,1.3-index*.2));transforms.push(matrix);instanced.setMatrixAt(index,matrix);
}
parent.updateMatrixWorld(true);const instances=snapshotSolidColliders(nested,{padding:.25});assert.equal(instances.length,3);assert.ok(instances.every(c=>c.id.startsWith(instanced.uuid+':')));
for(let index=0;index<3;index++){
  const matrix=new THREE.Matrix4().multiplyMatrices(instanced.matrixWorld,transforms[index]);const expected=geometry.boundingBox.clone().applyMatrix4(matrix);assertBox(instances[index],expected,.25);assert.equal(instances[index].id,`${instanced.uuid}:${index}`);
}
const filtered=snapshotSolidColliders(parent,{filter:(mesh,index)=>mesh!==instanced||index===1});assert.deepEqual(filtered.map(c=>c.id),[`${instanced.uuid}:1`]);
instanced.count=2;assert.equal(snapshotSolidColliders(parent).length,2);instanced.count=3;instanced.visible=false;assert.equal(snapshotSolidColliders(parent).length,0);instanced.visible=true;
const normal=boxMesh();normal.position.set(-4,3,9);normal.rotation.set(.7,.4,-.25);normal.scale.set(-2,.6,1.3);nested.add(normal);normal.geometry.computeBoundingBox();const withNormal=snapshotSolidColliders(parent);assertBox(withNormal.find(c=>c.id===normal.uuid),normal.geometry.boundingBox.clone().applyMatrix4(normal.matrixWorld));
for(const invalid of [null,{},3])assert.throws(()=>snapshotSolidColliders(invalid),TypeError);
for(const padding of [NaN,Infinity,-1,'1'])assert.throws(()=>snapshotSolidColliders(root,{padding}),TypeError);
assert.throws(()=>snapshotSolidColliders(root,{filter:1}),TypeError);assert.throws(()=>snapshotSolidColliders(root,{filter:()=>undefined}),TypeError);

// Batched geometry can retain sparse physical components explicitly. Local
// boxes replace the batch AABB and receive world padding after transformation.
const batch=new THREE.Mesh(new THREE.BoxGeometry(50,8,20),glass);batch.position.set(9,4,-6);batch.rotation.set(.1,.6,-.17);batch.scale.set(1.4,.7,1.1);root.add(batch);
const customBoxes=[{min:{x:-12,y:-1,z:-2},max:{x:-10,y:3,z:2}},{min:{x:10,y:-1,z:-2},max:{x:12,y:3,z:2}}];batch.userData.collisionBoxes=customBoxes;
let customFilterCalls=0;const custom=snapshotSolidColliders(batch,{padding:.2,filter:mesh=>{customFilterCalls++;return mesh===batch;}});assert.equal(custom.length,2);assert.equal(customFilterCalls,1,'A custom batch is filtered once, not once per box');
customBoxes.forEach((box,index)=>{assert.equal(custom[index].id,`${batch.uuid}:box:${index}`);assertBox(custom[index],new THREE.Box3(vector(box.min),vector(box.max)).applyMatrix4(batch.matrixWorld),.2);});
const customSaved=custom[0].min.x;customBoxes[0].min.x=-13;assert.equal(custom[0].min.x,customSaved,'Custom box snapshots must own their coordinates');customBoxes[0].min.x=-12;
assert.equal(snapshotSolidColliders(batch,{filter:()=>false}).length,0);batch.visible=false;assert.equal(snapshotSolidColliders(batch).length,0);batch.visible=true;batch.userData.collision=false;assert.equal(snapshotSolidColliders(batch).length,0);delete batch.userData.collision;
batch.userData.collisionBoxes=[];assert.equal(snapshotSolidColliders(batch).length,0,'An empty explicit list never falls back to the merged geometry box');
for(const invalid of [null,[{}],[{min:{x:2,y:0,z:0},max:{x:1,y:2,z:2}}],[{min:{x:0,y:NaN,z:0},max:{x:1,y:2,z:2}}],Array(2)]){batch.userData.collisionBoxes=invalid;assert.throws(()=>snapshotSolidColliders(batch),TypeError);}batch.userData.collisionBoxes=customBoxes;
instanced.userData.collisionBoxes=customBoxes;const instanceFilterCalls=[];
const instanceCustom=snapshotSolidColliders(instanced,{filter:(mesh,index)=>{instanceFilterCalls.push(index);return index===1;}});assert.deepEqual(instanceFilterCalls,[0,1,2]);assert.equal(instanceCustom.length,2);
const storedInstance=new THREE.Matrix4();instanced.getMatrixAt(1,storedInstance);const oneWorld=new THREE.Matrix4().multiplyMatrices(instanced.matrixWorld,storedInstance);customBoxes.forEach((box,index)=>{assert.equal(instanceCustom[index].id,`${instanced.uuid}:1:box:${index}`);assertBox(instanceCustom[index],new THREE.Box3(vector(box.min),vector(box.max)).applyMatrix4(oneWorld));});delete instanced.userData.collisionBoxes;

// Actual 90-tube life geometry remains one draw mesh but supplies 90 hard local
// tubes. The 8100 soft crown strokes never enter the solid obstacle list.
let seed=1901;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const life=createVentLife({random,count:90,groundHeight:(x,z)=>Math.sin(x*.11)+Math.cos(z*.09)}),tubes=life.children.find(object=>object.isMesh&&!object.isInstancedMesh),fronds=life.children.find(object=>object.isInstancedMesh&&object.userData.collision===false),lips=life.children.find(object=>object.isInstancedMesh&&object!==fronds);
assert.ok(tubes&&fronds&&lips);assert.equal(tubes.userData.collisionBoxes.length,90);assert.equal(fronds.count,8100);assert.equal(lips.count,90);
const tubeVertices=tubes.geometry.attributes.position,perTube=tubeVertices.count/90;assert.equal(perTube,90);
for(let tube=0;tube<90;tube++){
  const measured=new THREE.Box3(),point=new THREE.Vector3();for(let index=tube*perTube;index<(tube+1)*perTube;index++)measured.expandByPoint(point.fromBufferAttribute(tubeVertices,index));
  assertBox(tubes.userData.collisionBoxes[tube],measured,.1);const box=tubes.userData.collisionBoxes[tube];assert.ok(box.max.x-box.min.x<5&&box.max.z-box.min.z<5,'A hard tube must not expand to the colony footprint');
}
life.position.set(35,8,-12);life.rotation.y=.7;life.scale.set(.7,1.2,1.1);const lifeSolids=snapshotSolidColliders(life);assert.equal(lifeSolids.length,180);assert.equal(lifeSolids.filter(c=>c.id.startsWith(tubes.uuid+':box:')).length,90);assert.equal(lifeSolids.filter(c=>c.id.startsWith(lips.uuid+':')).length,90);assert.equal(lifeSolids.some(c=>c.id===tubes.uuid||c.id.startsWith(fronds.uuid)),false);
tubes.geometry.computeBoundingBox();let gap=null;
for(let x=Math.ceil(tubes.geometry.boundingBox.min.x)+1;x<tubes.geometry.boundingBox.max.x-1&&!gap;x++)for(let z=Math.ceil(tubes.geometry.boundingBox.min.z)+1;z<tubes.geometry.boundingBox.max.z-1;z++){
  const point=new THREE.Vector3(x,3,z).applyMatrix4(tubes.matrixWorld),inside=lifeSolids.some(box=>['x','y','z'].every(axis=>point[axis]>=box.min[axis]&&point[axis]<=box.max[axis]));if(!inside){gap=point;break;}
}
assert.ok(gap,'Water inside the former merged AABB must remain outside all independent hard tubes');

// The profile is calibrated against actual meshes, not semantic anchors or a
// decorative light beam. All 101 arm states, both bottle positions and both
// roll extremes are checked; hidden electronics cutaway is excluded normally.
const rov=createRovSystem();rov.group.scale.setScalar(.85);rov.setCutaway(false);
const observed=new THREE.Box3(),stateBox=new THREE.Box3(),point=new THREE.Vector3();let testedStates=0,physicalMeshes=0,vertexChecks=0,hiddenMeshes=0;
rov.group.traverse(object=>{if(object.isMesh&&object.parent?.visible===false)hiddenMeshes++;});
assert.ok(hiddenMeshes>0,'The real model must include hidden cutaway meshes');
for(let armIndex=0;armIndex<=100;armIndex++)for(const samplingProgress of [0,1])for(const roll of [-.016,.016]){
  rov.update({time:armIndex*.123,armProgress:armIndex/100,samplingProgress});rov.group.rotation.z=roll;rov.group.updateMatrixWorld(true);stateBox.makeEmpty();
  const physical=snapshotSolidColliders(rov.group);physicalMeshes=physical.length;
  for(const collider of physical){stateBox.expandByPoint(vector(collider.min));stateBox.expandByPoint(vector(collider.max));}
  for(const axis of ['x','y','z']){assert.ok(stateBox.min[axis]>=profile.min[axis]-1e-5,`ROV ${armIndex}/${samplingProgress}/${roll} exceeds minimum ${axis}: ${stateBox.min[axis]}`);assert.ok(stateBox.max[axis]<=profile.max[axis]+1e-5,`ROV ${armIndex}/${samplingProgress}/${roll} exceeds maximum ${axis}: ${stateBox.max[axis]}`);}
  // Also verify actual transformed physical vertices, independently of the AABB
  // snapshot helper, so a broken snapshot cannot falsely certify the profile.
  rov.group.traverse(object=>{
    if(!object.isMesh||object.geometry.type==='RingGeometry')return;
    for(let ancestor=object;ancestor;ancestor=ancestor.parent)if(ancestor.visible===false||ancestor.userData.collision===false)return;
    const positions=object.geometry.attributes.position;
    for(let index=0;positions&&index<positions.count;index++){
      point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);
      for(const axis of ['x','y','z'])assert.ok(point[axis]>=profile.min[axis]-1e-5&&point[axis]<=profile.max[axis]+1e-5,`Actual ROV vertex escaped ${axis}`);
      vertexChecks++;
    }
  });
  observed.union(stateBox);testedStates++;
}
assert.equal(testedStates,404);assert.ok(physicalMeshes>50&&vertexChecks>100000);
const beforeCutaway=snapshotSolidColliders(rov.group).length;rov.setCutaway(true);const afterCutaway=snapshotSolidColliders(rov.group).length;assert.ok(afterCutaway>beforeCutaway,'Visible cutaway is included if explicitly enabled; transparency is not an opt-out');rov.setCutaway(false);
dispose(root);dispose(outside);dispose(parent);dispose(rov.group);dispose(life);
console.log(JSON.stringify({passed:true,rov:{scale:.85,armStates:101,bottleStates:2,rollStates:2,testedStates,physicalMeshes,vertexChecks,hiddenCutawayMeshes:hiddenMeshes,bodyRadius:radius,observedBounds:{min:observed.min.toArray(),max:observed.max.toArray()},profile},ventLife:{hardTubes:90,lipInstances:90,softFronds:fronds.count,solidColliders:lifeSolids.length,openWaterGap:true},checks:['per-mesh boxes preserve empty space','every instanced matrix multiplied by matrixWorld','nested rotation, nonuniform/negative scale and offset geometry','instance filtering and active count','invisible/collision:false ancestor exclusion','RingGeometry excluded; transparent glass retained','owned frozen snapshots and world padding','explicit local collisionBoxes replace merged boxes and expand per instance','real tube vertices retain 90 independent hard bounds; 8100 soft crowns excluded','actual ROV actuator/roll geometry enclosed by calibrated profile']},null,2));
