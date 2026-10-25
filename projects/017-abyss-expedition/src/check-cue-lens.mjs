// SPDX-License-Identifier: GPL-3.0-only
// CPU/lifecycle checks; visual readability is checked separately in the browser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const threeURL=new URL('../web/vendor/three/build/three.module.min.js',import.meta.url),THREE=await import(threeURL.href);
const load=async relative=>{const text=await readFile(new URL(relative,import.meta.url),'utf8');return import('data:text/javascript;base64,'+Buffer.from(text.replace("from 'three'",'from '+JSON.stringify(threeURL.href))).toString('base64'));};
const {createCueLens,findCueLensViewport}=await load('../web/rendering/cue-lens.mjs'),{createSpongeColony}=await load('../web/rendering/benthic-life.mjs');
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const cases=[
  {width:681,height:773,obstacles:[{x:12,y:87,width:304,height:202},{x:365,y:374,width:304,height:387},{x:550,y:12,width:110,height:36}]},
  {width:390,height:746,obstacles:[{x:10,y:72,width:370,height:146},{x:10,y:390,width:370,height:346}]},
  {width:390,height:745.333,obstacles:[{x:10,y:72,width:370,height:186.927},{x:10,y:389.906,width:370,height:345.427},{x:10,y:12,width:370,height:37}]},
  {width:1029,height:820,obstacles:[{x:18,y:92,width:310,height:235},{x:700,y:425,width:316,height:382}]},
];
for(const c of cases){const v=findCueLensViewport(c);assert.ok(v&&v.width>=140&&v.height>=112);assert.ok(v.x>=0&&v.y>=0&&v.x+v.width<=c.width&&v.y+v.height<=c.height);for(const o of c.obstacles)assert.ok(!overlap(v,{x:o.x-8,y:o.y-8,width:o.width+16,height:o.height+16}));}
assert.equal(findCueLensViewport({width:390,height:480,obstacles:[{x:0,y:50,width:390,height:430}]}),null);
assert.equal(findCueLensViewport({width:NaN,height:480}),null);

