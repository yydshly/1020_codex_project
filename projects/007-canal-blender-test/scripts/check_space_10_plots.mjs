import fs from 'node:fs';
import {register} from 'node:module';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),web=new URL('web/',root),threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL),{GLTFLoader}=await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
const {applyPlots}=await import(new URL('scene-space-10-plots.js',web)),{createNavigation}=await import(new URL('scene-space-10-navigation.js',web));
const manifest=JSON.parse(fs.readFileSync(new URL('models/space-10-manifest.json',web))),bytes=fs.readFileSync(new URL('models/space-10.glb',web));
const {scene:model}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=new THREE.Scene();scene.add(model);
const texture=new THREE.DataTexture(new Uint8Array([180,195,140,255]),1,1);texture.name='Geometry-check borrowed alpha placeholder';
const sourceMaterial=new THREE.MeshStandardMaterial({map:texture,alphaTest:.35,side:THREE.DoubleSide});
const sourceLeaves=new THREE.Mesh(new THREE.PlaneGeometry(1,1),sourceMaterial);sourceLeaves.name='SPACE09_IndividualLeafSprigs';scene.add(sourceLeaves);
const originals=[];model.traverse(o=>{if(o.isMesh)originals.push({o,geometry:o.geometry,position:o.geometry.attributes.position.array.slice(),material:o.material,visible:o.visible,cast:o.castShadow,receive:o.receiveShadow});});
const nav=createNavigation({ground:manifest.neighbourhood.ground.navigation});
const h=await applyPlots({},scene,model,manifest.neighbourhood);assert.equal(await applyPlots({},scene,model,manifest.neighbourhood),h);
const group=scene.getObjectByName('SPACE10_PlantedParcels');group.updateMatrixWorld(true);
const failures=[],position=new THREE.Vector3(),matrix=new THREE.Matrix4();let measuredVertices=0;
const inside=(bounds,x,y)=>bounds.some(([a,b,c,d])=>x>=a-1e-5&&x<=c+1e-5&&y>=b-1e-5&&y<=d+1e-5);
for(const plot of h.metadata.plots){
 for(const key of ['stone','wood','hedge']){
  const mesh=scene.getObjectByName('SPACE10_Parcels_'+key),r=plot.ranges[key],p=mesh.geometry.attributes.position;
  for(let i=r.start;i<r.start+r.count;i++){position.fromBufferAttribute(p,i);measuredVertices++;
   if(!inside(plot.allowedBoundsBlenderXY,position.x,-position.z))failures.push({type:'out-of-plot',plot:plot.id,key,point:position.toArray()});
   if(nav.isWalkable(position.x,position.z))failures.push({type:'walkable-intrusion',plot:plot.id,key,point:position.toArray()});
  }
 }
 const mesh=scene.getObjectByName('SPACE10_PlotLeaves'),r=plot.ranges.leaves,p=mesh.geometry.attributes.position;
 for(let i=r.start;i<r.start+r.count;i++){mesh.getMatrixAt(i,matrix);for(let j=0;j<p.count;j++){
  position.fromBufferAttribute(p,j).applyMatrix4(matrix);measuredVertices++;
  if(!inside(plot.allowedBoundsBlenderXY,position.x,-position.z))failures.push({type:'out-of-plot',plot:plot.id,key:'leaf',point:position.toArray()});
  if(nav.isWalkable(position.x,position.z))failures.push({type:'walkable-intrusion',plot:plot.id,key:'leaf',point:position.toArray()});
 }}
}
const routeFailures=[];
for(const [id,route]of Object.entries(nav.routes))for(let i=1;i<route.length;i++){
 const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025);
 for(let j=0;j<=steps;j++){const t=steps?j/steps:0,x=THREE.MathUtils.lerp(a.x,b.x,t),z=THREE.MathUtils.lerp(a.z,b.z,t);if(!nav.isWalkable(x,z))routeFailures.push({id,x,z});}
}
const entries=manifest.neighbourhood.ground.entry_approaches.map(e=>({...e,walkable:nav.isWalkable(e.point[0],-e.point[1])}));
for(const before of originals){assert.equal(before.o.geometry,before.geometry);assert.deepEqual(before.o.geometry.attributes.position.array,before.position);assert.equal(before.o.visible,before.visible);assert.equal(before.o.castShadow,before.cast);assert.equal(before.o.receiveShadow,before.receive);}
const resources=new Set();group.traverse(o=>{if(o.isMesh){resources.add(o.geometry);resources.add(o.material);}});model.traverse(o=>{if(o.isMesh&&o.material.name.startsWith('Space 10'))resources.add(o.material);});
const counts=new Map();for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)??0)+1));let borrowedDisposals=0;texture.addEventListener('dispose',()=>borrowedDisposals++);
const metadata=structuredClone(h.metadata);h.dispose();h.dispose();
for(const before of originals){assert.equal(before.o.material,before.material);assert.equal(before.o.geometry,before.geometry);}for(const r of resources)assert.equal(counts.get(r),1);assert.equal(borrowedDisposals,0);
const report={passed:!failures.length&&!routeFailures.length&&entries.every(e=>e.walkable),triangles:metadata.triangles,drawCalls:metadata.drawCalls,
 leafInstances:metadata.leafInstances,plots:metadata.plotCount,groundSamples:metadata.groundSamples.length,measuredVertices,failures:failures.slice(0,30),failureCount:failures.length,
 routeFailures:routeFailures.slice(0,30),routeFailureCount:routeFailures.length,entryApproaches:entries,resourcesDisposedOnce:resources.size,borrowedTextureDisposed:false,
 originalGeometryUnchanged:true,originalReferencesRestored:true,metadata,
 note:'Actual SPACE10 GLB and navigation. Leaf alpha appearance is not tested here; it borrows the already verified SPACE09 texture. GPU visual review remains required.'};
fs.writeFileSync(new URL('artifacts/scene-space-10/plots-module-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,triangles:report.triangles,drawCalls:report.drawCalls,leafInstances:report.leafInstances,failures:report.failures,routeFailures:report.routeFailures,failedEntries:entries.filter(e=>!e.walkable)}));
if(!report.passed)process.exitCode=1;
