import * as THREE from 'three';

// Material-only SPACE10 layer. The imported GLB buffers and earlier surface
// treatments remain unchanged; old shared materials use strict spatial masks.
const OLD_HOUSES=[
  {id:'original-opposite-1',center:[-11,-18.85],footprint:[-13.8,-21.35,-8.2,-16.35],local_width:5.6,local_depth:5,base_z:.85,eaves_z:5.1,ridge_z:6.25,yaw_deg:0},
  {id:'original-opposite-2',center:[-3,-18.85],footprint:[-5.9,-21.35,-.1,-16.35],local_width:5.8,local_depth:5,base_z:.85,eaves_z:6,ridge_z:7.15,yaw_deg:0},
  {id:'original-opposite-3',center:[4.8,-18.85],footprint:[2,-21.35,7.6,-16.35],local_width:5.6,local_depth:5,base_z:.85,eaves_z:4.8,ridge_z:5.95,yaw_deg:0},
];

function oldWindows(house){
  const upper=house.eaves_z-.99,upperHeight=Math.min(1.3,(house.eaves_z-.85)*.30),result=[];
  for(const sign of [-1,1]){
    const x=house.center[0]+sign*house.local_width*.265;
    result.push({center:[x,-16.35,upper],width:.86,height:upperHeight,outward_xy:[0,1]},
      {center:[x,-16.35,1.9],width:.78,height:1.02,outward_xy:[0,1]},
      {center:[x,-21.35,upper],width:.78,height:1.10,outward_xy:[0,-1]});
    for(const height of [1.95,upper])result.push({center:[house.center[0]+sign*house.local_width/2,-18.85,height],
      width:.9,height:1.07,outward_xy:[sign,0]});
  }
  return result;
}

export function surfaceTarget(meshName='') {
  // GLTFLoader exposes the exported node name on Mesh.name; the JSON mesh
  // resource uses a different display name. Accept both exact export forms.
  const source=meshName.replace(/^ROAM01_Surface__/,'').replace(/^ROAM01_Mesh \/ /,'');
  if(/^SPACE10_Roof(?:Alt)?$/.test(source))return {kind:'roof',scope:'new'};
  if(/^SPACE10_(?:Plaster|PlasterAlt|WarmGreyPlaster|SoftOchrePlaster)$/.test(source))return {kind:'wall',scope:'new'};
  if(/^roof(?:_alt)?$/.test(source))return {kind:'roof',scope:'opposite'};
  if(/^plaster(?:_alt)?$/.test(source))return {kind:'wall',scope:'opposite'};
  return null;
}

export function surfaceRegions(neighbourhood={}) {
  const houses=neighbourhood.buildings?.houses;
  if(!Array.isArray(houses)||!houses.length)throw new Error('SPACE10 needs the explicit SPACE10 building manifest.');
  const convert=house=>({id:house.id,footprint:[...house.footprint],base:house.base_z,eaves:house.eaves_z,ridge:house.ridge_z,
    center:[...(house.center??[(house.footprint[0]+house.footprint[2])/2,(house.footprint[1]+house.footprint[3])/2])],
    width:house.local_width??house.footprint[2]-house.footprint[0],depth:house.local_depth??house.footprint[3]-house.footprint[1],
    yaw:(house.yaw_deg??0)*Math.PI/180,hipRun:house.roof?.hipRun??0,windows:house.windows??[]});
  return {new:houses.map(convert),opposite:OLD_HOUSES.map(house=>convert({...house,windows:oldWindows(house)}))};
}

// Independent callers can inspect the selection boundary without running a
// renderer; geometry normals and world height further narrow it in the shader.
export function regionAtWorldPoint(regions,point,kind) {
  const x=point.x,y=-point.z,height=point.y;
  return regions.find(region=>{
    const [left,bottom,right,top]=region.footprint,pad=kind==='roof'?.34:.035;
    return x>=left-pad&&x<=right+pad&&y>=bottom-pad&&y<=top+pad&&
      height>=(kind==='roof'?region.eaves-.28:region.base-.02)&&height<=region.ridge+.22;
  })??null;
}

