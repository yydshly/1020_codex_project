import { createCat as createBaseCat } from "./roam-cat-v3.js";

// Additive head-only experiment. The V3 model, neck, body and foot solver stay
// unchanged. yaw/pitch inputs are degrees relative to the captured head pose;
// positive yaw turns toward root +X, positive pitch lowers the nose.
export async function createCat(THREE) {
  const base = await createBaseCat(THREE);
  let head;
  base.object.traverse(part => { if (part.isBone && part.name === "head") head = part; });
  if (!head) { base.dispose(); throw new Error("Head attention requires the V3 head joint"); }
  const control = { enabled: true, mode: "natural", yaw: 0, pitch: 0 };
  const applied = { yaw: 0, pitch: 0 };
  const angles = { yaw: 0, pitch: 0 };
  const rootWorld = new THREE.Quaternion(), inverseRoot = new THREE.Quaternion();
  const headWorld = new THREE.Quaternion(), parentInverse = new THREE.Quaternion();
  const offset = new THREE.Quaternion(), worldOffset = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const rad = Math.PI / 180;
  let elapsed = 0, disposed = false, motionEnvelope = 0;
  const naturalPoses = [
    { duration: 2.0, yaw: 0, pitch: 0 },
    { duration: 2.6, yaw: -6, pitch: 1 },
    { duration: 4.4, yaw: 0, pitch: 0 },
    { duration: 3.0, yaw: 5, pitch: 0 },
    { duration: 5.2, yaw: 0, pitch: 0 },
    { duration: 2.3, yaw: 0, pitch: 3 },
    { duration: 5.5, yaw: 0, pitch: 0 }
  ];
  const cycleDuration = naturalPoses.reduce((sum, pose) => sum + pose.duration, 0);
  function naturalTarget() {
    let t = elapsed % cycleDuration;
    for (const pose of naturalPoses) { if (t < pose.duration) return pose; t -= pose.duration; }
    return naturalPoses[0];
  }
  function setAttention(next = {}) {
    if (typeof next.enabled === "boolean") control.enabled = next.enabled;
    if (next.mode === "natural" || next.mode === "manual") {
      if (next.mode !== control.mode) elapsed = 0;
      control.mode = next.mode;
    }
    if (Number.isFinite(next.yaw)) { control.yaw = THREE.MathUtils.clamp(next.yaw, -8, 8); control.mode = "manual"; }
    if (Number.isFinite(next.pitch)) { control.pitch = THREE.MathUtils.clamp(next.pitch, -4, 4); control.mode = "manual"; }
  }
  function update(delta, state = {}) {
    if (disposed) return;
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    base.update(delta, state);
    if (state.reset) {
      elapsed = 0; angles.yaw = angles.pitch = applied.yaw = applied.pitch = 0; motionEnvelope = 0;
      return;
    }
    elapsed += dt;
    const gait = base.getDebugState().gait;
    const motion = Math.max(gait.speed || 0, Math.abs(gait.angularSpeed || 0) * .15);
    // The envelope contracts continuously during acceleration, reaching the
    // 4-degree moving limit by 0.15 m/s (or 1 rad/s of root turning).
    motionEnvelope = THREE.MathUtils.smoothstep(motion, 0, .15);
    const yawLimit = 8 - 4 * motionEnvelope;
    const pose = control.mode === "natural" ? naturalTarget() : control;
    const targetYaw = control.enabled ? THREE.MathUtils.clamp(pose.yaw, -yawLimit, yawLimit) : 0;
    const targetPitch = control.enabled ? THREE.MathUtils.clamp(pose.pitch, -4, 4) : 0;
    const blend = 1 - Math.exp(-dt * 5.5);
    angles.yaw += (targetYaw - angles.yaw) * blend;
    angles.pitch += (targetPitch - angles.pitch) * blend;
    applied.yaw = THREE.MathUtils.clamp(angles.yaw, -yawLimit, yawLimit);
    applied.pitch = THREE.MathUtils.clamp(angles.pitch, -4, 4);
    if (!control.enabled && Math.abs(applied.yaw) + Math.abs(applied.pitch) < .0001) {
      applied.yaw = applied.pitch = angles.yaw = angles.pitch = 0;
    }
    if (applied.yaw || applied.pitch) {
      base.object.getWorldQuaternion(rootWorld);
      inverseRoot.copy(rootWorld).invert();
      head.getWorldQuaternion(headWorld);
      head.parent.getWorldQuaternion(parentInverse).invert();
      offset.setFromEuler(euler.set(applied.pitch * rad, applied.yaw * rad, 0));
      worldOffset.copy(rootWorld).multiply(offset).multiply(inverseRoot);
      head.quaternion.copy(parentInverse).multiply(worldOffset).multiply(headWorld).normalize();
      base.object.updateMatrixWorld(true);
    }
  }
  function getDebugState() {
    return { ...base.getDebugState(), attention: {
      version: "head-attention-04", enabled: control.enabled, mode: control.mode,
      appliedDegrees: { ...applied }, requestedDegrees: { yaw: control.yaw, pitch: control.pitch },
      yawLimit: 8 - 4 * motionEnvelope, elapsed, eyeControl: false, mouthControl: false
    } };
  }
  return { object: base.object, update, setAttention, getDebugState,
    dispose() { if (!disposed) { disposed = true; base.dispose(); } } };
}
