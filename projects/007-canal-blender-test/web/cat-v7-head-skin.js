// Local, per-instance skin correction for the preserved V3 surface. The source
// assigned head weights by height, so the skull moved separately from its jaw.
// Keep the facial shell rigid and distribute its transition through the nape.
export function prepareHeadSkin(THREE, object) {
  let source, head;
  object.traverse(node => {
    if (node.isSkinnedMesh && !source) source = node;
    if (node.isBone && node.name === 'head') head = node;
  });
  if (!source || !head) throw new Error('V7 needs the preserved cat skin and head joint');
  const original = source.geometry;
  const geometry = original.clone();
  const position = geometry.attributes.position;
  const joints = geometry.attributes.skinIndex;
  const weights = geometry.attributes.skinWeight;
  const names = source.skeleton.bones.map(bone => bone.name);
  const headIndex = names.indexOf('head');
  if (headIndex < 0) { geometry.dispose(); throw new Error('V7 head skin palette unavailable'); }
  const pivot = [.005, .325, .15];
  const forward = [.8289901626607705, 0, .5592631851031045];
  const side = [forward[2], 0, -forward[0]];
  const smooth = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value-a)/(b-a), 0, 1);
    return t*t*(3-2*t);
  };
  const protectedJoint = names.map(name => /^(fore_|hind_|tail_)/.test(name));
  const stats = { changedVertices: 0, rigidFaceVertices: 0, protectedVertices: 0,
    maxWeightSumError: 0, positionNormalUvIndexUnchanged: true,
    addedVertices: 0, addedTriangles: 0 };
  for (let i = 0; i < position.count; i++) {
    const originalInfluences = Array.from({length:4}, (_, slot) => ({
      joint: joints.getComponent(i, slot), weight: weights.getComponent(i, slot)
    }));
    if (originalInfluences.some(influence => influence.weight > 1e-6 && protectedJoint[influence.joint])) {
      stats.protectedVertices++; continue;
    }
    const x = position.getX(i)-pivot[0], y = position.getY(i), z = position.getZ(i)-pivot[2];
    const along = x*forward[0]+z*forward[2];
    const across = Math.abs(x*side[0]+z*side[2]);
    // The foreleg weights end near y=.264. Start above that seam so tiny
    // protected limb influences cannot create a discontinuous neck flap.
    // The muzzle becomes rigid lower down than the nape; using one horizontal
    // cutoff would concentrate the entire correction into a narrow collar.
    const fullSkullHeight = .284+.065*(1-smooth(.015,.09,along));
    const skull = Math.max(smooth(.265,fullSkullHeight,y)*smooth(-.04,.018,along),
      smooth(.35,.375,y)*smooth(-.04,0,along))*(1-smooth(.075,.105,across));
    const previousHead = originalInfluences.reduce((sum, influence) => sum+(influence.joint === headIndex ? influence.weight : 0), 0);
    const targetHead = Math.max(previousHead, skull);
    if (targetHead >= 1-1e-7) stats.rigidFaceVertices++;
    if (targetHead-previousHead < 1e-7) continue;
    const multiplier = (1-targetHead)/Math.max(1e-8, 1-previousHead);
    const updated = [{joint:headIndex, weight:targetHead}, ...originalInfluences
      .filter(influence => influence.joint !== headIndex && influence.weight > 0)
      .map(influence => ({joint:influence.joint, weight:influence.weight*multiplier}))]
      .sort((a,b) => b.weight-a.weight).slice(0,4);
    const total = updated.reduce((sum, influence) => sum+influence.weight,0);
    for (let slot = 0; slot < 4; slot++) {
      joints.setComponent(i, slot, updated[slot]?.joint ?? headIndex);
      weights.setComponent(i, slot, updated[slot] ? updated[slot].weight/total : 0);
    }
    stats.changedVertices++;
  }
  for (let i = 0; i < weights.count; i++) {
    let total = 0;
    for (let slot = 0; slot < 4; slot++) total += weights.getComponent(i,slot);
    stats.maxWeightSumError = Math.max(stats.maxWeightSumError, Math.abs(1-total));
  }
  joints.needsUpdate = weights.needsUpdate = true;
  source.geometry = geometry;
  let disposed = false;
  return {head, headRest:head.quaternion.clone(), source, stats,
    calibration:{pivot, sourceFaceYawDegrees:55.99514261333094, faceForward:forward},
    dispose() { if (!disposed) { disposed = true; geometry.dispose(); } }
  };
}
