import * as THREE from 'three';
import { setupEnvironment as setupPrevious } from './scene-space-03-environment.js';

// Material-only revision. The scene-space-03 geometry, existing stone scans,
// bookshop, roof treatment and all lighting remain owned by earlier layers.
const HOUSES=[{x:-11,width:5.6,eaves:5.1},{x:-3,width:5.8,eaves:6},{x:4.8,width:5.6,eaves:4.8}];
export const DOOR_PANELS=Object.freeze(HOUSES.flatMap(house=>[
  {x:house.x,z:16.395,halfWidth:.325,minY:1.04,maxY:2.55,halfDepth:.028},
  {x:house.x+.45,z:21.305,halfWidth:.29,minY:1.035,maxY:2.48,halfDepth:.028},
]));
export const WINDOW_BACKDROPS=Object.freeze(HOUSES.flatMap(house=>{
  const upper=house.eaves-.99,upperHeight=Math.min(1.3,(house.eaves-.85)*.30),windows=[];
  for(const offset of [-house.width*.265,house.width*.265]){
    windows.push({axis:'z',plane:16.615,u:house.x+offset,y:upper,w:.86,h:upperHeight});
    windows.push({axis:'z',plane:16.615,u:house.x+offset,y:1.9,w:.78,h:1.02});
    windows.push({axis:'z',plane:21.085,u:house.x+offset,y:upper,w:.78,h:1.10});
  }
  for(const side of [-1,1])for(const y of [1.95,upper]){
    windows.push({axis:'x',plane:house.x+side*(house.width/2-.265),u:18.85,y,w:.9,h:1.07});
  }
  return windows;
}));

export function isDoorPanel(point) {
  return DOOR_PANELS.some(rect=>Math.abs(point.x-rect.x)<=rect.halfWidth&&
    Math.abs(point.z-rect.z)<=rect.halfDepth&&point.y>=rect.minY&&point.y<=rect.maxY);
}

function geometryState(model) {
  const parts=[];
  model.traverse(part=>{if(part.isMesh&&!part.isReflector)parts.push({part,geometry:part.geometry,
    position:part.geometry.attributes.position,index:part.geometry.index,uv:part.geometry.attributes.uv});});
  return parts;
}

function worldVarying(shader) {
  shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nvarying vec3 vSpace04World;');
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\nvSpace04World=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
    '#include <common>\nvarying vec3 vSpace04World;');
}

