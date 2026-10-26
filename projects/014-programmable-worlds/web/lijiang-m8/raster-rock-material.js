// World-space freshwater limestone.  All fields are evaluated from code; no
// image, authored texture, model or frozen directional light is introduced.
// M3 receives structural flanks from lijiang_m3_landform; this material does
// not deform or replace that geometry. Unequal solution weathering follows
// a mostly vertical domain, while filtered mineral detail remains restrained.
export const ROCK_MATERIAL_REVISION='limestone-m4-supported-earth-and-moss-5';

const GLSL=/* glsl */`
varying vec3 vLiGeoWorld,vLiGeoWorldNormal;
uniform vec3 uLiGeoOrigin;
vec3 liGeoHash(vec3 p){
  p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);
  return fract((p.xxy+p.yxx)*p.zyx);
}
// Two complete 3D rotations.  Neither the bedding nor its independent joint
// set puts an interpolation lattice plane along a world-space cliff axis.
const mat3 liGeoR0=mat3(0.,.8,.6,-.8,.36,-.48,-.6,-.48,.64);
const mat3 liGeoR1=mat3(.70710678,.40824829,-.57735027,
  -.70710678,.40824829,-.57735027,0.,.81649658,.57735027);
// Gradient noise and its analytic derivative.  Unlike value noise, its
// derivative at a lattice vertex is the corner gradient, not zero in all
// three directions.  Strong anisotropic value-noise bump made a visible grid.
// Differentiating the analytic field also avoids 2x2 screen-derivative quads.
vec4 liGeoCorner(vec3 corner,vec3 relative){
  vec3 g=(liGeoHash(corner)*2.-1.)*1.15470054;
  return vec4(dot(g,relative),g);
}
vec4 liGeoField(vec3 p){
  vec3 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.);
  vec3 du=30.*f*f*(f-1.)*(f-1.);
  vec4 a=liGeoCorner(i,f),b=liGeoCorner(i+vec3(1,0,0),f-vec3(1,0,0));
  vec4 c=liGeoCorner(i+vec3(0,1,0),f-vec3(0,1,0));
  vec4 d=liGeoCorner(i+vec3(1,1,0),f-vec3(1,1,0));
  vec4 e=liGeoCorner(i+vec3(0,0,1),f-vec3(0,0,1));
  vec4 ff=liGeoCorner(i+vec3(1,0,1),f-vec3(1,0,1));
  vec4 g=liGeoCorner(i+vec3(0,1,1),f-vec3(0,1,1));
  vec4 h=liGeoCorner(i+vec3(1,1,1),f-vec3(1,1,1));
  vec4 x0=mix(a,b,u.x),x1=mix(c,d,u.x),x2=mix(e,ff,u.x),x3=mix(g,h,u.x);
  x0.y+=(b.x-a.x)*du.x;x1.y+=(d.x-c.x)*du.x;
  x2.y+=(ff.x-e.x)*du.x;x3.y+=(h.x-g.x)*du.x;
  vec4 y0=mix(x0,x1,u.y),y1=mix(x2,x3,u.y);
  y0.z+=(x1.x-x0.x)*du.y;y1.z+=(x3.x-x2.x)*du.y;
  vec4 value=mix(y0,y1,u.z);value.w+=(y1.x-y0.x)*du.z;
  return vec4(.5+value.x*.78,value.yzw*.78);
}
float liGeoSmoothSlope(float low,float high,float value){
  float t=clamp((value-low)/(high-low),0.,1.);
  return 6.*t*(1.-t)/(high-low);
}
// Sparse finite fracture planes, not an iso-contour of a smooth noise field.
// Each plane is an unequal bounded patch, so it makes a short broken line
// where it intersects the real cliff.  Independent random placement prevents
// a complete Voronoi/tile network and no shared six-metre grid is drawn.
// Return opening coverage and the analytic gradient of that same opening.
vec4 liGeoFiniteJoints(vec3 p,vec3 offset,float footprint){
  // These openings are only 3.5–9.5 cm wide. Once a pixel covers
  // 45 cm they are unresolved; do not evaluate 27 neighbour cells for a
  // nearly invisible residual. Larger structural clefts remain real mesh.
  float resolved=1.-smoothstep(.14,.45,footprint);
  if(resolved<=.001)return vec4(0.);
  const float cellSize=14.;
  vec3 cell=floor(p/cellSize),local=p-cell*cellSize;
  vec4 best=vec4(0.);
  for(int iz=-1;iz<=1;iz++)for(int iy=-1;iy<=1;iy++)for(int ix=-1;ix<=1;ix++){
    vec3 neighbour=vec3(float(ix),float(iy),float(iz));
    vec3 h=liGeoHash(cell+neighbour+offset+vec3(19.1,7.4,31.6));
    if(h.x>.34)continue;
    vec3 variation=liGeoHash(cell+neighbour+offset+73.9);
    vec3 centre=cellSize*(neighbour+vec3(.12)+.76*variation);
    vec3 q=local-centre;
    if(dot(q,q)>135.)continue;
    vec3 planeNormal=mix(vec3(.82,.11,.56),vec3(-.54,-.14,.83),step(.5,h.y));
    if(h.z>.86)planeNormal=vec3(.30,.88,.36);
    planeNormal=normalize(planeNormal+(variation-.5)*.28);
    vec3 tangent=normalize(cross(vec3(0.,1.,0.),planeNormal));
    vec3 across=cross(planeNormal,tangent);
    float a=dot(q,tangent),b=dot(q,across),distance=dot(q,planeNormal);
    float halfA=mix(2.1,4.6,h.y),halfB=mix(3.2,8.4,h.z);
    if(abs(a)>halfA||abs(b)>halfB)continue;
    float gateA=1.-smoothstep(halfA*.64,halfA,abs(a));
    float gateB=1.-smoothstep(halfB*.68,halfB,abs(b));
    float width=mix(.035,.095,variation.z),aa=max(.012,footprint*.48);
    float inner=width*.24,outer=width+aa;
    float slit=1.-smoothstep(inner,outer,abs(distance));
    float coverage=width/(width+aa)*resolved;
    float opening=slit*gateA*gateB*coverage;
    if(opening>best.x){
      vec3 slitGradient=-liGeoSmoothSlope(inner,outer,abs(distance))*sign(distance)*planeNormal;
      vec3 gateAGradient=-liGeoSmoothSlope(halfA*.64,halfA,abs(a))*sign(a)*tangent;
      vec3 gateBGradient=-liGeoSmoothSlope(halfB*.68,halfB,abs(b))*sign(b)*across;
      vec3 gradient=(slitGradient*gateA*gateB+slit*(gateAGradient*gateB+gateA*gateBGradient))*coverage;
      best=vec4(opening,gradient);
    }
  }
  return best;
}
`;

