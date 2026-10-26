// Experimental raster terrain built from the native scene's generated fields.
// No image/model assets and no alternative analytic mountain generator are used.
// Actual visual quality and frame time must be verified before product use.

import { applyGroundDetail } from './raster-ground-detail.js';

const REVISION='native-field-raster-terrain-5-living-floor';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

function field(value,fallbackResolution,name){
  const data=value?.data||value;
  if(!ArrayBuffer.isView(data)||data instanceof DataView)throw new Error(name+' must be a typed array or {data,width,height,channels}');
  const explicit=value?.width||value?.resolution;
  let width=explicit||fallbackResolution;
  let channels=value?.channels;
  if(!width){
    channels=channels||(name==='height'?1:4);
    width=Math.sqrt(data.length/channels);
  }
  let height=value?.height||width;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2)throw new Error('Invalid '+name+' resolution');
  if(!channels){
    channels=data.length/(width*height);
    // V/A maps can have a different resolution from the height map.
    if(![1,2,3,4].includes(channels)&&!explicit){width=Math.sqrt(data.length/4);height=width;channels=4;}
  }
  if(!Number.isInteger(width)||!Number.isInteger(height)||![1,2,3,4].includes(channels)||data.length!==width*height*channels)throw new Error(name+' data dimensions disagree');
  const scale=data instanceof Uint8Array||data instanceof Uint8ClampedArray?1/255:1;
  return {data,width,height,channels,scale};
}

function rectangle(value){
  if(!Array.isArray(value)&&!ArrayBuffer.isView(value))throw new Error('rect must be [x,z,size] or [x,z,width,height]');
  const [x,z,width,fourth]=value;
  const height=fourth>1?fourth:width;
  if(![x,z,width,height].every(Number.isFinite)||width<=0||height<=0)throw new Error('Invalid terrain rectangle');
  return {x,z,width,height};
}

function sample(f,r,x,z,channel=0){
  // Native fields are sampled at texel centres.  Preserve that half-texel
  // convention rather than shifting the source mountains by half a grid cell.
  const u=clamp((x-r.x)/r.width*f.width-.5,0,f.width-1);
  const v=clamp((z-r.z)/r.height*f.height-.5,0,f.height-1);
  const x0=Math.floor(u),z0=Math.floor(v),x1=Math.min(x0+1,f.width-1),z1=Math.min(z0+1,f.height-1);
  const tx=u-x0,tz=v-z0,c=Math.min(channel,f.channels-1),a=f.data;
  const at=(i,j)=>a[(j*f.width+i)*f.channels+c]*f.scale;
  return mix(mix(at(x0,z0),at(x1,z0),tx),mix(at(x0,z1),at(x1,z1),tx),tz);
}

