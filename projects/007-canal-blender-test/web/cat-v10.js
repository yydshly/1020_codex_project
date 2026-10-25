import { createCat as createV9 } from './cat-v9.js';
import { createCat as createMotion10 } from './cat-v10-motion.js';
import { prepareContinuousSkin } from './cat-v10-continuous-skin.js';
import { prepareThighSkin } from './cat-v10-thigh-skin.js';
import { restoreHindSkin } from './cat-v10-hind-restore.js';

// Baseline/field variants isolate surface changes on the V9 movement.
// The current variant also includes the V10 swing-paw articulation.
export async function createCat(THREE, options = {}) {
  const variant=options.variant ?? 'current';
  if(!['baseline','field4','field8','paw','current','thigh','restore'].includes(variant)) throw new Error('This form candidate is not available: '+variant);
  const base=await (['paw','current','thigh','restore'].includes(variant)?createMotion10:createV9)(THREE,{surfaceSkin:false});
  const skin=variant==='baseline'||variant==='paw'?null:prepareContinuousSkin(THREE,base.object,{sigma:variant==='field4'?.004:.008});
  const thigh=variant==='thigh'?prepareThighSkin(THREE,base.object):null;
  const restored=variant==='restore'?await restoreHindSkin(THREE,base.object):null;
  let disposed=false;
  return {
    object:base.object, update:base.update, setAttention:base.setAttention, setBlink:base.setBlink,
    getDebugState(){return {...base.getDebugState(),version:'cat-form-10',variant,
      continuousSkin:skin?.stats ?? {enabled:false},thighSkin:thigh?.stats ?? {enabled:false},hindRestore:restored?.stats ?? {enabled:false},volumeStats:null};},
    dispose(){if(disposed)return;disposed=true;restored?.dispose();thigh?.dispose();skin?.dispose();base.dispose();}
  };
}