const COMMON=`
varying vec3 vSpace10World;
varying vec3 vSpace10WorldNormal;
float s10Hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float s10Noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(s10Hash(i),s10Hash(i+vec2(1.,0.)),f.x),mix(s10Hash(i+vec2(0.,1.)),s10Hash(i+vec2(1.)),f.x),f.y);}
vec3 s10BumpNormal(vec3 n,float height){
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,n),ry=cross(n,dx);float det=dot(dx,rx);
  return normalize(abs(det)*n-sign(det)*(dFdx(height)*rx+dFdy(height)*ry));
}
float s10SillRun(vec3 p,vec3 n,vec4 opening,vec3 plane){
  float depth=plane.x<.5?p.x:p.z,along=plane.x<.5?p.z:p.x;
  float facing=plane.x<.5?n.x:n.z;
  float wall=(1.-smoothstep(.015,.055,abs(depth-plane.y)))*smoothstep(.65,.92,facing*plane.z);
  float drop=opening.y-p.y;
  float edge=min(abs(along-opening.x-opening.z*.42),abs(along-opening.x+opening.z*.42));
  float w=.065+.040*s10Noise(vec2(along*7.,p.y*2.8));
  return wall*(1.-smoothstep(w,w+.065,edge))*smoothstep(.015,.07,drop)
    *(1.-smoothstep(opening.w*.42,opening.w,drop));
}
`;

const number=value=>Number(value).toFixed(6);
function runoffFunction(regions){
  const bodies=regions.map((region,index)=>{
    const lines=region.windows.map((window,windowIndex)=>{
      const [x,y,z]=window.center,[nx,ny]=window.outward_xy,axis=Math.abs(nx)>.5?0:1;
      const along=axis===0?-y:x,plane=axis===0?x:-y,sign=axis===0?nx:-ny;
      const drop=.40+(windowIndex%3)*.085;
      return `r=max(r,s10SillRun(p,n,vec4(${[along,z-window.height/2-.12,window.width,drop].map(number).join(',')}),vec3(${[axis,plane,sign].map(number).join(',')})));`;
    }).join('\n');
    return `${index?'else ':''}if(house==${index}){${lines}}`;
  }).join('\n');
  return `float s10Runoff(vec3 p,vec3 n,int house){float r=0.;${bodies}\nreturn r;}\n`;
}

function selectionCode(kind,count){
  return `
    vec3 s10GeometryNormal=normalize(vSpace10WorldNormal);
    vec2 s10Plan=vec2(vSpace10World.x,-vSpace10World.z);
    int s10House=-1;float s10Mask=0.;vec2 s10Local=vec2(0.);vec4 s10Levels=vec4(0.);vec4 s10Shape=vec4(0.);
    for(int i=0;i<${count};i++){
      vec4 rect=s10Bounds[i],levels=s10Heights[i],shape=s10ShapeAndYaw[i];
      float pad=${kind==='roof'?'.34':'.035'};
      if(s10Plan.x>=rect.x-pad&&s10Plan.x<=rect.z+pad&&s10Plan.y>=rect.y-pad&&s10Plan.y<=rect.w+pad
        &&vSpace10World.y>=${kind==='roof'?'levels.y-.28':'levels.x-.02'}&&vSpace10World.y<=levels.z+.22){
        vec2 delta=s10Plan-(rect.xy+rect.zw)*.5;
        float c=cos(shape.z),s=sin(shape.z);
        s10Local=vec2(c*delta.x+s*delta.y,-s*delta.x+c*delta.y);
        s10House=i;s10Levels=levels;s10Shape=shape;
        s10Mask=${kind==='roof'?'smoothstep(.28,.60,s10GeometryNormal.y)':'1.-smoothstep(.22,.48,abs(s10GeometryNormal.y))'};
        break;
      }
    }
    vec3 s10BeforeScanNormal=normal;
  `;
}

