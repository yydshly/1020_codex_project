// Runtime isosurface candidate; the scalar field must come from code generation.
// Only lookup tables are reused from Three.  The large MarchingCubes class,
// full-volume normal cache and palette are deliberately never instantiated.
import {edgeTable,triTable} from '../lijiang-flythrough/node_modules/three/examples/jsm/objects/MarchingCubes.js';
import {applyLiveLimestone,ROCK_MATERIAL_REVISION} from './raster-rock-material.js';

const REVISION='native-rock-sdf-raster-4-live-limestone';
const CORNERS=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const EDGE_CORNERS=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const TRI_COUNTS=new Uint8Array(256);
for(let c=0;c<256;c++)for(let i=0;i<16&&triTable[c*16+i]!==-1;i+=3)TRI_COUNTS[c]++;

function finiteArray(value,length,label){
  if(!value||value.length!==length||!Array.from(value).every(Number.isFinite))throw new Error('Invalid '+label);
  return Array.from(value);
}
function isFloat32(value){
  // instanceof fails for real generated arrays returned by another Window.
  return ArrayBuffer.isView(value)&&Object.prototype.toString.call(value)==='[object Float32Array]';
}
function replace(shader,anchor,text){
  if(shader.split(anchor).length!==2)throw new Error('SDF pilot shader boundary changed: '+anchor);
  return shader.replace(anchor,text);
}

function ellipseUniforms(input){
  if(!input)return [];
  return (Array.isArray(input)?input:[input]).map(item=>{
    const uniform=item?.uLiSdfEllipse||item;
    let value=uniform?.value;
    if(!value&&item?.centre&&(item.ellipse||item.clipEllipse)){
      const [x,y]=item.centre,[z,w]=item.ellipse||item.clipEllipse;
      value={x,y,z,w,toArray(a=[],o=0){a[o]=x;a[o+1]=y;a[o+2]=z;a[o+3]=w;return a;}};
    }
    if(!value||![value.x,value.y,value.z,value.w].every(Number.isFinite)||value.z<=0||value.w<=0)throw new Error('Invalid pilot ellipse uniform');
    return uniform?.value?uniform:{value};
  });
}

