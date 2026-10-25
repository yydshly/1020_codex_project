// CPU integration audit of the real GLB and full production environment chain.
// GPU captures and image decoding are explicit stubs; no browser is started.
import {readFile,writeFile,access} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
import {createAuditCanvas} from './check_space_09_canvas.mjs';
const root=new URL('../',import.meta.url),web=new URL('web/',root);
const output=new URL(process.argv[2]??'artifacts/scene-space-09/runtime-validation.json',root);
try{await access(output);throw new Error('Refusing to overwrite existing audit report.');}catch(error){if(error.code!=='ENOENT')throw error;}
const hash=data=>createHash('sha256').update(data).digest('hex');
const hashFile=async path=>hash(await readFile(new URL(path,root)));
const readJSON=async path=>JSON.parse((await readFile(new URL(path,root),'utf8')).replace(/^\uFEFF/,''));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checks={},evidence={},started=performance.now();
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL=new URL('vendor/three/examples/jsm/',web).href;
const env09URL=new URL('scene-space-09-environment.js',web).href;
const wrappers={};
for(const [file,fn,hook] of [
 ['scene-space-06-environment.js','setupEnvironment','Previous'],
 ['scene-space-09-surfaces.js','applySurfaces','Surfaces'],
 ['scene-space-09-landscape.js','applyLandscape','Landscape'],
 ['scene-space-08-windows.js','applyWindowLights','Windows'],
 ['scene-space-09-lamps.js','applyStreetLights','Lamps'],
 ['scene-space-09-weather.js','applyWeather','Weather'],
]){
 const url=new URL(file,web).href;
 const body=fn==='setupEnvironment'
  ?`export async function ${fn}(...args){const h=await actual(...args);globalThis.__space09Previous(...args);return{...h,dispose(){globalThis.__space09BeforePreviousDispose();h.dispose();}};}`
  :`export function ${fn}(...args){const result=actual(...args);const done=h=>{globalThis.__space09${hook}(h,...args);return h;};return result?.then?result.then(done):done(result);}`;
 wrappers['./'+file]='data:text/javascript,'+encodeURIComponent(`import {${fn} as actual} from ${JSON.stringify(url)};${body}`);
}
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};const w=${JSON.stringify(wrappers)};if(c.parentURL===${JSON.stringify(env09URL)}&&w[s])return{url:w[s],shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL);
const {GLTFLoader}=await import(new URL('loaders/GLTFLoader.js',addonsURL));
const {HDRLoader}=await import(new URL('loaders/HDRLoader.js',addonsURL));
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,values){this.type=type;Object.assign(this,values);}};
const loadedTextures=new Map();
const stubs={imageDecodes:0,hdrDecodes:0,cubeCaptures:0,pmremEquirectangular:0,pmremCubemap:0,gpuCompile:0};
globalThis.fetch=async input=>{
  const url=new URL(input instanceof URL?input.href:typeof input==='string'?input:input.url,web);
  if(url.protocol!=='file:')throw new Error('Unexpected non-local resource: '+url.href);
  return new Response(await readFile(url));
};
async function textureStub(url,hdr=false){
  const resolved=new URL(url,web),bytes=await readFile(resolved);
  if(!bytes.length)throw new Error('Empty texture asset: '+resolved.href);
  loadedTextures.set(resolved.href,{bytes:bytes.length,sha256:hash(bytes)});
  const texture=new THREE.DataTexture(hdr?new Float32Array([.5,.5,.5,1]):new Uint8Array([128,128,255,255]),1,1,THREE.RGBAFormat,hdr?THREE.FloatType:THREE.UnsignedByteType);
  texture.name=resolved.pathname.split('/').pop();texture.userData.auditSource=resolved.href;texture.needsUpdate=true;
  stubs[hdr?'hdrDecodes':'imageDecodes']++;return texture;
}
THREE.TextureLoader.prototype.loadAsync=function(url){return textureStub(url);};
HDRLoader.prototype.loadAsync=function(url){return textureStub(url,true);};
THREE.CubeCamera.prototype.update=function(){stubs.cubeCaptures++;};
for(const [method,counter]of[['fromEquirectangular','pmremEquirectangular'],['fromCubemap','pmremCubemap']]){
  THREE.PMREMGenerator.prototype[method]=function(){stubs[counter]++;const texture=new THREE.Texture();texture.name='CPU stub '+method;texture.userData.auditSource=method;return{texture,dispose(){texture.dispose();}};};
}
const renderer={capabilities:{getMaxAnisotropy:()=>8},shadowMap:{},toneMappingExposure:1,outputColorSpace:THREE.SRGBColorSpace,compile(){stubs.gpuCompile++;}};
const bytesHash=array=>array?hash(Buffer.from(array.buffer,array.byteOffset,array.byteLength)):null;
function geometryState(geometry){return{attributes:Object.fromEntries(Object.entries(geometry.attributes).sort().map(([name,a])=>[name,{count:a.count,itemSize:a.itemSize,type:a.array.constructor.name,hash:bytesHash(a.array)}])),index:geometry.index?{count:geometry.index.count,type:geometry.index.array.constructor.name,hash:bytesHash(geometry.index.array)}:null,groups:geometry.groups,drawRange:{start:geometry.drawRange.start,count:Number.isFinite(geometry.drawRange.count)?geometry.drawRange.count:'Infinity'}};}
function shaderState(material){
  if(material.isShaderMaterial)return{vertex:hash(material.vertexShader),fragment:hash(material.fragmentShader),key:material.customProgramCacheKey()};
  const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader,renderer);
  return{vertex:hash(shader.vertexShader),fragment:hash(shader.fragmentShader),key:material.customProgramCacheKey(),uniforms:Object.fromEntries(Object.entries(shader.uniforms).map(([name,{value}])=>[name,Array.isArray(value)?value.map(v=>v.toArray?.()??v):value?.toArray?.()??value]))};
}
function textureState(texture){if(!texture)return null;return{name:texture.name,source:texture.userData.auditSource??null,repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),wrap:[texture.wrapS,texture.wrapT],colorSpace:texture.colorSpace,mapping:texture.mapping,anisotropy:texture.anisotropy,data:texture.image?.data?bytesHash(texture.image.data):null};}
function materialState(material){
  const fields=['type','name','roughness','metalness','opacity','transparent','depthWrite','side','vertexColors','envMapIntensity','emissiveIntensity','clearcoat','clearcoatRoughness','transmission','ior','forceSinglePass','aoMapIntensity','dithering'];
  return{...Object.fromEntries(fields.filter(k=>material[k]!==undefined).map(k=>[k,material[k]])),color:material.color?.toArray(),emissive:material.emissive?.toArray(),normalScale:material.normalScale?.toArray(),maps:Object.fromEntries(['map','normalMap','roughnessMap','aoMap','envMap'].map(k=>[k,textureState(material[k])])),shader:shaderState(material)};
}
function capture(scene){
  scene.updateMatrixWorld(true);const meshes=[];
  scene.traverse(part=>{if(!part.isMesh)return;const materials=Array.isArray(part.material)?part.material:[part.material];meshes.push({part,name:part.name,geometry:part.geometry,position:part.geometry.attributes.position,index:part.geometry.index,uv:part.geometry.attributes.uv,geometryState:geometryState(part.geometry),transform:[...part.matrixWorld.elements],materials,materialStates:materials.map(materialState)});});
  return meshes;
}
function geometryChanges(previous){return previous.filter(row=>row.part.geometry!==row.geometry||row.part.geometry.attributes.position!==row.position||row.part.geometry.index!==row.index||row.part.geometry.attributes.uv!==row.uv||!equal(geometryState(row.part.geometry),row.geometryState)||!equal(row.part.matrixWorld.elements,row.transform)).map(row=>row.name);}
function materialChanges(previous){return previous.flatMap(row=>{const materials=Array.isArray(row.part.material)?row.part.material:[row.part.material];return materials.map((material,i)=>({mesh:row.name,previous:row.materials[i]?.name,current:material.name,referenceChanged:material!==row.materials[i],stateChanged:!equal(materialState(material),row.materialStates[i])})).filter(v=>v.referenceChanged||v.stateChanged);});}
function lights(scene){const result=[];scene.traverse(light=>{if(light.isLight)result.push({object:light,type:light.type,name:light.name,intensity:light.intensity,color:light.color.toArray(),ground:light.groundColor?.toArray(),position:light.position.toArray(),target:light.target?.position.toArray(),castShadow:light.castShadow,mapSize:light.shadow?.mapSize.toArray(),shadow:light.shadow?{bias:light.shadow.bias,normalBias:light.shadow.normalBias,radius:light.shadow.radius,camera:Object.fromEntries(['left','right','top','bottom','near','far'].filter(k=>light.shadow.camera[k]!==undefined).map(k=>[k,light.shadow.camera[k]]))}:null});});return result;}
const plainLights=rows=>rows.map(({object,...row})=>row);
function worldState(scene){return{environment:scene.environment,background:scene.background,environmentIntensity:scene.environmentIntensity,backgroundIntensity:scene.backgroundIntensity,backgroundBlurriness:scene.backgroundBlurriness,fog:scene.fog?{density:scene.fog.density,color:scene.fog.color.toArray()}:null,exposure:renderer.toneMappingExposure};}
function navSamples(navigation){const rows=[];for(const[name,points]of Object.entries(navigation.routes)){for(let j=0;j<points.length-1;j++){const a=points[j],b=points[j+1],count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.28);for(let i=0;i<count;i++){const x=a.x+(b.x-a.x)*i/count,z=a.z+(b.z-a.z)*i/count;rows.push({route:name,x,z,walkable:navigation.isWalkable(x,z),height:navigation.sampleHeight(x,z)});}}const p=points.at(-1);rows.push({route:name,x:p.x,z:p.z,walkable:navigation.isWalkable(p.x,p.z),height:navigation.sampleHeight(p.x,p.z)});}return rows;}
async function preservation(record){const failures=[];for(const[path,expected]of Object.entries(record)){try{if((await hashFile(path)).toLowerCase()!==expected.toLowerCase())failures.push(path);}catch{failures.push(path);}}return failures;}
function ownMeshesSince(scene,rows){const known=new Set(rows.map(r=>r.part)),out=[];scene.traverse(p=>{if(p.isMesh&&!known.has(p))out.push(p);});return out;}
function triangles(rows){return rows.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3*(p.isInstancedMesh?p.count:1),0);}
function materialOf(hit){return Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;}
function warmToken(name){return name.split(' / ').some(s=>s==='SPACE08_WindowWarm'||s==='SPACE03_WindowWarm');}
function sourceShaderPreserved(before,after){
 const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
 before.onBeforeCompile(shader,renderer);
 const newer={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
 after.onBeforeCompile(newer,renderer);
 return {oldKey:before.customProgramCacheKey(),newKey:after.customProgramCacheKey(),oldUniforms:Object.keys(shader.uniforms),newUniforms:Object.keys(newer.uniforms),uniformsRetained:Object.keys(shader.uniforms).every(k=>k in newer.uniforms),vertexSourceRetained:shader.vertexShader===newer.vertexShader||shader.vertexShader.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#include')).every(l=>newer.vertexShader.includes(l)),fragmentSourceRetained:shader.fragmentShader.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#include')).every(l=>newer.fragmentShader.includes(l))};
}

function actualTriangles(meshes){
 const out=[],instance=new THREE.Matrix4(),world=new THREE.Matrix4();
 for(const mesh of meshes){
  const positions=mesh.geometry.attributes.position,indices=mesh.geometry.index;
  for(let k=0;k<(mesh.isInstancedMesh?mesh.count:1);k++){
   if(mesh.isInstancedMesh){mesh.getMatrixAt(k,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
   for(let i=0;i<(indices?.count??positions.count);i+=3){
    const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,indices?indices.getX(i+j):i+j).applyMatrix4(world).toArray());
    out.push({mesh:mesh.name,instance:mesh.isInstancedMesh?k:null,vertices,
      min:vertices[0].map((_,axis)=>Math.min(...vertices.map(v=>v[axis]))),max:vertices[0].map((_,axis)=>Math.max(...vertices.map(v=>v[axis])))});
   }
  }
 }
 return out;
}
function clipHeight(vertices,bound,keepAbove){
 const out=[];for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],inside=p=>keepAbove?p[1]>=bound:p[1]<=bound;
  const ai=inside(a),bi=inside(b);if(ai)out.push(a);
  if(ai!==bi){const t=(bound-a[1])/(b[1]-a[1]);out.push(a.map((n,j)=>n+(b[j]-n)*t));}
 }return out;
}
function horizontalDistance(p,polygon){
 let distance=Infinity,inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j],dx=b[0]-a[0],dz=b[2]-a[2],length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[2])*dz)/length)):0;
  distance=Math.min(distance,Math.hypot(p.x-a[0]-dx*t,p.z-a[2]-dz*t));
  if((a[2]>p.z)!==(b[2]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[2])/(b[2]-a[2])+a[0])inside=!inside;
 }return inside?0:distance;
}
function treeClearance(meshes,navigation){
 const triangles=actualTriangles(meshes),cells=new Map(),cellSize=2,points=new Map(),failures=[];
 for(let i=0;i<triangles.length;i++){
  const t=triangles[i];for(let x=Math.floor(t.min[0]/cellSize);x<=Math.floor(t.max[0]/cellSize);x++)for(let z=Math.floor(t.min[2]/cellSize);z<=Math.floor(t.max[2]/cellSize);z++){
   const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
  }
 }
 const bounds=navigation.mapBounds;
 for(let x=Math.ceil(bounds.minX*4)/4;x<=bounds.maxX;x+=.25)for(let z=Math.ceil(bounds.minZ*4)/4;z<=bounds.maxZ;z+=.25)
  if(navigation.isWalkable(x,z))points.set(`${x},${z}`,{x,z,height:navigation.sampleHeight(x,z),source:'grid'});
 for(const p of navSamples(navigation))points.set(`${p.x},${p.z}`,{...p,source:p.route});
 let tested=0,candidates=0;const radius=navigation.radius;
 for(const p of points.values()){
  const selected=new Set();for(let x=Math.floor((p.x-radius)/cellSize);x<=Math.floor((p.x+radius)/cellSize);x++)for(let z=Math.floor((p.z-radius)/cellSize);z<=Math.floor((p.z+radius)/cellSize);z++)for(const i of cells.get(`${x},${z}`)??[])selected.add(i);
  if(!selected.size)continue;tested++;
  for(const i of selected){const t=triangles[i];if(t.max[1]<p.height+.03||t.min[1]>p.height+2.0||t.min[0]>p.x+radius||t.max[0]<p.x-radius||t.min[2]>p.z+radius||t.max[2]<p.z-radius)continue;
   candidates++;const polygon=clipHeight(clipHeight(t.vertices,p.height+.03,true),p.height+2.0,false);if(!polygon.length)continue;
   const distance=horizontalDistance(p,polygon);if(distance<radius-1e-5){failures.push({point:p,mesh:t.mesh,instance:t.instance,triangle:i,nearestDistance:distance});break;}
  }
 }
 return {passed:failures.length===0,triangles:triangles.length,gridAndRoutePoints:points.size,nearTreePoints:tested,nearBodyTriangles:candidates,failures:failures.slice(0,100),failureCount:failures.length,
  method:'Actual world-space triangles, including every instance, are clipped to a 2m-high vertical body cylinder and tested against a 0.25m navigation grid plus route samples; leaf alpha is treated conservatively as solid.'};
}
function treeGeometryRecords(meshes,metadata,sourceTrees){
 const branches=meshes.find(p=>p.name==='SPACE09_BranchHierarchy'),leaves=meshes.find(p=>p.isInstancedMesh),records=[];
 if(!branches||!leaves)return{passed:false,reason:'Missing actual branch/leaf batches'};
 const position=branches.geometry.attributes.position,leafPosition=leaves.geometry.attributes.position;
 const instance=new THREE.Matrix4(),world=new THREE.Matrix4();let vertexEnd=0,instanceEnd=0;
 for(const tree of metadata.trees??[]){
  const source=sourceTrees.find(s=>s.id===tree.id),range=tree.branchVertexRange,leafRange=tree.leafInstances;
  if(!source||!range||!leafRange){records.push({id:tree.id,passed:false,reason:'No original tree or geometry ranges'});continue;}
  const branchBounds=new THREE.Box3(),leafBounds=new THREE.Box3(),points=[];
  for(let i=range.start;i<range.start+range.count;i++){const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(branches.matrixWorld);branchBounds.expandByPoint(p);points.push(p.toArray());}
  for(let i=leafRange.start;i<leafRange.start+leafRange.count;i++){
   leaves.getMatrixAt(i,instance);world.multiplyMatrices(leaves.matrixWorld,instance);
   for(let j=0;j<leafPosition.count;j++)leafBounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(leafPosition,j).applyMatrix4(world));
  }
  const atFoot=[],plane=source.base_z+.15;
  for(let i=0;i<points.length;i+=3)for(let edge=0;edge<3;edge++){
   const a=points[i+edge],b=points[i+(edge+1)%3];if((a[1]<=plane&&b[1]>=plane)||(b[1]<=plane&&a[1]>=plane)){
    if(Math.abs(a[1]-b[1])<1e-10)continue;const t=(plane-a[1])/(b[1]-a[1]);atFoot.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);
   }
  }
  const radius=Math.max(0,...atFoot.map(p=>Math.hypot(p[0]-source.x,p[1]+source.blender_y)));
  const boundsEqual=(box,record)=>record&&box.min.toArray().every((v,i)=>Math.abs(v-record.min[i])<1e-4)&&box.max.toArray().every((v,i)=>Math.abs(v-record.max[i])<1e-4);
  const sameSource=equal(tree.sourcePositionBlender,[source.x,source.blender_y,source.base_z])&&equal(tree.baseWorld,[source.x,source.base_z,-source.blender_y]);
  const rangesGood=range.start===vertexEnd&&leafRange.start===instanceEnd;vertexEnd=range.start+range.count;instanceEnd=leafRange.start+leafRange.count;
  records.push({id:tree.id,sourcePositionPreserved:sameSource,rangesContiguous:rangesGood,footIntersectionCount:atFoot.length,actualFootRadius:radius,originalColliderRadius:source.collider_radius,
   actualBranchBounds:{min:branchBounds.min.toArray(),max:branchBounds.max.toArray()},actualLeafBounds:{min:leafBounds.min.toArray(),max:leafBounds.max.toArray()},
   passed:sameSource&&rangesGood&&atFoot.length>3&&radius<=source.collider_radius+1e-4&&boundsEqual(branchBounds,tree.branchBounds)&&boundsEqual(leafBounds,tree.leafBounds)});
 }
 return{passed:records.length===23&&records.every(r=>r.passed)&&vertexEnd===position.count&&instanceEnd===leaves.count,records,branchVertices:vertexEnd,leafInstances:instanceEnd};
}

