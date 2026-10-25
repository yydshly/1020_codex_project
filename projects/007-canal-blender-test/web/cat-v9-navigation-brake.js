// Slow before a navigation boundary so the gait can finish its current steps.
// Navigation remains the authority for the final collision-resolved movement.
export function limitApproachSpeed(navigation, position, desired, currentSpeed) {
  const requestedSpeed = Math.hypot(desired.x, desired.z);
  if (requestedSpeed < .0001) return { blocked: false, available: 0, limit: 0 };
  const directionX = desired.x / requestedSpeed, directionZ = desired.z / requestedSpeed;
  const probeDistance = Math.max(.12, currentSpeed * currentSpeed / (2 * 1.8) + .12);
  const probe = navigation.move(position, { x: directionX * probeDistance, z: directionZ * probeDistance });
  const available = Math.max(0, Math.min(probeDistance,
    (probe.x - position.x) * directionX + (probe.z - position.z) * directionZ));
  const blocked = available < probeDistance - .0001;
  const limit = blocked ? Math.sqrt(2 * 1.8 * Math.max(0, available - .05)) : requestedSpeed;
  if (limit < requestedSpeed) {
    desired.x *= limit / requestedSpeed;
    desired.z *= limit / requestedSpeed;
  }
  return { blocked, available, limit, probeDistance };
}
