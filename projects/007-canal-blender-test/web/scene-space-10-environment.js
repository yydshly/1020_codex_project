import { setupEnvironment as setupBase } from './scene-space-06-environment.js';
import { applySurfaces } from './scene-space-10-surfaces.js';
import { applyLandscape } from './scene-space-09-landscape.js';
import { applyWindowLights } from './scene-space-10-windows.js';
import { applyStreetLights } from './scene-space-10-lamps.js';
import { applyWeather } from './scene-space-09-weather.js';
import { applyPlots } from './scene-space-10-plots.js';

export async function setupEnvironment(renderer,scene,model,options={}){
  const base=await setupBase(renderer,scene,model,options),parts=[];
  let surfaces,landscape,windows,lamps,weather,plots;
  try{
    surfaces=await applySurfaces(renderer,scene,model,options.neighbourhood);parts.push(surfaces);
    landscape=await applyLandscape(renderer,scene,model,options.neighbourhood);parts.push(landscape);
    windows=applyWindowLights(scene,model,options.neighbourhood);parts.push(windows);
    lamps=applyStreetLights(scene,model,options.neighbourhood);parts.push(lamps);
    weather=applyWeather(renderer,scene,model,options.neighbourhood);parts.push(weather);
    plots=await applyPlots(renderer,scene,model,options.neighbourhood);parts.push(plots);
  }catch(error){parts.reverse().forEach(part=>part.dispose());base.dispose();throw error;}
  let disposed=false;
  return {cameraOccluders:base.cameraOccluders,
    metadata:{...base.metadata,version:'space-10-varied-street-groups-and-planted-plots',
      surfaces:surfaces.metadata,landscape:landscape.metadata,windows:windows.metadata,
      streetLights:lamps.metadata,weather:weather.metadata,plots:plots.metadata,
      geometrySource:'space-10.glb; same finite district and house count',
      intent:'A grown canal neighbourhood: varied rooflines, corner courts and purposeful planted ground within the existing streets.'},
    update(time,state={}){base.update(time,state);landscape.update?.(time,state);lamps.update(time,state);plots.update?.(time,state);},
    dispose(){if(disposed)return;disposed=true;[...parts].reverse().forEach(part=>part.dispose());base.dispose();},
  };
}
