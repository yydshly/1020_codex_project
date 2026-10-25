// Stand-pose adaptation only: author's two opposing Walk contacts, with small
// rotation-only leg corrections. The source GLB and all source tracks stay intact.
export const CAT_A_LEGS = Object.freeze({
  frontL: { root: 'Foot_front_L2', toe: 'Toe_Pointer_L_front', joints: ['Foot_front_L2','Calf_Front_L','Thigh_front_L'] },
  frontR: { root: 'Foot_front_L2.002', toe: 'Toe_Pointer_L_front.002', joints: ['Foot_front_L2.002','Calf_Front_R','Thigh_front_R'] },
  rearL: { root: 'Foot_Back_L', toe: 'Toe_back_L_Pointer', joints: ['Foot_Back_L','Calf_back_L','Thigh_Back_L'] },
  rearR: { root: 'Foot_Back_R', toe: 'Toe_back_L_Pointer.002', joints: ['Foot_Back_R','Calf_back_R','Thigh_Back_R'] }
});

export function findCatBone(THREE, model, name) {
  return model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
}

// Apply only joint rotations; never relocate a shoulder/hip to fake reach.
// Caller supplies world-space target and may reuse a point on the effector.
export function solveLeg(THREE, effector, joints, target, options = {}) {
  const point = options.pointLocal || new THREE.Vector3();
  const identity = new THREE.Quaternion();
  for (let iteration = 0; iteration < (options.iterations ?? 7); iteration++) {
    for (const joint of joints) {
      if (!joint) continue;
      effector.updateWorldMatrix(true, false);
      const current = effector.localToWorld(point.clone());
      const pivot = joint.getWorldPosition(new THREE.Vector3());
      const from = current.sub(pivot), to = target.clone().sub(pivot);
      if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) continue;
      const delta = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
      const angle = identity.angleTo(delta), maximum = options.maxStep ?? .12;
      if (angle > maximum) delta.slerp(identity, 1 - maximum / angle);
      const parent = joint.parent.getWorldQuaternion(new THREE.Quaternion());
      joint.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent)).normalize();
      joint.updateWorldMatrix(false, true);
      if(options.preserveWorldQuaternion) {
        const parentQ=effector.parent.getWorldQuaternion(new THREE.Quaternion());
        effector.quaternion.copy(parentQ.invert().multiply(options.preserveWorldQuaternion));
        effector.updateWorldMatrix(false,true);
      }
    }
    if (effector.localToWorld(point.clone()).distanceTo(target) < .00008) break;
  }
  return effector.localToWorld(point.clone()).distanceTo(target);
}

export function buildIdleClip(THREE, model, walk) {
  // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse. Calling only
  // Object3D.updateWorldMatrix before the first render would apply scale twice.
  const updateWhole=()=>{let root=model;while(root.parent)root=root.parent;root.updateMatrixWorld(true);};
  const saved = [];
  model.traverse(node => saved.push([node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]));
  const tracks = walk.tracks.map(track => {
    const sample = t => Array.from(track.createInterpolant(new Float32Array(track.getValueSize())).evaluate(t * walk.duration));
    const a = sample(.426), b = sample(.926);
    const value = track.ValueTypeName === 'quaternion'
      ? new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b),.5).toArray()
      : a.map((v,i)=>(v+b[i])*.5);
    return new track.constructor(track.name,[0],value);
  });
  const provisional = new THREE.AnimationClip('Stand contact preparation',1,tracks);
  const mixer = new THREE.AnimationMixer(model), action=mixer.clipAction(provisional);
  action.play();mixer.update(0);updateWhole();
  const body=model.getObjectByName('Cat');body.skeleton.update();
  const skin=body.geometry.attributes.skinIndex,weights=body.geometry.attributes.skinWeight;
  const paws={};
  for(const [label,spec] of Object.entries(CAT_A_LEGS)) {
    const foot=findCatBone(THREE,model,spec.root), toe=findCatBone(THREE,model,spec.toe);
    const ids=new Set();foot.traverse(b=>{if(b.isBone)ids.add(body.skeleton.bones.indexOf(b));});
    const vertices=[];
    for(let i=0;i<skin.count;i++) {
      let amount=0;for(let c=0;c<4;c++)if(ids.has(skin.getComponent(i,c)))amount+=weights.getComponent(i,c);
      if(amount>.6)vertices.push(i);
    }
    paws[label]={spec,foot,toe,vertices,joints:spec.joints.map(name=>findCatBone(THREE,model,name))};
  }
  const point = index => body.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(body.matrixWorld);
  const sole = paw => {
    body.skeleton.update();const points=paw.vertices.map(point),min=Math.min(...points.map(v=>v.y));
    const low=points.filter(v=>v.y<min+.003);
    const center=low.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/low.length);
    return {min,center};
  };
  const initial=Object.fromEntries(Object.entries(paws).map(([label,paw])=>[label,sole(paw)]));
  const floor=Object.values(initial).map(v=>v.min).sort((a,b)=>a-b)[1];
  const audit={method:'Average opposing original Walk contacts, then rotation-only CCD to a shared sole plane',floorWorldY:floor,paws:{}};
  for(const [label,paw] of Object.entries(paws)) {
    const originalQuat=paw.foot.getWorldQuaternion(new THREE.Quaternion());
    // Keep X/Z stance fixed while bringing the averaged pose's sole to the plane.
    for(let pass=0;pass<4;pass++) {
      updateWhole();const current=sole(paw);
      const target=current.center.clone();target.y+=floor-current.min;
      solveLeg(THREE,paw.foot,paw.joints.filter(joint=>joint!==paw.foot),target,{pointLocal:paw.foot.worldToLocal(current.center.clone()),iterations:18,maxStep:.10,preserveWorldQuaternion:originalQuat});
      // Foot orientation is part of the authored pose; preserve it while the
      // upper joints absorb the small vertical correction on subsequent passes.
      const parent=paw.foot.parent.getWorldQuaternion(new THREE.Quaternion());
      paw.foot.quaternion.copy(parent.invert().multiply(originalQuat));
      updateWhole();
    }
    const final=sole(paw);
    audit.paws[label]={beforeY:initial[label].min,afterY:final.min,correctionM:final.min-initial[label].min,errorM:final.min-floor};
  }
  const finalTracks=walk.tracks.map(track=>{
    const parsed=THREE.PropertyBinding.parseTrackName(track.name),node=model.getObjectByName(parsed.nodeName);
    const value=node[parsed.propertyName].toArray();return new track.constructor(track.name,[0],value);
  });
  const clip=new THREE.AnimationClip('Stand adapted from original Walk contacts',1,finalTracks);
  const footPositions=Object.fromEntries(Object.entries(paws).map(([label,paw])=>[label,paw.toe.getWorldPosition(new THREE.Vector3()).toArray()]));
  mixer.stopAllAction();mixer.uncacheRoot(model);
  for(const [node,p,q,s] of saved){node.position.copy(p);node.quaternion.copy(q);node.scale.copy(s);}
  updateWhole();
  return {clip,audit,footPositions};
}