const ROOF_RESPONSE=`
  if(s10Mask>0.){
    float c=cos(s10Shape.z),s=sin(s10Shape.z);
    vec2 worldPlanNormal=vec2(s10GeometryNormal.x,-s10GeometryNormal.z);
    vec2 localPlanNormal=vec2(c*worldPlanNormal.x+s*worldPlanNormal.y,-s*worldPlanNormal.x+c*worldPlanNormal.y);
    bool hipFace=s10Shape.w>.001&&abs(localPlanNormal.x)>abs(localPlanNormal.y);
    float run=hipFace?s10Shape.w:s10Shape.y*.5;
    float pitch=(s10Levels.z-s10Levels.y)/max(run,.1);
    vec2 metres=hipFace?vec2(s10Local.y,(abs(s10Local.x)-(s10Shape.x*.5-run))*sqrt(1.+pitch*pitch))
      :vec2(s10Local.x,abs(s10Local.y)*sqrt(1.+pitch*pitch));
    const vec2 tileSize=vec2(.30,.22);
    float row=floor(metres.y/tileSize.y);
    vec2 grid=vec2(metres.x/tileSize.x+mod(row,2.)*.5,metres.y/tileSize.y);
    vec2 cell=floor(grid),f=fract(grid),dist=min(f,1.-f)*tileSize;
    vec2 aa=max(fwidth(metres)*.65,vec2(.0008));
    float seamX=(1.-smoothstep(.0015-aa.x,.0045+aa.x,dist.x))*min(1.,.0045/max(aa.x,.0045));
    float seamY=(1.-smoothstep(.002-aa.y,.006+aa.y,dist.y))*min(1.,.006/max(aa.y,.006));
    float lod=1.-smoothstep(.07,.18,max(fwidth(metres.x),fwidth(metres.y)));
    float tileRandom=s10Hash(cell+float(s10House)*13.7);
    float flake=s10Noise(metres*8.5+vec2(2.3,8.1));
    float ridgeMask=smoothstep(.065,.15,abs(s10Local.y));
    float detailMask=s10Mask*ridgeMask;
    // Current roof_alt patches are nearly twice the main slate albedo. This
    // bounded tone curve retains their source variation once, without letting
    // large mesh tiles read as bright repairs across the entire roof.
    float sourceLuma=max(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)),.001);
    vec3 chroma=mix(vec3(.83,1.,1.055),diffuseColor.rgb/sourceLuma,.28);
    float compressedLuma=.061+min(sourceLuma,.14)*.075;
    vec3 slate=chroma*compressedLuma;
    slate*=mix(1.,.91+.18*tileRandom,lod)*(.975+.05*flake);
    slate*=1.-max(seamX*.27,seamY*.32)*lod*ridgeMask;
    diffuseColor.rgb=mix(diffuseColor.rgb,slate,s10Mask);
    roughnessFactor=mix(roughnessFactor,.69+.10*tileRandom+.025*(1.-flake),s10Mask);
    normal=normalize(mix(normal,s10BeforeScanNormal,s10Mask));
    float lap=smoothstep(.03,.17,f.y)*(1.-smoothstep(.83,.995,f.y));
    float relief=(lap*.0018-seamX*.00085+cos((f.x-.5)*3.141593)*.00035)*lod*detailMask;
    normal=s10BumpNormal(normal,relief);
  }
`;

const WALL_RESPONSE=`
  if(s10Mask>0.){
    vec2 wallUV=abs(s10GeometryNormal.x)>abs(s10GeometryNormal.z)?vSpace10World.zy:vSpace10World.xy;
    float c=cos(s10Shape.z),s=sin(s10Shape.z);
    vec2 nPlan=vec2(s10GeometryNormal.x,-s10GeometryNormal.z);
    vec2 localNormal=vec2(c*nPlan.x+s*nPlan.y,-s*nPlan.x+c*nPlan.y);
    float gable=step(abs(localNormal.y),abs(localNormal.x));
    float roofLine=s10Levels.y+(s10Levels.z-s10Levels.y)*max(0.,1.-abs(s10Local.y)/max(s10Shape.y*.5,.1));
    float wallHead=mix(s10Levels.y,roofLine,gable);
    float fine=s10Noise(wallUV*31.);
    float vertical=s10Noise(vec2(wallUV.x*5.2,wallUV.y*.85));
    float foot=(1.-smoothstep(s10Levels.x+.20,s10Levels.x+.80,vSpace10World.y))*(.40+.60*vertical);
    float eave=smoothstep(wallHead-.48,wallHead-.12,vSpace10World.y)
      *(1.-smoothstep(wallHead-.05,wallHead+.025,vSpace10World.y))*(.55+.45*vertical);
    float sill=s10Runoff(vSpace10World,s10GeometryNormal,s10House)*(.55+.45*vertical);
    // The inherited plaster scan is intentionally colour-neutral, but its
    // 5–95% albedo range is only .928–.973. Expand that measured detail around
    // the same .953506 median; divide out its old multiplier so the scan and
    // source vertex colour are each used once, with no global repaint.
    float priorScan=mix(.91,1.075,clamp(spaceScanLuma*1.6,0.,1.));
    float plasterDetail=clamp(.953506+(priorScan-.953506)*1.8,.89,1.035);
    diffuseColor.rgb*=mix(1.,plasterDetail/max(priorScan,.001),s10Mask);
    float aging=foot*.120+eave*.060+sill*.100;
    diffuseColor.rgb*=mix(vec3(1.),vec3(.96,.975,.925),foot*.35*s10Mask);
    diffuseColor.rgb*=1.-aging*s10Mask;
    diffuseColor.rgb*=1.+(fine-.5)*.026*s10Mask;
    roughnessFactor=clamp(roughnessFactor+(foot*.035+sill*.02)*s10Mask,.76,.98);
    float relief=(fine*.00035+s10Noise(wallUV*6.)*.00065)*s10Mask;
    normal=s10BumpNormal(normal,relief);
  }
`;

