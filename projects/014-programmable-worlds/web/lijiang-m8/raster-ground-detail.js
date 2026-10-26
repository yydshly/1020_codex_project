// Continuous, metre-scaled forest floor. All colour and normal detail is
// evaluated from the generated terrain fields and arithmetic, without assets.
const REVISION='lijiang-litter-alluvium-pbr-m2';
const functions=/* glsl */`
varying vec3 vLiGroundWorld,vLiGroundNormal;
uniform sampler2D uLiGroundCover,uLiGroundAttributes;
uniform vec4 uLiGroundRect;
vec2 liGDHash(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy);}
vec3 liGDNoise(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
  vec2 ga=normalize(liGDHash(i)*2.-1.+vec2(.0001)),gb=normalize(liGDHash(i+vec2(1,0))*2.-1.+vec2(.0001));
  vec2 gc=normalize(liGDHash(i+vec2(0,1))*2.-1.+vec2(.0001)),gd=normalize(liGDHash(i+1.)*2.-1.+vec2(.0001));
  float a=dot(ga,f),b=dot(gb,f-vec2(1,0)),c=dot(gc,f-vec2(0,1)),d=dot(gd,f-1.);
  float lo=mix(a,b,u.x),hi=mix(c,d,u.x);
  vec2 grad=mix(mix(ga,gb,u.x)+vec2((b-a)*du.x,0.),mix(gc,gd,u.x)+vec2((d-c)*du.x,0.),u.y)+vec2(0.,(hi-lo)*du.y);
  return vec3(.5+.65*mix(lo,hi,u.y),.65*grad);
}
`;

