import { createCat as createPrevious } from './cat-v10-face.js';
import { prepareHeadSkin } from './cat-v7-head-skin.js';

// The scan's face looks about 56 degrees across the body. Re-centre the whole
// skull before adding small attention poses; do not treat that scan pose as
// the forward-looking walking pose. Previous modules and assets stay intact.
export async function createCat(THREE, options = {}) {
  const base = await createPrevious(THREE);
  const skin = prepareHeadSkin(THREE, base.object);
  let head, lids;
  base.object.traverse(node => {
    if (node.isBone && node.name === 'head') head = node;
    if (node.isSkinnedMesh && node.name.includes('V6 curved')) lids = node;
  });
  if (!head || !lids) { base.dispose(); throw new Error('Head correction requires the preserved V6 rig'); }
  const headRest = head.quaternion.clone();
  const headIndex = lids.skeleton.bones.indexOf(head);
  const control = { enabled: true, mode: 'natural', yaw: 0, pitch: 0 };
  const applied = { yaw: 0, pitch: 0 };
  const rootWorld = new THREE.Quaternion(), inverseRoot = new THREE.Quaternion();
  const headWorld = new THREE.Quaternion(), parentInverse = new THREE.Quaternion();
  const offset = new THREE.Quaternion(), worldOffset = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const rad = Math.PI / 180, correction = -skin.calibration.sourceFaceYawDegrees;
  const neutralRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), correction * rad);
  let elapsed = 0, motionEnvelope = 0, disposed = false;
  let lastWeightVersion = -1;
  base.setAttention?.({ enabled: false });

  function updateLidSkin() {
    const weights = lids.geometry.attributes.skinWeight, joints = lids.geometry.attributes.skinIndex;
    if (weights.version === lastWeightVersion) return;
    // The lids and the eye/forehead now share the same rigid skull influence.
    // V6 updates weights when blink geometry moves, so restore this palette
    // only after such an update, not on every idle frame.
    for (let i = 0; i < weights.count; i++) {
      weights.setXYZW(i, 1, 0, 0, 0); joints.setXYZW(i, headIndex, 0, 0, 0);
    }
    weights.needsUpdate = true; joints.needsUpdate = true;
    lastWeightVersion = weights.version;
  }
  function setAttention(next = {}) {
    if (typeof next.enabled === 'boolean') control.enabled = next.enabled;
    if (next.mode === 'natural' || next.mode === 'manual') {
      if (control.mode !== next.mode) elapsed = 0;
      control.mode = next.mode;
    }
    if (Number.isFinite(next.yaw)) { control.yaw = THREE.MathUtils.clamp(next.yaw, -6, 6); control.mode = 'manual'; }
    if (Number.isFinite(next.pitch)) { control.pitch = THREE.MathUtils.clamp(next.pitch, -3, 3); control.mode = 'manual'; }
  }
  function naturalTarget() {
    const t = elapsed % 28;
    if (t > 6 && t < 7.6) return { yaw: -4, pitch: .5 };
    if (t > 16 && t < 17.8) return { yaw: 4, pitch: 0 };
    if (t > 24 && t < 25.2) return { yaw: 0, pitch: 1.5 };
    return { yaw: 0, pitch: 0 };
  }
  function update(delta, state = {}) {
    if (disposed) return;
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    base.update(delta, state);
    if (state.reset) { elapsed = 0; applied.yaw = applied.pitch = 0; }
    else elapsed += dt;
    const gait = base.getDebugState().gait;
    const movement = Math.max(gait.speed || 0, Math.abs(gait.angularSpeed || 0) * .15);
    motionEnvelope = THREE.MathUtils.smoothstep(movement, 0, .15);
    const limit = 6 - 4 * motionEnvelope;
    const target = control.mode === 'natural' ? naturalTarget() : control;
    // A walking cat mostly looks along its route. Idle glances are brief and
    // have a quiet forward hold between them; no perpetual sinusoidal wobble.
    const naturalMotion = control.mode === 'natural' ? 1 - .8 * motionEnvelope : 1;
    const yaw = control.enabled ? THREE.MathUtils.clamp(target.yaw * naturalMotion, -limit, limit) : 0;
    const pitch = control.enabled ? target.pitch * (1 - .65 * motionEnvelope) : 0;
    const blend = 1 - Math.exp(-dt * 4.5);
    applied.yaw += (yaw - applied.yaw) * blend;
    applied.pitch += (pitch - applied.pitch) * blend;
    // Cancel the source head's local-axis sway, keeping all torso and leg
    // motion unchanged. Apply the calibrated pose in the cat-root frame.
    head.quaternion.copy(headRest);
    base.object.updateMatrixWorld(true);
    base.object.getWorldQuaternion(rootWorld); inverseRoot.copy(rootWorld).invert();
    head.getWorldQuaternion(headWorld); head.parent.getWorldQuaternion(parentInverse).invert();
    offset.setFromEuler(euler.set(applied.pitch * rad, applied.yaw * rad, 0));
    offset.multiply(neutralRotation);
    worldOffset.copy(rootWorld).multiply(offset).multiply(inverseRoot);
    head.quaternion.copy(parentInverse).multiply(worldOffset).multiply(headWorld).normalize();
    updateLidSkin(); base.object.updateMatrixWorld(true);
  }
  update(0, { reset: true });
  return {
    object: base.object, update, setAttention, setBlink: base.setBlink,
    getDebugState() {
      const previous = base.getDebugState();
      return { ...previous, version: 'cat-motion-10',
        attention: { version: 'head-attention-07', enabled: control.enabled, mode: control.mode,
          appliedDegrees: { ...applied }, requestedDegrees: { yaw: control.yaw, pitch: control.pitch },
          yawLimit: 6 - 4 * motionEnvelope, elapsed, bindYawCorrection: correction,
          eyeControl: false, mouthControl: false },
        headCorrection: { sourceFaceYawDegrees: -correction, correctionDegrees: correction, skin: skin.stats },
        blink: { ...previous.blink, baseGeometryUnchanged: false, basePositionUnchanged: true,
          headSkinReweighted: true, kind: 'separate-skinned-eyelids' } };
    },
    dispose() { if (!disposed) { disposed = true; skin.dispose?.(); base.dispose(); } }
  };
}