const rasterizedCanvases=[];
function auditCanvas(width=1,height=1){const canvas=createAuditCanvas(width,height);rasterizedCanvases.push(canvas);return canvas;}
globalThis.document={createElement(tag){if(tag!=='canvas')throw new Error('Unexpected DOM request '+tag);return auditCanvas();}};
globalThis.OffscreenCanvas=class{constructor(width,height){return auditCanvas(width,height);}};

const materialList=part=>Array.isArray(part.material)?part.material:[part.material];
function texturesIn(rows,scene){
 const out=new Set([scene.environment,scene.background].filter(t=>t?.isTexture));
 for(const row of rows)for(const material of row.materials){
  for(const value of Object.values(material))if(value?.isTexture)out.add(value);
  for(const uniform of Object.values(material.uniforms??{}))if(uniform?.value?.isTexture)out.add(uniform.value);
 }return out;
}
function phaseChanges(previous,current){
 return current.flatMap(row=>{const old=previous.find(p=>p.part===row.part);return old?row.materials.map((material,i)=>({mesh:row.name,source:old.materials[i],replacement:material})).filter(r=>r.source!==r.replacement):[];});
}
function phaseShaderChecks(previous,current){return phaseChanges(previous,current).filter(r=>!r.source.isShaderMaterial).map(r=>({mesh:r.mesh,source:r.source.name,replacement:r.replacement.name,...sourceShaderPreserved(r.source,r.replacement)}));}
function shaderChecksPass(rows){return rows.every(r=>r.newKey.startsWith(r.oldKey)&&r.uniformsRetained&&r.vertexSourceRetained&&r.fragmentSourceRetained);}
const oldTreeTokens=new Set(['SPACE06_Bark','SPACE06_Leaf','SPACE06_LeafLight','SPACE06_LeafShade']);
const isOldTree=row=>row.materials.length===1&&row.materials[0].name.split(' / ').some(n=>oldTreeTokens.has(n));
const oldGrassNames=new Set(['ROAM01_Surface__SPACE06_Grass','ROAM01_Surface__SPACE06_GrassShade','ROAM01_Surface__SPACE06_GrassDry']);
function grassTerrainSupport(grassRows,sourceRows,navigation){
 const terrain=sourceRows.filter(r=>['ROAM01_Surface__soil','ROAM01_Surface__EXT_B02_DampMineralGround'].includes(r.name)).map(r=>r.part);
 const points=new Map(),failures=[],differences=[],largerOldOverlayOffsets=[],walkableSamples=[];
 for(const triangle of actualTriangles(grassRows.map(r=>r.part))){
  const center=triangle.vertices[0].map((_,i)=>triangle.vertices.reduce((sum,p)=>sum+p[i],0)/3);
  for(const p of [...triangle.vertices,center])points.set(p.map(n=>n.toFixed(6)).join(','),p);
 }
 for(const p of points.values()){
  const ray=new THREE.Raycaster(new THREE.Vector3(p[0],p[1]+.05,p[2]),new THREE.Vector3(0,-1,0),0,.25);
  const hit=ray.intersectObjects(terrain,false)[0],difference=hit?p[1]-hit.point.y:null;
  if(!hit)failures.push({point:p,difference,hit:null});else differences.push(difference);
  const walkable=navigation.isWalkable(p[0],p[2]);
  if(hit&&Math.abs(difference)>.035)largerOldOverlayOffsets.push({point:p,difference,terrain:hit.object.name,walkable});
  if(walkable){
   const height=navigation.sampleHeight(p[0],p[2]);
   const visible=sourceRows.filter(r=>r.part.visible).map(r=>r.part),floorRay=new THREE.Raycaster(new THREE.Vector3(p[0],height+.25,p[2]),new THREE.Vector3(0,-1,0),0,.50),floor=floorRay.intersectObjects(visible,false)[0];
   const good=!!floor&&Math.abs(floor.point.y-height)<=.025;walkableSamples.push({point:p,navigationHeight:height,visibleFloor:floor?.object.name??null,height:floor?.point.y??null,passed:good});
   if(!good)failures.push({point:p,reason:'Visible walking floor changed after removing grass overlay'});
  }
 }
 return{passed:terrain.length===2&&points.size>0&&failures.length===0,terrainMeshes:terrain.map(p=>p.name),samples:points.size,minimumHeightDifference:Math.min(...differences),maximumHeightDifference:Math.max(...differences),failures,
  largerOldOverlayOffsets,walkableSamples,
  method:'All retired grass triangle vertices and centroids must hit unchanged visible soil/terrain. Old overlays with more than 3.5cm interpolation offset are explicitly recorded, not interpreted as missing ground; any walkable sample separately requires its visible floor to match the unchanged navigation height.'};
}
function leafMipAudit(meshes){
 const leaves=meshes.find(p=>p.isInstancedMesh),texture=leaves?.material.map,cutoff=leaves?.material.alphaTest;
 if(!texture?.isDataTexture)return{passed:false,reason:'No actual explicit DataTexture'};
 const levels=texture.mipmaps.map((level,i)=>{
  let above=0,sum=0,nonzero=0;for(let n=3;n<level.data.length;n+=4){above+=level.data[n]/255>=cutoff?1:0;sum+=level.data[n]/255;nonzero+=level.data[n]>0?1:0;}
  const count=level.width*level.height;return{level:i,width:level.width,height:level.height,coverage:above/count,meanAlpha:sum/count,nonzero:nonzero/count,bytes:level.data.length,sha256:bytesHash(level.data)};
 });
 const base=levels[0],declared=texture.userData.alphaStatistics;
 const report={levels,baseline:declared?.baselineAtOldCutoff,cutoff,alphaToCoverage:leaves.material.alphaToCoverage,generateMipmaps:texture.generateMipmaps,
  backend:rasterizedCanvases.map(c=>c.auditStats),explicitDataImageHash:bytesHash(texture.image.data),method:'Production path commands are actually rasterized via the installed Windows antialiasing backend; coverage is independently counted from the final uploaded RGBA mip byte arrays. Browser/GPU sampling still requires visual review.'};
 report.passed=levels.length===9&&base.width===256&&base.height===256&&base.coverage>=.20&&base.coverage<.70&&declared.baselineAtOldCutoff.coverage>.04&&base.coverage>declared.baselineAtOldCutoff.coverage*1.4&&
  levels.every((v,i)=>v.width===Math.max(1,256>>i)&&v.height===v.width&&v.bytes===v.width*v.height*4&&v.meanAlpha>0&&v.coverage>0&&Math.abs(v.coverage-declared.mipLevels[i].coverage)<1e-10)&&
  levels.filter(v=>v.width>=4).every(v=>Math.abs(v.coverage-base.coverage)<=Math.max(.035,1.5/(v.width*v.height)))&&
  levels.at(-1).coverage===1&&!texture.generateMipmaps&&!leaves.material.alphaToCoverage&&texture.minFilter===THREE.LinearMipmapLinearFilter&&report.explicitDataImageHash===base.sha256&&
  rasterizedCanvases.some(c=>c.auditStats.rasterizations>=2);
 return report;
}
let environment,lighting;
try{
 const protectedFiles=await readJSON('artifacts/scene-space-09/preserved-files.json'),previousProtected=await readJSON('artifacts/scene-space-08/preserved-files.json');
 const filesBefore=await preservation(protectedFiles);
 checks.previous163FilesIncludedUnchanged=Object.keys(previousProtected).length===163&&Object.entries(previousProtected).every(([p,h])=>protectedFiles[p]?.toLowerCase()===h.toLowerCase());
 const manifest=await readJSON('web/models/space-08-manifest.json'),appearance=await readJSON('web/models/space-03-manifest.json');
 const previousAudit=await readJSON('artifacts/scene-space-08/runtime-validation-final-r2.json');
 const bytes=await readFile(new URL('models/space-08.glb',web));
 checks.sameOriginal08GLBMatchesManifestAndPassed08Audit=hash(bytes)===manifest.sha256&&previousAudit.passed&&previousAudit.evidence.source.sha256===hash(bytes);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const scene=new THREE.Scene();scene.add(gltf.scene);
 const {createNavigation}=await import(new URL('scene-space-08-navigation.js',web));
 const navigation=createNavigation(),navBefore=navSamples(navigation),phases={},handles={};
 let inherited,originalLights,originalWorld,oldTreeRows,originalTextures,reflectorsBeforeWeather=[];
 const originalMaterials=new Map(),originalVisibility=new Map(),originalShadowState=new Map(),disposeEvents={oldGeometry:0,oldMaterials:0,oldTextures:0,newGeometry:0,newMaterials:0,newTextures:0};
 globalThis.__space09Previous=()=>{
  inherited=capture(scene);originalLights=lights(scene);originalWorld=worldState(scene);phases.Previous=inherited;
  oldTreeRows=inherited.filter(isOldTree);originalTextures=texturesIn(inherited,scene);
  for(const row of inherited){
   originalVisibility.set(row.part,row.part.visible);row.geometry.addEventListener('dispose',()=>disposeEvents.oldGeometry++);
   originalShadowState.set(row.part,{cast:row.part.castShadow,receive:row.part.receiveShadow,depth:row.part.customDepthMaterial,distance:row.part.customDistanceMaterial});
   for(const material of row.materials)if(!originalMaterials.has(material)){originalMaterials.set(material,materialState(material));material.addEventListener('dispose',()=>disposeEvents.oldMaterials++);}
  }
  for(const texture of originalTextures)texture.addEventListener('dispose',()=>disposeEvents.oldTextures++);
 };
 for(const phase of ['Surfaces','Landscape','Windows','Lamps','Weather'])globalThis['__space09'+phase]=handle=>{
  handles[phase]=handle;phases[phase]=capture(scene);
  if(phase==='Lamps')reflectorsBeforeWeather=phases[phase].filter(r=>r.part.isReflector).map(r=>({part:r.part,material:r.part.material,target:r.part.getRenderTarget(),texture:r.part.getRenderTarget().texture,onBeforeRender:r.part.onBeforeRender}));
 };
 let previousDisposeCalls=0;
 globalThis.__space09BeforePreviousDispose=()=>{
  previousDisposeCalls++;
  evidence.inheritedOwnershipBeforeOwnerDispose={oldGeometry:disposeEvents.oldGeometry,oldMaterials:disposeEvents.oldMaterials,oldTextures:disposeEvents.oldTextures};
  checks.disposeRestoresAllInheritedMaterialReferences=inherited.every(row=>materialList(row.part).every((m,i)=>m===row.materials[i]));
  checks.disposeRestoresOldTreesAndAllOtherVisibility=inherited.every(row=>row.part.visible===originalVisibility.get(row.part));
  checks.disposePreservesAllInheritedShadowFlagsAndCasterMaterials=inherited.every(({part})=>{const s=originalShadowState.get(part);return part.castShadow===s.cast&&part.receiveShadow===s.receive&&part.customDepthMaterial===s.depth&&part.customDistanceMaterial===s.distance;});
  checks.disposeRemovesAllOwnedGeometryAndLights=ownMeshesSince(scene,inherited).length===0&&equal(plainLights(lights(scene)),plainLights(originalLights));
  checks.disposeDoesNotReleaseInheritedGeometryMaterialsTextures=disposeEvents.oldGeometry===0&&disposeEvents.oldMaterials===0&&disposeEvents.oldTextures===0&&geometryChanges(inherited).length===0;
 };
 const module=await import(env09URL),facade=appearance.refinements.facades;
 environment=await module.setupEnvironment(renderer,scene,gltf.scene,{mobile:true,materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials,neighbourhood:manifest.neighbourhood});
 if(!inherited||Object.keys(handles).length!==5)throw new Error('Complete production 06→surfaces→landscape→windows→lamps→weather hooks did not execute');
 scene.updateMatrixWorld(true);const after=capture(scene),newMeshes=ownMeshesSince(scene,inherited);
 const geometryDiff=geometryChanges(inherited),oldMaterialChanges=[...originalMaterials].filter(([m,state])=>!equal(materialState(m),state)).map(([m])=>m.name);
 checks.productionChainRunsExactlyOneInheritedCapture=stubs.hdrDecodes===1&&stubs.cubeCaptures===1&&stubs.pmremEquirectangular===1&&stubs.pmremCubemap===1;
 checks.originalGeometryUVIndicesTransformsUnchanged=geometryDiff.length===0;
 checks.inheritedMaterialObjectsRemainUnmodified=oldMaterialChanges.length===0;
 checks.allInheritedCastReceiveAndCasterMaterialSettingsStayUnchanged=inherited.every(({part})=>{const s=originalShadowState.get(part);return part.castShadow===s.cast&&part.receiveShadow===s.receive&&part.customDepthMaterial===s.depth&&part.customDistanceMaterial===s.distance;});
 const oldGrassRows=inherited.filter(r=>oldGrassNames.has(r.name));
 checks.onlyFourTreeAndThreeGrassBatchesHidden=oldTreeRows.length===4&&oldGrassRows.length===3&&inherited.every(row=>row.part.visible===(oldTreeRows.includes(row)||oldGrassRows.includes(row)?false:originalVisibility.get(row.part)));
 evidence.retiredGrassSupport=grassTerrainSupport(oldGrassRows,inherited,navigation);checks.retiredGrassHasContinuousOriginalTerrainUnderEverySample=evidence.retiredGrassSupport.passed;
 const surfaceChanges=phaseChanges(phases.Previous,phases.Surfaces);
 const expectedSurfaces=['SPACE08_Roof','SPACE08_RoofAlt','SPACE08_Plaster','SPACE08_PlasterAlt','SPACE08_WarmGreyPlaster','SPACE08_SoftOchrePlaster','roof','roof_alt','plaster','plaster_alt'].map(token=>'ROAM01_Surface__'+token);
 const changedSurfaceNames=[...new Set(surfaceChanges.map(r=>r.mesh))].sort();
 checks.surfaceTreatmentActuallyReachesAllTenRequiredBatchesOnly=equal(changedSurfaceNames,[...expectedSurfaces].sort())&&handles.Surfaces.metadata.changedMeshes===10&&handles.Surfaces.metadata.changedMaterials>0;
 checks.surfaceTreatmentRetainsSharedGlobalColorAndTextureValues=surfaceChanges.every(({source,replacement})=>{
  const a=materialState(source),b=materialState(replacement);for(const key of ['name','shader']){delete a[key];delete b[key];}return equal(a,b);
 });
 evidence.surfaceSelection={expected:expectedSurfaces,actual:changedSurfaceNames};
 const treeMeshes=phases.Landscape.filter(row=>!phases.Surfaces.some(v=>v.part===row.part)).map(row=>row.part);
 checks.replacementTreesAtMostFiveBatchesAnd50000ActualTriangles=treeMeshes.length>0&&treeMeshes.length<=5&&triangles(treeMeshes)<=50000;
 evidence.leafAlphaMipmaps=leafMipAudit(treeMeshes);checks.realRasterizedLeafAtlasRetainsCoverageThroughExplicitMips=evidence.leafAlphaMipmaps.passed;
 const sourceTrees=manifest.neighbourhood.landscape.trees;
 evidence.actualTreeRecords=treeGeometryRecords(treeMeshes,handles.Landscape.metadata,sourceTrees);
 checks.all23TreeFeetStayInsideTheirOriginalCollidersAndMatchActualRanges=evidence.actualTreeRecords.passed;
 evidence.treeClearance=treeClearance(treeMeshes,navigation);checks.actualReplacementTreesKeepAllWalkableBodyVolumesClear=evidence.treeClearance.passed;
 const shaderPhases={Surfaces:phaseShaderChecks(phases.Previous,phases.Surfaces),Landscape:phaseShaderChecks(phases.Surfaces,phases.Landscape),Windows:phaseShaderChecks(phases.Landscape,phases.Windows),Lamps:phaseShaderChecks(phases.Windows,phases.Lamps),Weather:phaseShaderChecks(phases.Lamps,phases.Weather)};
 checks.allMaterialLayersRetainTheirPredecessorShaderHooks=Object.values(shaderPhases).every(shaderChecksPass);
 const biasedReceivers=[];
 for(const row of after)for(const material of row.materials){
  if(material.isShaderMaterial)continue;
  const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};material.onBeforeCompile(shader,renderer);
  const matches=[...shader.vertexShader.matchAll(/vDirectionalShadowCoord\[\s*i\s*\]\.z\s*-=\s*([.\d]+)\s*\*\s*vDirectionalShadowCoord\[\s*i\s*\]\.w/g)];
  if(matches.length)biasedReceivers.push({mesh:row.name,material:material.name,biases:matches.map(m=>-Number(m[1])),receiveShadow:row.part.receiveShadow,castShadow:row.part.castShadow,
   noUVOrPointOverride:!/(?:vDirectionalShadowCoord\[\s*i\s*\]\.(?:x|y|xy)|vPointShadowCoord\[\s*i\s*\])\s*[-+*/]?=/.test(shader.vertexShader)});
 }
 checks.groundReceiverCorrectionOnlyAffectsTwoSoilDirectionalDepthComparisons=equal([...new Set(biasedReceivers.map(r=>r.mesh))].sort(),['ROAM01_Surface__EXT_B02_DampMineralGround','ROAM01_Surface__soil'])&&biasedReceivers.length===2&&biasedReceivers.every(r=>r.biases.length===1&&r.biases[0]===-.00020&&r.receiveShadow&&r.noUVOrPointOverride);
 evidence.groundShadowReceivers=biasedReceivers;
 const reflectorEvidence=reflectorsBeforeWeather.map(r=>({name:r.part.name,replacedMaterial:r.part.material!==r.material,originalUniformKeys:Object.keys(r.material.uniforms),
  sharesUniformObjects:Object.keys(r.material.uniforms).every(k=>r.part.material.uniforms[k]===r.material.uniforms[k]),sameRenderTarget:r.part.getRenderTarget()===r.target,sameTargetTexture:r.target.texture===r.texture,sameRenderCallback:r.part.onBeforeRender===r.onBeforeRender}));
 checks.waterReusesExactReflectorRenderTargetTextureCallbackAndUniforms=reflectorEvidence.length===1&&reflectorEvidence.every(r=>r.replacedMaterial&&r.sharesUniformObjects&&r.sameRenderTarget&&r.sameTargetTexture&&r.sameRenderCallback);
 checks.wetRoadAndTerrainLayersActuallyChangeTheirIntendedMaterials=handles.Weather.metadata.pavingMaterialCount>0&&handles.Landscape.metadata.groundMaterialCount>0&&phaseChanges(phases.Lamps,phases.Weather).length>1;
 evidence.reflector=reflectorEvidence;
 const wm=handles.Windows.metadata,lm=handles.Lamps.metadata,oldWM=previousAudit.evidence.windowMetadata,oldLM=previousAudit.evidence.lampMetadata;
 const windowPositions=m=>m.windows.map(w=>({id:w.id,center:w.worldCenter,normal:w.normal,tangent:w.tangent,width:w.innerWidth,height:w.innerHeight,depth:w.depth}));
 const lampPositions=m=>m.fixtures.map(f=>({id:f.id,position:f.worldPosition,anchor:f.wallAnchor,normal:f.outwardNormal,mount:f.mount,physicalBounds:f.physicalBoundsThreeXYZ}));
 checks.all62WindowPositionsAndSizesMatchSPACE08=wm.litWindowCount===62&&equal(windowPositions(wm),windowPositions(oldWM));
 checks.all33LampMountsAndPhysicalPositionsMatchSPACE08=lm.fixtureCount===33&&equal(lampPositions(lm),lampPositions(oldLM));
 const addedLights=lights(scene).filter(r=>!originalLights.some(old=>old.object===r.object));
 checks.sameSixShadowlessActualLightsAndNoExtraLights=addedLights.length===6&&addedLights.every(r=>r.type==='PointLight'&&!r.castShadow);
 checks.originalSourceLightsUnmodified=equal(plainLights(lights(scene).filter(r=>originalLights.some(old=>old.object===r.object))),plainLights(originalLights));
 checks.environmentAndExposureRemainStableUntilExplicitLighting=equal(worldState(scene),originalWorld);
 const allPhaseRows=Object.values(phases).flat();
 const ownedMaterials=new Set(allPhaseRows.flatMap(row=>row.materials).filter(m=>!originalMaterials.has(m))),ownedGeometry=new Set(newMeshes.map(p=>p.geometry)),newTextures=new Set([...texturesIn(allPhaseRows,scene)].filter(t=>!originalTextures.has(t)));
 const newGeometryBefore=newMeshes.map(p=>({part:p,state:geometryState(p.geometry),matrix:p.instanceMatrix?bytesHash(p.instanceMatrix.array):null,colour:p.instanceColor?bytesHash(p.instanceColor.array):null,count:p.isInstancedMesh?p.count:null}));
 for(const m of ownedMaterials)m.addEventListener('dispose',()=>disposeEvents.newMaterials++);
 for(const g of ownedGeometry)g.addEventListener('dispose',()=>disposeEvents.newGeometry++);
 for(const t of newTextures)t.addEventListener('dispose',()=>disposeEvents.newTextures++);
 const beforeLighting={world:worldState(scene),lights:plainLights(lights(scene)),refs:lights(scene).map(r=>r.object)};
 const lightingModule=await import(new URL('scene-space-09-lighting.js',web));lighting=lightingModule.applyLighting(scene,renderer);
 const afterLighting=lights(scene);
 checks.visualFillAddsNoLightsAndKeepsExposure=afterLighting.length===beforeLighting.refs.length&&afterLighting.every(r=>beforeLighting.refs.includes(r.object))&&renderer.toneMappingExposure===beforeLighting.world.exposure;
 lighting.dispose();lighting.dispose();
 checks.visualFillDisposeRestoresPriorWorldAndLights=equal(worldState(scene),beforeLighting.world)&&equal(plainLights(lights(scene)),beforeLighting.lights);
 for(const time of [0,.016,1,12,120])environment.update(time,{camera:new THREE.PerspectiveCamera()});
 scene.updateMatrixWorld(true);
 checks.updatesKeepOriginalBuffersAndNavigation=geometryChanges(inherited).length===0&&equal(navSamples(navigation),navBefore)&&navBefore.every(p=>p.walkable&&Number.isFinite(p.height));
 checks.updatesKeepTreeInstancesAndAllNewGeometryStatic=newGeometryBefore.every(({part,state,matrix,colour,count})=>equal(geometryState(part.geometry),state)&&(part.instanceMatrix?bytesHash(part.instanceMatrix.array):null)===matrix&&(part.instanceColor?bytesHash(part.instanceColor.array):null)===colour&&(part.isInstancedMesh?part.count:null)===count);
 evidence.metadata=Object.fromEntries(Object.entries(handles).map(([k,h])=>[k,h.metadata]));
 Object.assign(evidence,{geometryDiff,oldMaterialChanges,shaderPhases,source:{file:'space-08.glb',sha256:hash(bytes),bytes:bytes.length,triangles:manifest.geometry.triangles},oldTrees:oldTreeRows.map(r=>r.name),sourceTreeCount:sourceTrees.length,trees:{batches:treeMeshes.length,triangles:triangles(treeMeshes),meshes:treeMeshes.map(p=>({name:p.name,instanced:!!p.isInstancedMesh,count:p.isInstancedMesh?p.count:1,triangles:triangles([p])}))},newRuntimeTriangles:triangles(newMeshes),navigationSamples:navBefore.length,stubs,loadedLocalTextures:Object.fromEntries(loadedTextures),lighting:lighting.metadata});
 environment.dispose();environment.dispose();
 checks.inheritedDisposeCalledExactlyOnce=previousDisposeCalls===1;
 checks.allOwnedResourcesDisposedExactlyOnce=disposeEvents.newGeometry===ownedGeometry.size&&disposeEvents.newMaterials===ownedMaterials.size&&disposeEvents.newTextures===newTextures.size;
 evidence.disposal={...disposeEvents,expectedNewGeometry:ownedGeometry.size,expectedNewMaterials:ownedMaterials.size,expectedNewTextures:newTextures.size};
 const filesAfter=await preservation(protectedFiles);checks.all173ProtectedFilesRemainUnchanged=Object.keys(protectedFiles).length===173&&filesBefore.length===0&&filesAfter.length===0;
 evidence.preservation={count:Object.keys(protectedFiles).length,changes:[...new Set([...filesBefore,...filesAfter])]};
 const controller=await readFile(new URL('scene-space-09.js',web),'utf8');
 checks.controllerReusesSPACE08GeometryAndNavigation=controller.includes('space-08')&&controller.includes('./scene-space-08-navigation.js')&&!controller.includes('space-09.glb');
 evidence.moduleHashes=Object.fromEntries(await Promise.all(['environment','surfaces','landscape','lamps','weather','lighting'].map(async name=>{const path=`web/scene-space-09-${name}.js`;return[path,await hashFile(path)];})));
}catch(error){checks.runtimeCompleted=false;evidence.error={message:error.message,stack:error.stack};}
const report={checkedUTC:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,evidence,seconds:Math.round((performance.now()-started)/10)/100,
 limitations:['Actual unchanged SPACE08 GLB and the complete production SPACE09 environment chain are exercised. Original source model files are hash-protected; no Blender save/render or browser is performed.','Image/HDR decoding and GPU CubeCamera/PMREM are stubbed after reading actual local assets. The real production leaf paths are rasterized with Windows System.Drawing and final uploaded alpha mip bytes are independently measured; browser/GPU sampling and appearance still need root visual review.','New tree triangles are conservatively tested as solid against sampled walking body cylinders. This is not a continuous mathematical clearance proof.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,failed:Object.keys(checks).filter(k=>!checks[k]),seconds:report.seconds,report:output.href,error:evidence.error},null,2));process.exitCode=report.passed?0:1;
