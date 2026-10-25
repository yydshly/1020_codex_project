// SPDX-License-Identifier: GPL-3.0-only
// Run: node src/check-collision-world.mjs
// Read-only CPU checks: actual canyon triangles, independent polygon clipping,
// full-body rotation, solid props, restoration and continuous camera movement.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCollisionWorld} from '../web/rendering/collision-world.mjs';
const threeURL=new URL('../web/vendor/three/build/three.module.min.js',import.meta.url),THREE=await import(threeURL.href);
const source=await readFile(new URL('../web/terrain.js',import.meta.url),'utf8');
const {createBathymetryField}=await import('data:text/javascript;base64,'+Buffer.from(source.replace("from 'three'",'from '+JSON.stringify(threeURL.href))).toString('base64'));
const data=JSON.parse(await readFile(new URL('../web/data/canyon.json',import.meta.url),'utf8')),field=createBathymetryField(data);
const body=Object.freeze({min:Object.freeze({x:-9.588,y:-8.364,z:-18.107}),max:Object.freeze({x:9.588,y:10.897,z:8.024})});
const world=createCollisionWorld({heightAt:field.heightAt,bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},ceiling:414});
const at=(x,y,z,heading=0)=>({position:{x,y,z},heading});
const close=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const sphereBox=r=>({min:{x:-r,y:-r,z:-r},max:{x:r,y:r,z:r}});

const geometry=new THREE.PlaneGeometry(field.extent,field.extent,field.resolution,field.resolution);geometry.rotateX(-Math.PI/2);for(let i=0;i<field.heights.length;i++)geometry.attributes.position.setY(i,field.heights[i]);
const outer=new THREE.BufferGeometry();outer.setAttribute('position',new THREE.BufferAttribute(field.outerPositions,3));outer.setIndex(field.outerIndices);
// Independent Sutherland-Hodgman clipping against world-space OBB edges. The
// implementation under test instead enumerates regular mesh/body-edge events.
function clippedMaximum(geometries,x,z,heading,profile){
  const c=Math.cos(heading),s=Math.sin(heading),quad=[[profile.min.x,profile.min.z],[profile.max.x,profile.min.z],[profile.max.x,profile.max.z],[profile.min.x,profile.max.z]].map(([lx,lz])=>({x:x+c*lx-s*lz,z:z+s*lx+c*lz}));
  const minX=Math.min(...quad.map(p=>p.x)),maxX=Math.max(...quad.map(p=>p.x)),minZ=Math.min(...quad.map(p=>p.z)),maxZ=Math.max(...quad.map(p=>p.z));let max=-Infinity;
  for(const g of geometries){const p=g.attributes.position,index=g.index.array;let offsets=[];
    if(g===geometry){const cell=field.extent/field.resolution,half=field.extent*.5;for(let iz=Math.max(0,Math.floor((minZ+half)/cell)-1);iz<=Math.min(field.resolution-1,Math.floor((maxZ+half)/cell)+1);iz++)for(let ix=Math.max(0,Math.floor((minX+half)/cell)-1);ix<=Math.min(field.resolution-1,Math.floor((maxX+half)/cell)+1);ix++)offsets.push((iz*field.resolution+ix)*6,(iz*field.resolution+ix)*6+3);}
    else offsets=Array.from({length:index.length/3},(_,i)=>i*3);
    for(const offset of offsets){let poly=[0,1,2].map(j=>{const id=index[offset+j];return {x:p.getX(id),y:p.getY(id),z:p.getZ(id)};});if(Math.max(...poly.map(v=>v.x))<minX||Math.min(...poly.map(v=>v.x))>maxX||Math.max(...poly.map(v=>v.z))<minZ||Math.min(...poly.map(v=>v.z))>maxZ)continue;
      for(let edge=0;edge<4&&poly.length;edge++){const a=quad[edge],b=quad[(edge+1)%4],side=v=>(b.x-a.x)*(v.z-a.z)-(b.z-a.z)*(v.x-a.x),out=[];for(let j=0;j<poly.length;j++){const u=poly[j],v=poly[(j+1)%poly.length],du=side(u),dv=side(v),insideU=du>=-1e-7,insideV=dv>=-1e-7;if(insideU)out.push(u);if(insideU!==insideV){const t=du/(du-dv);out.push({x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t,z:u.z+(v.z-u.z)*t});}}poly=out;}
      for(const v of poly)max=Math.max(max,v.y);
    }
  }
  return max-profile.min.y+.8;
}
let maxEnvelopeError=0;
for(let i=0;i<72;i++){const x=Math.sin(i*.73)*460,z=Math.cos(i*.47)*460,heading=i*.33,actual=world.minimumYAt(x,z,heading,body),reference=clippedMaximum([geometry],x,z,heading,body);maxEnvelopeError=Math.max(maxEnvelopeError,Math.abs(actual-reference));close(actual,reference,2e-5);}