export function createPaneMaterial(source,environment) {
  const material=new THREE.MeshPhysicalMaterial({
    name:'Space 04 / thin neutral window panes',
    // The former blue vertex albedo described an opaque painted slab. Thin
    // glazing uses a neutral tint, the real closed reveal and a sky reflection.
    color:new THREE.Color(.28,.31,.31),vertexColors:false,
    roughness:.105,metalness:0,ior:1.48,
    transparent:true,opacity:.46,depthWrite:false,side:source.side,
    clearcoat:.32,clearcoatRoughness:.12,
    // Explicitly bind the existing PMREM: with envMap=null, Three r180 uses
    // scene.environmentIntensity and ignores material.envMapIntensity.
    envMap:environment??null,envMapIntensity:.85,dithering:true,
  });
  material.forceSinglePass=true;
  material.onBeforeCompile=shader=>{
    worldVarying(shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      float paneWaver=sin(vSpace04World.y*18.+vSpace04World.x*1.7+vSpace04World.z*.6)*.0018;
      normal=normalize(normal+vec3(paneWaver,paneWaver*.3,0.));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float paneFacing=clamp(abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.);
      diffuseColor.a*=.72+.60*pow(1.-paneFacing,3.);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'space04-neutral-thin-window-01';
  return material;
}

const RECESS_COMMON=`
uniform vec4 space04WindowRects[30];
uniform vec2 space04WindowPlanes[30];
float s04Hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float s04Noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(s04Hash(i),s04Hash(i+vec2(1.,0.)),f.x),
 mix(s04Hash(i+vec2(0.,1.)),s04Hash(i+vec2(1.)),f.x),f.y);}
`;

export function createRecessMaterial(source) {
  const material=new THREE.MeshStandardMaterial({
    name:'Space 04 / closed window backdrops and inset wooden door panels',
    color:new THREE.Color(.037,.039,.036),vertexColors:false,
    roughness:.76,metalness:0,side:source.side,dithering:true,
  });
  material.onBeforeCompile=shader=>{
    worldVarying(shader);
    shader.uniforms.space04WindowRects={value:WINDOW_BACKDROPS.map(rect=>new THREE.Vector4(rect.u,rect.y,rect.w,rect.h))};
    shader.uniforms.space04WindowPlanes={value:WINDOW_BACKDROPS.map(rect=>new THREE.Vector2(rect.axis==='x'?0:1,rect.plane))};
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+RECESS_COMMON);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float s04Front=step(16.367,vSpace04World.z)*step(vSpace04World.z,16.423);
      float s04Rear=step(21.277,vSpace04World.z)*step(vSpace04World.z,21.333);
      float s04DoorX=min(abs(vSpace04World.x+11.-s04Rear*.45),min(abs(vSpace04World.x+3.-s04Rear*.45),abs(vSpace04World.x-4.8-s04Rear*.45)));
      float s04Door=(1.-step(.325-.035*s04Rear,s04DoorX))*max(s04Front,s04Rear)
        *step(1.035,vSpace04World.y)*step(vSpace04World.y,2.55);
      float s04Grain=.955+.09*s04Noise(vec2(vSpace04World.x*74.,vSpace04World.y*2.4));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.17,.102,.054)*s04Grain,s04Door);
      // These are the existing 28cm-deep, opaque closure panels. Subtle linen
      // margins behind the transparent panes provide depth without new meshes,
      // fake rooms, emissive windows or new render passes.
      for(int i=0;i<30;i++){
        vec2 plane=space04WindowPlanes[i];vec4 rect=space04WindowRects[i];
        float depth=plane.x<.5?vSpace04World.x:vSpace04World.z;
        float along=plane.x<.5?vSpace04World.z:vSpace04World.x;
        vec2 windowUV=vec2((along-rect.x)/rect.z,(vSpace04World.y-rect.y)/rect.w)+.5;
        float inside=(1.-step(.012,abs(depth-plane.y)))*step(0.,windowUV.x)*step(windowUV.x,1.)
          *step(0.,windowUV.y)*step(windowUV.y,1.);
        float hem=.205+.018*sin(windowUV.y*6.5+float(i)*.7);
        float linen=(1.-smoothstep(hem-.035,hem+.035,windowUV.x))
          +smoothstep(.83,.89,windowUV.x);
        linen=clamp(linen,0.,1.)*smoothstep(.04,.12,windowUV.y);
        float folds=.86+.14*sin(windowUV.x*74.+float(i));
        vec3 backdrop=mix(vec3(.034,.039,.038),vec3(.20,.18,.145)*folds,linen);
        diffuseColor.rgb=mix(diffuseColor.rgb,backdrop,inside*(1.-s04Door));
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      roughnessFactor=mix(.86,.63+.06*(1.-s04Grain),s04Door);
    `);
  };
  material.customProgramCacheKey=()=> 'space04-closed-reveal-linen-door-01';
  return material;
}

export function enhancePlaster(source) {
  const material=source.clone(),compile=source.onBeforeCompile,key=source.customProgramCacheKey();
  material.name=source.name+' / space04 opposite microtexture';
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      float s04Wall=step(-14.1,vSpaceWorld.x)*step(vSpaceWorld.x,7.9)
        *step(16.05,vSpaceWorld.z)*step(vSpaceWorld.z,21.65)*step(vSpaceWorld.y,6.12);
      vec3 s04WorldNormal=normalize(cross(dFdx(vSpaceWorld),dFdy(vSpaceWorld)));
      vec2 s04WallUV=abs(s04WorldNormal.x)>abs(s04WorldNormal.z)?vSpaceWorld.zy:vSpaceWorld.xy;
      float s04Broad=spaceNoise(s04WallUV*.72);
      float s04Grain=spaceNoise(s04WallUV*32.0);
      float s04Relief=(s04Grain*.0014+spaceNoise(s04WallUV*8.5)*.0018)*s04Wall;
      vec3 s04Dx=dFdx(-vViewPosition),s04Dy=dFdy(-vViewPosition);
      vec3 s04Rx=cross(s04Dy,normal),s04Ry=cross(normal,s04Dx);
      float s04Det=dot(s04Dx,s04Rx);
      normal=normalize(abs(s04Det)*normal-sign(s04Det)*(dFdx(s04Relief)*s04Rx+dFdy(s04Relief)*s04Ry));
      diffuseColor.rgb*=mix(1.,(.91+.18*s04Broad)*(.975+.05*s04Grain),s04Wall);
      roughnessFactor=clamp(roughnessFactor+(s04Broad-.5)*.08*s04Wall,.73,.98);
    `);
  };
  material.customProgramCacheKey=()=>key+'/space04-opposite-microtexture-01';
  return material;
}