function insert(shader,stage,anchor,value){
  if(shader[stage].split(anchor).length!==2)throw new Error('Live limestone shader boundary changed: '+anchor);
  shader[stage]=shader[stage].replace(anchor,value);
}

/** Add only to a live-lit materialOnly rock mesh, never to baked HDR shade. */
export function applyLiveLimestone(material,{THREE,centre=[0,0]}={}){
  if(!material?.isMeshStandardMaterial||!THREE?.Vector3)throw new Error('Live limestone needs a StandardMaterial and Three');
  if(material.userData.liLiveLimestone)return material;
  const priorCompile=material.onBeforeCompile,priorKey=material.customProgramCacheKey?.call(material)||material.type;
  const origin={value:new THREE.Vector3(centre[0],0,centre[1])};
  material.onBeforeCompile=function(shader,renderer){
    priorCompile?.call(this,shader,renderer);
    shader.uniforms.uLiGeoOrigin=origin;
    insert(shader,'vertexShader','#include <common>','#include <common>\nvarying vec3 vLiGeoWorld,vLiGeoWorldNormal;');
    insert(shader,'vertexShader','#include <project_vertex>',`#include <project_vertex>
      vLiGeoWorld=(modelMatrix*vec4(transformed,1.)).xyz;
      vLiGeoWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    insert(shader,'fragmentShader','#include <common>','#include <common>\n'+GLSL);
    insert(shader,'fragmentShader','#include <color_fragment>',/* glsl */`#include <color_fragment>
      vec3 liGP=vLiGeoWorld;
      float liGFootprint=max(length(dFdx(liGP)),length(dFdy(liGP)));
      vec3 liGN=normalize(vLiGeoWorldNormal);
      float liGLuma=max(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)),.001);
      // The original generated colour still selects actual living pockets.
      // Warm bare rock is not interpreted as moss merely because it is dark.
      float liGChroma=(diffuseColor.g-max(diffuseColor.r*.985,diffuseColor.b*1.06))/max(liGLuma,.012);
      // The CPU material contract uses G=1.045*R for bare stone and
      // an additional .055 green residual for full plant cover. The small
      // cavity factor is about .955. Decode once; do not slope-gate again.
      float liGCover=clamp((diffuseColor.g-1.045*diffuseColor.r)/.0525,0.,1.);
      float liGFace=smoothstep(.12,.58,1.-abs(liGN.y));
      float liGBare=(1.-liGCover)*mix(.24,1.,liGFace);
      vec3 liGOffset=uLiGeoOrigin*vec3(.031,.0,.037);
      vec4 liGMacro=liGeoField((liGeoR1*liGP)*.018+liGOffset+17.3);
      // A restrained geological bedding field.  All axes participate in the
      // rotated domain; the former dominant y*.165 term made six-metre ribs.
      const vec3 liGBedFrequency=vec3(.073,.014,.061);
      const mat3 liGFlowRotation=mat3(.923,.030,.383, -.028,.999,-.014, -.383,.002,.923);
      vec3 liGBedP=(liGFlowRotation*liGP)*liGBedFrequency+liGOffset+5.7;
      vec4 liGBed=liGeoField(liGBedP);
      vec3 liGBedGrad=(liGBed.yzw*liGBedFrequency)*liGFlowRotation;
      // Source SDF geometry carries the major cliff clefts.  Material adds
      // only sparse finite small fractures; never outline a noise isosurface.
      vec4 liGFissure=liGeoFiniteJoints(liGP,liGOffset,liGFootprint);
      float liGJoint=liGFissure.x;
      float liGWet=clamp(.49*liGJoint+.29*(1.-liGMacro.x)
        +.62*(1.-smoothstep(.2,4.8,liGP.y)),0.,1.);
      float liGLithology=smoothstep(.32,.68,.61*liGMacro.x+.39*liGBed.x);
      vec3 liGStone=mix(vec3(.118,.134,.129),vec3(.310,.322,.291),liGLithology);
      float liGSolutionStain=(1.-smoothstep(.40,.61,liGBed.x))*smoothstep(.27,.62,liGMacro.x);
      liGStone*=1.-.52*liGSolutionStain*liGFace;
      liGStone*=.95+.10*liGBed.x;
      liGStone=mix(liGStone,vec3(.090,.118,.108),liGWet*.36);
      liGStone*=1.-.39*liGJoint;
      // Unequal dry weathering follows broad rock structure; it is colour
      // variation rather than high-frequency black speckle or extra fog.
      float liGDrySkin=smoothstep(.37,.69,liGMacro.x+.16*liGBed.x)*(1.-liGWet);
      liGStone*=mix(vec3(.96,1.,1.015),vec3(1.055,1.,.925),liGDrySkin);
      // A small amount of source variation preserves source cavity placement;
      // it no longer paints the whole cliff with its frozen ochre smear.
      float liGSourceCavity=clamp(sqrt(liGLuma/.15),.70,1.07);
      liGStone*=mix(1.,liGSourceCavity,.30);
      // M4 keeps the plant cover from the generated surface material.
      // Actual SDF normals decide soil support: shoulders/ledges can carry
      // dark shrubs and forest floor, while sheer planes retain bare stone.
      // No absolute-height green cap and no uniform green vertical slab.
      // This layer is damp rock / soil / moss under real separate foliage.
      // Keep the generated vertex mask continuous. A hard occupancy threshold
      // amplified normal-interpolation triangles into angular green paint.
      vec4 liGSoil=vec4(.5,0.,0.,0.);
      if(liGCover>.01)liGSoil=liGeoField((liGeoR0*liGP)*.38+liGOffset+47.1);
      float liGSoilFilter=1.-smoothstep(1.6,4.5,liGFootprint);
      float liGMoss=clamp(liGCover*(.94+.09*(liGSoil.x-.5)*liGSoilFilter),0.,1.);
      vec3 liGEarth=mix(vec3(.034,.033,.022),vec3(.067,.064,.037),liGMacro.x);
      vec3 liGMossTone=mix(vec3(.027,.047,.022),vec3(.048,.079,.034),
        clamp(.28*liGBed.x+.35*liGMacro.x+.37*liGSoil.x,0.,1.));
      vec3 liGSupportedGround=mix(liGEarth,liGMossTone,.28+.36*liGSoil.x);
      diffuseColor.rgb=mix(liGStone,liGSupportedGround,liGMoss);
      liGBare=mix(.60,1.,liGFace)*(1.-liGMoss*.86);
      // Filtered soil grains add only physical surface roughness. They do not
      // create leaves, roots or canopy volume, and use no screen-space dither.
      vec3 liGSoilGradient=(liGSoil.yzw*.38)*liGeoR0;
      liGSoilGradient*=.15*(1.-smoothstep(.55,2.2,liGFootprint));
      float liGSoilGrainFilter=1.-smoothstep(.16,.62,liGFootprint);
      if(liGSoilGrainFilter>.001&&liGMoss>.001){
        vec4 liGSoilGrain=liGeoField((liGeoR1*liGP)*1.72+liGOffset+81.7);
        liGSoilGradient+=.030*((liGSoilGrain.yzw*1.72)*liGeoR1)*liGSoilGrainFilter;
        diffuseColor.rgb*=1.+liGMoss*(liGSoilGrain.x-.5)*.06*liGSoilGrainFilter;
      }
      vec3 liGHeightGradient=-.028*liGFissure.yzw;
      // Broken sub-1.5m facets and finer mineral roughness use distinct
      // rotated octaves.  Their normal response carries texture, with only a
      // very small albedo modulation so shaded rock never becomes noisy salt.
      if(liGFootprint<1.2){
        vec4 liGCrag=liGeoField((liGeoR1*liGP)*.72+liGOffset+27.8);
        float liGCragFilter=1.-smoothstep(.22,.86,liGFootprint*.72);
        vec3 liGCragGradient=(liGCrag.yzw*.72)*liGeoR1;
        liGHeightGradient+=.046*liGCragGradient*liGCragFilter;
        diffuseColor.rgb*=1.+(liGCrag.x-.5)*.050*liGCragFilter*liGBare;
      }
      if(liGFootprint<.46){
        vec4 liGGrain=liGeoField((liGeoR0*liGP)*1.85+liGOffset+37.4);
        float liGFine=1.-smoothstep(.18,.86,liGFootprint*1.85);
        liGHeightGradient+=.012*((liGGrain.yzw*1.85)*liGeoR0)*liGFine;
        diffuseColor.rgb*=1.+(liGGrain.x-.5)*.025*liGFine*liGBare;
      }
    `);
    insert(shader,'fragmentShader','#include <roughnessmap_fragment>',/* glsl */`#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,mix(.95,.84,liGWet),liGBare);
      roughnessFactor=mix(roughnessFactor,.97,liGMoss);
    `);
    insert(shader,'fragmentShader','#include <normal_fragment_maps>',/* glsl */`#include <normal_fragment_maps>
      float liGFlatLow=(1.-smoothstep(.08,.30,1.-abs(liGN.y)))*(1.-smoothstep(30.,100.,liGP.y));
      vec3 liGViewGradient=mat3(viewMatrix)*(liGHeightGradient*liGBare*1.55*(1.-liGFlatLow)
        +liGSoilGradient*liGMoss);
      liGViewGradient-=normal*dot(normal,liGViewGradient);
      liGViewGradient/=max(1.,length(liGViewGradient)/.66);
      normal=normalize(normal-liGViewGradient);
    `);
    insert(shader,'fragmentShader','#include <aomap_fragment>',/* glsl */`#include <aomap_fragment>
      reflectedLight.indirectDiffuse*=1.-liGBare*.10*liGJoint;
    `);
  };
  material.customProgramCacheKey=()=>priorKey+'|'+ROCK_MATERIAL_REVISION;
  material.userData.liLiveLimestone={revision:ROCK_MATERIAL_REVISION,externalAssets:0,geometryUnchanged:true,
    material:'M4 continuous supported damp-earth/moss base with filtered soil roughness, finite geological joints and exposed sheer faces; leaves and woodland crowns are separate real geometry',
    light:'Physical raster lighting; no source directional HDR tail',artAccepted:false};
  material.needsUpdate=true;
  return material;
}
