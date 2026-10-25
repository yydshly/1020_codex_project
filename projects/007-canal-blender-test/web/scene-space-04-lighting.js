import * as THREE from 'three';

// The opposite facades face -Z, while the existing key light comes from +Z.
// Keep that evening direction and its warm shop lights. A small bias in the
// existing sky hemisphere lifts the unlit bank without adding a frontal lamp.
const ACTIVE = new WeakMap();
const TARGET_ENVIRONMENT_INTENSITY = .36;
const TARGET_HEMISPHERE_INTENSITY = .27;
const TARGET_HEMISPHERE_POSITION = new THREE.Vector3(0, 1, -.28);

function lightSnapshot(light) {
  return {
    name: light.name || light.type,
    type: light.type,
    intensity: light.intensity,
    color: light.color?.toArray(),
    groundColor: light.groundColor?.toArray(),
    position: light.position.toArray(),
    direction: light.isHemisphereLight ? light.position.clone().normalize().toArray() : undefined,
    target: light.target?.position.toArray(),
    castShadow: light.castShadow,
  };
}

/**
 * Apply the SPACE04 sky-fill study after the inherited environment is ready.
 * No GPU work, geometry/material writes, textures, lamps or shadow maps are
 * created. `strength` is a bounded blend from the inherited lighting to this
 * single conservative proposal; production uses its default value of one.
 */
export function applyLighting(scene, renderer, options = {}) {
  if (ACTIVE.has(scene)) return ACTIVE.get(scene);
  const hemispheres = [], preservedLights = [];
  scene.traverse(object => {
    if (object.isHemisphereLight) hemispheres.push(object);
    else if (object.isLight) preservedLights.push(object);
  });
  if (hemispheres.length !== 1) {
    throw new Error('SPACE04 expects the inherited single hemisphere sky-fill light.');
  }
  const strength = THREE.MathUtils.clamp(
    Number.isFinite(options.strength) ? options.strength : 1, 0, 1,
  );
  const hemisphere = hemispheres[0];
  const previous = {
    hemisphereIntensity: hemisphere.intensity,
    hemispherePosition: hemisphere.position.clone(),
    environmentIntensity: scene.environmentIntensity,
    metadata: scene.userData.space04Lighting,
    hadMetadata: Object.hasOwn(scene.userData, 'space04Lighting'),
  };
  const beforeHemisphere = lightSnapshot(hemisphere);
  const exposure = renderer.toneMappingExposure;
  const readOnlyLights = preservedLights.map(lightSnapshot);

  hemisphere.intensity = THREE.MathUtils.lerp(previous.hemisphereIntensity, TARGET_HEMISPHERE_INTENSITY, strength);
  hemisphere.position.lerpVectors(previous.hemispherePosition, TARGET_HEMISPHERE_POSITION, strength);
  hemisphere.updateMatrixWorld(true);
  scene.environmentIntensity = THREE.MathUtils.lerp(previous.environmentIntensity, TARGET_ENVIRONMENT_INTENSITY, strength);

  const key = preservedLights.find(light => light.isDirectionalLight);
  const keyDirection = key?.position.clone().sub(key.target.position).normalize();
  const facadeNormal = new THREE.Vector3(0, 0, -1);
  const keyDot = keyDirection ? facadeNormal.dot(keyDirection) : null;
  const metadata = {
    version: 'space-04-conservative-sky-fill',
    strength,
    hemisphere: { before: beforeHemisphere, after: lightSnapshot(hemisphere) },
    environmentIntensity: { before: previous.environmentIntensity, after: scene.environmentIntensity },
    exposure: { before: exposure, after: renderer.toneMappingExposure, changed: false },
    originalDirectionalAndWarmLights: readOnlyLights,
    originalDirectionalAndWarmLightsChanged: false,
    backgroundChanged: false,
    fogChanged: false,
    environmentTextureChanged: false,
    geometryOrMaterialsChanged: false,
    addedLights: 0,
    addedShadowMaps: 0,
    diagnosis: {
      oppositeFacadeNormal: facadeNormal.toArray(),
      existingKeyDirection: keyDirection?.toArray() ?? null,
      keyDotOppositeFacade: keyDot,
      directKeyContributionToFront: keyDot === null ? null : Math.max(0, keyDot),
      sourceEnvironment: 'Existing lookdev-v4-world.hdr, including its source-world strength; unchanged.',
      explanation: 'The opposite front has no direct key light. A 15.6-degree sky-fill bias toward the river opens its shadows; material albedo and glass response are handled separately.',
    },
  };
  scene.userData.space04Lighting = metadata;
  let disposed = false;
  const handle = {
    metadata,
    dispose() {
      if (disposed) return;
      disposed = true;
      hemisphere.intensity = previous.hemisphereIntensity;
      hemisphere.position.copy(previous.hemispherePosition);
      hemisphere.updateMatrixWorld(true);
      scene.environmentIntensity = previous.environmentIntensity;
      if (scene.userData.space04Lighting === metadata) {
        if (previous.hadMetadata) scene.userData.space04Lighting = previous.metadata;
        else delete scene.userData.space04Lighting;
      }
      ACTIVE.delete(scene);
    },
  };
  ACTIVE.set(scene, handle);
  return handle;
}
