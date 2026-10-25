// SPDX-License-Identifier: GPL-3.0-only
// Opaque animated sea surface and limited upper-water scattering. The depth
// column is explanatory and compressed; these are not fluid-simulation results.
import * as THREE from 'three';

export function buildOceanWater({surface=[0,430,0],texture,random=Math.random}={}){
  const group=new THREE.Group(),time={value:0},waterY={value:surface[1]-.8},cameraDepth={value:0},absorbColour={value:new THREE.Color(0x041d31)};
  const geometry=new THREE.PlaneGeometry(2,2,220,220);geometry.rotateX(-Math.PI/2);
  const grid=geometry.attributes.position,mapCoordinate=n=>Math.sign(n)*180*(Math.exp(Math.abs(n)*Math.log(1+6000/180))-1);
  for(let i=0;i<grid.count;i++)grid.setXYZ(i,mapCoordinate(grid.getX(i)),0,mapCoordinate(grid.getZ(i)));
  const material=new THREE.ShaderMaterial({uniforms:{uTime:time,uWaterY:waterY,uCameraDepth:cameraDepth,uSurfaceOrigin:{value:new THREE.Vector2(surface[0],surface[2])},uAbsorbColour:absorbColour},side:THREE.DoubleSide,transparent:false,depthWrite:true,
    vertexShader:`
      uniform float uTime;varying vec3 vWorld;varying vec3 vWaveNormal;varying float vCrest;
      void main(){
        vec3 p=position;
        float a=p.x*.026+p.z*.018+uTime*.62;
        float b=p.x*.047-p.z*.033-uTime*.83;
        float c=p.x*.11+p.z*.083+uTime*1.15;
        p.y+=sin(a)*1.35+sin(b)*.52+sin(c)*.17;
        float dx=cos(a)*1.35*.026+cos(b)*.52*.047+cos(c)*.17*.11;
        float dz=cos(a)*1.35*.018-cos(b)*.52*.033+cos(c)*.17*.083;
        vWaveNormal=normalize(vec3(-dx,1.,-dz));vCrest=sin(a)*.7+sin(b)*.3;
        vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
      }
    `,
    fragmentShader:`
      uniform float uTime;uniform float uWaterY;uniform float uCameraDepth;uniform vec2 uSurfaceOrigin;uniform vec3 uAbsorbColour;
      varying vec3 vWorld;varying vec3 vWaveNormal;varying float vCrest;
      float foamHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float foamNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(foamHash(i),foamHash(i+vec2(1,0)),f.x),mix(foamHash(i+vec2(0,1)),foamHash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 view=normalize(cameraPosition-vWorld),n=normalize(vWaveNormal);
        float a=vWorld.x*.19+vWorld.z*.11+uTime*.83;
        float b=vWorld.x*.43-vWorld.z*.22-uTime*1.1;
        float ripple=sin(a+sin(b)*.4)*sin(vWorld.z*.37-vWorld.x*.13-uTime*.7);
        n=normalize(n+vec3(cos(a)*.075+ripple*.045,0.,sin(b)*.065+ripple*.025));
        float above=step(uWaterY-.1,cameraPosition.y);
        if(above<.5)n=-n;
        float facing=clamp(dot(n,view),0.,1.),fresnel=.07+.85*pow(1.-facing,4.);
        vec3 sky=vec3(.47,.66,.76),deep=vec3(.018,.13,.20);
        vec3 colour=mix(deep,sky,fresnel*.72);
        vec3 sun=normalize(vec3(-.38,.78,.32));
        float glint=pow(max(dot(reflect(-sun,n),view),0.),160.);
        colour+=vec3(.88,.85,.64)*glint*.85;
        float breaker=sin(a+sin(b)*.4)*.7+sin(b)*.3;
        float foamCloud=foamNoise(vWorld.xz*.021+uTime*.008)*.6+foamNoise(vWorld.xz*.077-uTime*.02)*.3+foamNoise(vWorld.xz*.19)*.1;
        float nearCaps=1.-smoothstep(170.,650.,distance(vWorld.xz,cameraPosition.xz));
        float cap=smoothstep(.93,.995,breaker)*smoothstep(.61,.80,foamCloud)*.23*nearCaps;
        colour=mix(colour,vec3(.70,.83,.86),cap);
        vec2 boat=vWorld.xz-uSurfaceOrigin;float bow=1.-smoothstep(20.,63.,boat.y);float halfWidth=mix(12.5,17.2,smoothstep(-52.,-26.,boat.y))*pow(max(.015,bow),.62);
        float along=smoothstep(-56.,-48.,boat.y)*(1.-smoothstep(59.,65.,boat.y));
        float waterline=exp(-pow((abs(boat.x)-halfWidth)/1.55,2.))*along;
        float sternDistance=length(boat-vec2(0.,-56.));float mooringRipples=pow(max(0.,sin(sternDistance*.72-uTime*.8)),12.)*exp(-sternDistance*.085)*(1.-smoothstep(-57.,-40.,boat.y));
        float contact=(waterline*(.35+.25*breaker)+mooringRipples*.17)*above;
        colour=mix(colour,vec3(.78,.88,.88),clamp(contact,0.,.65));
        if(above<.5){float upperLight=exp(-max(0.,uCameraDepth)/16.);colour=mix(uAbsorbColour,vec3(.14,.42,.53)+glint*.17,upperLight*(.3+.7*fresnel));}
        gl_FragColor=vec4(colour,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `});
  const water=new THREE.Mesh(geometry,material);water.position.set(surface[0],surface[1]-.8,surface[2]);water.renderOrder=0;water.frustumCulled=false;group.add(water);
  // Soft shafts stop in the upper water column. No sunlight beam reaches the
  // abyssal work site: the only close-range light there belongs to the ROV.
  const shafts=new THREE.Group();group.add(shafts);const shaftFade={value:0};
  const shaftMaterial=new THREE.ShaderMaterial({uniforms:{uFade:shaftFade},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float uFade;varying vec2 vUv;void main(){float edge=pow(max(0.,1.-abs(vUv.x*2.-1.)),3.);float ends=pow(sin(vUv.y*3.1415926),2.);gl_FragColor=vec4(.32,.64,.73,edge*ends*.047*uFade);}'
  });
  for(let i=0;i<7;i++){const beam=new THREE.Mesh(new THREE.PlaneGeometry(18+i*2.4,165),shaftMaterial);beam.position.set(surface[0]-140+i*46,surface[1]-82,surface[2]-15+i*20);beam.rotation.set(0,.6+i*.23,-.15);shafts.add(beam);}
  const count=240,positions=new Float32Array(count*3),initial=new Float32Array(count*3),phase=new Float32Array(count);
  for(let i=0;i<count;i++){positions[i*3]=surface[0]+(random()-.5)*650;positions[i*3+1]=surface[1]-8-random()*420;positions[i*3+2]=surface[2]+(random()-.5)*650;phase[i]=random()*6.28;}initial.set(positions);
  const snowGeometry=new THREE.BufferGeometry();snowGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const snow=new THREE.Points(snowGeometry,new THREE.PointsMaterial({map:texture,size:.7,color:0xa5d7dc,transparent:true,opacity:.2,depthWrite:false,sizeAttenuation:true}));group.add(snow);
  return {group,water,shafts,snow,update:(seconds,cameraPosition)=>{
    time.value=seconds;const depth=cameraPosition?Math.max(0,surface[1]-cameraPosition.y):0;cameraDepth.value=depth;water.visible=depth<80;shaftFade.value=Math.exp(-depth/50);shafts.visible=depth>0&&depth<165;snow.visible=depth>2;
    const p=snowGeometry.attributes.position;for(let i=0;i<count;i++)p.setXYZ(i,initial[i*3]+Math.sin(seconds*.08+phase[i])*2.5,initial[i*3+1]+Math.sin(seconds*.13+phase[i])*.7,initial[i*3+2]+Math.cos(seconds*.09+phase[i])*1.2);p.needsUpdate=true;
  },setAbsorptionColour:colour=>absorbColour.value.copy(colour)};
}

export function createRovLightShaft(){
  const geometry=new THREE.ConeGeometry(1,1,24,1,true);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv;varying vec3 vN;varying vec3 vView;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalMatrix*normal;vView=-mv.xyz;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying vec2 vUv;varying vec3 vN;varying vec3 vView;void main(){float facing=abs(dot(normalize(vN),normalize(vView)));float a=pow(facing,1.3)*smoothstep(0.,.24,vUv.y)*.042;gl_FragColor=vec4(.43,.68,.75,a);}'
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;return mesh;
}
