import { setupEnvironment as setupMaterials } from './scene-space-06-environment.js';
import { applyWindowLights } from './scene-space-08-windows.js';
import { applyStreetLights } from './scene-space-08-lamps.js';

export async function setupEnvironment(renderer,scene,model,options={}){
  const previous=await setupMaterials(renderer,scene,model,options);
  let windows,lamps;
  try{
    windows=applyWindowLights(scene,model,options.neighbourhood);
    lamps=applyStreetLights(scene,model,options.neighbourhood);
  }catch(error){lamps?.dispose();windows?.dispose();previous.dispose();throw error;}
  let disposed=false;
  return {cameraOccluders:previous.cameraOccluders,
    metadata:{...previous.metadata,version:'space-08-grouped-streets-and-courtyard',windows:windows.metadata,
      streetLights:lamps.metadata,geometrySource:'space-08.glb',lighting:'SPACE07 night treatment adapted to actual SPACE08 doors and windows.'},
    update(time,state={}){previous.update(time,state);lamps.update(time,state);},
    dispose(){if(disposed)return;disposed=true;lamps.dispose();windows.dispose();previous.dispose();},
  };
}
