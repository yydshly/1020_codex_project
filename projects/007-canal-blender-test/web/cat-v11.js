import { createCat as createV10 } from './cat-v10.js';

// Locomotion-linked head/neck and tail poses for the preserved V10 cat.
// The old source scan has an upright, hooked tail. Rotate from its measured
// neutral bind pose rather than accumulating another offset on V10's tail.
export async function createCat(THREE) {
  const base = await createV10(THREE);
  base.setAttention({ enabled: false });
  base.update(0, { reset: true });
  const object = base.object, bones = new Map();
  object.traverse(node => { if (node.isBone) bones.set(node.name, node); });
  const head = bones.get('head'), neck = bones.get('neck');
  const tail = ['tail_01', 'tail_02', 'tail_03', 'tail_04'].map(name => bones.get(name));
  if (!head || !neck || tail.some(node => !node)) { base.dispose(); throw new Error('V11 requires the preserved head, neck and four tail joints'); }
  object.updateMatrixWorld(true);
  const rootQ = new THREE.Quaternion(), inverseRoot = new THREE.Quaternion();
  object.getWorldQuaternion(rootQ); inverseRoot.copy(rootQ).invert();
  const neutralHead = head.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverseRoot);
  const neutralNeck = neck.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverseRoot);
  const tailRest = tail.map(node => node.quaternion.clone());
  // Measured end of tail_04 in the preserved rig metadata, shifted with the
  // same neutral model height. This is a diagnostic point, not new geometry.
  const tailTipLocal = tail[3].worldToLocal(object.localToWorld(new THREE.Vector3(.015, .469, -.18)));
  const inverseParent = new THREE.Quaternion(), worldQ = new THREE.Quaternion();
  const deltaQ = new THREE.Quaternion(), relativeQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const rad = Math.PI / 180, clamp = THREE.MathUtils.clamp;
  const smooth = THREE.MathUtils.smoothstep;
  const control = { enabled: true, mode: 'natural', yaw: 0, pitch: 0 };
  const applied = { yaw: 0, pitch: 0, roll: 0, tailPitch: -.52, tailYaw: 0, tailMid: 0, tailTip: 0, tailCurl: 0 };
  const target = { ...applied };
  let elapsed = 0, idleTime = 0, previousSpeed = 0, acceleration = 0, turnRate = 0, movingBlend = 0, runBlend = 0;
  let speed = 0, disposed = false, initialized = false, lastPosition = object.position.clone();
  const damp = (value, next, rate, dt) => value + (next - value) * (1 - Math.exp(-rate * dt));

  function setAttention(next = {}) {
    if (typeof next.enabled === 'boolean') control.enabled = next.enabled;
    if (next.mode === 'natural' || next.mode === 'manual') control.mode = next.mode;
    if (Number.isFinite(next.yaw)) { control.yaw = clamp(next.yaw, -8, 8); control.mode = 'manual'; }
    if (Number.isFinite(next.pitch)) { control.pitch = clamp(next.pitch, -4, 5); control.mode = 'manual'; }
  }
  function rootPose(node, neutral, pitch, yaw, roll) {
    deltaQ.setFromEuler(euler.set(pitch, yaw, roll));
    worldQ.copy(rootQ).multiply(deltaQ).multiply(neutral);
    node.parent.getWorldQuaternion(inverseParent).invert();
    node.quaternion.copy(inverseParent).multiply(worldQ).normalize();
    node.updateMatrixWorld(true);
  }
  function addRootOffset(node, pitch, yaw, roll) {
    node.getWorldQuaternion(worldQ);
    deltaQ.setFromEuler(euler.set(pitch, yaw, roll));
    relativeQ.copy(rootQ).multiply(deltaQ).multiply(inverseRoot);
    worldQ.premultiply(relativeQ);
    node.parent.getWorldQuaternion(inverseParent).invert();
    node.quaternion.copy(inverseParent).multiply(worldQ).normalize();
    node.updateMatrixWorld(true);
  }
  function update(delta, state = {}) {
    if (disposed) return;
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const reset = !!state.reset || !initialized || object.position.distanceTo(lastPosition) > .8;
    base.update(delta, state);
    const gait = base.getDebugState().gait;
    speed = Math.max(0, gait.speed || 0);
    if (reset) {
      elapsed = idleTime = 0; previousSpeed = speed; acceleration = turnRate = movingBlend = runBlend = 0;
      Object.assign(applied, { yaw: 0, pitch: 0, roll: 0, tailPitch: -.52, tailYaw: 0, tailMid: 0, tailTip: 0, tailCurl: 0 });
      initialized = true;
    } else {
      elapsed += dt;
      acceleration = damp(acceleration, clamp(dt > 0 ? (speed - previousSpeed) / dt : 0, -2.2, 2.2), 7, dt);
      turnRate = damp(turnRate, clamp(gait.angularSpeed || 0, -2.5, 2.5), 8, dt);
      movingBlend = damp(movingBlend, smooth(Math.max(speed, Math.abs(turnRate) * .12), .015, .25), 5, dt);
      runBlend = damp(runBlend, smooth(speed, .48, .85), 5, dt);
      idleTime = speed < .02 && Math.abs(turnRate) < .05 ? idleTime + dt : 0;
    }
    previousSpeed = speed; lastPosition.copy(object.position);
    const phase = gait.phase || 0;
    const lead = clamp(Number.isFinite(state.lookAheadYaw) ? state.lookAheadYaw : turnRate * .18, -.55, .55);
    // Brief, separated idle looks. Movement replaces these with a route look;
    // no permanent sideways head pose and no endless idle pendulum.
    const idlePhase = idleTime % 21;
    const glance = idlePhase > 5 && idlePhase < 7.8 ? -Math.sin((idlePhase - 5) / 2.8 * Math.PI) * 5
      : idlePhase > 14 && idlePhase < 16.4 ? Math.sin((idlePhase - 14) / 2.4 * Math.PI) * 4 : 0;
    const manualWeight = 1 - .45 * movingBlend;
    target.yaw = control.enabled ? clamp((lead * .36 + turnRate * .055) / rad +
      (control.mode === 'manual' ? control.yaw * manualWeight : glance * (1 - movingBlend)), -12, 12) : 0;
    // +X pitches the face down in this +Z-forward rig. The calibrated skull
    // orientation remains the starting pose; the neck takes only 25% of it.
    target.pitch = control.enabled ? 1.8 * movingBlend + 4.8 * runBlend + acceleration * .85 +
      Math.sin(phase * Math.PI * 4 + .35) * movingBlend * (.35 + .3 * runBlend) +
      (control.mode === 'manual' ? control.pitch * manualWeight : 0) : 0;
    target.pitch = clamp(target.pitch, -3, 9);
    target.roll = control.enabled ? clamp(-turnRate * 1.0 * movingBlend, -2, 2) : 0;
    // Negative root-frame X lowers the upright source tail backward. This
    // replaces V10's base rotation rather than doubling it. Running carries
    // the tail behind the pelvis; it does not wag to every footfall.
    target.tailPitch = -.52 - .48 * movingBlend - .46 * runBlend - acceleration * .035 +
      Math.sin(phase * Math.PI * 2 - .7) * .018 * movingBlend;
    target.tailYaw = clamp(-turnRate * .065 - lead * .1, -.18, .18);
    const idleTip = idlePhase > 8 && idlePhase < 10.5 ? Math.sin((idlePhase - 8) / 2.5 * Math.PI) * .065 * (1 - movingBlend) : 0;
    target.tailCurl = -.05 * movingBlend - .075 * runBlend;
    applied.yaw = damp(applied.yaw, target.yaw, 7, dt);
    applied.pitch = damp(applied.pitch, target.pitch, 7, dt);
    applied.roll = damp(applied.roll, target.roll, 6, dt);
    applied.tailPitch = damp(applied.tailPitch, target.tailPitch, 4.5, dt);
    applied.tailYaw = damp(applied.tailYaw, target.tailYaw, 4, dt);
    // A delayed chain follows the change in direction; when the root stops
    // turning its tip settles later, without an undriven periodic wag.
    target.tailMid = applied.tailYaw * .55;
    applied.tailMid = damp(applied.tailMid, target.tailMid, 3.5, dt);
    target.tailTip = applied.tailMid * .6 + idleTip;
    applied.tailTip = damp(applied.tailTip, target.tailTip, 3, dt);
    applied.tailCurl = damp(applied.tailCurl, target.tailCurl, 3.5, dt);

    object.getWorldQuaternion(rootQ); inverseRoot.copy(rootQ).invert();
    // Root-relative orientation cancels the small chest rotations, keeping
    // the gaze steadier than the shoulders. Bone positions stay unchanged.
    rootPose(neck, neutralNeck, applied.pitch * rad * .25, applied.yaw * rad * .22, applied.roll * rad * .2);
    rootPose(head, neutralHead, applied.pitch * rad, applied.yaw * rad, applied.roll * rad);
    tail.forEach((node, i) => { node.quaternion.copy(tailRest[i]); node.updateMatrixWorld(true); });
    addRootOffset(tail[0], applied.tailPitch, applied.tailYaw, 0);
    addRootOffset(tail[1], applied.tailCurl * .6, applied.tailMid, 0);
    addRootOffset(tail[2], applied.tailCurl * .4, applied.tailTip, 0);
    addRootOffset(tail[3], 0, applied.tailTip * .35, 0);
    object.updateMatrixWorld(true);
  }
  update(0, { reset: true });
  return {
    object, update, setAttention, setBlink: base.setBlink,
    getDebugState() {
      const previous = base.getDebugState();
      const tip = object.worldToLocal(tail[3].localToWorld(tailTipLocal.clone()));
      const points = Object.fromEntries([neck, head, ...tail].map(node => [node.name, object.worldToLocal(node.getWorldPosition(new THREE.Vector3())).toArray()]));
      return { ...previous, version: 'cat-motion-11', attention: { ...previous.attention,
        version: 'motion-attention-11', enabled: control.enabled, mode: control.mode,
        appliedDegrees: { yaw: applied.yaw, pitch: applied.pitch, roll: applied.roll },
        requestedDegrees: { yaw: control.yaw, pitch: control.pitch }, yawLimit: 12 },
        secondaryMotion: { version: 11, speed, acceleration, turnRate, movingBlend, runBlend, elapsed, idleTime,
          target: { ...target }, applied: { ...applied }, tailTip: tip.toArray(), points,
          headStabilization: 'root-relative orientation; bone positions unchanged',
          tailPose: 'absolute neutral reset with delayed direction response' } };
    },
    dispose() { if (disposed) return; disposed = true; base.dispose(); }
  };
}