const original=Object.freeze({position:Object.freeze({x:170.6,y:-205.3,z:204.6}),heading:0}),before=JSON.stringify(original);
assert.equal(world.isPoseClear(original,body),false,'The former centre-only safe canyon pose intersects the wall with its body');
assert.equal(world.isBlockedBySolids(original,body),false,'Terrain collision must not be misreported as a solid prop');
const radius=Math.max(...[body.min.x,body.max.x].flatMap(x=>[body.min.z,body.max.z].map(z=>Math.hypot(x,z)))),centreBounds={minX:-580+radius,maxX:580-radius,minZ:-580+radius,maxZ:580-radius};
const restored=world.resolveRestoredPose(original,body,{centreBounds});assert.ok(restored.valid);assert.ok(world.isPoseClear(restored,body));assert.ok(restored.position.y-original.position.y<=8,'A nearby wall must not pull the vehicle up to its top');assert.ok(Math.hypot(restored.position.x-original.position.x,restored.position.z-original.position.z)<=16);assert.equal(restored.method,'local-pushout');assert.equal(JSON.stringify(original),before);assert.deepEqual(world.resolveRestoredPose(original,body,{centreBounds}),restored);
const rotated={position:restored.position,heading:Math.PI/2},turn=world.sweepBody(restored,rotated,body);assert.equal(world.isPoseClear(rotated,body),false);assert.ok(turn.blocked&&turn.fraction<1&&world.isPoseClear(turn,body),'Pure turn must stop when the rotated arm/body reaches the wall');
const boundary=world.resolveRestoredPose(at(575,140,0),body,{centreBounds});assert.ok(boundary.valid&&boundary.position.x<=centreBounds.maxX+1e-7);

// A genuine triangulated needle peak is inside the footprint while every box
// corner is on flat ground. Dense endpoint/corner checking alone misses it.
function triangularHeight(cell,node){return (x,z)=>{const gx=x/cell,gz=z/cell,ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,a=node(ix,iz),b=node(ix+1,iz),c=node(ix,iz+1),d=node(ix+1,iz+1);return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);};}
const peakHeight=triangularHeight(1,(x,z)=>x===0&&z===0?20:0),peakWorld=createCollisionWorld({heightAt:peakHeight,terrainCell:1,terrainOrigin:{x:0,z:0},margin:.8}),wide=sphereBox(2.2);close(peakWorld.minimumYAt(.3,.3,Math.PI/7,wide),23); // 20 - (-2.2) + .8
const ridgeHeight=triangularHeight(.25,x=>x===0?20:0),ridgeWorld=createCollisionWorld({heightAt:ridgeHeight,terrainCell:.25,terrainOrigin:{x:0,z:0},margin:.2}),small={min:{x:-.2,y:-.1,z:-.4},max:{x:.2,y:.1,z:.4}},thin=ridgeWorld.sweepBody(at(-8,3,0),at(8,3,0),small);assert.ok(thin.blocked&&thin.fraction<.5&&ridgeWorld.isPoseClear(thin,small),'A thin ridge between safe endpoints must stop the body');

const rod={min:{x:-.5,y:-.5,z:-5},max:{x:.5,y:.5,z:5}},post={min:{x:3.4,y:0,z:-3.6},max:{x:3.6,y:8,z:-3.4}},props=createCollisionWorld({heightAt:()=>0,colliders:[post],margin:.1}),start=at(0,3,0),end=at(0,3,0,Math.PI/2);assert.ok(props.isPoseClear(start,rod)&&props.isPoseClear(end,rod));assert.ok(props.sweepBody(start,end,rod).blocked,'A narrow post must block an intermediate rotation even when both endpoints are clear');
props.setColliders([{center:{x:0,y:3,z:0},radius:.5}]);assert.ok(props.isBlockedBySolids(start,rod));props.setColliders([]);assert.ok(!props.isBlockedBySolids(start,rod));

