// CPU integration audit of the real GLB and full production environment chain.
// GPU captures and image decoding are explicit stubs; no browser is started.
import {readFile,writeFile,access} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
import {createAuditCanvas} from './check_space_09_canvas.mjs';
const root=new URL('../',import.meta.url),web=new URL('web/',root);
const output=new URL(process.argv[2]??'artifacts/scene-space-11/runtime-validation.json',root);
try{await access(output);throw new Error('Refusing to overwrite existing audit report.');}catch(error){if(error.code!=='ENOENT')throw error;}
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

function terrainMeshes(model){const out=[];model.traverse(p=>{if(p.isMesh&&['ROAM01_Surface__soil','ROAM01_Surface__EXT_B02_DampMineralGround'].includes(p.name))out.push(p);});return out;}
function terrainHeight(meshes,x,blenderY){
 const ray=new THREE.Raycaster(new THREE.Vector3(x,50,-blenderY),new THREE.Vector3(0,-1,0),0,100);
 return ray.intersectObjects(meshes,true)[0]?.point.y??null;
}
function meshBounds(meshes){const b=new THREE.Box3();for(const p of meshes)b.union(new THREE.Box3().setFromObject(p));return{min:b.min.toArray(),max:b.max.toArray()};}
function receiverState(rows){const out=[];for(const row of rows)for(const m of row.materials){if(m.isShaderMaterial)continue;
 const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};m.onBeforeCompile(shader,renderer);
 const matches=[...shader.vertexShader.matchAll(/vDirectionalShadowCoord\[\s*i\s*\]\.z\s*-=\s*([.\d]+)\s*\*\s*vDirectionalShadowCoord\[\s*i\s*\]\.w/g)];
 if(matches.length)out.push({name:row.name,biases:matches.map(m=>-Number(m[1])),receiveShadow:row.part.receiveShadow});
 }return out;}