function hash3(x,y,z){
  let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
function noise3(x,y,z){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const a=x-ix,b=y-iy,c=z-iz,u=a*a*(3-2*a),v=b*b*(3-2*b),w=c*c*(3-2*c);
  return mix(mix(mix(hash3(ix,iy,iz),hash3(ix+1,iy,iz),u),mix(hash3(ix,iy+1,iz),hash3(ix+1,iy+1,iz),u),v),mix(mix(hash3(ix,iy,iz+1),hash3(ix+1,iy,iz+1),u),mix(hash3(ix,iy+1,iz+1),hash3(ix+1,iy+1,iz+1),u),v),w)*2-1;
}

const MATERIAL_GLSL=/* glsl */`
uniform sampler2D uLiVegetation,uLiAttributes;
uniform vec4 uLiFieldRect;
varying vec3 vLiWorld,vLiSlopeNormal;
vec3 liHash33(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float liHash(vec3 p){vec3 h=liHash33(p);return h.x;}
float liNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(liHash(i),liHash(i+vec3(1,0,0)),f.x),mix(liHash(i+vec3(0,1,0)),liHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(liHash(i+vec3(0,0,1)),liHash(i+vec3(1,0,1)),f.x),mix(liHash(i+vec3(0,1,1)),liHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float liFractal(vec3 p){return .57*liNoise(p)+.29*liNoise(p*2.03+13.7)+.14*liNoise(p*4.11-9.1);}
vec2 liUV(){return clamp((vLiWorld.xz-uLiFieldRect.xy)*uLiFieldRect.zw,vec2(0.),vec2(1.));}
// Analytic value-noise derivatives reuse exactly the same eight corner hashes.
// Normal detail therefore never differentiates a derivative-filtered height,
// which otherwise exposes the rasterizer's 2x2 derivative quads on steep walls.
vec4 liNoiseGradient(vec3 p){
  vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
  float a=liHash(i),b=liHash(i+vec3(1,0,0)),c=liHash(i+vec3(0,1,0)),d=liHash(i+vec3(1,1,0));
  float e=liHash(i+vec3(0,0,1)),ff=liHash(i+vec3(1,0,1)),g=liHash(i+vec3(0,1,1)),h=liHash(i+vec3(1,1,1));
  float low=mix(mix(a,b,u.x),mix(c,d,u.x),u.y),high=mix(mix(e,ff,u.x),mix(g,h,u.x),u.y);
  vec3 gradient=vec3(mix(mix(b-a,d-c,u.y),mix(ff-e,h-g,u.y),u.z)*du.x,
    mix(mix(c-a,d-b,u.x),mix(g-e,h-ff,u.x),u.z)*du.y,(high-low)*du.z);
  return vec4(mix(low,high,u.z),gradient);
}
float liSmoothDerivative(float lo,float hi,float v){
  float t=clamp((v-lo)/(hi-lo),0.,1.);return 6.*t*(1.-t)/(hi-lo);
}
vec3 liStoneGradient(vec3 p,float footprint){
  const vec3 frequency=vec3(.19,.075,.19);
  vec4 g0=liNoiseGradient(p*frequency),g1=liNoiseGradient(p*frequency*2.03+13.7),g2=liNoiseGradient(p*frequency*4.11-9.1);
  float w0=1.-smoothstep(.35,.85,footprint*.19),w1=1.-smoothstep(.35,.85,footprint*.19*2.03),w2=1.-smoothstep(.35,.85,footprint*.19*4.11);
  vec3 gradient=.90*frequency*(.57*g0.yzw*w0+.29*2.03*g1.yzw*w1+.14*4.11*g2.yzw*w2);
  vec4 flute=liNoiseGradient(vec3(p.x*.23+p.y*.035,p.y*.022,p.z*.23-p.y*.029));
  float fluteAA=clamp(footprint*.075,.008,.25);
  float fluteD=liSmoothDerivative(.075-fluteAA,.28+fluteAA,abs(flute.x-.43))*sign(flute.x-.43);
  vec3 fluteGradient=vec3(.23*flute.y,.035*flute.y+.022*flute.z-.029*flute.w,.23*flute.w);
  gradient+=.38*fluteD*fluteGradient*(1.-smoothstep(.32,.80,footprint*.23));
  vec4 shear=liNoiseGradient(vec3(p.x*.36+p.y*.17,p.y*.24-p.z*.09,p.z*.31-p.y*.13));
  float shearAA=clamp(footprint*.10,.006,.26);
  float shearD=liSmoothDerivative(.035-shearAA,.17+shearAA,abs(shear.x-.47))*sign(shear.x-.47);
  vec3 shearGradient=vec3(.36*shear.y,.17*shear.y+.24*shear.z-.13*shear.w,-.09*shear.z+.31*shear.w);
  gradient+=.22*shearD*shearGradient*(1.-smoothstep(.30,.75,footprint*.36));
  vec4 fine=liNoiseGradient(p*2.8);
  gradient+=.045*2.8*fine.yzw*(1.-smoothstep(.15,.65,footprint*2.8));
  return gradient;
}
`;

function texture(THREE,f){
  // Field arrays originate from procedural generation; these are runtime data
  // textures, never fetched image files or pre-authored surface maps.
  let data=f.data,channels=f.channels;
  if(channels!==4){
    const out=new Float32Array(f.width*f.height*4);
    for(let i=0;i<f.width*f.height;i++)for(let c=0;c<4;c++)out[i*4+c]=c<channels?data[i*channels+c]*f.scale:(c===3?1:0);
    data=out;channels=4;
  }else if(data instanceof Uint8ClampedArray){data=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);}
  else if(!(data instanceof Float32Array)&&!(data instanceof Uint8Array)){data=Float32Array.from(data,x=>x*f.scale);}
  const type=data instanceof Uint8Array?THREE.UnsignedByteType:THREE.FloatType;
  const t=new THREE.DataTexture(data,f.width,f.height,THREE.RGBAFormat,type);
  t.name='Li River generated field';t.minFilter=t.magFilter=THREE.LinearFilter;
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.generateMipmaps=false;t.flipY=false;t.needsUpdate=true;
  if(THREE.NoColorSpace!==undefined)t.colorSpace=THREE.NoColorSpace;
  return t;
}

