import { ExtrudeGeometry, Shape } from 'three';
import { CAR } from './vehicle.js';

/** Existing body envelope, with open wheel arches aligned to both axles.
 * The returned geometry is already in vehicle-local coordinates. */
export function createCarBodyGeometry() {
  const width = 1.78, bottom = 0.36, top = 0.94, rear = -0.79, front = 3.43;
  const wheelHeight = 0.34, radius = 0.375;
  const endAngle = Math.asin((bottom - wheelHeight) / radius);
  const startAngle = Math.PI - endAngle;
  const profile = new Shape();
  // Shape X is vehicle Z. Walking each upper arc clockwise removes material
  // below it while leaving the door panel and the top of the body connected.
  profile.moveTo(rear, bottom);
  for (const axle of [0, CAR.wheelbase]) {
    profile.lineTo(axle + radius * Math.cos(startAngle), bottom);
    profile.absarc(axle, wheelHeight, radius, startAngle, endAngle, true);
  }
  profile.lineTo(front, bottom);
  profile.lineTo(front, top);
  profile.lineTo(rear, top);
  profile.closePath();
  const geometry = new ExtrudeGeometry(profile, { depth: width, steps: 1, bevelEnabled: false, curveSegments: 24 });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(width / 2, 0, 0);
  return geometry;
}