export function applyGroundDetail(material,{THREE,vegetation,attributes,rect,continuousLowland=true}){
  if(material.userData.liGroundDetail)return material;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    Object.assign(shader.uniforms,{uLiGroundCover:{value:vegetation},uLiGroundAttributes:{value:attributes},uLiGroundRect:{value:new THREE.Vector4(rect.x,rect.z,1/rect.width,1/rect.height)}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLiGroundWorld,vLiGroundNormal;').replace('#include <project_vertex>',`#include <project_vertex>
      vLiGroundWorld=(modelMatrix*vec4(transformed,1.)).xyz;
      vLiGroundNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+functions);
    // The native colour sample runs after color_fragment. This following
    // boundary deliberately gives the soil its own physical reflectance.
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',/* glsl */`
      vec3 gdP=vLiGroundWorld;
      vec2 gdUV=clamp((gdP.xz-uLiGroundRect.xy)*uLiGroundRect.zw,vec2(0.),vec2(1.));
      float gdCover=clamp(texture2D(uLiGroundCover,gdUV).r,0.,1.);
      vec4 gdAttributes=texture2D(uLiGroundAttributes,gdUV);
      float gdFlat=smoothstep(.62,.93,abs(normalize(vLiGroundNormal).y));
      float gdLow=1.-smoothstep(38.,110.,gdP.y);
      // Lowland soil must not switch palette with a coarse tile's averaged
      // vertex normal. That made the LOD triangles visible as colour wedges.
      float gdWeight=${continuousLowland?'gdLow*mix(1.,gdFlat,smoothstep(22.,65.,gdP.y))':'gdLow*gdFlat'};
      float gdFoot=max(length(dFdx(gdP.xz)),length(dFdy(gdP.xz)));
      vec3 gdBroad=liGDNoise(gdP.xz*.043+17.3),gdPatch=liGDNoise(gdP.xz*.27-9.1);
      float gdBroadAA=1.-smoothstep(.25,.8,gdFoot*.043),gdPatchAA=1.-smoothstep(.25,.8,gdFoot*.27);
      gdBroad.x=mix(.5,gdBroad.x,gdBroadAA);gdPatch.x=mix(.5,gdPatch.x,gdPatchAA);gdPatch.yz*=gdPatchAA;
      vec3 gdCrumb=liGDNoise(gdP.xz*2.6+21.),gdFine=liGDNoise(gdP.xz*12.7-7.);
      float gdCrumbAA=1.-smoothstep(.12,.62,gdFoot*2.6),gdFineAA=1.-smoothstep(.15,.65,gdFoot*12.7);
      float gdOrganic=smoothstep(.24,.71,gdCover*.50+gdBroad.x*.50);
      vec3 gdEarth=mix(vec3(.116,.102,.067),vec3(.187,.163,.112),gdPatch.x);
      vec3 gdMoss=mix(vec3(.052,.084,.029),vec3(.096,.129,.049),gdPatch.x);
      vec3 gdAlbedo=mix(gdEarth,gdMoss,gdOrganic*.68);
      gdAlbedo*=.88+.22*gdBroad.x+.13*(gdCrumb.x-.5)*gdCrumbAA+.07*(gdFine.x-.5)*gdFineAA;
      // Unaligned overlapping litter, at real 8–20cm leaf scale. Neighbour
      // cells let each leaf cross its cell boundary without a stamped grid.
      if(gdWeight>.02&&gdFoot<.085){
        vec2 gdCell=gdP.xz*4.8,gdIndex=floor(gdCell),gdFrac=fract(gdCell);
        float gdLitterFade=1.-smoothstep(.035,.085,gdFoot);
        for(int gdY=-1;gdY<=1;gdY++)for(int gdX=-1;gdX<=1;gdX++){
          vec2 gdOffset=vec2(float(gdX),float(gdY));
          vec2 gdRandom=liGDHash(gdIndex+gdOffset),gdRandom2=liGDHash(gdIndex+gdOffset+37.13);
          vec2 gdLeaf=gdFrac-gdOffset-gdRandom;
          float gdAngle=gdRandom2.x*6.2831853;
          gdLeaf=mat2(cos(gdAngle),-sin(gdAngle),sin(gdAngle),cos(gdAngle))*gdLeaf;
          vec2 gdSize=vec2(.10+.13*gdRandom2.y,.25+.24*gdRandom.x);
          float gdShape=pow(abs(gdLeaf.x)/gdSize.x,1.35)+pow(abs(gdLeaf.y)/gdSize.y,1.35);
          float gdAA=clamp(gdFoot*4.8/gdSize.x,.045,.85);
          float gdMask=(1.-smoothstep(1.-gdAA,1.+gdAA,gdShape))*step(.23,gdRandom.y)*gdLitterFade;
          vec3 gdLeafTone=mix(vec3(.072,.053,.028),vec3(.169,.127,.060),gdRandom2.y);
          gdAlbedo=mix(gdAlbedo,gdLeafTone,gdMask*.67);
        }
      }
      float gdShore=smoothstep(-.20,.45,gdP.y)*(1.-smoothstep(.8,3.6,gdP.y));
      float gdDamp=max(gdShore,clamp(gdAttributes.a,0.,1.)*.32);
      gdAlbedo*=mix(1.,.72,gdDamp);
      diffuseColor.rgb=mix(diffuseColor.rgb,gdAlbedo,gdWeight);
      #include <alphamap_fragment>
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,mix(.96,.76,gdDamp),gdWeight);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec2 gdGrad=.026*.27*gdPatch.yz+.043*2.6*gdCrumb.yz*gdCrumbAA+.004*12.7*gdFine.yz*gdFineAA;
      vec3 gdViewGradient=mat3(viewMatrix)*vec3(gdGrad.x,0.,gdGrad.y);
      gdViewGradient-=normal*dot(normal,gdViewGradient);
      normal=normalize(normal-gdViewGradient*gdWeight);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      reflectedLight.indirectDiffuse*=mix(1.,clamp(gdAttributes.r,.55,1.),gdWeight*.5);`);
  };
  material.customProgramCacheKey=()=>key+'|'+REVISION+'|'+continuousLowland;
  material.userData.liGroundDetail=REVISION;material.needsUpdate=true;
  return material;
}
