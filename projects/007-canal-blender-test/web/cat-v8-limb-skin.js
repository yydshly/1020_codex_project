// Per-instance correction of the scanned cat's continuous belly/leg surface.
// Original weights choose a whole left/right leg at x=0, including the groin.
// Fade those central influences into the torso before the side changes. The
// low paws and all head/neck/tail influences remain as authored.
export function prepareLimbSkin(THREE, object) {
  let source;
  object.traverse(node => { if (node.isSkinnedMesh && !source) source = node; });
  if (!source) throw new Error('V8 limb correction requires the original cat skin');
  const original = source.geometry, geometry = original.clone();
  const position = geometry.attributes.position;
  const weights = geometry.attributes.skinWeight, joints = geometry.attributes.skinIndex;
  const names = source.skeleton.bones.map(bone => bone.name);
  const spineIndex = names.indexOf('spine'), chestIndex = names.indexOf('chest');
  if (spineIndex < 0 || chestIndex < 0) { geometry.dispose(); throw new Error('V8 torso skin palette unavailable'); }
  const smooth = (a, b, value) => { const t = THREE.MathUtils.clamp((value-a)/(b-a), 0, 1); return t*t*(3-2*t); };
  const legJoint = names.map(name => /^(fore_|hind_)/.test(name));
  const protectedJoint = names.map(name => /^(head|neck|tail_)/.test(name));
  object.updateMatrixWorld(true);
  const chains = ['fore_left','fore_right','hind_left','hind_right'].map(key => {
    const ids = ['upper','lower','paw'].map(part => names.indexOf(key+'_'+part));
    const points = ids.map(id => object.worldToLocal(source.skeleton.bones[id].getWorldPosition(new THREE.Vector3())));
    return { key, ids, points, axis: points[2].clone().sub(points[1]) };
  });
  const vertex = new THREE.Vector3(), projection = new THREE.Vector3(), span = new THREE.Vector3();
  function segmentDistance(point, start, end) {
    span.copy(end).sub(start);
    const t = THREE.MathUtils.clamp(projection.copy(point).sub(start).dot(span)/span.lengthSq(),0,1);
    projection.copy(start).addScaledVector(span,t);
    return point.distanceTo(projection);
  }
  const stats = { changedVertices: 0, lowPawVerticesPreserved: 0, protectedVerticesPreserved: 0,
    maxWeightSumError: 0, addedTriangles: 0, addedVertices: 0, positionNormalUvIndexUnchanged: true,
    kneeRedistributedVertices: 0 };
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i), x = position.getX(i), z = position.getZ(i);
    if (y <= .065) { stats.lowPawVerticesPreserved++; continue; }
    const influences = Array.from({length: 4}, (_, slot) => ({
      joint: joints.getComponent(i, slot), weight: weights.getComponent(i, slot)
    })).filter(influence => influence.weight > 0);
    // The height envelope has already returned to zero before neck/tail
    // influences start; this guard protects the existing face correction.
    if (influences.some(influence => protectedJoint[influence.joint])) { stats.protectedVerticesPreserved++; continue; }
    const legTotal = influences.reduce((sum, influence) => sum+(legJoint[influence.joint] ? influence.weight : 0), 0);
    if (!legTotal) continue;
    const width = .025+.020*smooth(.10,.22,y);
    const sideGate = smooth(.004,width,Math.abs(x));
    const envelope = smooth(.065,.10,y)*(1-smooth(.22,.25,y));
    const keep = 1-envelope*(1-sideGate);
    if (keep >= 1-1e-7) continue;
    const bodyJoint = z > .02 ? chestIndex : spineIndex;
    const combined = new Map();
    for (const influence of influences) {
      const value = influence.weight*(legJoint[influence.joint] ? keep : 1);
      combined.set(influence.joint, (combined.get(influence.joint) || 0)+value);
    }
    combined.set(bodyJoint,(combined.get(bodyJoint) || 0)+legTotal*(1-keep));
    const selected = [...combined].filter(([, weight]) => weight > 1e-8).sort((a,b) => b[1]-a[1]).slice(0,4);
    const sum = selected.reduce((total,[, weight]) => total+weight,0);
    for (let slot = 0; slot < 4; slot++) {
      joints.setComponent(i,slot,selected[slot]?.[0] ?? bodyJoint);
      weights.setComponent(i,slot,selected[slot] ? selected[slot][1]/sum : 0);
    }
    stats.changedVertices++;
  }
  // Preserve each leg's total influence and its newly calibrated rigid paw,
  // but divide thigh/shin around the actual knee-to-hock axis. A point below
  // knee height can still be in front of the knee and belong to the thigh.
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position,i);
    if (vertex.y <= .065) continue;
    const previous = new Map();
    for (let slot = 0; slot < 4; slot++) {
      const joint=joints.getComponent(i,slot),weight=weights.getComponent(i,slot);
      if(weight>0)previous.set(joint,(previous.get(joint)||0)+weight);
    }
    if ([...previous.keys()].some(joint=>protectedJoint[joint])) continue;
    let changed=false;
    for (const chain of chains) {
      const [upper,lower] = chain.ids;
      const total=(previous.get(upper)||0)+(previous.get(lower)||0);
      if(total<1e-6)continue;
      const t=projection.copy(vertex).sub(chain.points[1]).dot(chain.axis)/chain.axis.lengthSq();
      const progress=smooth(-.10,.40,t);
      const upperDistance=segmentDistance(vertex,chain.points[0],chain.points[1]);
      const lowerDistance=segmentDistance(vertex,chain.points[1],chain.points[2]);
      const preference=smooth(-.012,.012,upperDistance-lowerDistance);
      const lowerScore=progress*(.35+.65*preference);
      const upperScore=(1-progress)*(.35+.65*(1-preference));
      const lowerFraction=lowerScore/Math.max(1e-8,lowerScore+upperScore);
      const blend=smooth(.065,.085,vertex.y);
      const wanted=THREE.MathUtils.lerp(previous.get(lower)||0,total*lowerFraction,blend);
      if(Math.abs(wanted-(previous.get(lower)||0))<1e-7)continue;
      previous.set(lower,wanted);previous.set(upper,total-wanted);changed=true;
    }
    if(!changed)continue;
    const selected=[...previous].filter(([,weight])=>weight>1e-8).sort((a,b)=>b[1]-a[1]);
    // The scan assigns only one leg to each point; adding its missing partner
    // remains within four influences. Leave unusual mixed palettes unchanged.
    if(selected.length>4)continue;
    for(let slot=0;slot<4;slot++){
      joints.setComponent(i,slot,selected[slot]?.[0]??spineIndex);
      weights.setComponent(i,slot,selected[slot]?.[1]??0);
    }
    stats.kneeRedistributedVertices++;
  }
  for (let i = 0; i < weights.count; i++) {
    let sum = 0; for (let slot = 0; slot < 4; slot++) sum += weights.getComponent(i,slot);
    stats.maxWeightSumError = Math.max(stats.maxWeightSumError,Math.abs(sum-1));
  }
  weights.needsUpdate = joints.needsUpdate = true;
  source.geometry = geometry;
  let disposed = false;
  return { stats, geometry, dispose() { if (!disposed) { disposed = true; geometry.dispose(); } } };
}