function actualRiverProfile(model){
 const meshes=[];model.traverse(p=>{if(p.isMesh&&(p.name==='ROAM01_Water'||/Canal.?water/i.test(p.name)))meshes.push(p);});
 if(!meshes.length)throw new Error('Actual inherited river mesh not found.');
 const triangles=actualTriangles(meshes);
 const bankAt=x=>{const cross=[];for(const t of triangles){if(x<t.min[0]-1e-6||x>t.max[0]+1e-6)continue;
  for(let i=0;i<3;i++){const a=t.vertices[i],b=t.vertices[(i+1)%3];if((x-a[0])*(x-b[0])>1e-9)continue;
   if(Math.abs(a[0]-b[0])<1e-8){if(Math.abs(a[0]-x)<1e-6)cross.push(-a[2],-b[2]);}
   else{const r=(x-a[0])/(b[0]-a[0]);if(r>=-1e-6&&r<=1.000001)cross.push(-(a[2]+(b[2]-a[2])*r));}
  }}return cross.length?{lower:Math.min(...cross),upper:Math.max(...cross)}:null;};
 return{meshNames:meshes.map(m=>m.name),triangles:triangles.length,bankAt,distance(x,y){const b=bankAt(x);if(!b)return null;return y>b.upper?y-b.upper:y<b.lower?b.lower-y:-Math.min(b.upper-y,y-b.lower);}};
}
function instanceBounds(mesh,start,count){
 const b=new THREE.Box3(),m=new THREE.Matrix4(),world=new THREE.Matrix4(),p=mesh.geometry.attributes.position;
 for(let i=start;i<start+count;i++){mesh.getMatrixAt(i,m);world.multiplyMatrices(mesh.matrixWorld,m);for(let j=0;j<p.count;j++)b.expandByPoint(new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(world));}
 return{min:b.min.toArray(),max:b.max.toArray()};
}
function independentLandscapeGeometry(meshes,metadata,model,navigation){
 const terrain=terrainMeshes(model),river=actualRiverProfile(model),branches=meshes.find(m=>m.name==='SPACE11_OuterTreeBranches'),leaves=meshes.find(m=>m.name==='SPACE11_OuterLeaves'),blades=meshes.find(m=>m.name==='SPACE11_MeadowReeds');
 if(terrain.length!==2||!branches||!leaves||!blades)throw new Error('Missing real terrain or explicit SPACE11 batch.');
 const rows=[],roots=[],groups=[],waterIntrusions=[];let branchEnd=0,leafEnd=0;
 const boxSame=(a,b)=>['min','max'].every(k=>a[k].every((v,i)=>Math.abs(v-b[k][i])<1e-4));
 const rangeBounds=(mesh,range)=>{const b=new THREE.Box3(),a=mesh.geometry.attributes.position;for(let i=range.start;i<range.start+range.count;i++)b.expandByPoint(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld));return{min:b.min.toArray(),max:b.max.toArray()};};
 const roadGap=(x,y)=>Math.min(...navigation.zones.map(r=>Math.hypot(Math.max(r.minX-x,0,x-r.maxX),Math.max(r.minZ+y,0,-y-r.maxZ))));
 function rootCheck(root,id,type){const[x,y,z]=root.blender,actual=terrainHeight(terrain,x,y),bank=river.distance(x,y),gap=roadGap(x,y);
  const safeBank=bank!==null&&(type==='tree'?bank>=10-1e-4:type==='reed'?bank>=.12-1e-4&&bank<=1.5+1e-4:bank>=0);
  const row={id,type,blender:root.blender,actualTerrainHeight:actual,error:actual===null?null:Math.abs(actual-z),actualBankDistance:bank,actualRoadGap:gap,passed:actual!==null&&Math.abs(actual-z)<1e-4&&safeBank&&gap>=.65-1e-5};roots.push(row);return row;}
 for(const tree of metadata.trees){
  const support=rootCheck(tree.support,tree.id,'tree'),br=tree.branchVertexRange,lr=tree.leafInstanceRange;
  const actualBranches=rangeBounds(branches,br),actualLeaves=instanceBounds(leaves,lr.start,lr.count);
  const contiguous=br.start===branchEnd&&lr.start===leafEnd;branchEnd=br.start+br.count;leafEnd=lr.start+lr.count;
  const anchor=tree.baseWorld,expected=[tree.support.blender[0],tree.support.blender[2],-tree.support.blender[1]];
  const inOpening=(metadata.openAreas??[]).filter(r=>r.bounds&&r.policy.toLowerCase().includes('no new tall')).some(r=>anchor[0]>=r.bounds[0]&&anchor[0]<=r.bounds[2]&&-anchor[2]>=r.bounds[1]&&-anchor[2]<=r.bounds[3]);
  rows.push({id:tree.id,actualBranchBounds:actualBranches,actualLeafBounds:actualLeaves,root:support,passed:support.passed&&contiguous&&boxSame(actualBranches,tree.branchBounds)&&boxSame(actualLeaves,tree.leafBounds)&&equal(anchor,expected)&&!inOpening});
 }
 for(const group of metadata.lowGroups){
  const support=group.support.map((r,i)=>rootCheck(r,group.id+'/'+i,group.type));let bounds;
  if(group.leafInstanceRange){const r=group.leafInstanceRange;bounds=instanceBounds(leaves,r.start,r.count);if(r.start!==leafEnd)throw new Error('Foliage instance ranges are not contiguous at '+group.id);leafEnd=r.start+r.count;}
  else bounds=rangeBounds(blades,group.bladeVertexRange);
  const approved=group.approvedBoundsBlenderXY;
  const within=!approved||(bounds.min[0]>=approved[0]-1e-4&&bounds.max[0]<=approved[2]+1e-4&&bounds.min[2]>=-approved[3]-1e-4&&bounds.max[2]<=-approved[1]+1e-4);
  let minBank=Infinity;
  if(group.type==='reed'){const r=group.bladeVertexRange,a=blades.geometry.attributes.position;for(let i=r.start;i<r.start+r.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(blades.matrixWorld),d=river.distance(p.x,-p.z);if(d!==null)minBank=Math.min(minBank,d);}
   waterIntrusions.push({id:group.id,minimumActualBankDistance:minBank,passed:minBank>=-.25-1e-4});}
  const declared=group.leafBounds??group.bladeBounds;
  groups.push({id:group.id,type:group.type,actualBounds:bounds,supportSamples:support.length,approvedBounds:approved,minimumActualBankDistance:Number.isFinite(minBank)?minBank:null,passed:support.length>0&&support.every(r=>r.passed)&&within&&boxSame(bounds,declared)&&minBank>=-.25-1e-4});
 }
 const treeCount=metadata.treeCount===metadata.trees.length&&metadata.treeCount>0&&metadata.treeCount<=24;
 return{passed:treeCount&&rows.every(r=>r.passed)&&groups.every(r=>r.passed)&&branchEnd===branches.geometry.attributes.position.count&&leafEnd===leaves.count,treeCount:rows.length,treeRows:rows,lowGroups:groups,rootCount:roots.length,rootFailures:roots.filter(r=>!r.passed),maximumTerrainError:Math.max(...roots.map(r=>r.error??999)),minTreeBankDistance:Math.min(...roots.filter(r=>r.type==='tree').map(r=>r.actualBankDistance)),waterIntrusions,river:{meshNames:river.meshNames,actualTriangles:river.triangles},method:'Independent downward rays onto the actual two terrain batches, river banks intersected from actual water triangles, and explicit world-space vertex/instance-range measurements.'};
}
// Evaluate the actual emitted GLSL expressions, rather than a copied mask formula.
function glslExpression(expression,values){
 const tokens=expression.match(/(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[+\-*/().,]/g)??[];let i=0;
 const binary=(a,b,fn)=>Array.isArray(a)?a.map((x,j)=>fn(x,Array.isArray(b)?b[j]:b)):Array.isArray(b)?b.map(y=>fn(a,y)):fn(a,b);
 const unary=(a,fn)=>Array.isArray(a)?a.map(fn):fn(a);
 const call=(name,args)=>{
  if(/^vec[234]$/.test(name)){const n=Number(name.at(-1)),flat=args.flat();return flat.length===1?Array(n).fill(flat[0]):flat;}
  if(name==='abs')return unary(args[0],Math.abs);
  if(name==='max'||name==='min')return binary(args[0],args[1],Math[name]);
  if(name==='length')return Math.hypot(...args[0]);
  if(name==='smoothstep')return binary(binary(args[2],args[0],(x,a)=>x-a),binary(args[1],args[0],(b,a)=>b-a),(x,d)=>{const t=Math.max(0,Math.min(1,x/d));return t*t*(3-2*t);});
  if(name==='mix')return binary(binary(args[0],args[2],(a,t)=>a*(1-t)),binary(args[1],args[2],(b,t)=>b*t),(a,b)=>a+b);
  throw new Error('Unsupported actual GLSL function '+name);
 };
 function atom(){let t=tokens[i++],v;if(t==='-'||t==='+')return unary(atom(),x=>t==='-'?-x:x);
  if(t==='('){v=parse();if(tokens[i++]!==')')throw new Error('Unclosed expression '+expression);}
  else if(/^(?:\d|\.)/.test(t))v=Number(t);
  else if(tokens[i]==='('){i++;const args=[];if(tokens[i]!==')'){do{args.push(parse());}while(tokens[i]===','&&++i);}if(tokens[i++]!==')')throw new Error('Unclosed call');v=call(t,args);}
  else{if(!(t in values))throw new Error('Missing actual GLSL symbol '+t);v=values[t];}
  while(tokens[i]==='.'){i++;const sw=tokens[i++],indices=[...sw].map(c=>'xyzw'.includes(c)?'xyzw'.indexOf(c):'rgba'.indexOf(c));v=indices.length===1?v[indices[0]]:indices.map(j=>v[j]);}return v;
 }
 function parse(min=0){let v=atom();while(i<tokens.length){const op=tokens[i],p=op==='+'||op==='-'?1:op==='*'||op==='/'?2:0;if(!p||p<min)break;i++;const r=parse(p+1);v=binary(v,r,(a,b)=>op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:a/b);}return v;}
 const value=parse();if(i!==tokens.length)throw new Error('Unhandled GLSL tokens '+expression);return value;
}
function strictDevelopedMask(replacements,model,layout){
 const expected=layout.developed_bounds_xy,rows=[];
 const points=[];for(let x=expected[0];x<=expected[2];x+=3)for(let y=expected[1];y<=expected[3];y+=3)points.push([x,y]);
 for(const x of [expected[0],expected[0]+1e-6,expected[2]-1e-6,expected[2]])for(const y of [expected[1],expected[1]+1e-6,expected[3]-1e-6,expected[3]])points.push([x,y]);
 for(const mesh of terrainMeshes(model)){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld),x=p.x,y=-p.z;if(x>=expected[0]&&x<=expected[2]&&y>=expected[1]&&y<=expected[3])points.push([x,y]);}}
 for(const {mesh,replacement}of replacements){
  const s={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};replacement.onBeforeCompile(s,renderer);
  const start=s.fragmentShader.indexOf('vec2 s11P='),end=s.fragmentShader.indexOf('#include <lights_physical_fragment>',start),block=s.fragmentShader.slice(start,end);
  const expr=name=>{const m=block.match(new RegExp('(?:float|vec2)\\s+'+name+'=([^;]+);'));if(!m)throw new Error('Missing emitted GLSL '+name);return m[1];};
  const expressions=Object.fromEntries(['q','s11Outside','s11OutsideMask','s11Band','s11Envelope'].map(n=>[n,expr(n)]));
  const colour=block.match(/diffuseColor\.rgb=mix\(([^;]+)\);/),contact=block.match(/diffuseColor\.rgb\*=([^;]+);/),rough=block.match(/roughnessFactor=([^;]+);/),receiver=[...block.matchAll(/s11ReceiverWeight=([^;]+);/g)].at(-1);
  if(!colour||!contact||!rough||!receiver)throw new Error('Missing output writes in actual11 shader');
  const uniform=s.uniforms.s11Developed.value.toArray();let failures=0,maxDelta=0;
  for(const p of points)for(const patch of [0,.5,1]){
   const v={s11P:p,s11Developed:uniform,s11Patch:patch,s11Wet:1,s11Top:1,s11Contact:1,s11Soil:[.8,.7,.6],diffuseColor:[.2,.3,.4,1],roughnessFactor:.6};
   for(const [name,expression]of Object.entries(expressions))v[name]=glslExpression(expression,v);
   const c=glslExpression('mix('+colour[1]+')',v),mult=glslExpression(contact[1],v),r=glslExpression(rough[1],v),bias=glslExpression(receiver[1],v);
   const delta=Math.max(...c.map((x,j)=>Math.abs(x-v.diffuseColor[j])),Math.abs(mult-1),Math.abs(r-.6),Math.abs(bias));maxDelta=Math.max(maxDelta,delta);if(delta>1e-15)failures++;
  }
  const expectedLighting=THREE.ShaderChunk.lights_fragment_begin.replace('directionalLightShadow.shadowBias,','( directionalLightShadow.shadowBias - .00025 * s11ReceiverWeight ),');
  const fragmentOnly=!s.vertexShader.includes('s11ReceiverWeight')&&!s.vertexShader.includes('s11OutsideMask');
  rows.push({mesh,uniform,actualExpressions:expressions,interiorSamples:points.length*3,maximumInteriorChange:maxDelta,failures,fragmentOnly,exactAllowedDirectionalChunk:s.fragmentShader.includes(expectedLighting),passed:equal(uniform,expected)&&failures===0&&fragmentOnly&&s.fragmentShader.includes(expectedLighting)});
 }
 return{passed:rows.length===2&&rows.every(r=>r.passed),developedBounds:expected,rows,method:'Small independent GLSL-expression evaluator executes the emitted mask and all four output writes at developed-grid/boundary and actual terrain-vertex fragments, across arbitrary noise extrema; also verifies the expanded Three directional-shadow chunk differs only by the approved local bias.'};
}

