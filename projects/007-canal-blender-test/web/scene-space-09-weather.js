// Reversible rain-film and water response. Reuse the existing canal Reflector,
// its geometry, render target and textureMatrix; no extra reflection pass.
const WATER_FRAGMENT=`
uniform sampler2D tDiffuse;
uniform float time;
varying vec4 vReflectionUv;
varying vec3 vWaterPosition;
#include <common>
#include <fog_pars_fragment>
vec2 s09River(float x){
  vec2 r=vec2(41.,10.5);
  r=mix(r,vec2(35.,11.),smoothstep(-125.,-105.,x));
  r=mix(r,vec2(22.,11.),smoothstep(-105.,-85.,x));
  r=mix(r,vec2(6.,10.4),smoothstep(-85.,-65.,x));
  r=mix(r,vec2(-3.,9.2),smoothstep(-65.,-45.,x));
  r=mix(r,vec2(-6.15138,8.74812),smoothstep(-45.,-28.,x));
  r=mix(r,vec2(-10.,9.6),smoothstep(24.,42.,x));
  r=mix(r,vec2(-22.,10.5),smoothstep(42.,65.,x));
  r=mix(r,vec2(-27.,11.),smoothstep(65.,90.,x));
  r=mix(r,vec2(-36.,11.),smoothstep(90.,120.,x));
  return r;
}
void main(){
  vec2 river=s09River(vWaterPosition.x);
  float along=vWaterPosition.x,across=vWaterPosition.z+river.x;
  float longWave=sin(along*2.8+across*1.4+time*.22);
  float ripple=sin(across*21.+sin(along*4.2+time*.18)*1.1+time*.48);
  float fine=sin(across*37.-along*5.6-time*.32);
  vec2 uv=vReflectionUv.xy/vReflectionUv.w;
  vec2 warp=vec2((ripple*.70+longWave*.30)*.0009,(fine*.7+ripple*.3)*.0013);
  vec3 central=texture2D(tDiffuse,clamp(uv+warp,vec2(.001),vec2(.999))).rgb;
  vec3 blur=(texture2D(tDiffuse,clamp(uv+warp+vec2(.0007,.0004),vec2(.001),vec2(.999))).rgb
    +texture2D(tDiffuse,clamp(uv+warp-vec2(.0007,.0004),vec2(.001),vec2(.999))).rgb)*.5;
  vec3 reflected=mix(blur,central,.74);
  float reflectionLuma=dot(reflected,vec3(.2126,.7152,.0722));
  reflected*=mix(.60,.96,smoothstep(.10,.68,reflectionLuma));
  vec3 n=normalize(vec3(ripple*.045,1.,fine*.055));
  float facing=clamp(dot(n,normalize(cameraPosition-vWaterPosition)),0.,1.);
  float fresnel=.02037+.97963*pow(1.-facing,5.);
  float edge=max(0.,river.y*.5-abs(across));
  float bank=smoothstep(.06,.80,edge);
  vec3 deep=vec3(.021,.040,.037)*( .96+.04*longWave );
  vec3 colour=mix(deep,reflected*.90,.26+.72*fresnel);
  colour*=mix(.80,1.,bank);
  gl_FragColor=vec4(colour,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const GROUND_COMMON=`
varying vec3 vSpace09RainWorld;
float s09RainHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float s09RainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(s09RainHash(i),s09RainHash(i+vec2(1.,0.)),f.x),mix(s09RainHash(i+vec2(0.,1.)),s09RainHash(i+vec2(1.)),f.x),f.y);}
`;

export function weatherCategory(material){
  if(!material?.isMeshStandardMaterial||material.transparent)return null;
  if(/paving(?:_alt)?(?: \/|$)|scanned worn stone and local rain film|Refine ten metre street surface/i.test(material.name))return 'paving';
  return null;
}

function rainMaterial(source){
  const material=source.clone(),compile=source.onBeforeCompile,key=source.customProgramCacheKey.call(source);
  material.name=`Space 09 rain / ${source.name}`;
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSpace09RainWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSpace09RainWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+GROUND_COMMON);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
      float s09DampField=s09RainNoise(vSpace09RainWorld.xz*.63)*.72+s09RainNoise(vSpace09RainWorld.xz*2.1+5.3)*.28;
      float s09Damp=smoothstep(.32,.69,s09DampField);
      float s09Film=smoothstep(.61,.79,s09DampField);
      // Retain the actual scan and relief; a broken film leaves most stones
      // readable, rather than making every road a continuous polished mirror.
      diffuseColor.rgb*=mix(1.015,.86,s09Damp);
      roughnessFactor=mix(clamp(roughnessFactor,.52,.90),clamp(roughnessFactor*.64,.22,.43),s09Damp);
      #include <lights_physical_fragment>
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',`
      #ifdef USE_CLEARCOAT
        material.clearcoat=.025+s09Damp*.055+s09Film*.22;
        material.clearcoatRoughness=mix(.30,.17,s09Film);
      #endif
      #include <lights_fragment_begin>
    `);
  };
  material.customProgramCacheKey=()=>key+'/space09-broken-rain-film-01';
  return material;
}

export function applyWeather(renderer,scene,model,neighbourhood){
  const replacements=[],cache=new Map(),waters=[];
  model.traverse(part=>{
    if(!part.isMesh)return;
    if(part.isReflector&&part.name==='Roaming reflective canal'){
      const original=part.material;
      const material=new original.constructor({
        name:'Space 09 / continuous canal reflections',uniforms:{...original.uniforms},
        vertexShader:original.vertexShader,fragmentShader:WATER_FRAGMENT,defines:{...original.defines},
        fog:original.fog,lights:original.lights,side:original.side,transparent:original.transparent,
        depthWrite:original.depthWrite,depthTest:original.depthTest,blending:original.blending,
        toneMapped:original.toneMapped,glslVersion:original.glslVersion,extensions:{...original.extensions},
      });
      // Reflector.onBeforeRender closes over its original material. Sharing
      // each original uniform object keeps that callback's render-target and
      // textureMatrix updates live while leaving the original shader intact.
      material.needsUpdate=true;
      part.material=material;waters.push({part,original,material});return;
    }
    const original=part.material,list=Array.isArray(original)?original:[original];let changed=false;
    const next=list.map(source=>{if(weatherCategory(source)!=='paving')return source;changed=true;
      if(!cache.has(source))cache.set(source,rainMaterial(source));return cache.get(source);});
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original});}
  });
  const metadata={version:'space-09-rain-film-and-curved-canal-response',pavingMaterialCount:cache.size,
    pavingMaterials:[...cache.keys()].map(material=>material.name),waterReflectors:waters.length,
    newReflectionPasses:0,newRenderTargets:0,newTextures:0,addedGeometry:0,
    waterUniformReferencesShared:waters.every(({original,material})=>Object.keys(original.uniforms).every(key=>original.uniforms[key]===material.uniforms[key])),
    waterReflectionContrast:'Restrained mid/dark reflection energy; bright window reflections keep their relative intensity.',
    preserved:'All source geometry/UVs, original material objects, scan textures, canal reflection geometry and existing render target.',
  };
  let disposed=false;
  return {metadata,dispose(){if(disposed)return;disposed=true;
    waters.forEach(({part,original,material})=>{part.material=original;material.dispose();});
    replacements.forEach(({part,original})=>{part.material=original;});cache.forEach(material=>material.dispose());
  }};
}
