// SPDX-License-Identifier: GPL-3.0-only
// Run: node src/check-environment-cues.mjs
// Read-only CPU checks against the actual authored terrain and Three.js meshes.
// No WebGL, audio generation, package installation or filesystem writes occur.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {environmentCueTracks} from '../web/data/environment-cue-tracks.mjs';

const threeURL=new URL('../web/vendor/three/build/three.module.min.js',import.meta.url);
const THREE=await import(threeURL.href);
async function loadBrowserModule(relative){
  const source=await readFile(new URL(relative,import.meta.url),'utf8');
  assert.ok(source.includes("from 'three'"));
  return import('data:text/javascript;base64,'+Buffer.from(source.replace("from 'three'",'from '+JSON.stringify(threeURL.href))).toString('base64'));
}
const {buildBathymetry}=await loadBrowserModule('../web/terrain.js');
const {createEnvironmentCues}=await loadBrowserModule('../web/rendering/environment-cues.mjs');
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const cameraPose=camera=>JSON.stringify({p:camera.position.toArray(),q:camera.quaternion.toArray(),fov:camera.fov,projection:camera.projectionMatrix.elements});
function resources(group){
  const objects=new Set();group.traverse(o=>{if(o.geometry)objects.add(o.geometry);for(const material of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])objects.add(material);});return [...objects];
}
function watchDisposal(group){return resources(group).map(object=>{const item={object,count:0};object.addEventListener('dispose',()=>item.count++);return item;});}
function assertDisposed(watched){for(const item of watched)assert.equal(item.count,1,'A removed cue must dispose every owned resource exactly once');}
function geometryIds(group){const ids=[];group.traverse(o=>{if(o.geometry)ids.push(o.geometry.uuid);});return ids;}
function snapshot(group){
  group.updateMatrixWorld(true);const hash=createHash('sha256');
  group.traverse(o=>{
    hash.update(JSON.stringify({visible:o.visible,matrix:o.matrix.elements,opacity:o.material?.opacity,pulse:o.material?.uniforms?.uOpacity?.value}));
    for(const key of ['position','aOpacity','aWeight','aSize']){const array=o.geometry?.attributes[key]?.array;if(array)hash.update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));}
  });
  return hash.digest('hex');
}
function assertFinite(group,label){group.updateMatrixWorld(true);group.traverse(o=>{assert.ok(o.matrixWorld.elements.every(Number.isFinite),`${label}: non-finite transform`);const p=o.geometry?.attributes.position;for(let i=0;p&&i<p.count;i++)assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)),`${label}: non-finite vertex`);});}

