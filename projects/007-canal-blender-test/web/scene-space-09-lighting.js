import * as THREE from 'three';
import { applyLighting as applyBaseLighting } from './scene-space-04-lighting.js';

// Softer sky support balances the restrained local lamps. Keep the original
// dusk HDR, directional light, exposure and number of shadow maps.
export function applyLighting(scene,renderer){
  const base=applyBaseLighting(scene,renderer),hemispheres=[];
  scene.traverse(light=>{if(light.isHemisphereLight)hemispheres.push(light);});
  if(hemispheres.length!==1){base.dispose();throw new Error('SPACE09 expects one inherited sky light.');}
  const sky=hemispheres[0],previous={intensity:sky.intensity,ground:sky.groundColor.clone(),environment:scene.environmentIntensity};
  sky.intensity=.32;sky.groundColor.lerp(new THREE.Color(0x4d493e),.35);scene.environmentIntensity=.40;
  const metadata={version:'space-09-balanced-sky-and-local-light',
    hemisphere:{before:previous.intensity,after:sky.intensity},environment:{before:previous.environment,after:scene.environmentIntensity},
    exposure:renderer.toneMappingExposure,addedLights:0,addedShadowMaps:0,
    preserved:'Original sky texture/background, exposure and directional/bookshop lights.',
    localLampBalance:'Fixed lamp field coefficient 2.65 to 1.85; wall/post point intensity 13/17 to 7.5/11; emitter 3.6 to 2.8.',
  };
  let disposed=false;
  return {metadata,dispose(){if(disposed)return;disposed=true;sky.intensity=previous.intensity;
    sky.groundColor.copy(previous.ground);scene.environmentIntensity=previous.environment;base.dispose();}};
}