const bar={min:{x:0,y:0,z:-.025},max:{x:.05,y:30,z:.025}},cameraWorld=createCollisionWorld({heightAt:()=>0,colliders:[bar],margin:.8}),cameraFrom=Object.freeze({x:-100,y:10,z:0}),cameraTo=Object.freeze({x:100,y:10,z:0}),cameraBefore=JSON.stringify([cameraFrom,cameraTo]),sweptCamera=cameraWorld.clampSweep(cameraFrom,cameraTo,3);assert.ok(sweptCamera.valid&&sweptCamera.blocked&&sweptCamera.position.x<-3.8);assert.ok(cameraWorld.isPoseClear({position:sweptCamera.position,heading:0},sphereBox(3)));assert.equal(JSON.stringify([cameraFrom,cameraTo]),cameraBefore,'Collision queries must not modify source camera coordinates');assert.deepEqual(cameraWorld.clampSweep(cameraFrom,cameraTo,3),sweptCamera);
const leaving=cameraWorld.clampSweep({x:0,y:10,z:0},{x:20,y:10,z:0},3);assert.ok(leaving.valid&&leaving.adjustedStart&&cameraWorld.isPoseClear({position:leaving.position,heading:0},sphereBox(3)),'A camera initially inside a prop must be repaired, never returned inside it');
const impossible=createCollisionWorld({heightAt:()=>500,ceiling:30,bounds:{minX:-5,maxX:5,minZ:-5,maxZ:5}}).clampSweep({x:0,y:0,z:0},{x:1,y:0,z:0},3);assert.equal(impossible.valid,false);assert.equal(impossible.position,null,'An unresolved camera must not receive an unsafe fallback');

const canyonCamera=createCollisionWorld({heightAt:field.heightAt,bounds:{minX:-1900,maxX:1900,minZ:-1900,maxZ:1900},ceiling:1800,terrainGeometries:[{positions:field.outerPositions,index:field.outerIndices}]}),crossWall=canyonCamera.clampSweep({x:134,y:-162,z:271},{x:220,y:-162,z:190},3);assert.ok(crossWall.valid&&crossWall.blocked&&canyonCamera.isPoseClear({position:crossWall.position,heading:0},sphereBox(3)));
for(const [x,z] of [[650,700],[-720,250],[500,860]])close(canyonCamera.minimumYAt(x,z,0,sphereBox(3)),clippedMaximum([geometry,outer],x,z,0,sphereBox(3)),2e-5);

for(const invalid of [NaN,Infinity,-Infinity,'0'])assert.throws(()=>world.minimumYAt(invalid,0,0,body),TypeError);
for(const invalid of [0,-1,NaN,Infinity])assert.throws(()=>cameraWorld.clampSweep(cameraFrom,cameraTo,invalid),TypeError);
assert.throws(()=>world.isPoseClear({position:{x:0,y:Infinity,z:0},heading:0},body),TypeError);
assert.throws(()=>world.isPoseClear(start,{min:{x:2,y:0,z:0},max:{x:1,y:1,z:1}}),TypeError);
assert.throws(()=>createCollisionWorld({heightAt:()=>NaN}).minimumYAt(0,0,0,body),TypeError);
geometry.dispose();outer.dispose();
console.log(JSON.stringify({passed:true,exactFootprints:72,maxEnvelopeError:Number(maxEnvelopeError.toPrecision(3)),canyonRestore:{method:restored.method,horizontalShift:Number(Math.hypot(restored.position.x-original.position.x,restored.position.z-original.position.z).toFixed(2)),verticalShift:Number((restored.position.y-original.position.y).toFixed(2))},checks:['interior peak and thin ridge','body rotation at canyon wall and solid post','continuous expanded-AABB camera sweep','camera repair and explicit unresolved fallback','outer-ring triangle geometry','finite inputs, deterministic queries and immutable source camera']}));