const originalTextureLoad=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
const externalTexture=new THREE.Texture();let externalTextureDisposals=0;externalTexture.addEventListener('dispose',()=>externalTextureDisposals++);
let totalCues=0,totalTargets=0,reportedCase=null;const emptyCues=[];
try{
  for(const missionId of ['vents','canyon']){
    const mission=JSON.parse(await readFile(new URL(`../web/data/${missionId}.json`,import.meta.url),'utf8')),terrain=buildBathymetry(mission);
    const toWorld=position=>{const x=(position[0]-.5)*620,z=(position[1]-.5)*620;return V(x,terrain.heightAt(x,z),z);};
    const viewer=missionId==='canyon'?V(170.6,-205.3,204.6):V(-28,terrain.heightAt(-28,45)+22,45);
    const camera=new THREE.PerspectiveCamera(50,680/871,.5,2500);camera.position.copy(missionId==='canyon'?V(134,-162,271):viewer.clone().add(V(-36,43,67)));camera.lookAt(missionId==='canyon'?V(170,-199,204):viewer);camera.updateMatrixWorld(true);
    const terrainMeshes=[];terrain.group.updateMatrixWorld(true);terrain.group.traverse(o=>{if(o.isMesh)terrainMeshes.push(o);});
    const originalPose=cameraPose(camera),cues=createEnvironmentCues({heightAt:terrain.heightAt,toWorld,entities:mission.entities,missionId,texture:externalTexture,terrainMeshes});
    const parent=new THREE.Group(),originalModel=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());let originalDisposed=false;originalModel.geometry.addEventListener('dispose',()=>originalDisposed=true);parent.add(originalModel,cues.group);
    const update=(elapsed,position=viewer)=>cues.update({elapsed,playing:false,viewerPosition:position,camera});
    let prior=[];
    for(const [chapter,track] of Object.entries(environmentCueTracks))if(chapter.startsWith(`env-${missionId}-`))for(const cue of track){
      cues.setCue(cue);assertDisposed(prior);update(7.125);assertFinite(cues.group,cue.id);
      const targets=cues.getTargets();if(!targets.length)emptyCues.push(cue.id);totalTargets+=targets.length;
      assert.ok(targets.every(t=>typeof t.id==='string'&&t.position.isVector3&&t.position.toArray().every(Number.isFinite)),`${cue.id}: invalid world target`);
      const geometryBefore=geometryIds(cues.group),paused=snapshot(cues.group);cues.setCue({...cue,progress:.87});update(7.125);assert.deepEqual(geometryIds(cues.group),geometryBefore,`${cue.id}: same cue rebuilt geometry`);assert.equal(snapshot(cues.group),paused,`${cue.id}: paused pose changed`);
      update(18.25);update(7.125);assert.equal(snapshot(cues.group),paused,`${cue.id}: backward seek is not deterministic`);assert.equal(cameraPose(camera),originalPose,`${cue.id}: cue changed camera`);
      prior=watchDisposal(cues.group);totalCues++;
    }
    cues.setCue(null);assertDisposed(prior);assert.equal(cues.getTargets().length,0);assert.equal(resources(cues.group).length,0);

    if(missionId==='canyon'){
      cues.setCue({id:'reported-wall',kind:'wall',targetIds:['c-wall'],secondaryKinds:['current','snow']});update(9.957);
      const targets=cues.getTargets(),wall=targets.find(t=>t.id==='reported-wall:local-wall'),snow=targets.find(t=>t.kind==='snow');assert.ok(wall&&snow,'The reported pilot position must have local wall and snow annotations');
      const terrainMeshes=[];terrain.group.updateMatrixWorld(true);terrain.group.traverse(o=>{if(o.isMesh)terrainMeshes.push(o);});
      const ray=new THREE.Raycaster();
      const visible=point=>{const direction=point.clone().sub(camera.position),distance=direction.length();ray.set(camera.position,direction.normalize());ray.far=Math.max(0,distance-.12);return ray.intersectObjects(terrainMeshes,false).length===0;};
      assert.ok(visible(wall.position),'Reported local wall anchor is behind real terrain');assert.ok(visible(snow.position),'Reported snow anchor is behind real terrain');
      assert.ok(Math.hypot(wall.position.x-viewer.x,wall.position.z-viewer.z)<=90,'Local wall is no longer local');
      const x=wall.position.x,z=wall.position.z,dx=(terrain.heightAt(x+2,z)-terrain.heightAt(x-2,z))/4,dz=(terrain.heightAt(x,z+2)-terrain.heightAt(x,z-2))/4,normalGap=(wall.position.y-terrain.heightAt(x,z))/Math.sqrt(1+dx*dx+dz*dz);
      assert.ok(normalGap>0&&normalGap<6,'Wall marker must remain close to the actual wall face');assert.ok(snow.position.y-terrain.heightAt(snow.position.x,snow.position.z)>7,'Snow marker must be in actual water, not inside rock');
      const projectedVisible=point=>{const q=point.clone().project(camera);if(Math.abs(q.x)>1||Math.abs(q.y)>1||q.z<-1||q.z>1)return false;const distance=camera.position.distanceTo(point),steps=Math.ceil(distance/3);for(let i=1;i<steps;i++){const q=camera.position.clone().lerp(point,i/steps);if(q.y<terrain.heightAt(q.x,q.z)+.3)return false;}return true;};
      let particles=0,visibleParticles=0;cues.group.updateMatrixWorld(true);cues.group.traverse(o=>{if(!o.isPoints)return;const p=o.geometry.attributes.position,alpha=o.geometry.attributes.aOpacity;particles=p.count;for(let i=0;i<p.count;i++)if(alpha.getX(i)>.08&&projectedVisible(V().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld)))visibleParticles++;});
      assert.ok(particles>=250&&particles<=300);assert.ok(visibleParticles>=12,'Snow must be readable from the reported camera');
      reportedCase={wallAnchorVisible:true,wallNormalGap:Number(normalGap.toFixed(2)),snowAnchorInWater:true,particles,visibleParticles};

      const highPosition=camera.position.clone(),highQuaternion=camera.quaternion.clone();
      camera.position.set(104.8,407.2,342.6);camera.lookAt(170,420,305.1);camera.updateMatrixWorld(true);
      cues.setCue({id:'far-overview',kind:'overview',targetIds:['c-wall','c-channel']});cues.update({elapsed:0,viewerPosition:V(170,414,305.1),camera});
      assert.equal(cues.getTargets().find(t=>t.primary)?.entityId,'c-wall','A distant landform overview must not redirect the user to a water sampler');
      camera.position.copy(highPosition);camera.quaternion.copy(highQuaternion);camera.updateMatrixWorld(true);

      // Regression of the user's actual final pose, its optical viewOffset and
      // the two free stage rectangles beside the guide / above the pilot desk.
      const reportedCamera=new THREE.PerspectiveCamera(54,681/871,.5,2500),reportedViewer=V(149.5,-205.3,209);
      reportedCamera.position.set(135.9,-155.1,279.8);reportedCamera.lookAt(149.5,-199.4,209);reportedCamera.setViewOffset(681,871,681*.19,0,681,871);reportedCamera.updateMatrixWorld(true);
      const focusRegions=[{left:.51,top:.19,right:.96,bottom:.49},{left:.055,top:.47,right:.47,bottom:.74}],reportedPose=cameraPose(reportedCamera),inStage=point=>{const q=point.clone().project(reportedCamera),x=q.x*.5+.5,y=.5-q.y*.5;return q.z>-1&&q.z<1&&focusRegions.some(r=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);};
      const focusCues=createEnvironmentCues({heightAt:terrain.heightAt,toWorld,entities:mission.entities,missionId,texture:externalTexture,terrainMeshes});
      const focusChecks={};
      for(const kind of ['wall','current','snow']){
        focusCues.setCue({id:`actual-${kind}`,kind,targetIds:kind==='wall'?['c-wall']:[]});focusCues.update({elapsed:9.957,viewerPosition:reportedViewer,camera:reportedCamera,focusRegions});
        const primary=focusCues.getTargets().find(t=>t.primary);assert.ok(primary&&primary.kind===kind,`${kind}: no primary target at the actual reported pose`);assert.ok(primary.visibleInFocus&&inStage(primary.position),`${kind}: primary target remains outside the usable stage`);
        assert.equal(cameraPose(reportedCamera),reportedPose,`${kind}: annotation steered free camera`);
        const firstIds=geometryIds(focusCues.group),first=snapshot(focusCues.group);focusCues.update({elapsed:9.957,viewerPosition:reportedViewer,camera:reportedCamera,focusRegions});assert.deepEqual(geometryIds(focusCues.group),firstIds);assert.equal(snapshot(focusCues.group),first,`${kind}: repeated frame rebased or flickered`);
        let visibleGeometry=0;focusCues.group.updateMatrixWorld(true);focusCues.group.traverse(o=>{if(kind==='snow'&&o.isPoints){const a=o.geometry.attributes.aOpacity,p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)if(a.getX(i)>.08&&inStage(V().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld)))visibleGeometry++;}if(kind==='current'&&o.isMesh&&o.geometry.type==='ConeGeometry'&&inStage(o.getWorldPosition(V())))visibleGeometry++;if(kind==='wall'&&o.isMesh&&o.geometry.type==='RingGeometry'&&inStage(o.getWorldPosition(V())))visibleGeometry++;});
        if(kind==='snow')assert.ok(visibleGeometry>=35,`Actual view has only ${visibleGeometry} readable snow particles`);if(kind==='current')assert.ok(visibleGeometry>=1,'Actual view has no readable moving current arrow');if(kind==='wall')assert.ok(visibleGeometry>=1,'Actual view has no visible gold wall reticle');
        if(kind==='current'){
          let vertices=0,nearest=Infinity,maxArrowPixels=0;
          for(let frame=0;frame<22;frame++){
            focusCues.update({elapsed:frame*1.1,viewerPosition:reportedViewer,camera:reportedCamera,focusRegions});focusCues.group.updateMatrixWorld(true);
            focusCues.group.traverse(o=>{if(!o.userData.cueFlow)return;assert.equal(o.material.toneMapped,false);const p=o.geometry.attributes.position;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let i=0;i<p.count;i++){const q=V().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);assert.ok(inStage(q),'A current line or whole arrow left the free stage');const distance=q.distanceTo(reportedCamera.position);nearest=Math.min(nearest,distance);assert.ok(distance>=18,'Current artwork approached the camera and would grow too large');assert.ok(q.y>=terrain.heightAt(q.x,q.z),'Current artwork intersects terrain');const s=q.clone().project(reportedCamera);minX=Math.min(minX,s.x);maxX=Math.max(maxX,s.x);minY=Math.min(minY,s.y);maxY=Math.max(maxY,s.y);vertices++;}if(o.geometry.type==='ConeGeometry')maxArrowPixels=Math.max(maxArrowPixels,(maxX-minX)*681*.5,(maxY-minY)*871*.5);});
          }
          assert.ok(maxArrowPixels<55,'A current arrow dominates the viewport');focusChecks.currentBounds={vertices,nearest:Number(nearest.toFixed(1)),maxArrowPixels:Number(maxArrowPixels.toFixed(1))};
        }
        focusChecks[kind]={primaryInStage:true,visibleGeometry};
      }
      focusCues.destroy();reportedCase.actualViewOffset=focusChecks;
      const liveCamera=new THREE.PerspectiveCamera(54,988/827.667,.5,2500),liveViewer=V(179.2,-47.7,105),liveRegions=[{left:.35,top:.085,right:.97,bottom:.42},{left:.05,top:.38,right:.63,bottom:.77}];
      liveCamera.position.set(184.6,-21.2,68.1);liveCamera.lookAt(179.2,-41.7,105);liveCamera.setViewOffset(988,827.667,140,0,988,827.667);liveCamera.updateMatrixWorld(true);
      const liveCues=createEnvironmentCues({heightAt:terrain.heightAt,toWorld,entities:mission.entities,missionId,texture:externalTexture,terrainMeshes}),liveChecks={};
      for(const kind of ['wall','current','snow']){liveCues.setCue({id:`live-${kind}`,kind,targetIds:kind==='wall'?['c-wall']:[]});liveCues.update({elapsed:8.5,viewerPosition:liveViewer,camera:liveCamera,focusRegions:liveRegions});const primary=liveCues.getTargets().find(t=>t.primary),q=primary?.position.clone().project(liveCamera),sx=q?q.x*.5+.5:NaN,sy=q?.y===undefined?NaN:.5-q.y*.5;assert.ok(primary?.visibleInFocus&&liveRegions.some(r=>sx>=r.left&&sx<=r.right&&sy>=r.top&&sy<=r.bottom),`${kind}: moved live camera has no in-stage primary`);liveChecks[kind]={primaryInStage:true,screen:[Number(sx.toFixed(3)),Number(sy.toFixed(3))]};}
      liveCues.destroy();reportedCase.movedLiveView=liveChecks;

      cues.setCue({id:'biology-check',kind:'biology',targetIds:['c-sponge']});update(3);const biological=cues.getTargets()[0],sponge=toWorld(mission.entities.find(e=>e.id==='c-sponge').position);assert.equal(biological.id,'c-sponge');assert.equal(biological.position.x,sponge.x);assert.equal(biological.position.z,sponge.z);assert.ok(biological.position.distanceTo(viewer)>200,'Biology was teleported toward the viewer');
      update(3,viewer.clone().add(V(120,15,-90)));assert.deepEqual(cues.getTargets()[0].position.toArray(),biological.position.toArray(),'Viewer movement must not move biology');
      const returned=cues.getTargets();returned[0].position.set(0,0,0);assert.deepEqual(cues.getTargets()[0].position.toArray(),biological.position.toArray(),'Target consumers must not mutate renderer anchors');
      cues.setCue({id:'invalid-biology',kind:'biology',targetIds:['missing-entity']});update(3);assert.equal(cues.getTargets().length,0,'An unknown biology target must not substitute another group');
    }
    const last=watchDisposal(cues.group);cues.destroy();assertDisposed(last);assert.equal(resources(cues.group).length,0);assert.deepEqual(parent.children,[originalModel]);assert.equal(originalDisposed,false);assert.equal(externalTextureDisposals,0);originalModel.geometry.dispose();originalModel.material.dispose();
    resources(terrain.group).forEach(resource=>resource.dispose());
  }
  const flat=createEnvironmentCues({heightAt:()=>0,entities:[],missionId:'canyon'});flat.setCue({id:'flat-seabed',kind:'wall'});flat.update({elapsed:3,viewerPosition:V(0,18,0)});assert.equal(flat.getTargets().length,0,'A flat surface must not be labelled as a wall');flat.destroy();
}finally{
  THREE.TextureLoader.prototype.load=originalTextureLoad;
}
assert.ok(totalCues>=55,'All authored cue tracks must be exercised');
console.log(JSON.stringify({passed:true,cuesChecked:totalCues,finiteWorldTargets:totalTargets,reportedCase,sameCueGeometryStable:true,pausedAndSeekStable:true,cameraUnchanged:true,biologyRemainsAtRealAnchor:true,ownedResourcesReleased:true,sharedTextureRetained:true,emptyCues}));