function makeMaterial(source,target,regions){
  const material=source.clone(),compile=source.onBeforeCompile,key=source.customProgramCacheKey.call(source);
  const uniforms={
    s10Bounds:{value:regions.map(region=>new THREE.Vector4(...region.footprint))},
    s10Heights:{value:regions.map(region=>new THREE.Vector4(region.base,region.eaves,region.ridge,0))},
    s10ShapeAndYaw:{value:regions.map(region=>new THREE.Vector4(region.width,region.depth,region.yaw,region.hipRun))},
  };
  material.name=`Space 10 surfaces / ${source.name}`;
  material.userData={...source.userData,space10Surface:{kind:target.kind,scope:target.scope}};
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec3 vSpace10World;
      varying vec3 vSpace10WorldNormal;
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>',`#include <defaultnormal_vertex>
      vSpace10WorldNormal=inverseTransformDirection(transformedNormal,viewMatrix);
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vSpace10World=(modelMatrix*vec4(transformed,1.)).xyz;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform vec4 s10Bounds[${regions.length}];
      uniform vec4 s10Heights[${regions.length}];
      uniform vec4 s10ShapeAndYaw[${regions.length}];
      ${COMMON}
      ${target.kind==='wall'?runoffFunction(regions):''}
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',
      selectionCode(target.kind,regions.length)+'\n#include <normal_fragment_maps>');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
      (target.kind==='roof'?ROOF_RESPONSE:WALL_RESPONSE)+'\n#include <lights_physical_fragment>');
  };
  material.customProgramCacheKey=()=>`${key}/space10-${target.scope}-${target.kind}-02/${regions.map(region=>region.id).join(',')}`;
  material.needsUpdate=true;return material;
}

export async function applySurfaces(renderer,scene,model,neighbourhood={}) {
  const regions=surfaceRegions(neighbourhood),replacements=[],materials=[],targets=[],cache=new Map();
  model.traverse(part=>{
    if(!part.isMesh||part.isReflector)return;
    const target=surfaceTarget(part.name);if(!target)return;
    const original=part.material,list=Array.isArray(original)?original:[original];
    const next=list.map(source=>{
      const identity=`${source.uuid}/${target.kind}/${target.scope}`;
      if(!cache.has(identity)){
        const material=makeMaterial(source,target,regions[target.scope]);cache.set(identity,material);materials.push(material);
      }
      return cache.get(identity);
    });
    part.material=Array.isArray(original)?next:next[0];
    replacements.push({part,original,installed:part.material});
    targets.push({mesh:part.name,...target,sourceMaterials:list.map(material=>material.name),
      installedMaterials:next.map(material=>material.name)});
  });
  const metadata={
    version:'space-10-metric-slate-and-local-plaster-aging',targets,changedMeshes:replacements.length,
    changedMaterials:materials.length,addedMeshes:0,addedTriangles:0,newTextures:0,newLights:0,
    roof:{tileWidthMetres:.30,exposedCourseMetres:.22,lapReliefMetres:.0018,
      materialMethod:'Roof albedo is compressed from its once-applied source vertex colour; independent small-tile variation and analytic slate joints replace the inherited wall-scan normal inside roof masks.',
      roughnessRange:[.69,.815],sourceRoofLumaRatioApprox:1.88,compressedRoofLumaRatioApprox:1.07},
    wall:{footAgingHeightMetres:.80,eaveBandMetres:.48,sillTrailMaxMetres:.57,
      maximumLocalFootDimming:.12,maximumEaveDimming:.06,maximumSillDimming:.10,
      scanDetailContrast:1.8,preservedMedianScanMultiplier:.953506,microReliefMaximumMetres:.001,
      textures:'Existing local worn-plaster scan and its UVs retained; no blanket wall tint or large stain field.'},
    regionBounds:{new:regions.new.map(({id,footprint,base,eaves,ridge})=>({id,footprint,base,eaves,ridge})),
      opposite:regions.opposite.map(({id,footprint,base,eaves,ridge})=>({id,footprint,base,eaves,ridge}))},
    assetReview:'lookdev-v4-roof-diffuse.png and roof_alt are sparse black-background UV atlases, not repeatable roof scans; deliberately not tiled over the neighbourhood.',
    preserved:'Bookshop, roads, vegetation, panes/curtains/lights, all source geometry/UV buffers, all source material objects, prior shader chains and shared texture ownership.',
  };
  const oldMetadata=scene.userData.space10Surfaces;scene.userData.space10Surfaces=metadata;
  let disposed=false;
  return {metadata,dispose(){
    if(disposed)return;disposed=true;
    for(const {part,original,installed}of replacements)if(part.material===installed)part.material=original;
    materials.forEach(material=>material.dispose());
    if(scene.userData.space10Surfaces===metadata){if(oldMetadata===undefined)delete scene.userData.space10Surfaces;else scene.userData.space10Surfaces=oldMetadata;}
  }};
}