export async function setupEnvironment(renderer,scene,model,options={}) {
  const previous=await setupPrevious(renderer,scene,model,options);
  const frozen=geometryState(model),replacements=[],cache=new Map();
  const targetCounts={panes:0,recesses:0,plaster:0};
  model.traverse(part=>{
    if(!part.isMesh||part.isReflector)return;
    const original=part.material,list=Array.isArray(original)?original:[original];
    let changed=false;
    const next=list.map(source=>{
      const pane=source.name==='Space 03 / SPACE03_WindowPane';
      const recess=/^(?:ROAM01_PBR \/ )?SPACE03_WindowRecess$/.test(source.name);
      const plaster=/^Space 02 \/ ROAM01_PBR \/ plaster(?:_alt)?(?: \/|$)/.test(source.name);
      if(!pane&&!recess&&!plaster)return source;
      changed=true;
      if(!cache.has(source)){
        const kind=pane?'panes':recess?'recesses':'plaster';targetCounts[kind]++;
        cache.set(source,pane?createPaneMaterial(source,scene.environment):recess?createRecessMaterial(source):enhancePlaster(source));
      }
      return cache.get(source);
    });
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original});}
  });
  const geometryUnchanged=frozen.every(({part,geometry,position,index,uv})=>part.geometry===geometry&&
    part.geometry.attributes.position===position&&part.geometry.index===index&&part.geometry.attributes.uv===uv);
  if(!geometryUnchanged)throw new Error('Material-only SPACE04 layer unexpectedly changed geometry.');
  const metadata={...previous.metadata,version:'space-04-opposite-material-readability',
    targetCounts,geometryAndUVReferencesUnchanged:geometryUnchanged,addedMeshes:0,addedLights:0,
    newTextures:0,newReflectionPasses:0,transmissionPass:false,
    paneResponse:'Neutral thin alpha glazing; explicit reuse of the existing scene environment, Fresnel opacity and slight surface waviness.',
    recessResponse:'Closed original backboards with subtle linen margins; six inset door cores use non-emissive old-wood albedo.',
    preserved:'Existing bookshop, scanned paving, roof treatment, geometry, navigation and all light/exposure settings.',
    diagnosis:'GLB base colour factors are white and colour is in COLOR_0 once. Previous opaque blue pane albedo and scene-level reflection intensity caused painted-block appearance.',
  };
  scene.userData.space04Materials=metadata;
  let disposed=false;
  return {cameraOccluders:previous.cameraOccluders,metadata,
    update(time,state={}){previous.update(time,state);},
    dispose(){if(disposed)return;disposed=true;
      replacements.forEach(({part,original})=>{part.material=original;});
      cache.forEach(material=>material.dispose());
      if(scene.userData.space04Materials===metadata)delete scene.userData.space04Materials;
      previous.dispose();
    },
  };
}