function patch(shader,anchor,replacement){
  if(shader.split(anchor).length!==2)throw new Error('Raster limestone shader boundary changed: '+anchor);
  return shader.replace(anchor,replacement);
}

function material(THREE,vegetation,attributes,r){
  const vTex=texture(THREE,vegetation),aTex=texture(THREE,attributes);
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.92,metalness:0});
  m.name='Procedural weathered freshwater limestone and alluvium';
  m.onBeforeCompile=s=>{
    s.uniforms.uLiVegetation={value:vTex};s.uniforms.uLiAttributes={value:aTex};
    s.uniforms.uLiFieldRect={value:new THREE.Vector4(r.x,r.z,1/r.width,1/r.height)};
    s.vertexShader=patch(s.vertexShader,'#include <common>','#include <common>\nvarying vec3 vLiWorld,vLiSlopeNormal;');
    s.vertexShader=patch(s.vertexShader,'#include <worldpos_vertex>',`#include <worldpos_vertex>
      vLiWorld=(modelMatrix*vec4(transformed,1.)).xyz;
      vLiSlopeNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    s.fragmentShader=patch(s.fragmentShader,'#include <common>','#include <common>\n'+MATERIAL_GLSL);
    s.fragmentShader=patch(s.fragmentShader,'#include <color_fragment>',/* glsl */`#include <color_fragment>
      vec3 wp=vLiWorld;vec4 liVM=texture2D(uLiVegetation,liUV());vec4 liAM=texture2D(uLiAttributes,liUV());
      float liCover=clamp(liVM.r,0.,1.),liDrain=clamp(liAM.a,0.,1.);
      vec3 liTerrainN=normalize(vLiSlopeNormal);
      float liSlope=1.-liTerrainN.y;
      float liMacro=liFractal(wp*vec3(.021,.014,.021));
      float liCrag=liFractal(wp*vec3(.14,.055,.14));
      // Irregular joints and vertical solution channels use different warped
      // domains.  No repeated horizontal mortar courses or height-only bands.
      vec3 jointP=vec3(wp.x*.075+wp.y*.028,wp.y*.049-wp.z*.017,wp.z*.071-wp.y*.019);
      jointP+=vec3(liNoise(wp*.027),liNoise(wp*.031+7.),liNoise(wp*.023+19.))*1.5;
      float liJoint=1.-smoothstep(.055,.23,abs(liNoise(jointP)-.49));
      liJoint*=smoothstep(.25,.69,liNoise(wp*vec3(.027,.093,.027)+31.));
      float liFlute=liNoise(vec3(wp.x*.11+wp.y*.013,wp.y*.016,wp.z*.11-wp.y*.021));
      // One additional low-frequency field supplies broad, unequal solution
      // channels.  Its long vertical axis continues across mountain waists;
      // the existing macro field breaks it into ledges and hanging thickets.
      // These patches cross contours and never use a mountain-height cutoff.
      float liBroadFlute=liNoise(vec3(wp.x*.027+wp.y*.0027,wp.y*.0037,wp.z*.027-wp.y*.0031));
      float liHollow=1.-smoothstep(-2.7,.8,liAM.g);
      float liDampAspect=.5+.5*dot(liTerrainN.xz,normalize(vec2(-.55,.83)));
      float liHumidity=clamp(.25+.27*liHollow+.31*liDrain+.17*liDampAspect,0.,1.);
      float liSolution=(1.-smoothstep(.29,.53,liBroadFlute))*smoothstep(.28,.56,liMacro+.12*liHollow);
      float liHanging=liSolution*smoothstep(.20,.63,liSlope)*(.55+.39*liHumidity);
      liCover=max(liCover,liHanging*(.85+.15*smoothstep(.28,.65,liFlute)));
      vec3 limestone=mix(vec3(.285,.302,.271),vec3(.515,.526,.461),clamp(.18+.82*liCrag,0.,1.));
      limestone*=.86+.25*liMacro;limestone*=1.-.30*liJoint;
      limestone*=mix(.72,1.07,liFlute)*mix(.87,1.05,smoothstep(.22,.67,liBroadFlute));
      float liWet=clamp(.48*liDrain+.24*liSolution*liHumidity+.37*(1.-smoothstep(.1,2.8,wp.y)),0.,1.);
      limestone*=mix(1.,.67,liWet);
      float liPlantDetail=liNoise(wp*vec3(.63,.49,.63));
      vec3 green=mix(vec3(.020,.052,.019),vec3(.073,.133,.041),clamp(.10+.73*liCrag+.23*liPlantDetail,0.,1.));
      green*=(.82+.29*liMacro)*mix(1.,.78,liHanging);
      vec3 wall=mix(limestone,green,clamp(liCover+(liPlantDetail-.5)*.12,0.,1.));
      vec3 sediment=mix(vec3(.108,.120,.080),vec3(.212,.224,.165),liMacro);
      sediment*=mix(1.,.56,1.-smoothstep(-.7,2.1,wp.y));
      vec3 meadow=mix(vec3(.034,.062,.023),vec3(.070,.103,.039),liCrag);
      vec3 plain=mix(sediment,meadow,liCover*.90);
      float liRockFace=smoothstep(.055,.24,liSlope);
      diffuseColor.rgb*=mix(plain,wall,liRockFace);
    `);
    s.fragmentShader=patch(s.fragmentShader,'#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor*=mix(1.,.79,liWet);`);
    s.fragmentShader=patch(s.fragmentShader,'#include <normal_fragment_maps>',/* glsl */`#include <normal_fragment_maps>
      float liFootprint=max(length(dFdx(vLiWorld)),length(dFdy(vLiWorld)));
      vec3 liWorldGradient=liStoneGradient(vLiWorld,liFootprint)*mix(.92,.26,liCover)*mix(.18,1.,liRockFace);
      vec3 liGradient=mat3(viewMatrix)*liWorldGradient;
      liGradient-=normal*dot(normal,liGradient);
      liGradient*=2.4;liGradient/=max(1.,length(liGradient)/1.4);
      normal=normalize(normal-liGradient);
    `);
    s.fragmentShader=patch(s.fragmentShader,'#include <aomap_fragment>',`#include <aomap_fragment>
      // Native horizon occlusion and rock cavities affect indirect light;
      // direct sun and real geometry shadows still carry the major form.
      float liAO=clamp(liAM.r,.24,1.)*(1.-.13*liJoint*liRockFace);
      reflectedLight.indirectDiffuse*=liAO;
      reflectedLight.indirectSpecular*=mix(.70,1.,liAO);`);
  };
  m.customProgramCacheKey=()=>REVISION;
  return {material:m,textures:[vTex,aTex]};
}

