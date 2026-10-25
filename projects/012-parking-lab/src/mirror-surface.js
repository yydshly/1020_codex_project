import * as THREE from 'three';
import { sampleMirrorRay } from './cockpit.js';

/**
 * Build a real finite spherical mirror in vehicle-local coordinates. The input
 * frame has a zero world X/Z pose; its Y coordinates are world heights. Root Y
 * is subtracted exactly once so attaching this geometry to the car preserves
 * the optical surface's world height. UVs address the SAME source camera as the
 * optional teaching card; reflection is already encoded and is never flipped.
 */
export function createMirrorSurfaceGeometry(frame, optics, { rootY = 0 } = {}) {
  const geometry = new THREE.PlaneGeometry(frame.width, frame.height, optics.columns, optics.rows);
  return updateMirrorSurfaceGeometry(geometry, frame, optics, { rootY });
}

export function updateMirrorSurfaceGeometry(geometry, frame, optics, { rootY = 0 } = {}) {
  if (!Number.isFinite(rootY)) throw new RangeError('Mirror root height must be finite.');
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uvs = geometry.getAttribute('uv');
  const count = (optics.columns + 1) * (optics.rows + 1);
  if (positions?.count !== count || normals?.count !== count || uvs?.count !== count || optics.uvs.length !== count * 2) {
    throw new RangeError('Physical mirror geometry must match the optical sampling grid.');
  }
  for (let row = 0; row <= optics.rows; row++) for (let column = 0; column <= optics.columns; column++) {
    const ray = sampleMirrorRay(frame, -1 + 2 * column / optics.columns, 1 - 2 * row / optics.rows);
    const index = row * (optics.columns + 1) + column;
    positions.setXYZ(index, ray.origin.x, ray.origin.y - rootY, ray.origin.z);
    normals.setXYZ(index, ray.normal.x, ray.normal.y, ray.normal.z);
  }
  uvs.array.set(optics.uvs);
  positions.needsUpdate = true; normals.needsUpdate = true; uvs.needsUpdate = true;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