let environment;
try{
 const manifest=await readJSON('web/models/space-10-manifest.json'),appearance=await readJSON('web/models/space-03-manifest.json');
 const priorAudit=await readJSON('artifacts/scene-space-10/runtime-validation-final.json');
 const bytes=await readFile(new URL('models/space-10.glb',web));
 checks.unchangedSPACE10SourceMatchesManifestAndAcceptedAudit=hash(bytes)===manifest.sha256&&priorAudit.passed&&priorAudit.evidence.source.sha256===hash(bytes);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const scene=new THREE.Scene();scene.add(gltf.scene);
 const {createNavigation}=await import(new URL('scene-space-10-navigation.js',web));
 const navigation=createNavigation({ground:manifest.neighbourhood.ground.navigation}),navBefore=navSamples(navigation);
 let inherited,originalLights,originalWorld,originalTextures,landscapeHandle,baseHandle,sourceReceivers,expectedInheritedLightsAtDispose;
 let beforeLayerUpdate,layerUpdateUnchanged=true;
 const originalMaterials=new Map(),visibility=new Map(),shadowState=new Map(),disposed={oldGeometry:0,oldMaterials:0,oldTextures:0,newGeometry:0,newMaterials:0,newTextures:0};
 globalThis.__space11Previous=(handle)=>{
  baseHandle=handle;inherited=capture(scene);originalLights=lights(scene);originalWorld=worldState(scene);originalTextures=texturesIn(inherited,scene);sourceReceivers=receiverState(inherited);
  for(const row of inherited){visibility.set(row.part,row.part.visible);row.geometry.addEventListener('dispose',()=>disposed.oldGeometry++);shadowState.set(row.part,{cast:row.part.castShadow,receive:row.part.receiveShadow,depth:row.part.customDepthMaterial,distance:row.part.customDistanceMaterial});
   for(const m of row.materials)if(!originalMaterials.has(m)){originalMaterials.set(m,materialState(m));m.addEventListener('dispose',()=>disposed.oldMaterials++);}}
  for(const t of originalTextures)t.addEventListener('dispose',()=>disposed.oldTextures++);
 };
 globalThis.__space11Landscape=handle=>{landscapeHandle=handle;};
 globalThis.__space11BeforeUpdate=()=>{beforeLayerUpdate={lights:plainLights(lights(scene)),world:worldState(scene)};};
 globalThis.__space11AfterUpdate=()=>{layerUpdateUnchanged&&=equal(plainLights(lights(scene)),beforeLayerUpdate.lights)&&equal(worldState(scene),beforeLayerUpdate.world);};
 let previousDisposeCalls=0;
 globalThis.__space11BeforePreviousDispose=()=>{
  previousDisposeCalls++;
  checks.disposeRestoresEveryInheritedMaterialReference=inherited.every(r=>materialList(r.part).every((m,i)=>m===r.materials[i]));
  checks.disposeRestoresEveryInheritedVisibilityAndShadowFlag=inherited.every(({part})=>{const s=shadowState.get(part);return part.visible===visibility.get(part)&&part.castShadow===s.cast&&part.receiveShadow===s.receive&&part.customDepthMaterial===s.depth&&part.customDistanceMaterial===s.distance;});
  checks.disposeRemovesOnly11OwnedMeshesAndNoInheritedLights=ownMeshesSince(scene,inherited).length===0&&equal(plainLights(lights(scene)),expectedInheritedLightsAtDispose);
  checks.disposeDoesNotReleaseAnyBorrowedGeometryMaterialTexture=disposed.oldGeometry===0&&disposed.oldMaterials===0&&disposed.oldTextures===0&&geometryChanges(inherited).length===0;
  evidence.disposalBeforeInheritedOwner={...disposed};
 };
 const {setupEnvironment}=await import(env11URL),facade=appearance.refinements.facades;
 environment=await setupEnvironment(renderer,scene,gltf.scene,{mobile:true,materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials,neighbourhood:manifest.neighbourhood});
 if(!inherited||!landscapeHandle)throw new Error('Production setup10 → landscape11 hook did not execute.');
 scene.updateMatrixWorld(true);const after=capture(scene),added=ownMeshesSince(scene,inherited),metadata=landscapeHandle.metadata;
 const geometryDiff=geometryChanges(inherited),oldMaterialMutations=[...originalMaterials].filter(([m,state])=>!equal(materialState(m),state)).map(([m])=>m.name);
 const materialReplacements=after.flatMap(row=>{const prev=inherited.find(r=>r.part===row.part);return prev?row.materials.map((m,i)=>({mesh:row.name,source:prev.materials[i],replacement:m})).filter(r=>r.source!==r.replacement):[];});
 checks.everyInheritedBufferUVIndexTransformRemainsUnchanged=geometryDiff.length===0;
 checks.everyInheritedMaterialObjectRemainsUnmodified=oldMaterialMutations.length===0;
 checks.allInheritedVisibilityShadowAndCasterSettingsUnchanged=inherited.every(({part})=>{const s=shadowState.get(part);return part.visible===visibility.get(part)&&part.castShadow===s.cast&&part.receiveShadow===s.receive&&part.customDepthMaterial===s.depth&&part.customDistanceMaterial===s.distance;});
 checks.inheritedLightsFogSkyExposureAndEnvironmentUnchanged=equal(plainLights(lights(scene)),plainLights(originalLights))&&equal(worldState(scene),originalWorld);
 checks.newMeshNamesAreSPACE11Only=added.length>0&&added.every(p=>p.name.startsWith('SPACE11_'));
 const count=triangles(added),draws=added.reduce((n,p)=>n+(p.geometry.groups.length||1),0);
 checks.newGeometryWithin60000TrianglesAndFiveDrawCalls=count<=60000&&draws<=5;
 checks.actualGeometryCountsAgreeWithMetadataWithoutExtraShadowCasters=count===metadata.triangles&&draws===metadata.drawCalls&&added.length===metadata.addedMeshes&&added.every(m=>!m.castShadow)&&metadata.newLights===0;
 const bounds=meshBounds(added);
 checks.newActualGeometryWithinApprovedBlenderXYEnvelope=bounds.min[0]>=-68.001&&bounds.max[0]<=68.001&&bounds.min[2]>=-62.001&&bounds.max[2]<=75.001;
 checks.materialChangesRestrictedToTwoExistingEarthBatches=materialReplacements.every(r=>['ROAM01_Surface__soil','ROAM01_Surface__EXT_B02_DampMineralGround'].includes(r.mesh));
 const inheritedHooks=materialReplacements.map(r=>({mesh:r.mesh,...sourceShaderPreserved(r.source,r.replacement)}));
 checks.everyEarthShaderRetainsPriorCallbacksAndUniforms=inheritedHooks.every(r=>r.newKey.startsWith(r.oldKey)&&r.uniformsRetained&&r.vertexSourceRetained&&r.fragmentSourceRetained);
 checks.existingGroundShadowReceiverCorrectionPreservedExactly=equal(receiverState(after.filter(r=>inherited.some(p=>p.part===r.part))),sourceReceivers);
 evidence.strictDevelopedMask=strictDevelopedMask(materialReplacements,gltf.scene,manifest.neighbourhood.layout);checks.developedInteriorColourRoughnessAndExtraShadowBiasExactlyUnchanged=evidence.strictDevelopedMask.passed;
 evidence.publicRoadClearance=treeClearance(added,navigation);checks.allNewWorldTrianglesClearEverySampledPublicWalkingBody=evidence.publicRoadClearance.passed;
 evidence.landscapeGeometry=independentLandscapeGeometry(added,metadata,gltf.scene,navigation);checks.allNewRootsHaveActualTerrainSupportSafeBanksAndDeclaredGeometryRanges=evidence.landscapeGeometry.passed;
 const {applyLandscape}=await import(new URL('scene-space-11-landscape.js',web));
 checks.reapplicationIsIdempotent=await applyLandscape(renderer,scene,gltf.scene,manifest.neighbourhood)===landscapeHandle&&ownMeshesSince(scene,inherited).length===added.length;
 const inheritedGeometry=new Set(inherited.map(r=>r.geometry));
 const ownedGeometry=new Set(added.map(p=>p.geometry).filter(g=>!inheritedGeometry.has(g))),ownedMaterials=new Set(after.flatMap(r=>r.materials).filter(m=>!originalMaterials.has(m))),ownedTextures=new Set([...texturesIn(after,scene)].filter(t=>!originalTextures.has(t)));
 const addedLeaves=added.find(p=>p.isInstancedMesh),inheritedLeaves=inherited.find(r=>r.part.name==='SPACE09_LeafCards');
 const actualBorrowedGeometry=added.filter(p=>inheritedGeometry.has(p.geometry));
 checks.borrowedLeafCardGeometryAndAlphaRemainOwnedByInheritedLayer=actualBorrowedGeometry.length===1&&actualBorrowedGeometry[0]===addedLeaves&&originalTextures.has(addedLeaves.material.map);
 checks.noNewTextureAllocation=ownedTextures.size===0;
 for(const g of ownedGeometry)g.addEventListener('dispose',()=>disposed.newGeometry++);
 for(const m of ownedMaterials)m.addEventListener('dispose',()=>disposed.newMaterials++);
 for(const t of ownedTextures)t.addEventListener('dispose',()=>disposed.newTextures++);
 const geometryBefore=added.map(p=>({part:p,state:geometryState(p.geometry),instance:p.instanceMatrix?bytesHash(p.instanceMatrix.array):null}));
 for(const time of [0,.016,1,12,120])environment.update(time,{camera:new THREE.PerspectiveCamera()});scene.updateMatrixWorld(true);
 checks.newLayerUpdatePreservesInheritedAnimatedLightsAndWorld=layerUpdateUnchanged;
 checks.updatesKeepAllInheritedGeometryAndNavigationUnchanged=geometryChanges(inherited).length===0&&equal(navSamples(navigation),navBefore);
 checks.updatesKeepNewGeometryAndInstancePlacementsStable=geometryBefore.every(r=>equal(geometryState(r.part.geometry),r.state)&&(r.part.instanceMatrix?bytesHash(r.part.instanceMatrix.array):null)===r.instance);
 Object.assign(evidence,{metadata,source:{file:'space-10.glb',sha256:hash(bytes),bytes:bytes.length,triangles:manifest.geometry.triangles},newGeometry:{triangles:count,drawCalls:draws,bounds,meshes:added.map(p=>({name:p.name,triangles:triangles([p]),instances:p.isInstancedMesh?p.count:1}))},geometryDiff,oldMaterialMutations,materialReplacements:materialReplacements.map(r=>({mesh:r.mesh,source:r.source.name,replacement:r.replacement.name})),inheritedHooks,sourceReceivers,navigationSamples:navBefore.length,stubs});
 expectedInheritedLightsAtDispose=plainLights(lights(scene));environment.dispose();environment.dispose();checks.baseDisposeCalledExactlyOnce=previousDisposeCalls===1;
 checks.ownedResourcesDisposedExactlyOnce=disposed.newGeometry===ownedGeometry.size&&disposed.newMaterials===ownedMaterials.size&&disposed.newTextures===ownedTextures.size;
 evidence.disposal={...disposed,expectedNewGeometry:ownedGeometry.size,expectedNewMaterials:ownedMaterials.size,expectedNewTextures:ownedTextures.size};
 const protectedFiles=await readJSON('artifacts/scene-space-11/preserved-files.json'),changed=await preservation(protectedFiles);
 checks.all1391PriorVersionFilesPreserved=Object.keys(protectedFiles).length===1391&&changed.length===0;evidence.preservation={count:Object.keys(protectedFiles).length,changes:changed};
 const controller=await readFile(new URL('scene-space-11.js',web),'utf8');
 checks.controllerUsesExisting10ModelAndNavigation=controller.includes("const modelName='space-10'")&&controller.includes("from './scene-space-10-navigation.js'")&&!controller.includes('space-11.glb');
 evidence.moduleHashes=Object.fromEntries(await Promise.all(['environment','landscape'].map(async n=>{const p=`web/scene-space-11-${n}.js`;return[p,await hashFile(p)];})));
}catch(error){checks.runtimeCompleted=false;evidence.error={message:error.message,stack:error.stack};}
const report={checkedUTC:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,evidence,seconds:Math.round((performance.now()-started)/10)/100,
 limitations:['Real SPACE10 GLB and complete production setup10 → landscape11 environment are exercised; no save, render, browser or old source edits.','Local image/HDR reads are real, decode and GPU PMREM/CubeCamera are explicit CPU stubs. Leaf atlas uses the actual production paths through Windows System.Drawing. Visual/GPU quality is reviewed separately.','Actual instanced geometry is conservatively solid in sampled body-volume tests; this does not prove every continuous trajectory.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,failed:Object.keys(checks).filter(k=>!checks[k]),seconds:report.seconds,report:output.href,error:evidence.error},null,2));process.exitCode=report.passed?0:1;
