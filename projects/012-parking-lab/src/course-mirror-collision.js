import * as THREE from 'three';

const PART = /^(left|right)-mirror-(backing|rim-[hv]-[+-]?1|stalk|rear-support)$/;
const vector = value => ({ x: value.x, y: value.y, z: value.z });
const quaternion = value => ({ x: value.x, y: value.y, z: value.z, w: value.w });
const geometryCache = new WeakMap(), meshCache = new WeakMap();

function sourceVertices(geometry) {
  const attribute = geometry.getAttribute('position'), previous = geometryCache.get(geometry);
  if (previous?.attribute === attribute && previous.version === attribute.version) return previous;
  const seen = new Set(), vertices = [];
  for (let index = 0; index < attribute.count; index++) {
    const point = new THREE.Vector3().fromBufferAttribute(attribute, index);
    const key = point.toArray().map(value => Math.round(value * 1e8)).join(',');
    if (!seen.has(key)) { seen.add(key); vertices.push(point); }
  }
  geometry.computeBoundingBox();
  const cached = { attribute, version: attribute.version, vertices, bounds: geometry.boundingBox.clone() };
  geometryCache.set(geometry, cached); return cached;
}

function localMatrix(mesh, car) {
  // Multiply actual descendant-local transforms, so ordinary car motion does
  // not introduce inverse-world roundoff or invalidate static hull caches.
  const matrix = mesh.matrix.clone();
  let node = mesh.parent;
  while (node && node !== car) { matrix.premultiply(node.matrix); node = node.parent; }
  if (node !== car) throw new TypeError('Mirror collision geometry must descend from the supplied car.');
  return matrix;
}

/** Actual convex geometry of the exterior housings, rims and supports.
 * The accompanying mesh-oriented boxes are broadphase bounds only: the
 * narrowphase must use vertices, leaving the rounded corners' empty space.
 * Glass is excluded: adjusting the reflector moves its vertices, not the
 * fixed housing. Coordinates stay in car-root metres; its ground lift belongs
 * to egoTransform exactly once, together with the real hill pitch and yaw. */
export function getCourseMirrorCollisionContext(carModel) {
  const car = carModel.car;
  car.updateWorldMatrix(true, true);
  const egoAttachments = [];
  carModel.externalMirrors.traverse(mesh => {
    const match = PART.exec(mesh.name);
    if (!mesh.isMesh || !match || !mesh.geometry?.getAttribute('position')) return;
    for (let node = mesh; node; node = node.parent) {
      if (!node.visible) return;
      if (node === car) break;
    }
    const source = sourceVertices(mesh.geometry), bounds = source.bounds;
    if (bounds.isEmpty()) return;
    const matrix = localMatrix(mesh, car), key = matrix.elements.join(',');
    const previous = meshCache.get(mesh);
    if (previous?.source === source && previous.key === key) { egoAttachments.push(previous.shape); return; }
    const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
    const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
    const axes = [0, 1, 2].map(index => new THREE.Vector3().setFromMatrixColumn(matrix, index));
    const scales = axes.map(axis => axis.length());
    if (scales.some(scale => scale < 1e-10)) return;
    axes.forEach((axis, index) => axis.multiplyScalar(1 / scales[index]));
    // Every current car part uses rigid or axis-aligned scaled transforms.
    // Never silently hand a sheared parallelepiped to an OBB collision solver.
    if (Math.max(Math.abs(axes[0].dot(axes[1])), Math.abs(axes[1].dot(axes[2])), Math.abs(axes[2].dot(axes[0]))) > 1e-6) {
      throw new TypeError(`Mirror collision mesh ${mesh.name} must have orthogonal local axes.`);
    }
    size.multiply(new THREE.Vector3(...scales));
    const side = match[1], part = match[2];
    const label = `${side === 'left' ? '左' : '右'}后视镜${part === 'backing' ? '壳' : part.startsWith('rim') ? '框' : '支架'}`;
    const shape = { id: mesh.name, label, side, type: 'convex', center: vector(center), halfSize: vector(size), axes: axes.map(vector),
      vertices: source.vertices.map(point => vector(point.clone().applyMatrix4(matrix))) };
    meshCache.set(mesh, { source, key, shape }); egoAttachments.push(shape);
  });
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), scale = new THREE.Vector3();
  car.matrixWorld.decompose(position, orientation, scale);
  return { egoAttachments, egoTransform: { position: vector(position), quaternion: quaternion(orientation) } };
}
