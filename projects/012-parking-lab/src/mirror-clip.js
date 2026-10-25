import * as THREE from 'three';

/** Keep only the reflecting side of a finite convex mirror. The plane includes
 * the deepest edge sag plus 1mm tolerance, so the real glass is never clipped.
 * World-space frames use defaults. Vehicle-local frames supply the car matrix
 * and the visual root's height, subtracted exactly once before transformation. */
export function createMirrorClipPlane(frame, { matrix = new THREE.Matrix4(), rootY = 0 } = {}) {
  const radius = Math.hypot(frame.width / 2, frame.height / 2);
  if (!Number.isFinite(rootY) || !Number.isFinite(frame.radius) || frame.radius <= radius || !Number.isFinite(radius))
    throw new RangeError('Mirror clipping requires a finite root height and a valid convex surface.');
  const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
  if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 1e-12) throw new RangeError('Mirror clipping requires a finite nonzero normal.');
  normal.normalize();
  const center = new THREE.Vector3(frame.center.x, frame.center.y - rootY, frame.center.z);
  const sag = frame.radius - Math.sqrt(frame.radius ** 2 - radius ** 2);
  return new THREE.Plane(normal, -normal.dot(center) + sag + .001).applyMatrix4(matrix);
}
