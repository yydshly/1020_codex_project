import { setupEnvironment as setupPrevious } from './scene-space-06-environment.js';
import { applyWindowLights } from './scene-space-07-windows.js';
import { applyStreetLights } from './scene-space-07-lamps.js';

// Keep SPACE06's shared scene and material treatment. Night activity is a
// reversible layer: glowing windows, fixtures and local illumination.
export async function setupEnvironment(renderer,scene,model,options={}) {
  const previous=await setupPrevious(renderer,scene,model,options);
  let windows,lamps;
  try {
    windows=applyWindowLights(scene,model,options.neighbourhood);
    lamps=applyStreetLights(scene,model,options.neighbourhood);
  } catch(error) {
    lamps?.dispose();windows?.dispose();previous.dispose();throw error;
  }
  const metadata={...previous.metadata,version:'space-07-neighbourhood-evening-lights',
    windows:windows.metadata,streetLights:lamps.metadata,
    lighting:'SPACE04 sky and existing bookshop lights plus distributed residential window and street lighting.',
    geometrySource:'Same space-06.glb for both comparison stages.',
    preserved:'SPACE06 buildings, roads, gardens, navigation, sky and source lights.',
  };
  let disposed=false;
  return {metadata,cameraOccluders:previous.cameraOccluders,
    update(time,state={}){previous.update(time,state);lamps.update?.(time,state);windows.update?.(time,state);},
    dispose(){if(disposed)return;disposed=true;lamps.dispose();windows.dispose();previous.dispose();},
  };
}
