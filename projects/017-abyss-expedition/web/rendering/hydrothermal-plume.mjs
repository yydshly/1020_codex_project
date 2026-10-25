// SPDX-License-Identifier: GPL-3.0-only
// A visual plume adapter: particles are placed in 3D, not a fluid simulation.
import * as THREE from 'three';

export function createHydrothermalPlume({origin,height,texture,random,primary=false}) {
  const count=primary?360:170;
  const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(count*3),seeds=new Float32Array(count*4);
  for(let i=0;i<count;i++){
    positions.set([origin[0],height,origin[1]],i*3);
    seeds.set([random(),random()*Math.PI*2,random(),random()],i*4);
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('plumeSeed',new THREE.BufferAttribute(seeds,4));
  const time={value:0};
  const material=new THREE.PointsMaterial({color:0x14242b,size:primary?10:8,map:texture,transparent:true,opacity:primary?.32:.20,depthWrite:false,sizeAttenuation:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.plumeTime=time;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nattribute vec4 plumeSeed;uniform float plumeTime;varying float plumeAge;varying vec2 plumeNoiseOffset;varying float plumeAngle;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        plumeAge=fract(plumeSeed.x+plumeTime*(.040+plumeSeed.w*.016));
        plumeNoiseOffset=plumeSeed.yw*vec2(17.,31.);plumeAngle=plumeSeed.y+plumeTime*.055;
        float radius=(.45+plumeAge*10.)*sqrt(plumeSeed.z);
        float curl=plumeSeed.y+plumeAge*6.5+plumeTime*.12;
        transformed.x+=cos(curl)*radius+plumeAge*plumeAge*15.;
        transformed.z+=sin(curl)*radius*.75+plumeAge*6.;
        transformed.y+=plumeAge*${primary?'82.':'62.'};
      `)
      .replace('gl_PointSize = size;','gl_PointSize = size*(.55+plumeAge*3.2);');
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>
        varying float plumeAge;varying vec2 plumeNoiseOffset;varying float plumeAngle;
        float plumeHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float plumeNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(plumeHash(i),plumeHash(i+vec2(1.,0.)),f.x),mix(plumeHash(i+vec2(0.,1.)),plumeHash(i+vec2(1.)),f.x),f.y);}
      `)
      .replace('#include <map_particle_fragment>',`
        vec2 cloudUv=gl_PointCoord-.5;
        float c=cos(plumeAngle),s=sin(plumeAngle);cloudUv=mat2(c,-s,s,c)*cloudUv;
        float cloud=plumeNoise(cloudUv*4.2+plumeNoiseOffset)*.72+plumeNoise(cloudUv*8.7+plumeNoiseOffset*1.7)*.28;
        vec2 curl=vec2(plumeNoise(cloudUv*3.1+plumeNoiseOffset+4.),plumeNoise(cloudUv*3.3+plumeNoiseOffset+17.))-.5;
        float edge=length((cloudUv+curl*.18)*vec2(.95,1.08))+(cloud-.5)*.19;
        diffuseColor.a*=1.-smoothstep(.06,.53,edge);
        diffuseColor.a*=.75+.25*cloud;
      `)
      .replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.012,.026,.032),plumeAge*.6);
        diffuseColor.a*=smoothstep(0.,.055,plumeAge)*(1.-smoothstep(.48,1.,plumeAge));
      `);
  };
  material.customProgramCacheKey=()=>primary?'abyss-plume-main-v2':'abyss-plume-secondary-v2';
  const object=new THREE.Points(geometry,material);object.frustumCulled=false;
  return {object,update:elapsed=>{time.value=elapsed;}};
}
