// Reuse the existing hind paw bones as the hock-to-foot segment. The source
// joints sat only 43 mm above the sole, bending most of the white foot as shin.
// This changes only this instance's bind pose and skin, never the source GLB.
export function prepareHockRig(THREE, object) {
  object.updateMatrixWorld(true);
  let source;
  object.traverse(node => { if (node.isSkinnedMesh && !source) source = node; });
  if (!source) throw new Error('V8 hock correction requires a skinned cat');
  const skeleton = source.skeleton;
  const names = skeleton.bones.map(bone => bone.name);
  const specs = {
    hind_left: { sole: [-.0541,.0031,-.1337] },
    hind_right: { sole: [.052,0,-.1638] }
  };
  const stats = { joints: {}, changedVertices: 0, maxWeightSumError: 0,
    addedBones: 0, addedVertices: 0, addedTriangles: 0, positionsUnchanged: true };
  for (const [key, spec] of Object.entries(specs)) {
    const paw = skeleton.bones[names.indexOf(key+'_paw')];
    if (!paw) throw new Error('V8 hock palette missing '+key);
    const previous = object.worldToLocal(paw.getWorldPosition(new THREE.Vector3()));
    const target = new THREE.Vector3(previous.x,.085,spec.sole[2]-.025);
    const world = object.localToWorld(target.clone());
    paw.position.copy(paw.parent.worldToLocal(world));
    // Parent orientation is unchanged, so retaining the quaternion preserves
    // the paw's world bind orientation while moving the articulation point.
    paw.updateMatrixWorld(true);
    stats.joints[key] = { previous: previous.toArray(), current: target.toArray() };
  }
  object.updateMatrixWorld(true);
  // Must run before animations/rest transforms are captured. Rebuild inverse
  // binds at this neutral pose so the vertex surface is exactly preserved.
  skeleton.calculateInverses();
  const originalGeometry = source.geometry;
  const geometry = originalGeometry.clone();
  const position = geometry.attributes.position;
  const weights = geometry.attributes.skinWeight, joints = geometry.attributes.skinIndex;
  const smooth = (a,b,value) => { const t = THREE.MathUtils.clamp((value-a)/(b-a),0,1); return t*t*(3-2*t); };
  const hindJoint = names.map(name => /^hind_/.test(name));
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (y >= .105 || z >= -.03) continue;
    const previous = Array.from({length:4},(_,slot)=>({joint:joints.getComponent(i,slot),weight:weights.getComponent(i,slot)})).filter(influence=>influence.weight>0);
    const legTotal = previous.reduce((sum,influence)=>sum+(hindJoint[influence.joint]?influence.weight:0),0);
    if (!legTotal) continue;
    const key = x < 0 ? 'hind_left' : 'hind_right', pawIndex = names.indexOf(key+'_paw');
    const oldPaw = previous.reduce((sum,influence)=>sum+(influence.joint===pawIndex?influence.weight:0),0);
    const targetPaw = legTotal*(1-smooth(.055,.105,y));
    const wanted = THREE.MathUtils.lerp(oldPaw,Math.max(oldPaw,targetPaw),smooth(.008,.022,Math.abs(x)));
    if (wanted <= oldPaw+1e-7) continue;
    const multiplier = (legTotal-wanted)/Math.max(1e-8,legTotal-oldPaw);
    const combined = new Map([[pawIndex,wanted]]);
    for (const influence of previous) {
      if (influence.joint===pawIndex) continue;
      combined.set(influence.joint,influence.weight*(hindJoint[influence.joint]?multiplier:1));
    }
    const selected = [...combined].filter(([,weight])=>weight>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const total = selected.reduce((sum,[,weight])=>sum+weight,0);
    for(let slot=0;slot<4;slot++) {
      joints.setComponent(i,slot,selected[slot]?.[0]??pawIndex);
      weights.setComponent(i,slot,selected[slot]?selected[slot][1]/total:0);
    }
    stats.changedVertices++;
  }
  for(let i=0;i<weights.count;i++) {
    let total=0;for(let slot=0;slot<4;slot++)total+=weights.getComponent(i,slot);
    stats.maxWeightSumError=Math.max(stats.maxWeightSumError,Math.abs(1-total));
  }
  weights.needsUpdate=joints.needsUpdate=true;
  source.geometry=geometry;
  skeleton.update();
  let disposed=false;
  // The body collects the replacement geometry after this function returns.
  // This helper owns only the original geometry removed before that traversal.
  return {stats,geometry,dispose(){if(!disposed){disposed=true;originalGeometry.dispose();}}};
}
