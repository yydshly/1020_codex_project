import { setupEnvironment as setupBase } from './scene-space-06-environment.js';
import { applySurfaces } from './scene-space-09-surfaces.js';
import { applyLandscape } from './scene-space-09-landscape.js';
import { applyWindowLights } from './scene-space-08-windows.js';
import { applyStreetLights } from './scene-space-09-lamps.js';
import { applyWeather } from './scene-space-09-weather.js';

export async function setupEnvironment(renderer,scene,model,options={}){
  const base=await setupBase(renderer,scene,model,options),parts=[];
  let surfaces,landscape,windows,lamps,weather;
  try{
    surfaces=await applySurfaces(renderer,scene,model,options.neighbourhood);parts.push(surfaces);
    landscape=await applyLandscape(renderer,scene,model,options.neighbourhood);parts.push(landscape);
    windows=applyWindowLights(scene,model,options.neighbourhood);parts.push(windows);
    lamps=applyStreetLights(scene,model,options.neighbourhood);parts.push(lamps);
    weather=applyWeather(renderer,scene,model,options.neighbourhood);parts.push(weather);
  }catch(error){parts.reverse().forEach(part=>part.dispose());base.dispose();throw error;}
  let disposed=false;
  return {cameraOccluders:base.cameraOccluders,
    metadata:{...base.metadata,version:'space-09-whole-district-material-and-landscape',
      surfaces:surfaces.metadata,landscape:landscape.metadata,windows:windows.metadata,
      streetLights:lamps.metadata,weather:weather.metadata,geometrySource:'Unchanged space-08.glb',
      intent:'Rain-after-dusk canal street: aged mineral facades, small roof courses, open leafy crowns and restrained warm light.'},
    update(time,state={}){base.update(time,state);surfaces.update?.(time,state);landscape.update?.(time,state);lamps.update(time,state);},
    dispose(){if(disposed)return;disposed=true;[...parts].reverse().forEach(part=>part.dispose());base.dispose();},
  };
}