function cameraPoint(camera){return camera?.position||camera||{x:-50,y:16,z:650};}
function distance(tile,p){return Math.hypot(Math.max(tile.x-p.x,0,p.x-tile.x-tile.width),Math.max(tile.z-p.z,0,p.z-tile.z-tile.height));}
function levelAt(d,old=-1){
  if(old===0&&d<610)return 0;
  if(old===1&&d>445&&d<1350)return 1;
  return d<495?0:d<1200?1:2;
}

/**
 * height: Float32Array R or RGBA; vegetation/attributes: RGBA typed fields.
 * Each field can instead specify {data,width,height,channels}.  rect follows
 * native [x,z,size,1/size] or explicit [x,z,width,height].  Native readPixels
 * row order is retained (row zero is the low-z edge), without a Y flip.
 */
export function createRasterTerrain({THREE,height,vegetation,attributes,radiance,resolution,rect,camera}={}){
  if(!THREE?.BufferGeometry||!THREE?.MeshStandardMaterial)throw new Error('Pass the caller Three module');
  const started=performance.now(),r=rectangle(rect||[-2400,-2400,4800]);
  const H=field(height,resolution,'height');
  const V=field(vegetation,undefined,'vegetation'),A=field(attributes,undefined,'attributes');
  const sampleHeight=(x,z)=>sample(H,r,x,z);
  const epsilon=Math.max(r.width/H.width,.6);
  function normalAt(x,z){
    const nx=sampleHeight(x-epsilon,z)-sampleHeight(x+epsilon,z),nz=sampleHeight(x,z-epsilon)-sampleHeight(x,z+epsilon);
    const ny=2*epsilon,inverse=1/Math.hypot(nx,ny,nz);return [nx*inverse,ny*inverse,nz*inverse];
  }
  function displacedAt(x,z,horizontalStep=2){
    const h=sampleHeight(x,z),n=normalAt(x,z),cover=sample(V,r,x,z);
    const rock=smooth(.13,.58,1-n[1])*(1-smooth(.28,.76,cover))*smooth(1.,7.,h);
    // Filter by the actual noise-domain displacement between heightfield
    // samples.  A two-metre horizontal step can span tens of vertical metres
    // on a cliff, where an unfiltered 13m joint aliases into a checker pattern.
    const gx=-n[0]/Math.max(n[1],.025),gz=-n[2]/Math.max(n[1],.025);
    const grooveFootprint=horizontalStep*Math.max(Math.hypot(.055+.002*gx,.007*gx,-.003*gx),Math.hypot(.002*gz,.007*gz,.055-.003*gz));
    const jointFootprint=horizontalStep*Math.max(Math.hypot(.035+.053*gx,.075*gx,-.037*gx),Math.hypot(.053*gz,.075*gz-.014,.041-.037*gz));
    const grooveWeight=1-smooth(.22,.70,grooveFootprint),jointWeight=1-smooth(.22,.70,jointFootprint);
    const groove=noise3(x*.055+h*.002,h*.007,z*.055-h*.003);
    const joint=noise3(x*.035+h*.053,h*.075-z*.014,z*.041-h*.037);
    const displacement=rock*(groove*3.10*grooveWeight+joint*1.65*jointWeight);
    return [x+n[0]*displacement,h+n[1]*displacement,z+n[2]*displacement];
  }
  function displacedNormalAt(x,z){
    // Evaluate the same continuous displaced field on every tile boundary;
    // using separate triangle averages there would expose a lighting seam.
    const e=.60;
    const l=displacedAt(x-e,z),rr=displacedAt(x+e,z),d=displacedAt(x,z-e),u=displacedAt(x,z+e);
    const dx=[rr[0]-l[0],rr[1]-l[1],rr[2]-l[2]],dz=[u[0]-d[0],u[1]-d[1],u[2]-d[2]];
    const n=[dz[1]*dx[2]-dz[2]*dx[1],dz[2]*dx[0]-dz[0]*dx[2],dz[0]*dx[1]-dz[1]*dx[0]];
    const base=normalAt(x,z),sign=n[0]*base[0]+n[1]*base[1]+n[2]*base[2]<0?-1:1;
    const inv=sign/Math.max(1e-8,Math.hypot(...n));return n.map(v=>v*inv);
  }
  const group=new THREE.Group();group.name='Li River / paged native-field raster terrain candidate';
  const owned=material(THREE,V,A,r),tiles=[];let disposed=false,geometryBuilds=0,lodUpdates=0;
  if(radiance){
    const values=field(radiance,undefined,'native radiance');
    if(values.channels!==4)throw new Error('Native radiance requires RGBA linear values');
    // This is a runtime-generated lighting field of the same coded terrain,
    // not a photograph or authored texture. Rock self-shadow, AO and albedo
    // are evaluated once by the native shader; the displayed scene retains
    // live geometry, reflection, world air and camera movement.
    const map=texture(THREE,values),original=owned.material;
    const nativeMaterial=radiance.metadata?.materialOnly?new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94,metalness:0}):new THREE.MeshBasicMaterial({color:0xffffff});
    if(radiance.metadata?.materialOnly)nativeMaterial.color.setScalar(Math.PI);
    const uniforms={uNativeRadiance:{value:map},uNativeRadianceRect:{value:new THREE.Vector4(r.x,r.z,1/r.width,1/r.height)}};
    nativeMaterial.name='Native code-generated terrain surface radiance';
    nativeMaterial.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vNativeRadianceXZ;').replace('#include <project_vertex>','#include <project_vertex>\nvNativeRadianceXZ=(modelMatrix*vec4(transformed,1.)).xz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vNativeRadianceXZ;uniform sampler2D uNativeRadiance;uniform vec4 uNativeRadianceRect;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=texture2D(uNativeRadiance,(vNativeRadianceXZ-uNativeRadianceRect.xy)*uNativeRadianceRect.zw).rgb;');
    };
    nativeMaterial.customProgramCacheKey=()=>REVISION+'-native-radiance-field-1';
    if(radiance.metadata?.materialOnly)applyGroundDetail(nativeMaterial,{THREE,vegetation:owned.textures[0],attributes:owned.textures[1],rect:r});
    owned.material=nativeMaterial;owned.textures.push(map);original.dispose();
    owned.radiance=values;owned.radianceMetadata=radiance.metadata;owned.radianceMap=map;
  }
  // MC patches and paged H tiles approximate the same floodplain on different
  // grids. A shared, slightly lower H surface closes sub-pixel gaps at their
  // clipping boundaries without bringing height-field mountain walls back.
  let continuityMaterial=null;
  if(radiance?.metadata?.materialOnly){
    const sourceHook=owned.material.onBeforeCompile,sourceKey=owned.material.customProgramCacheKey.call(owned.material);
    continuityMaterial=owned.material.clone();continuityMaterial.name='Continuous alluvial substrate beneath rock-patch seams';
    continuityMaterial.onBeforeCompile=function(shader,renderer){
      sourceHook.call(this,shader,renderer);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y-=.28;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`if(vLiGroundWorld.y>24.||abs(normalize(vLiGroundNormal).y)<.90)discard;\n#include <alphamap_fragment>`);
    };
    continuityMaterial.customProgramCacheKey=()=>sourceKey+'|continuous-low-alluvium';
  }
  const grid=128,page=256;
  function geometry(tile,level){
    const step=1<<level,positions=[],indices=[],cache=new Map();
    function vertex(i,j){
      const key=j*(grid+1)+i,found=cache.get(key);if(found!==undefined)return found;
      const x=tile.x+i/grid*tile.width,z=tile.z+j/grid*tile.height;
      const interiorStep=Math.max(tile.width,tile.height)/grid*step;
      const edgeDistance=Math.min(i/grid*tile.width,(grid-i)/grid*tile.width,j/grid*tile.height,(grid-j)/grid*tile.height);
      // Shared perimeter samples always use the same 2m footprint, independent
      // of the neighbour's LOD.  Filtering changes smoothly inside coarse tiles.
      const horizontalStep=mix(2,interiorStep,smooth(0,Math.max(8,interiorStep*3),edgeDistance));
      const p=displacedAt(x,z,horizontalStep);
      const index=positions.length/3;cache.set(key,index);
      positions.push(...p);return index;
    }
    const tri=(a,b,c)=>{if(a!==b&&b!==c&&a!==c)indices.push(a,b,c);};
    for(let j=step;j<grid-step;j+=step)for(let i=step;i<grid-step;i+=step){
      const a=vertex(i,j),b=vertex(i+step,j),c=vertex(i,j+step),d=vertex(i+step,j+step);
      tri(a,c,b);tri(b,c,d);
    }
    // A fixed fine perimeter is shared by every adjacent tile at every LOD.
    // Zipper triangles connect it to the coarse interior, eliminating both
    // cracks and the exposed vertical skirts that cut steep mountain faces.
    const sides=[
      [i=>[i,0],i=>[i,step]],
      [i=>[grid,i],i=>[grid-step,i]],
      [i=>[grid-i,grid],i=>[grid-i,grid-step]],
      [i=>[0,grid-i],i=>[step,grid-i]],
    ];
    for(const [outerAt,innerAt]of sides){
      let oi=0,ii=step,outer=vertex(...outerAt(0)),inner=vertex(...innerAt(step));
      while(oi<grid||ii<grid-step){
        if(oi<grid&&(ii>=grid-step||oi+1<=ii+step)){
          const next=vertex(...outerAt(oi+1));tri(outer,inner,next);outer=next;oi++;
        }else{
          const next=vertex(...innerAt(ii+step));tri(outer,inner,next);inner=next;ii+=step;
        }
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setIndex(indices);g.computeVertexNormals();
    const normals=g.attributes.normal;
    for(const [key,index]of cache){
      const i=key%(grid+1),j=Math.floor(key/(grid+1));
      const x=tile.x+i/grid*tile.width,z=tile.z+j/grid*tile.height;
      if(positions[index*3+1]<80){
        // The low floodplain uses the same continuous H derivative at every
        // LOD. Coarse interior triangle normals previously made hard wedges.
        normals.setXYZ(index,...normalAt(x,z));
      }else if(i===0||i===grid||j===0||j===grid){
        normals.setXYZ(index,...displacedNormalAt(x,z));
      }
    }
    normals.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
    g.userData={revision:REVISION,lod:level,sampleStepMetres:tile.width/grid*step,fixedEdgeSamples:grid+1,normalMethod:'Actual displaced triangle mesh; shared continuous-field derivatives on tile edges'};
    geometryBuilds++;return g;
  }
  for(let z=r.z;z<r.z+r.height-1e-5;z+=page)for(let x=r.x;x<r.x+r.width-1e-5;x+=page){
    const tile={x,z,width:Math.min(page,r.x+r.width-x),height:Math.min(page,r.z+r.height-z),level:-1,mesh:null};
    tile.level=levelAt(distance(tile,cameraPoint(camera)));
    tile.mesh=new THREE.Mesh(geometry(tile,tile.level),owned.material);
    tile.mesh.name=`Native terrain tile ${tiles.length} / lod ${tile.level}`;
    tile.mesh.castShadow=true;tile.mesh.receiveShadow=true;tile.mesh.frustumCulled=true;
    group.add(tile.mesh);
    if(continuityMaterial){
      tile.substrate=new THREE.Mesh(tile.mesh.geometry,continuityMaterial);tile.substrate.name='Low alluvial continuity '+tiles.length;
      tile.substrate.castShadow=false;tile.substrate.receiveShadow=true;tile.substrate.renderOrder=1;group.add(tile.substrate);
    }
    tiles.push(tile);
  }
  const initialBuildMilliseconds=performance.now()-started;
  function getStats(){
    let vertices=0,triangles=0;const levels=[0,0,0];
    for(const t of tiles){vertices+=t.mesh.geometry.attributes.position.count;triangles+=t.mesh.geometry.index.count/3;levels[t.level]++;}
    return {revision:REVISION,experimental:true,artAccepted:false,externalAssets:0,tiles:tiles.length,levels,vertices,triangles,geometryBuilds,lodUpdates,initialBuildMilliseconds,heightResolution:[H.width,H.height],vegetationResolution:[V.width,V.height],attributeResolution:[A.width,A.height],radianceResolution:owned.radiance?[owned.radiance.width,owned.radiance.height]:null,shading:owned.radiance?'native-generated-radiance':'procedural-pbr',edgeMethod:'Fixed shared fine perimeter and triangulated transition ring',continuousLowland:!!continuityMaterial,sourceFieldRetained:true};
  }
  return {group,material:owned.material,revision:REVISION,sampleHeight,
    applyGroundDetail(target){return applyGroundDetail(target,{THREE,vegetation:owned.textures[0],attributes:owned.textures[1],rect:r,continuousLowland:false});},
    setRadiance(next){
      if(!owned.radianceMap)throw new Error('Terrain was not created with native radiance');
      const f=field(next,undefined,'native radiance');
      if(f.width!==owned.radiance.width||f.height!==owned.radiance.height||f.channels!==4)throw new Error('Updated native radiance dimensions changed');
      const a=f.data;
      owned.radianceMap.image.data=a instanceof Float32Array?a:new Float32Array(a.buffer,a.byteOffset,a.length);
      owned.radianceMap.needsUpdate=true;owned.radiance=f;owned.radianceMetadata=next.metadata;
    },
    sampleNormal(x,z,target){const n=normalAt(x,z);return target?.set?target.set(...n):n;},
    sampleVegetation(x,z){return [0,1,2,3].map(c=>sample(V,r,x,z,c));},
    sampleAttributes(x,z){return [0,1,2,3].map(c=>sample(A,r,x,z,c));},
    updateLOD(nextCamera=camera,{maxUpdates=1}={}){
      if(disposed)return {updated:0,disposed:true};const start=performance.now(),p=cameraPoint(nextCamera);
      const pending=tiles.map(t=>({tile:t,distance:distance(t,p)})).map(t=>({...t,next:levelAt(t.distance,t.tile.level)})).filter(t=>t.next!==t.tile.level).sort((a,b)=>a.distance-b.distance);
      let updated=0;
      for(const {tile,next}of pending.slice(0,Math.max(0,Math.floor(maxUpdates)))){
        const old=tile.mesh.geometry;tile.mesh.geometry=geometry(tile,next);if(tile.substrate)tile.substrate.geometry=tile.mesh.geometry;tile.level=next;tile.mesh.name=tile.mesh.name.replace(/lod \d+$/,'lod '+next);old.dispose();updated++;lodUpdates++;
      }
      return {updated,pending:pending.length-updated,milliseconds:performance.now()-start};
    },getStats,
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const tile of tiles)tile.mesh.geometry.dispose();owned.material.dispose();continuityMaterial?.dispose();for(const t of owned.textures)t.dispose();},
  };
}
