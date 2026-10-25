// CPU integration audit of the real GLB and full production environment chain.
// GPU captures and image decoding are explicit stubs; no browser is started.
import {readFile,writeFile,access} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
import {createAuditCanvas} from './check_space_09_canvas.mjs';
const root=new URL('../',import.meta.url),web=new URL('web/',root);


const hash=data=>createHash('sha256').update(data).digest('hex');
const hashFile=async path=>hash(await readFile(new URL(path,root)));
const readJSON=async path=>JSON.parse((await readFile(new URL(path,root),'utf8')).replace(/^\uFEFF/,''));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checks={},evidence={},started=performance.now();
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL=new URL('vendor/three/examples/jsm/',web).href;
const env11URL=new URL('scene-space-11-environment.js',web).href;
const wrappers={};
for(const [file,fn,hook] of [['scene-space-10-environment.js','setupEnvironment','Previous'],['scene-space-11-landscape.js','applyLandscape','Landscape']]){
 const url=new URL(file,web).href;
 const body=fn==='setupEnvironment'
  ?`export async function ${fn}(...args){const h=await actual(...args);globalThis.__space11Previous(h,...args);return{...h,dispose(){globalThis.__space11BeforePreviousDispose();h.dispose();}};}`
  :`export async function ${fn}(...args){const h=await actual(...args);globalThis.__space11Landscape(h,...args);return {...h,update(...state){globalThis.__space11BeforeUpdate();h.update?.(...state);globalThis.__space11AfterUpdate();}};}`;
 wrappers['./'+file]='data:text/javascript,'+encodeURIComponent(`import {${fn} as actual} from ${JSON.stringify(url)};${body}`);
}
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};const w=${JSON.stringify(wrappers)};if(c.parentURL===${JSON.stringify(env11URL)}&&w[s])return{url:w[s],shortCircuit:true};return n(s,c);}`),import.meta.url);
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
function warmToken(name){return name.split(' / ').some(s=>s==='SPACE10_WindowWarm'||s==='SPACE03_WindowWarm');}
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

const materialList=part=>Array.isArray(part.material)?part.material:[part.material];
function texturesIn(rows,scene){const out=new Set([scene.environment,scene.background].filter(t=>t?.isTexture));for(const row of rows)for(const m of row.materials){for(const v of Object.values(m))if(v?.isTexture)out.add(v);let uniforms=m.uniforms??{};if(!m.isShaderMaterial){const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};m.onBeforeCompile(shader,renderer);uniforms=shader.uniforms;}for(const u of Object.values(uniforms))if(u?.value?.isTexture)out.add(u.value);}return out;}
const rasterizedCanvases=[];
function auditCanvas(width=1,height=1){const canvas=createAuditCanvas(width,height);rasterizedCanvases.push(canvas);return canvas;}
globalThis.document={createElement(tag){if(tag!=='canvas')throw new Error('Unexpected DOM request '+tag);return auditCanvas();}};
globalThis.OffscreenCanvas=class{constructor(width,height){return auditCanvas(width,height);}};


const manifest=await readJSON('web/models/space-10-manifest.json'),appearance=await readJSON('web/models/space-03-manifest.json');
const bytes=await readFile(new URL('models/space-10.glb',web));
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=new THREE.Scene();scene.add(gltf.scene);
const {setupEnvironment}=await import(new URL('scene-space-10-environment.js',web));const facade=appearance.refinements.facades;
const env=await setupEnvironment(renderer,scene,gltf.scene,{mobile:true,materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials,neighbourhood:manifest.neighbourhood});scene.updateMatrixWorld(true);
const sourceMeshes=[];gltf.scene.traverse(p=>{if(p.isMesh&&p.visible)sourceMeshes.push(p);});
const rows=[],ray=new THREE.Raycaster(),keyLight=lights(scene).find(r=>r.type==='DirectionalLight'&&r.castShadow).object;
keyLight.shadow.updateMatrices(keyLight);
function shadowGradient(hit){
 const mesh=hit.object,g=mesh.geometry,index=g.index,p=g.attributes.position,n=g.attributes.normal,coordinates=[];
 const nm=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
 for(let j=0;j<3;j++){const i=index?index.getX(hit.faceIndex*3+j):hit.faceIndex*3+j;
  const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),normal=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(nm).normalize();
  v.addScaledVector(normal,keyLight.shadow.normalBias);const q=new THREE.Vector4(v.x,v.y,v.z,1).applyMatrix4(keyLight.shadow.matrix);coordinates.push(new THREE.Vector3(q.x/q.w,q.y/q.w,q.z/q.w-.00020));}
 const a=coordinates[1].clone().sub(coordinates[0]),b=coordinates[2].clone().sub(coordinates[0]),det=a.x*b.y-a.y*b.x;
 const gradient=[(b.y*a.z-a.y*b.z)/det,(a.x*b.z-b.x*a.z)/det],extent=2*(Math.abs(gradient[0])/keyLight.shadow.mapSize.x+Math.abs(gradient[1])/keyLight.shadow.mapSize.y);
 return{projectedTriangle:coordinates.map(p=>p.toArray()),gradientUV:gradient,determinant:det,pcfTwoTexelBias:extent,lightDepthMetres:extent*(keyLight.shadow.camera.far-keyLight.shadow.camera.near)};
}
for(const [x,y]of[[-25,32],[-27,34],[-29,36],[-22.4047,31.3078],[-25.4551,35.5377]]){
 ray.set(new THREE.Vector3(x,50,-y),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=100;
 const hits=ray.intersectObjects(sourceMeshes,false).slice(0,12).map(h=>({shadowGradient:shadowGradient(h),object:h.object.name,material:materialOf(h).name,triangleIndex:h.faceIndex,blender:[h.point.x,-h.point.z,h.point.y],distance:h.distance,normal:h.face.normal.toArray(),transparent:materialOf(h).transparent,depthWrite:materialOf(h).depthWrite,normalMap:materialOf(h).normalMap?.name??null}));
 rows.push({blenderXY:[x,y],hits,closestLayerSeparation:hits.length>1?hits[1].distance-hits[0].distance:null});
}
const report={shadow:{mapSize:keyLight.shadow.mapSize.toArray(),globalBias:keyLight.shadow.bias,normalBias:keyLight.shadow.normalBias},source:'Actual SPACE10 GLB after the complete production SPACE10 environment establishes visibility/materials',visibleSourceMeshes:sourceMeshes.length,rows};
await writeFile(new URL('artifacts/scene-space-11/front-shadow-plane-gradients.json',root),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));env.dispose();
