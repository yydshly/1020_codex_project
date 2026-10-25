import { setupEnvironment as setupPrevious, createPaneMaterial } from './scene-space-04-environment.js';
import { applyLandscape } from './scene-space-06-landscape.js';

const rawName=material=>material.name.replace(/^ROAM01_PBR \/ /,'');

export async function setupEnvironment(renderer,scene,model,options={}) {
  const buildings=options.neighbourhood?.buildings??{};
  const aliases={...(options.materialAliases??{}),...(buildings.web_material_aliases??{})};
  const previous=await setupPrevious(renderer,scene,model,{...options,materialAliases:aliases});
  const paneNames=new Set(buildings.new_pane_materials??[]),warmNames=new Set(buildings.new_warm_materials??[]);
  const replacements=[],cache=new Map();
  model.traverse(part=>{
    if(!part.isMesh)return;
    const original=part.material,list=Array.isArray(original)?original:[original];let changed=false;
    const next=list.map(source=>{
      if(!paneNames.has(rawName(source)))return source;
      changed=true;
      if(!cache.has(source)){
        const material=createPaneMaterial(source,scene.environment);material.name=`Space 06 / ${rawName(source)}`;
        cache.set(source,material);
      }
      return cache.get(source);
    });
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original});}
    if(list.every(material=>paneNames.has(rawName(material))||warmNames.has(rawName(material))))part.castShadow=false;
  });
  const landscape=applyLandscape(scene,model,{...options,metadata:options.neighbourhood?.landscape});
  const metadata={...previous.metadata,version:'space-06-complete-neighbourhood',
    buildings:buildings.building_count??0,newPaneMaterialCount:cache.size,
    landscape:landscape?.metadata??null,lighting:'Inherited SPACE04 skylight; no new lights.',
  };
  let disposed=false;
  return {metadata,cameraOccluders:previous.cameraOccluders,
    update(time,state={}){previous.update(time,state);landscape?.update?.(time,state);},
    dispose(){if(disposed)return;disposed=true;landscape?.dispose?.();replacements.forEach(({part,original})=>{part.material=original;});cache.forEach(material=>material.dispose());previous.dispose();},
  };
}