function clipShader(shader,uniforms,inside=true,exclusions=[]){
  const own=inside?uniforms[0]:null;
  if(inside)shader.uniforms.uLiSdfEllipse=own;
  else shader.uniforms.uLiSdfEllipses={value:uniforms.map(u=>u.value)};
  if(exclusions.length)shader.uniforms.uLiSdfExclusions={value:exclusions.map(u=>u.value)};
  shader.vertexShader=replace(shader.vertexShader,'#include <common>','#include <common>\nvarying vec3 vLiSdfWorld;');
  shader.vertexShader=replace(shader.vertexShader,'#include <project_vertex>',`#include <project_vertex>
    vLiSdfWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);
  const declarations='\nvarying vec3 vLiSdfWorld;\n'+(inside?'uniform vec4 uLiSdfEllipse;':`uniform vec4 uLiSdfEllipses[${uniforms.length}];`)
    +(exclusions.length?`\nuniform vec4 uLiSdfExclusions[${exclusions.length}];`:'');
  shader.fragmentShader=replace(shader.fragmentShader,'#include <common>','#include <common>'+declarations);
  const test=inside?`vec2 liSdfClip=(vLiSdfWorld.xz-uLiSdfEllipse.xy)/uLiSdfEllipse.zw;
    if(dot(liSdfClip,liSdfClip)>1.)discard;`:
    `for(int liClip=0;liClip<${uniforms.length};liClip++){
      vec4 e=uLiSdfEllipses[liClip];vec2 q=(vLiSdfWorld.xz-e.xy)/e.zw;if(dot(q,q)<=1.)discard;
    }`;
  const excluded=exclusions.length?`\nfor(int liExclude=0;liExclude<${exclusions.length};liExclude++){
    vec4 e=uLiSdfExclusions[liExclude];vec2 q=(vLiSdfWorld.xz-e.xy)/e.zw;if(dot(q,q)<=1.)discard;
  }`:'';
  shader.fragmentShader=replace(shader.fragmentShader,'#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+test+excluded);
}

/** Mutate one main/depth/distance material to keep inside/outside the pilot. */
export function applyPilotClip(material,{uniform,clipUniforms,inside=true,exclusions=[]}={}){
  const ellipses=ellipseUniforms(uniform||clipUniforms),excluded=ellipseUniforms(exclusions);
  if(!material||inside&&ellipses.length!==1)throw new Error('Inside clipping needs exactly one pilot ellipse');
  if(!ellipses.length)return material;
  if(material.userData?.liSdfClipApplied)throw new Error('Pilot clipping was already applied to this material');
  const baseCompile=material.onBeforeCompile,baseKey=material.customProgramCacheKey?.call(material)||material.type;
  material.onBeforeCompile=function(shader,renderer){baseCompile?.call(this,shader,renderer);clipShader(shader,ellipses,inside,excluded);};
  material.customProgramCacheKey=()=>baseKey+'-'+REVISION+'-ellipse-'+(inside?'inside':'outside')+'-'+ellipses.length+'-exclude-'+excluded.length;
  material.userData.liSdfClipApplied={inside,ellipses:ellipses.length,exclusions:excluded.length};return material;
}

function materialWithClip(source,uniform,microNormalStrength){
  const clone=source.clone(),baseCompile=source.onBeforeCompile,baseKey=source.customProgramCacheKey?.call(source)||source.type;
  // Material.clone() does not preserve callback customizations.  Keep the
  // caller's generated-field albedo, AO and fine rock shading explicitly.
  clone.onBeforeCompile=function(shader,renderer){
    baseCompile?.call(source,shader,renderer);
    const anchor='normal=normalize(normal-liGradient);';
    if(shader.fragmentShader.includes('liGradient')){
      shader.fragmentShader=replace(shader.fragmentShader,anchor,`normal=normalize(normal-liGradient*${microNormalStrength.toFixed(5)});`);
    }
  };
  clone.customProgramCacheKey=()=>baseKey+'-'+REVISION+'-micro-'+microNormalStrength;
  clone.name=(source.name||'Li River rock')+' / SDF pilot';
  clone.userData.liSdfMicroNormalStrength=microNormalStrength;
  return applyPilotClip(clone,{uniform,inside:true});
}

/**
 * field is a node-sampled signed field (negative inside), x varies fastest:
 *   field[x+n*(y+n*z)], p=origin+[x,y,z]*size/(n-1).
 * metadata.spacing and sampleOffset can explicitly describe centre-sampled
 * volumes; sampleOffset is in world metres, not voxel indices.
 */
export function createSdfPilot({THREE,field,metadata,material,colors,colorMetadata}={}){
  if(!THREE?.BufferGeometry||!THREE?.Mesh||!THREE?.Vector4)throw new Error('Pass the caller Three module');
  if(!isFloat32(field))throw new Error('SDF field must be Float32Array');
  const bakedColors=colors!==undefined&&colors!==null;
  // Three's GPU attribute uploader uses local typed-array constructors.
  // Re-wrap a foreign-window buffer without copying or changing its bytes.
  if(colors&&isFloat32(colors)&&!(colors instanceof Float32Array))colors=new Float32Array(colors.buffer,colors.byteOffset,colors.length);
  if(!bakedColors&&!material?.clone)throw new Error('Pass the caller terrain material for PBR mode');
  if(bakedColors&&(!isFloat32(colors)||!THREE.MeshBasicMaterial))throw new Error('Native surface colors must be Float32Array');
  let colorMin=Infinity,colorMax=-Infinity;
  if(bakedColors)for(let i=0;i<colors.length;i++){
    const c=colors[i];if(!Number.isFinite(c)||c<0)throw new Error('Invalid native HDR surface color at '+i);
    if(c<colorMin)colorMin=c;if(c>colorMax)colorMax=c;
  }
  const started=performance.now(),n=Number(metadata?.resolution),cells=n-1;
  if(!Number.isInteger(n)||n<3||n>512||field.length!==n*n*n)throw new Error('SDF dimensions disagree');
  const origin=finiteArray(metadata.origin,3,'volume origin');
  const size=typeof metadata.size==='number'?[metadata.size,metadata.size,metadata.size]:finiteArray(metadata.size,3,'volume size');
  if(!size.every(x=>Number.isFinite(x)&&x>0))throw new Error('Invalid volume size');
  const spacing=metadata.spacing===undefined?size.map(x=>x/cells):(typeof metadata.spacing==='number'?[metadata.spacing,metadata.spacing,metadata.spacing]:finiteArray(metadata.spacing,3,'volume spacing'));
  if(!spacing.every(x=>Number.isFinite(x)&&x>0))throw new Error('Invalid volume spacing');
  const offset=metadata.sampleOffset===undefined?[0,0,0]:finiteArray(metadata.sampleOffset,3,'sample offset');
  const centre=finiteArray(metadata.centre,2,'pilot centre'),ellipse=finiteArray(metadata.clipEllipse,2,'pilot ellipse');
  if(!ellipse.every(x=>x>0))throw new Error('Pilot ellipse axes must be positive');
  const iso=Number(metadata.isovalue??0);if(!Number.isFinite(iso))throw new Error('Invalid isovalue');
  const microNormalStrength=Number(metadata.microNormalStrength??.25);
  if(!Number.isFinite(microNormalStrength)||microNormalStrength<0||microNormalStrength>4)throw new Error('Invalid micro normal strength');
  const n2=n*n,caseField=new Uint8Array(cells*cells*cells);
  let minField=Infinity,maxField=-Infinity;
  for(let q=0;q<field.length;q++){
    const f=field[q];if(!Number.isFinite(f))throw new Error('Nonfinite SDF sample at '+q);
    if(f<minField)minField=f;if(f>maxField)maxField=f;
  }
  let rawTriangles=0,activeCells=0,ci=0;
  for(let z=0;z<cells;z++)for(let y=0;y<cells;y++)for(let x=0;x<cells;x++,ci++){
    const q=x+n*(y+n*z);
    const c=(field[q]<iso?1:0)|(field[q+1]<iso?2:0)|(field[q+1+n]<iso?4:0)|(field[q+n]<iso?8:0)|
      (field[q+n2]<iso?16:0)|(field[q+1+n2]<iso?32:0)|(field[q+1+n+n2]<iso?64:0)|(field[q+n+n2]<iso?128:0);
    caseField[ci]=c;rawTriangles+=TRI_COUNTS[c];if(c!==0&&c!==255)activeCells++;
  }
  const maxTriangles=Number(metadata.maxTriangles??3000000);
  if(rawTriangles>maxTriangles)throw new Error('Pilot triangle budget exceeded: '+rawTriangles+' > '+maxTriangles);
  // Count unique sign-changing lattice edges, so output buffers have exact
  // capacity instead of reserving a worst-case triangle soup.
  let expectedVertices=0;
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const q=x+n*(y+n*z),inside=field[q]<iso;
    if(x<cells&&inside!==(field[q+1]<iso))expectedVertices++;
    if(y<cells&&inside!==(field[q+n]<iso))expectedVertices++;
    if(z<cells&&inside!==(field[q+n2]<iso))expectedVertices++;
  }
  if(bakedColors&&colors.length!==expectedVertices*3)throw new Error('Native RGB vertex count disagrees: '+colors.length+' / '+expectedVertices*3);
  const positions=new Float32Array(expectedVertices*3),normals=new Float32Array(expectedVertices*3),indices=new Uint32Array(rawTriangles*3);
  let x0=new Int32Array(n2).fill(-1),x1=new Int32Array(n2).fill(-1),y0=new Int32Array(n2).fill(-1),y1=new Int32Array(n2).fill(-1);
  const ze=new Int32Array(n2).fill(-1),edgeIndices=new Int32Array(12),cornerOffsets=CORNERS.map(c=>c[0]+n*(c[1]+n*c[2]));
  let vertexCount=0,indexCount=0,windingFlips=0,discardedDegenerate=0;
  function gradient(q,x,y,z){
    const xl=x>0?1:0,xr=x<cells?1:0,yl=y>0?1:0,yr=y<cells?1:0,zl=z>0?1:0,zr=z<cells?1:0;
    return [(field[q+xr]-field[q-xl])/((xl+xr)*spacing[0]),
      (field[q+yr*n]-field[q-yl*n])/((yl+yr)*spacing[1]),
      (field[q+zr*n2]-field[q-zl*n2])/((zl+zr)*spacing[2])];
  }
  function vertex(edge,q,x,y,z){
    let cache,key=x+n*y;
    if(edge===0)cache=x0;
    else if(edge===1){cache=y0;key++;}
    else if(edge===2){cache=x0;key+=n;}
    else if(edge===3)cache=y0;
    else if(edge===4)cache=x1;
    else if(edge===5){cache=y1;key++;}
    else if(edge===6){cache=x1;key+=n;}
    else if(edge===7)cache=y1;
    else {cache=ze;if(edge===9)key++;else if(edge===10)key+=n+1;else if(edge===11)key+=n;}
    if(cache[key]!==-1)return cache[key];
    const [ca,cb]=EDGE_CORNERS[edge],a=CORNERS[ca],b=CORNERS[cb],qa=q+cornerOffsets[ca],qb=q+cornerOffsets[cb];
    const va=field[qa]-iso,vb=field[qb]-iso,t=Math.max(0,Math.min(1,va/(va-vb)));
    const index=vertexCount++,p=index*3;
    positions[p]=origin[0]+offset[0]+(x+a[0]+(b[0]-a[0])*t)*spacing[0];
    positions[p+1]=origin[1]+offset[1]+(y+a[1]+(b[1]-a[1])*t)*spacing[1];
    positions[p+2]=origin[2]+offset[2]+(z+a[2]+(b[2]-a[2])*t)*spacing[2];
    const ga=gradient(qa,x+a[0],y+a[1],z+a[2]),gb=gradient(qb,x+b[0],y+b[1],z+b[2]);
    let nx=ga[0]+(gb[0]-ga[0])*t,ny=ga[1]+(gb[1]-ga[1])*t,nz=ga[2]+(gb[2]-ga[2])*t;
    let length=Math.hypot(nx,ny,nz);
    if(length<1e-12){const direction=vb>va?1:-1;nx=(b[0]-a[0])*direction;ny=(b[1]-a[1])*direction;nz=(b[2]-a[2])*direction;length=Math.hypot(nx,ny,nz);}
    normals[p]=nx/length;normals[p+1]=ny/length;normals[p+2]=nz/length;
    cache[key]=index;return index;
  }
  const areaEpsilon=Math.pow(Math.min(...spacing),4)*1e-16;
  ci=0;
  for(let z=0;z<cells;z++){
    x1.fill(-1);y1.fill(-1);ze.fill(-1);
    for(let y=0;y<cells;y++)for(let x=0;x<cells;x++,ci++){
      const c=caseField[ci],bits=edgeTable[c];if(bits===0)continue;
      const q=x+n*(y+n*z);
      for(let e=0;e<12;e++)if(bits&(1<<e))edgeIndices[e]=vertex(e,q,x,y,z);
      const table=c*16;
      for(let i=0;i<16&&triTable[table+i]!==-1;i+=3){
        const a=edgeIndices[triTable[table+i]],b=edgeIndices[triTable[table+i+1]],cc=edgeIndices[triTable[table+i+2]],pa=a*3,pb=b*3,pc=cc*3;
        const ux=positions[pb]-positions[pa],uy=positions[pb+1]-positions[pa+1],uz=positions[pb+2]-positions[pa+2];
        const vx=positions[pc]-positions[pa],vy=positions[pc+1]-positions[pa+1],vz=positions[pc+2]-positions[pa+2];
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
        if(nx*nx+ny*ny+nz*nz<=areaEpsilon){discardedDegenerate++;continue;}
        const orientation=nx*(normals[pa]+normals[pb]+normals[pc])+ny*(normals[pa+1]+normals[pb+1]+normals[pc+1])+nz*(normals[pa+2]+normals[pb+2]+normals[pc+2]);
        indices[indexCount++]=a;
        if(orientation<0){indices[indexCount++]=cc;indices[indexCount++]=b;windingFlips++;}
        else {indices[indexCount++]=b;indices[indexCount++]=cc;}
      }
    }
    [x0,x1]=[x1,x0];[y0,y1]=[y1,y0];
  }
  if(vertexCount!==expectedVertices)throw new Error('SDF edge-cache accounting mismatch: '+vertexCount+' / '+expectedVertices);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  if(bakedColors)geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.setIndex(new THREE.BufferAttribute(indexCount===indices.length?indices:indices.slice(0,indexCount),1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const clipUniforms={uLiSdfEllipse:{value:new THREE.Vector4(centre[0],centre[1],ellipse[0],ellipse[1])}};
  let ownedMaterial;
  if(bakedColors){
    // The native shader already supplied linear HDR lighting at these exact
    // vertices.  Basic material preserves it without applying PBR or a second
    // procedural rock normal.  Renderer tone mapping and scene fog remain live.
    ownedMaterial=colorMetadata?.materialOnly?new THREE.MeshStandardMaterial({vertexColors:true,roughness:.89,metalness:0,side:THREE.DoubleSide}):new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
    ownedMaterial.name='Native code-generated surface lighting / SDF pilot';
    if(colorMetadata?.materialOnly){ownedMaterial.color.setScalar(Math.PI);applyLiveLimestone(ownedMaterial,{THREE,centre});}
    applyPilotClip(ownedMaterial,{clipUniforms,inside:true});
  }else ownedMaterial=materialWithClip(material,clipUniforms.uLiSdfEllipse,microNormalStrength);
  const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  const distanceMaterial=new THREE.MeshDistanceMaterial();
  for(const [m,label]of [[depthMaterial,'depth'],[distanceMaterial,'distance']]){
    m.customProgramCacheKey=()=>REVISION+'-ellipse-'+label;
    applyPilotClip(m,{clipUniforms,inside:true});
  }
  const mesh=new THREE.Mesh(geometry,ownedMaterial);mesh.name='Li River / native signed rock surface pilot';
  mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=depthMaterial;mesh.customDistanceMaterial=distanceMaterial;
  const group=new THREE.Group();group.name='Independent runtime-generated rock SDF pilot';group.add(mesh);
  const stats={revision:REVISION,experimental:true,artAccepted:false,externalAssets:0,resolution:n,origin,size,spacing,voxelCount:field.length,
    fieldRange:[minField,maxField],activeCells,vertices:vertexCount,triangles:indexCount/3,rawTriangles,discardedDegenerate,windingFlips,microNormalStrength:bakedColors?0:microNormalStrength,
    shadingMode:bakedColors?'native-surface-vertex-colors':'procedural-pbr',
    vertexColorRange:bakedColors&&colors.length?[colorMin,colorMax]:null,
    verticesColorSHAmetadata:bakedColors&&colorMetadata?{...colorMetadata}:null,
    vertexColorSHA256:bakedColors?(colorMetadata?.colorsSHA256||colorMetadata?.sha256||null):null,
    vertexColorPositionsSHA256:bakedColors?(colorMetadata?.positionsSHA||colorMetadata?.positionsSHA256||null):null,
    sourceSurfaceRef:bakedColors?(colorMetadata?.sourceSurfaceRef||null):null,
    colorValidation:bakedColors?'Float32 brand, exact RGB count and finite nonnegative HDR values; positions/hash provenance is verified by the native bake caller':null,
    meshBytes:positions.byteLength+normals.byteLength+geometry.index.array.byteLength+(bakedColors?colors.byteLength:0),
    workingArrayBytes:field.byteLength+caseField.byteLength+5*n2*4+positions.byteLength+normals.byteLength+indices.byteLength+(bakedColors?colors.byteLength:0),
    milliseconds:performance.now()-started,bounds:vertexCount?{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}:null,
    signConvention:'negative inside, positive outside; interpolated scalar-field gradient points outwards',
    clipping:{centre,ellipse,keep:'inside radius 1; matching old heightfield must be discarded inside this ellipse'},
  };
  // Drop the local scalar-volume reference after extraction.  The returned
  // lifecycle closures own only geometry/materials; callers can release each
  // volume before generating the next peak.  The caller's array is not mutated.
  field=null;x0=x1=y0=y1=null;
  let disposed=false;
  return {group,mesh,stats,clipUniforms,clipSpec:stats.clipping,
    description:'A raster isosurface of the actual code-generated signed terrain field. It replaces the old terrain inside the pilot ellipse without additional vertex displacement. '+(bakedColors?'Main shading uses native linear HDR vertex colors, without PBR normal or lighting.':'Main shading uses the caller terrain PBR material for comparison.'),
    getStats:()=>({...stats,disposed}),
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();geometry.dispose();ownedMaterial.dispose();depthMaterial.dispose();distanceMaterial.dispose();},
  };
}

/**
 * Construct a parent-window mesh from buffers already verified by the caller's
 * SHA transfer chain.  This performs no MC extraction and no lighting bake.
 * Views are rewrapped in this realm without copying or changing their bytes.
 */
export function createBakedSdfMesh({THREE,meshData,metadata,colorMetadata,exclusions=[]}={}){
  if(!THREE?.BufferGeometry||!THREE?.MeshBasicMaterial)throw new Error('Pass the caller Three module');
  const started=performance.now();
  function floats(input,label){
    if(!isFloat32(input))throw new Error(label+' must be Float32Array');
    return new Float32Array(input.buffer,input.byteOffset,input.length);
  }
  const positions=floats(meshData?.positions,'positions'),normals=floats(meshData?.normals,'normals'),colors=floats(meshData?.colors,'colors');
  const originalIndices=meshData?.indices,brand=Object.prototype.toString.call(originalIndices);
  if(!ArrayBuffer.isView(originalIndices)||!['[object Uint32Array]','[object Uint16Array]'].includes(brand))throw new Error('indices must be Uint16Array or Uint32Array');
  const IndexType=brand==='[object Uint32Array]'?Uint32Array:Uint16Array,indices=new IndexType(originalIndices.buffer,originalIndices.byteOffset,originalIndices.length);
  if(positions.length%3||normals.length!==positions.length||colors.length!==positions.length||indices.length%3)throw new Error('Baked mesh buffer counts disagree');
  const vertices=positions.length/3;
  let minColor=Infinity,maxColor=-Infinity;
  for(let i=0;i<positions.length;i++){
    if(!Number.isFinite(positions[i])||!Number.isFinite(normals[i])||!Number.isFinite(colors[i])||colors[i]<0)throw new Error('Nonfinite geometry or invalid HDR color at '+i);
    minColor=Math.min(minColor,colors[i]);maxColor=Math.max(maxColor,colors[i]);
  }
  for(let i=0;i<indices.length;i++)if(indices[i]>=vertices)throw new Error('Baked triangle index out of range');
  const expectedSHA=metadata?.positionsSHA||metadata?.positionsSHA256,colorsPositionSHA=colorMetadata?.positionsSHA||colorMetadata?.positionsSHA256;
  if(expectedSHA&&colorsPositionSHA&&expectedSHA!==colorsPositionSHA)throw new Error('Baked surface colors refer to different positions');
  const centre=finiteArray(metadata?.centre,2,'pilot centre'),ellipse=finiteArray(metadata?.clipEllipse,2,'pilot ellipse');
  if(!ellipse.every(x=>x>0))throw new Error('Pilot ellipse axes must be positive');
  const clipUniforms={uLiSdfEllipse:{value:new THREE.Vector4(centre[0],centre[1],ellipse[0],ellipse[1])}};
  const geometry=new THREE.BufferGeometry();
  for(const [name,array]of [['position',positions],['normal',normals],['color',colors]])geometry.setAttribute(name,new THREE.BufferAttribute(array,3));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=colorMetadata?.materialOnly?new THREE.MeshStandardMaterial({vertexColors:true,roughness:.89,metalness:0,side:THREE.DoubleSide}):new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});material.name=colorMetadata?.materialOnly?'Native generated material / live raster lighting':'Native generated surface lighting / transferred SDF mesh';
  // The source base-color convention omits Lambert's 1/pi normalization.
  // Calibrate it once for Three's physical diffuse model; forest remains in
  // its existing linear material convention.
  if(colorMetadata?.materialOnly)material.color.setScalar(Math.PI);
  if(colorMetadata?.materialOnly)applyLiveLimestone(material,{THREE,centre});
  applyPilotClip(material,{clipUniforms,inside:true,exclusions});
  const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),distanceMaterial=new THREE.MeshDistanceMaterial();
  applyPilotClip(depthMaterial,{clipUniforms,inside:true,exclusions});applyPilotClip(distanceMaterial,{clipUniforms,inside:true,exclusions});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Native SDF surface / verified buffer transfer';mesh.castShadow=mesh.receiveShadow=true;
  mesh.customDepthMaterial=depthMaterial;mesh.customDistanceMaterial=distanceMaterial;
  const group=new THREE.Group();group.name='Native SDF surface with generated vertex lighting';group.add(mesh);
  const excluded=ellipseUniforms(exclusions),clipSpec={centre,ellipse,keep:'inside own ellipse, excluding all prior ellipses',exclusions:excluded.map(u=>[u.value.x,u.value.y,u.value.z,u.value.w])};
  const stats={revision:REVISION,experimental:true,artAccepted:false,externalAssets:0,construction:'verified-buffer-views; no MC or lighting rebake',
    shadingMode:colorMetadata?.materialOnly?'source-material-with-live-limestone-pbr':'native-surface-vertex-colors',
    geologyRevision:colorMetadata?.materialOnly?ROCK_MATERIAL_REVISION:null,geometryRefinement:'none; source signed-field geometry unchanged',vertices,triangles:indices.length/3,exclusions:excluded.length,
    vertexColorRange:colors.length?[minColor,maxColor]:null,verticesColorSHAmetadata:colorMetadata?{...colorMetadata}:null,
    vertexColorSHA256:colorMetadata?.colorsSHA256||colorMetadata?.sha256||null,vertexColorPositionsSHA256:colorsPositionSHA||expectedSHA||null,
    sourceSurfaceRef:colorMetadata?.sourceSurfaceRef||null,meshBytes:positions.byteLength+normals.byteLength+colors.byteLength+indices.byteLength,
    transferredBufferHashes:metadata?.meshDataHashes||metadata?.bufferHashes||null,
    validation:'Float32/unsigned-index brands, counts, finite geometry, nonnegative HDR, valid indices; byte SHA verification belongs to the transfer caller',
    milliseconds:performance.now()-started,bounds:vertices?{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}:null,clipping:clipSpec};
  let disposed=false;
  return {group,mesh,stats,clipUniforms,clipSpec,materials:[material],getStats:()=>({...stats,disposed}),
    description:'Native code-generated SDF geometry and lighting transferred as verified typed buffers. Existing terrain is removed under the union; overlap priority follows exclusion order.',
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();geometry.dispose();material.dispose();depthMaterial.dispose();distanceMaterial.dispose();},
  };
}
