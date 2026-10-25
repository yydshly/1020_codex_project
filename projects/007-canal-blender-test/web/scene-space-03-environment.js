import * as THREE from 'three';
import { setupEnvironment as setupPrevious } from './scene-space-02-environment.js';

const sourceName = material => material.name.replace(/^ROAM01_PBR \/ /,'');

export async function setupEnvironment(renderer,scene,model,options={}) {
  const aliases=options.materialAliases??{};
  const windows=options.windowMaterials??{};
  const originals=[];
  model.traverse(part=>{
    if(!part.isMesh)return;
    for(const material of(Array.isArray(part.material)?part.material:[part.material])){
      const raw=sourceName(material);
      if(!Object.hasOwn(aliases,raw))continue;
      originals.push({material,name:material.name});
      material.name=`ROAM01_PBR / ${aliases[raw]}`;
    }
  });
  let previous;
  try { previous=await setupPrevious(renderer,scene,model,options); }
  catch(error) { originals.forEach(({material,name})=>{material.name=name;});throw error; }
  const paneNames=new Set(windows.pane??['SPACE03_WindowPane']);
  const warmNames=new Set(windows.warm??['SPACE03_WindowWarm']);
  const recessNames=new Set(windows.recess??['SPACE03_WindowRecess']);
  const cache=new Map(),replacements=[];
  model.traverse(part=>{
    if(!part.isMesh)return;
    const original=part.material,list=Array.isArray(original)?original:[original];
    let changed=false;
    const next=list.map(source=>{
      const pane=paneNames.has(sourceName(source)),recess=recessNames.has(sourceName(source));
      const plaster=/^Space 02 \/ ROAM01_PBR \/ plaster(?:_alt)?(?: \/|$)/.test(source.name);
      const slate=/^Space 02 \/ ROAM01_PBR \/ roof_alt(?: \/|$)/.test(source.name);
      if(!pane&&!recess&&!plaster&&!slate)return source;
      changed=true;
      if(!cache.has(source)){
        // Shallow closed reveals supply depth. Opaque coated panes reflect
        // the existing sky without transmission into unmodelled interiors.
        const material=pane?new THREE.MeshPhysicalMaterial({
          name:`Space 03 / ${sourceName(source)}`,color:source.color.clone(),
          vertexColors:source.vertexColors,roughness:.19,metalness:.18,
          side:source.side,clearcoat:.30,clearcoatRoughness:.20,
          envMapIntensity:.85,dithering:true,
        }):source.clone();
        if(!pane){
          const compile=source.onBeforeCompile,key=source.customProgramCacheKey();
          if(recess)material.roughness=.65;
          material.onBeforeCompile=(shader,renderer)=>{
            compile.call(material,shader,renderer);
            if(recess){
              shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vOppositeDetailWorld;');
              shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvOppositeDetailWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
              shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vOppositeDetailWorld;');
              shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
                float oppFront=step(16.367,vOppositeDetailWorld.z)*step(vOppositeDetailWorld.z,16.423);
                float oppRear=step(21.277,vOppositeDetailWorld.z)*step(vOppositeDetailWorld.z,21.333);
                float oppDoorX=min(abs(vOppositeDetailWorld.x+11.-oppRear*.45),min(abs(vOppositeDetailWorld.x+3.-oppRear*.45),abs(vOppositeDetailWorld.x-4.8-oppRear*.45)));
                float oppDoor=(1.-step(.325-.035*oppRear,oppDoorX))*max(oppFront,oppRear)*step(1.035,vOppositeDetailWorld.y)*step(vOppositeDetailWorld.y,2.55);
                float oppGrain=.97+.035*sin(vOppositeDetailWorld.x*108.+sin(vOppositeDetailWorld.y*2.3)*.25);
                diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.070,.045,.028)*oppGrain,oppDoor);
              `);
            }else{
              shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
                float oppHouseMask=step(-14.1,vSpaceWorld.x)*step(vSpaceWorld.x,7.9)*step(16.05,vSpaceWorld.z)*step(vSpaceWorld.z,21.65);
                ${slate?'diffuseColor.rgb*=mix(1.,.78,oppHouseMask);':`
                  float oppPlaster=.94+.12*spaceNoise(vSpaceWorld.xy*.83);
                  float oppColumn=min(min(abs(vSpaceWorld.x+12.484),abs(vSpaceWorld.x+9.516)),min(min(abs(vSpaceWorld.x+4.537),abs(vSpaceWorld.x+1.463)),min(abs(vSpaceWorld.x-3.316),abs(vSpaceWorld.x-6.284))));
                  float oppSill=vSpaceWorld.x< -7.?3.47:vSpaceWorld.x<1.?4.36:3.26;
                  float oppRun=(1.-smoothstep(.22,.52,oppColumn))*smoothstep(oppSill-.64,oppSill-.12,vSpaceWorld.y)*(1.-step(oppSill,vSpaceWorld.y));
                  oppRun*=.35+.65*spaceNoise(vec2(vSpaceWorld.x*14.,vSpaceWorld.y*.35));
                  diffuseColor.rgb*=mix(1.,oppPlaster*(1.-oppRun*.085),oppHouseMask);
                `}
              `);
            }
          };
          material.customProgramCacheKey=()=>`${key}/space03-${recess?'door':slate?'slate':'plaster'}`;
        }
        cache.set(source,material);
      }
      return cache.get(source);
    });
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original});}
    if(list.every(material=>paneNames.has(sourceName(material))||warmNames.has(sourceName(material))))part.castShadow=false;
  });
  const metadata={...previous.metadata,version:'space-03-opposite-house-details',
    materialAliases:aliases,paneMaterials:[...paneNames],warmMaterials:[...warmNames],
    lighting:'Same existing lights, exposure, environment and fog as SPACE02.',
    windowResponse:'Closed shallow reveals, coated sky-reflecting panes and two low-emission warm window accents.',
    facadeFinishing:'Local plaster mottling and sill runoff; dark brown door panels; restrained lighter slate contrast.',
  };
  scene.userData.oppositeStudy=metadata;
  let disposed=false;
  return {
    cameraOccluders:previous.cameraOccluders,metadata,
    update(time,state={}){previous.update(time,state);},
    dispose(){
      if(disposed)return;disposed=true;
      replacements.forEach(({part,original})=>{part.material=original;});
      cache.forEach(material=>material.dispose());previous.dispose();
      originals.forEach(({material,name})=>{material.name=name;});
      if(scene.userData.oppositeStudy===metadata)delete scene.userData.oppositeStudy;
    },
  };
}