class Element{
  constructor(tag='div'){this.tagName=tag;this.style={};this.dataset={};this.children=[];this.hidden=false;this.attributes={};}
  append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
  setAttribute(k,v){this.attributes[k]=v;}
  getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()];}
  getBoundingClientRect(){return this.rect||{x:0,y:0,width:681,height:773};}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
}
const stage=new Element(),container=new Element();stage.append(container);container.rect={x:0,y:98,width:681,height:773};
const nodes=new Map();for(const [id,rect]of [['#environment-guide',{x:12,y:185,width:304,height:202}],['#pilot-console',{x:365,y:472,width:304,height:387}]]){const e=new Element();e.rect=rect;nodes.set(id,e);}
const priorDocument=globalThis.document;globalThis.document={createElement:tag=>new Element(tag),querySelector:id=>nodes.get(id)||null};
let seed=10;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const original=createSpongeColony({random}),outer=new THREE.Group();outer.position.set(14,0,-20);original.position.set(150,0,180);original.scale.setScalar(.85);outer.add(original);outer.updateMatrixWorld(true);
const originalGeometry=[],originalMaterial=[];original.traverse(o=>{if(o.isMesh){originalGeometry.push(o.geometry);originalMaterial.push(o.material);}});
let originalDisposals=0;for(const item of [...originalGeometry,...originalMaterial])item.addEventListener('dispose',()=>originalDisposals++);
let lensSize={width:681,height:773};
const lens=createCueLens({container,getSize:()=>({...lensSize}),heightAt:()=>0,getEntityRoot:id=>id==='c-sponge'?original:null,getEntity:id=>id==='c-sponge'?{id,kind:'coral',appearance:'sponges'}:null});
const mainCamera=new THREE.PerspectiveCamera(54,681/773,.5,2500);mainCamera.position.set(135.9,-155.1,279.8);mainCamera.lookAt(149.5,-199.4,209);mainCamera.setViewOffset(681,773,129.39,0,681,773);mainCamera.updateMatrixWorld(true);
const beforeCamera=JSON.stringify({p:mainCamera.position.toArray(),q:mainCamera.quaternion.toArray(),projection:mainCamera.projectionMatrix.elements}),beforeEntity=original.matrixWorld.toArray();
const target={id:'c-sponge',entityId:'c-sponge',label:'杯状海绵',kind:'biology',position:new THREE.Vector3(164,22,160)},cue={id:'biology-cue',kind:'biology'};
const args={cue,targets:[target],viewerPosition:new THREE.Vector3(149.5,-205.3,209),elapsed:6,mainCamera,mainStatus:[{id:'c-sponge',visibility:'岩壁遮挡',labelVisible:true}]};
lens.update(args);assert.ok(lens.getStatus().visible);assert.equal(lens.getStatus().entityId,'c-sponge');assert.ok(lens.getStatus().distance>200);assert.ok(stage.children.some(e=>e.className==='environment-cue-lens'));
assert.equal(lens.getStatus().lookFor,'看杯／管状身体与顶部开口');assert.ok(lens.getStatus().highlight.includes('actual-top-opening'));assert.ok(lens.getStatus().openingCentre.every(Number.isFinite));
const highlights=[];lens.scene.traverse(o=>{if(o.userData.cueLensHighlight)highlights.push(o);});assert.equal(highlights.length,2,'Use short ground brackets and one actual opening ring, not a giant wireframe box');assert.equal(highlights.find(o=>o.isLineSegments).geometry.attributes.position.count,16);assert.ok(highlights.find(o=>!o.isLineSegments).geometry.attributes.position.count>=12);
const ownedHighlightDisposals=new Map(highlights.map(o=>[o.geometry,0]));for(const [g]of ownedHighlightDisposals)g.addEventListener('dispose',()=>ownedHighlightDisposals.set(g,ownedHighlightDisposals.get(g)+1));let highlightMaterialDisposals=0;const highlightMaterial=highlights[0].material;highlightMaterial.addEventListener('dispose',()=>highlightMaterialDisposals++);
const shared=[];lens.scene.traverse(o=>{if(o.isMesh&&originalGeometry.includes(o.geometry))shared.push(o);});assert.equal(shared.length,3,'Each real sponge instance mesh is shared with the preview');assert.ok(shared.every(o=>originalMaterial.includes(o.material)));assert.ok(shared.every(o=>o.instanceMatrix!==original.children.find(c=>c.geometry===o.geometry).instanceMatrix),'Instance transform buffers belong to the clone');
const bodyBounds=new THREE.Box3().setFromObject(original),bodyCentre=bodyBounds.getCenter(new THREE.Vector3());let largestProjection=0;
for(const x of [bodyBounds.min.x,bodyBounds.max.x])for(const y of [bodyBounds.min.y,bodyBounds.max.y])for(const z of [bodyBounds.min.z,bodyBounds.max.z]){const p=new THREE.Vector3(x,y,z).sub(bodyCentre).project(lens.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1,'Actual station bounds must fit inside the independent lens');largestProjection=Math.max(largestProjection,Math.abs(p.x),Math.abs(p.y));}
assert.ok(largestProjection>.65,'The entity close-up must use a readable part of the preview, not a distant whole-scene framing');
assert.equal(JSON.stringify({p:mainCamera.position.toArray(),q:mainCamera.quaternion.toArray(),projection:mainCamera.projectionMatrix.elements}),beforeCamera);assert.deepEqual(original.matrixWorld.toArray(),beforeEntity);
const pausedLensCamera=lens.camera.position.toArray();lens.update(args);assert.deepEqual(lens.camera.position.toArray(),pausedLensCamera,'Same narration time keeps the preview camera fixed');
const pausedHighlight=highlightMaterial.opacity;lens.update({...args,elapsed:7});assert.notEqual(highlightMaterial.opacity,pausedHighlight,'Part highlight follows narration elapsed time');lens.update(args);assert.equal(highlightMaterial.opacity,pausedHighlight,'Paused or backward-seek highlight is deterministic');assert.equal(originalDisposals,0);

// Real rendering updates world matrices and performs frustum culling. Exercise
// those operations instead of checking only the pre-centred source bounds.
const projectionFrustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4();let liveFrameChecks=0;
const setLensSize=(width,height)=>{
  lensSize={width,height};container.rect={x:0,y:98,width,height};
  nodes.get('#environment-guide').rect={x:12,y:185,width:Math.min(304,width-24),height:width<500?146:202};
  nodes.get('#pilot-console').rect=width<500?{x:10,y:488,width:width-20,height:336}:{x:width-356,y:472,width:344,height:Math.max(180,height-386)};
};
for(let frameIndex=0;frameIndex<240;frameIndex++){
  const width=frameIndex<80?390:frameIndex<160?1280:681,height=frameIndex<80?746:frameIndex<160?676:773;
  setLensSize(width,height);mainCamera.aspect=width/height;mainCamera.position.set(135.9+Math.sin(frameIndex*.08)*64,-155.1+Math.sin(frameIndex*.035)*22,279.8+Math.cos(frameIndex*.08)*38);mainCamera.lookAt(149.5,-199.4,209);mainCamera.setViewOffset(width,height,width>520?width*.19:0,width<=520?height*.18:0,width,height);mainCamera.updateMatrixWorld(true);
  const mainBeforeFrame=JSON.stringify({p:mainCamera.position.toArray(),q:mainCamera.quaternion.toArray(),projection:mainCamera.projectionMatrix.elements});
  lens.update({...args,elapsed:6+frameIndex/60});lens.scene.updateMatrixWorld(true);lens.camera.updateMatrixWorld(true);
  assert.ok(lens.getStatus().visible,`Frame ${frameIndex}: preview must remain visible during main-camera orbit/resize`);
  const liveBounds=new THREE.Box3(),liveMeshes=[];lens.scene.traverse(o=>{if(o.isMesh&&originalGeometry.includes(o.geometry)){liveBounds.expandByObject(o);liveMeshes.push(o);}});
  assert.equal(liveMeshes.length,3);assert.ok(!liveBounds.isEmpty()&&[...liveBounds.min.toArray(),...liveBounds.max.toArray()].every(Number.isFinite));
  viewProjection.multiplyMatrices(lens.camera.projectionMatrix,lens.camera.matrixWorldInverse);projectionFrustum.setFromProjectionMatrix(viewProjection);
  for(const mesh of liveMeshes)assert.ok(projectionFrustum.intersectsObject(mesh),`Frame ${frameIndex}: real clone is outside the lens render frustum`);
  for(const x of [liveBounds.min.x,liveBounds.max.x])for(const y of [liveBounds.min.y,liveBounds.max.y])for(const z of [liveBounds.min.z,liveBounds.max.z]){const p=new THREE.Vector3(x,y,z).project(lens.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1,`Frame ${frameIndex}: updated clone world bounds must remain in view`);}
  assert.equal(JSON.stringify({p:mainCamera.position.toArray(),q:mainCamera.quaternion.toArray(),projection:mainCamera.projectionMatrix.elements}),mainBeforeFrame);assert.equal(originalDisposals,0);liveFrameChecks++;
}
setLensSize(681,773);lens.update(args);lens.scene.updateMatrixWorld(true);

