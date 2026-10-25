import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createCockpitSettings } from './cockpit.js';
import { CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { COURSE_INTERIOR_MIRROR_CENTER } from './course-observation.js';

const WIDTH = .256, HEIGHT = .082;
const referenceEye = new THREE.Vector3(.39, 1.28, 1.10);
const center = new THREE.Vector3(COURSE_INTERIOR_MIRROR_CENTER.x, COURSE_INTERIOR_MIRROR_CENTER.y, COURSE_INTERIOR_MIRROR_CENTER.z);
// This is one fixed glass adjustment. Moving the seat changes the reflection,
// rather than automatically retargeting the mirror at the rear window.
const normal = referenceEye.clone().sub(center).normalize().add(new THREE.Vector3(0, 1.28, -.23).sub(center).normalize()).normalize();
const right = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
const up = normal.clone().cross(right).normalize();

export function courseInteriorMirrorFrame(settings = createCockpitSettings()) {
  return { center: center.clone(), normal: normal.clone(), right: right.clone(), up: up.clone(), width: WIDTH, height: HEIGHT,
    eye: new THREE.Vector3(.39, settings.seatHeight, settings.seatFore) };
}

/** A plane mirror has a single exact virtual eye. The texture matrix projects
 * the reflected world onto the real glass; it is not a rear-facing camera at
 * the vehicle bumper and receives no extra horizontal screen flip. */
export function createCourseInteriorMirror({ renderer, world, carModel, settings = createCockpitSettings() }) {
  let current = { seatHeight: settings.seatHeight, seatFore: settings.seatFore }, invalid = true, disposed = false, lastKey = '';
  const adjustment = new THREE.Quaternion();
  const group = new THREE.Group(); group.name = 'course-interior-rearview-mirror'; carModel.car.add(group);
  const orientation = new THREE.Matrix4().makeBasis(right, up, normal);
  const localCenter = center.clone(); localCenter.y -= CAR_VISUAL_ROOT_Y;
  const trim = new THREE.MeshStandardMaterial({ color: '#293135', roughness: .7 });
  const pieces = [];
  const part = (name, size, position) => {
    const object = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, Math.min(.008, size[0] / 3, size[1] / 3)), trim);
    object.name = name; object.position.copy(position); object.quaternion.setFromRotationMatrix(orientation);
    object.castShadow = true; object.receiveShadow = true; group.add(object); pieces.push(object); return object;
  };
  part('interior-mirror-backing', [WIDTH + .028, HEIGHT + .023, .025], localCenter.clone().addScaledVector(normal, -.018));
  for (const sign of [-1, 1]) {
    part(`interior-mirror-rim-h-${sign}`, [WIDTH + .018, .008, .012], localCenter.clone().addScaledVector(up, sign * (HEIGHT / 2 + .004)).addScaledVector(normal, .001));
    part(`interior-mirror-rim-v-${sign}`, [.008, HEIGHT + .014, .012], localCenter.clone().addScaledVector(right, sign * (WIDTH / 2 + .004)).addScaledVector(normal, .001));
  }
  const stemFrom = new THREE.Vector3(0, 1.401 - CAR_VISUAL_ROOT_Y, 1.595), stemTo = localCenter.clone().addScaledVector(up, HEIGHT / 2).addScaledVector(normal, -.021);
  const stemDelta = stemTo.clone().sub(stemFrom);
  const stem = part('interior-mirror-stem', [.016, stemDelta.length(), .016], stemFrom.clone().add(stemTo).multiplyScalar(.5));
  stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stemDelta.normalize());
  const target = new THREE.WebGLRenderTarget(1024, 328, { colorSpace: THREE.SRGBColorSpace });
  const textureMatrix = new THREE.Matrix4();
  const glassMaterial = new THREE.ShaderMaterial({
    name: 'CourseInteriorMirror', toneMapped: false,
    uniforms: { reflection: { value: target.texture }, textureMatrix: { value: textureMatrix } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 projectedUV;
      void main(){ projectedUV=textureMatrix*vec4(position,1.); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D reflection; varying vec4 projectedUV;
      void main(){ gl_FragColor=texture2DProj(reflection,projectedUV); gl_FragColor.a=1.;
      #include <colorspace_fragment>
      }`,
    side: THREE.FrontSide,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), glassMaterial);
  surface.name = 'interior-mirror-glass'; surface.position.copy(localCenter); surface.quaternion.setFromRotationMatrix(orientation);
  surface.castShadow = false; surface.receiveShadow = false; group.add(surface);
  const reflectionCamera = new THREE.PerspectiveCamera(16, WIDTH / HEIGHT, .025, 450);
  const mirrorPosition = new THREE.Vector3(), worldEye = new THREE.Vector3(), worldNormal = new THREE.Vector3(), reflectedTarget = new THREE.Vector3();
  function applyAdjustment(next) {
    adjustment.copy(next).normalize();
    // The housing swivels around its centre; its roof anchor must remain on
    // the car. Reconnect the short stem instead of rotating the roof endpoint.
    group.quaternion.copy(adjustment);
    group.position.copy(localCenter).sub(localCenter.clone().applyQuaternion(adjustment));
    group.updateMatrix();
    const from = stemFrom.clone().applyMatrix4(group.matrix.clone().invert()), delta = stemTo.clone().sub(from);
    stem.geometry.dispose(); stem.geometry = new RoundedBoxGeometry(.016, delta.length(), .016, 2, .005333333333333333);
    stem.position.copy(from).add(stemTo).multiplyScalar(.5);
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    group.updateMatrixWorld(true); invalid = true;
  }
  function prepare({ dirty = false } = {}) {
    if (disposed) return false;
    carModel.car.updateMatrixWorld(true);
    const key = JSON.stringify([current.seatHeight, current.seatFore, carModel.car.matrixWorld.elements]);
    if (!dirty && !invalid && key === lastKey) return false;
    mirrorPosition.setFromMatrixPosition(surface.matrixWorld);
    worldNormal.set(0, 0, 1).transformDirection(surface.matrixWorld);
    worldEye.set(.39, current.seatHeight - CAR_VISUAL_ROOT_Y, current.seatFore).applyMatrix4(carModel.car.matrixWorld);
    const distance = worldEye.clone().sub(mirrorPosition).dot(worldNormal);
    reflectionCamera.position.copy(worldEye).addScaledVector(worldNormal, -2 * distance);
    reflectedTarget.copy(mirrorPosition);
    reflectionCamera.up.set(0, 1, 0).transformDirection(carModel.car.matrixWorld).reflect(worldNormal);
    reflectionCamera.lookAt(reflectedTarget); reflectionCamera.updateMatrixWorld(true); reflectionCamera.updateProjectionMatrix();
    textureMatrix.set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1)
      .multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse).multiply(surface.matrixWorld);
    const clip = new THREE.Plane().setFromNormalAndCoplanarPoint(worldNormal, mirrorPosition.clone().addScaledVector(worldNormal, -.001));
    const previous = { target: renderer.getRenderTarget(), viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(), autoClear: renderer.autoClear, shadowUpdate: renderer.shadowMap.autoUpdate,
      clippingPlanes: renderer.clippingPlanes, localClippingEnabled: renderer.localClippingEnabled };
    const visibility = [group, carModel.externalMirrors].filter(Boolean).map(object => ({ object, visible: object.visible }));
    try {
      for (const { object } of visibility) object.visible = false;
      renderer.shadowMap.autoUpdate = false; renderer.autoClear = true; renderer.setScissorTest(false);
      renderer.clippingPlanes = [...(previous.clippingPlanes || []), clip];
      renderer.setRenderTarget(target); renderer.render(world, reflectionCamera);
    } finally {
      visibility.forEach(({ object, visible }) => { object.visible = visible; });
      renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor); renderer.setScissorTest(previous.scissorTest);
      renderer.autoClear = previous.autoClear; renderer.shadowMap.autoUpdate = previous.shadowUpdate;
      renderer.clippingPlanes = previous.clippingPlanes; renderer.localClippingEnabled = previous.localClippingEnabled;
    }
    lastKey = key; invalid = false; return true;
  }
  return { group, surface, prepare,
    setSettings(next) { if (next.seatHeight !== current.seatHeight || next.seatFore !== current.seatFore) { current = { seatHeight: next.seatHeight, seatFore: next.seatFore }; invalid = true; } },
    invalidate() { invalid = true; },
    getFrame() {
      const frame = courseInteriorMirrorFrame(current);
      for (const name of ['normal', 'right', 'up']) frame[name].applyQuaternion(adjustment);
      return frame;
    },
    getAdjustment() { return { quaternion: adjustment.toArray() }; },
    setAdjustment(value) {
      const values = value?.quaternion;
      if (!Array.isArray(values) || values.length !== 4 || values.some(v => typeof v !== 'number' || !Number.isFinite(v))) return false;
      const candidate = new THREE.Quaternion(...values), length = candidate.length();
      if (length < .5 || length > 1.5) return false;
      candidate.normalize();
      // The API restores our own snapshots; malformed external state must not
      // turn the reflector through the roof or face it away from the driver.
      if (candidate.angleTo(new THREE.Quaternion()) > Math.PI / 4) return false;
      applyAdjustment(candidate); return true;
    },
    recommendForSeat() {
      const currentEye = new THREE.Vector3(.39, current.seatHeight, current.seatFore);
      const adjustedNormal = currentEye.sub(center).normalize().add(new THREE.Vector3(0, 1.28, -.23).sub(center).normalize()).normalize();
      // Eye changes alone never rotate the glass: this is an explicit request.
      applyAdjustment(new THREE.Quaternion().setFromUnitVectors(normal, adjustedNormal));
      return { adjusted: true, target: 'rear-window', seatHeight: current.seatHeight, seatFore: current.seatFore };
    },
    dispose() { if (disposed) return; disposed = true; target.dispose(); glassMaterial.dispose(); trim.dispose(); surface.geometry.dispose(); pieces.forEach(object => object.geometry.dispose()); group.removeFromParent(); },
  };
}
