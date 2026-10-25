import { setupEnvironment as setupBase } from './scene-space-10-environment.js';
import { applyLandscape } from './scene-space-11-landscape.js';

export async function setupEnvironment(renderer,scene,model,options={}){
  const base=await setupBase(renderer,scene,model,options);
  let landscape;
  try{landscape=await applyLandscape(renderer,scene,model,options.neighbourhood);}
  catch(error){base.dispose();throw error;}
  let disposed=false;
  return {cameraOccluders:base.cameraOccluders,
    metadata:{...base.metadata,version:'space-11-settlement-to-landscape-transition',
      boundaryLandscape:landscape.metadata,geometrySource:'Unchanged space-10.glb',
      intent:'A quiet canal settlement connected to open meadows, wet banks and broken woodland edges.'},
    update(time,state={}){base.update(time,state);landscape.update?.(time,state);},
    dispose(){if(disposed)return;disposed=true;landscape.dispose();base.dispose();},
  };
}