function fakeRenderer(){
  const result={autoClear:true,info:{autoReset:true},viewport:new THREE.Vector4(0,0,681,773),scissor:new THREE.Vector4(4,5,600,700),scissorTest:false,color:new THREE.Color(0x102030),alpha:.65,renders:0,
    getViewport:v=>v.copy(result.viewport),getScissor:v=>v.copy(result.scissor),getScissorTest:()=>result.scissorTest,getClearColor:c=>c.copy(result.color),getClearAlpha:()=>result.alpha,
    setViewport(...v){result.viewport=v[0]?.isVector4?v[0].clone():new THREE.Vector4(...v);},setScissor(...v){result.scissor=v[0]?.isVector4?v[0].clone():new THREE.Vector4(...v);},setScissorTest:v=>result.scissorTest=v,setClearColor(c,a){result.color.set(c);result.alpha=a;},clear(){assert.ok(result.scissorTest);},render(){result.renders++;if(result.fail)throw new Error('test render failure');}};return result;
}
const renderer=fakeRenderer(),saved=()=>JSON.stringify({viewport:renderer.viewport.toArray(),scissor:renderer.scissor.toArray(),test:renderer.scissorTest,color:renderer.color.getHex(),alpha:renderer.alpha,auto:renderer.autoClear,info:renderer.info.autoReset}),beforeRenderer=saved();
assert.equal(lens.render(renderer),true);assert.equal(saved(),beforeRenderer);assert.ok(lens.getStatus().drawn);assert.equal(renderer.renders,1);
renderer.fail=true;assert.throws(()=>lens.render(renderer),/test render failure/);assert.equal(saved(),beforeRenderer,'Renderer state restores even if the preview throws');
for(let i=0;i<5;i++)lens.update({...args,mainStatus:[{id:'c-sponge',visibility:'画面中',labelVisible:true}]});assert.equal(lens.getStatus().visible,false);
for(const kind of ['overview','current','snow','wall']){for(let i=0;i<5;i++)lens.update({...args,cue:{...cue,kind}});assert.equal(lens.getStatus().visible,false,`${kind} must not open an unrelated physical-object lens`);}
lens.update({...args,cue:{...cue,kind:'sampling'}});assert.equal(lens.getStatus().visible,false,'A sampling cue must not substitute a biology object');
lens.update(args);assert.equal(lens.getStatus().visible,true);lens.clear();assert.equal(lens.getStatus().visible,false);assert.equal(originalDisposals,0);for(const count of ownedHighlightDisposals.values())assert.equal(count,1,'Every independently owned highlight geometry must dispose once');assert.equal(highlightMaterialDisposals,0,'Clear retains the reusable highlight material');lens.destroy();assert.equal(highlightMaterialDisposals,1);assert.equal(originalDisposals,0);assert.ok(!stage.children.some(e=>e.className==='environment-cue-lens'));
globalThis.document=priorDocument;
for(const item of new Set([...originalGeometry,...originalMaterial]))item.dispose();
console.log(JSON.stringify({passed:true,layoutCases:cases.length,realStationMeshes:3,liveWorldMatrixFrames:liveFrameChecks,realFrustumAfterResizeAndMainCameraDrag:true,entityBoundsFitPreview:true,actualOpeningRing:true,partHighlightResourcesDisposed:true,sharedSourceAssetsPreserved:true,mainCameraUnchanged:true,instanceBuffersOwned:true,pausedViewStable:true,rendererStateRestored:true,clearAndDestroy:true}));
