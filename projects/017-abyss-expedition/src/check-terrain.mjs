// SPDX-License-Identifier: GPL-3.0-only
// Run: node src/check-terrain.mjs
// Read-only Node verification of the actual terrain meshes and collision field.
// Browser texture I/O is stubbed in memory; no web file, dependency or cache is
// written. Shader appearance is covered by the separate browser visual review.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const threeURL=new URL('../web/vendor/three/build/three.module.min.js',import.meta.url);
const THREE=await import(threeURL.href);
const terrainSource=await readFile(new URL('../web/terrain.js',import.meta.url),'utf8');
assert.ok(terrainSource.includes("from 'three'"),'Expected the terrain adapter to import local Three.js through the browser import map');
const nodeSource=terrainSource.replace("from 'three'",'from '+JSON.stringify(threeURL.href));
const {buildBathymetry}=await import('data:text/javascript;base64,'+Buffer.from(nodeSource).toString('base64'));

// Geometry construction uses the real adapter. Only TextureLoader.load, which
// needs an HTML image element, is temporarily replaced inside this process.
const originalTextureLoad=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};

const points=[];
for(let i=0;i<130;i++){
  const radius=i<90?635:1600;
  points.push([Math.sin(i*7.239)*radius,Math.cos(i*3.191)*radius]);
}
points.push([660,0],[660,660],[-660,-660],[690,20],[0,-1200]);
const report=[];
const close=(a,b,tolerance,label)=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b} (tolerance ${tolerance})`);

try{
  for(const name of ['vents','canyon']){
    const mission=JSON.parse(await readFile(new URL(`../web/data/${name}.json`,import.meta.url),'utf8'));
    const terrain=buildBathymetry(mission);
    terrain.group.updateMatrixWorld(true);
    const meshes=[];
    terrain.group.traverse(object=>{if(object.isMesh)meshes.push(object);});
    assert.equal(meshes.length,2,`${name}: expect the detailed field and its joined outer ring`);
    let min=Infinity,max=-Infinity,triangles=0;
    for(const mesh of meshes){
      const position=mesh.geometry.attributes.position;
      for(let i=0;i<position.count;i++)assert.ok(Number.isFinite(position.getX(i)+position.getY(i)+position.getZ(i)),`${name}: non-finite geometry vertex`);
      triangles+=mesh.geometry.index.count/3;
    }
    const central=meshes[0].geometry.attributes.position;
    for(let i=0;i<central.count;i++){min=Math.min(min,central.getY(i));max=Math.max(max,central.getY(i));}

    const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
    const meshHeight=(x,z)=>{
      ray.set(new THREE.Vector3(x,1200,z),down);
      const hit=ray.intersectObjects(meshes,false)[0];
      assert.ok(hit,`${name}: no top-facing mesh under (${x},${z})`);
      return hit.point.y;
    };
    let maxError=0,outerPoints=0;
    for(const [x,z] of points){
      const sampled=terrain.heightAt(x,z),actual=meshHeight(x,z);
      assert.ok(Number.isFinite(sampled),`${name}: non-finite collision height`);
      maxError=Math.max(maxError,Math.abs(sampled-actual));
      close(sampled,actual,1e-4,`${name}: collision / mesh at (${x},${z})`);
      if(Math.max(Math.abs(x),Math.abs(z))>660)outerPoints++;
    }
    assert.ok(outerPoints>=25,`${name}: outer-ring coverage is too small`);

    let maxHoverDelta=0,maxDeviceFootprintDelta=0;
    for(const entity of mission.entities){
      const x=(entity.position[0]-.5)*620,z=(entity.position[1]-.5)*620,station=terrain.heightAt(x,z);
      close(station,meshHeight(x,z),1e-4,`${name}.${entity.id}: equipment anchor`);
      const hover=terrain.heightAt(x+22,z+26);
      close(hover,meshHeight(x+22,z+26),1e-4,`${name}.${entity.id}: ROV hover ground`);
      maxHoverDelta=Math.max(maxHoverDelta,Math.abs(hover-station));
      const radius=entity.kind==='vent'?12:entity.kind==='coral'?7:entity.kind==='sampling'?6:4;
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        maxDeviceFootprintDelta=Math.max(maxDeviceFootprintDelta,Math.abs(terrain.heightAt(x+Math.cos(a)*radius,z+Math.sin(a)*radius)-station));
      }
    }
    assert.ok(maxHoverDelta<(name==='canyon'?2:16),`${name}: equipment and canonical ROV working area are on different levels (${maxHoverDelta})`);
    assert.ok(maxDeviceFootprintDelta<4,`${name}: equipment footprint crosses an unprepared steep slope (${maxDeviceFootprintDelta})`);

    for(const pose of [terrain.getOverviewPose(),terrain.getPilotStart(),...mission.entities.map(entity=>terrain.getStationView(entity.id))].filter(Boolean)){
      assert.ok(pose.position.length===3&&pose.target.length===3&&[...pose.position,...pose.target].every(Number.isFinite),`${name}: invalid recommended camera pose`);
      assert.ok(pose.position[1]>=terrain.heightAt(pose.position[0],pose.position[2])+18,`${name}: recommended pose is inside the ground`);
    }
    report.push({mission:name,meshProbes:points.length,outerProbes:outerPoints,maxRayError:Number(maxError.toPrecision(3)),relief:Number((max-min).toFixed(1)),maxStationHoverDelta:Number(maxHoverDelta.toFixed(2)),maxDeviceFootprintDelta:Number(maxDeviceFootprintDelta.toFixed(2)),triangles});
    const geometries=new Set(),materials=new Set();terrain.group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
  }
}finally{
  THREE.TextureLoader.prototype.load=originalTextureLoad;
}

assert.ok(report[1].relief>250,'Canyon must remain a deeply incised landform');
assert.ok(report[0].relief<100,'Vent field must retain its open, low-ridge relief');
assert.ok(report[1].relief>report[0].relief*4,'The two missions must differ in actual geometry, not only material colour');
console.log(JSON.stringify({passed:true,terrain:report}));
