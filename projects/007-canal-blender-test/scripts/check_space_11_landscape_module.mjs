import fs from 'node:fs';
import {register} from 'node:module';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),web=new URL('web/',root),threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL),{GLTFLoader}=await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
const {applyLandscape:applyPrevious}=await import(new URL('scene-space-09-landscape.js',web)),{applyLandscape}=await import(new URL('scene-space-11-landscape.js',web));
const {createNavigation}=await import(new URL('scene-space-10-navigation.js',web));
const manifest=JSON.parse(fs.readFileSync(new URL('models/space-10-manifest.json',web))),bytes=fs.readFileSync(new URL('models/space-10.glb',web));
const {scene:model}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=new THREE.Scene();scene.add(model);
const canvasFactory=()=>({width:256,height:256,getContext:()=>new Proxy({getImageData:()=>({width:256,height:256,data:new Uint8ClampedArray(256*256*4)})},{get:(target,key)=>key in target?target[key]:()=>{}})});
const renderer={domElement:{ownerDocument:{createElement:canvasFactory}},capabilities:{getMaxAnisotropy:()=>4}};
const previous=await applyPrevious(renderer,scene,model,manifest.neighbourhood),originals=[];
scene.traverse(o=>{if(o.isMesh)originals.push({o,geometry:o.geometry,position:o.geometry.attributes.position.array.slice(),material:o.material,visible:o.visible,cast:o.castShadow,receive:o.receiveShadow});});
const sourceLeaves=scene.getObjectByName('SPACE09_IndividualLeafSprigs'),borrowed=[sourceLeaves.geometry,sourceLeaves.material.map];let borrowedDisposed=0;
for(const r of borrowed)r.addEventListener('dispose',()=>borrowedDisposed++);
const h=await applyLandscape(renderer,scene,model,manifest.neighbourhood);assert.equal(await applyLandscape(renderer,scene,model,manifest.neighbourhood),h);
const group=scene.getObjectByName('SPACE11_OuterLandscape');group.updateMatrixWorld(true);
const nav=createNavigation({ground:manifest.neighbourhood.ground.navigation}),failures=[],p=new THREE.Vector3(),matrix=new THREE.Matrix4();let vertices=0;
const [a,b,c,d]=h.metadata.envelopeBlenderXY;
function check(point){vertices++;if(point.x<a-1e-5||point.x>c+1e-5||-point.z<b-1e-5||-point.z>d+1e-5)failures.push({type:'out-of-envelope',point:point.toArray()});if(nav.isWalkable(point.x,point.z))failures.push({type:'public-route-intrusion',point:point.toArray()});}
group.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;
 if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);for(let j=0;j<positions.count;j++)check(p.fromBufferAttribute(positions,j).applyMatrix4(matrix));}}
 else for(let j=0;j<positions.count;j++)check(p.fromBufferAttribute(positions,j));});
for(const before of originals){assert.equal(before.o.geometry,before.geometry);assert.deepEqual(before.o.geometry.attributes.position.array,before.position);assert.equal(before.o.visible,before.visible);assert.equal(before.o.castShadow,before.cast);assert.equal(before.o.receiveShadow,before.receive);}
const resources=new Set();group.traverse(o=>{if(o.isMesh){if(!borrowed.includes(o.geometry))resources.add(o.geometry);resources.add(o.material);}});model.traverse(o=>{if(o.isMesh&&o.material.name.startsWith('Space 11'))resources.add(o.material);});
const counts=new Map();for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)??0)+1));
const metadata=structuredClone(h.metadata);h.dispose();h.dispose();
for(const before of originals){assert.equal(before.o.material,before.material);assert.equal(before.o.geometry,before.geometry);}for(const r of resources)assert.equal(counts.get(r),1);assert.equal(borrowedDisposed,0);
const report={passed:!failures.length,treeCount:metadata.treeCount,triangles:metadata.triangles,drawCalls:metadata.drawCalls,leafInstances:metadata.leafInstances,
 measuredVertices:vertices,failures:failures.slice(0,40),failureCount:failures.length,minimumTreeBankDistance:Math.min(...metadata.trees.map(t=>t.support.bankDistance)),
 resourcesDisposedOnce:resources.size,borrowedResourcesDisposed:false,originalGeometryUnchanged:true,originalReferencesRestored:true,metadata,
 note:'Real SPACE10 GLB and navigation, actual copied prototype branches/card matrices. Canvas raster is stubbed only to initialise the unchanged SPACE09 texture; this test does not establish GPU foliage appearance.'};
fs.mkdirSync(new URL('artifacts/scene-space-11/',root),{recursive:true});fs.writeFileSync(new URL('artifacts/scene-space-11/landscape-module-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,treeCount:report.treeCount,triangles:report.triangles,drawCalls:report.drawCalls,leafInstances:report.leafInstances,measuredVertices:vertices,failures:report.failures,minimumTreeBankDistance:report.minimumTreeBankDistance}));
previous.dispose();if(!report.passed)process.exitCode=1;
