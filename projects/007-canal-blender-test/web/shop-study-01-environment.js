import * as THREE from 'three';
import { setupEnvironment as setupPrevious } from './roam-environment-refine.js';
import { setupGround } from './shop-study-01-ground.js';

// A separate material/lighting study. Exported geometry and previous pages stay intact.
const assetRoot = new URL('./textures/shop-study-01/', import.meta.url);
const stripName = name => name.replace(/^ROAM01_PBR \/ /, '').split(' / ')[0];
const vector = new THREE.Vector3();
function countTriangles(model) {
  let count = 0;
  model.traverse(part => { if (part.isMesh && !part.isReflector) count += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3; });
  return count;
}

async function loadSurface(renderer, name, scale) {
  const loader = new THREE.TextureLoader();
  const textures = await Promise.all(['diff_1k.jpg', 'nor_gl_1k.png', 'rough_1k.jpg', 'ao_1k.jpg'].map(suffix => loader.loadAsync(new URL(`${name}/${name}_${suffix}`, assetRoot).href)));
  textures.forEach((texture, i) => {
    texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / scale, 1 / scale);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  });
  return textures;
}

// Material separation changes only index ownership, never a position or triangle.
function splitPart(part, bounds, frontOnly) {
  const source = part.geometry, position = source.attributes.position;
  const selected = [], remaining = [];
  const count = source.index?.count ?? position.count;
  for (let offset = 0; offset < count; offset += 3) {
    const indices = [0, 1, 2].map(i => source.index ? source.index.getX(offset + i) : offset + i);
    const points = indices.map(index => vector.fromBufferAttribute(position, index).applyMatrix4(part.matrixWorld).toArray());
    const match = bounds.some(box => points.every(point => point.every((v, axis) => v >= box.min[axis] - .0002 && v <= box.max[axis] + .0002))) &&
      (!frontOnly || points.every(p => p[2] >= -1.501 && p[2] <= -.699));
    (match ? selected : remaining).push(...indices);
  }
  if (!selected.length) return null;
  const geometry = source.clone(); geometry.setIndex(selected); geometry.clearGroups();
  // Export has no UVs: project in metres, choosing the dominant normal per vertex.
  const uv = new Float32Array(position.count * 2), normal = source.attributes.normal;
  for (let i = 0; i < position.count; i++) {
    const p = vector.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld).clone();
    const n = new THREE.Vector3().fromBufferAttribute(normal, i).transformDirection(part.matrixWorld);
    const axis = Math.abs(n.y) > Math.max(Math.abs(n.x), Math.abs(n.z)) ? 1 : Math.abs(n.x) > Math.abs(n.z) ? 0 : 2;
    uv[i * 2] = axis === 0 ? p.z : p.x;
    uv[i * 2 + 1] = axis === 1 ? -p.z : p.y;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const rest = source.clone(); rest.setIndex(remaining); rest.clearGroups(); part.geometry = rest;
  return { geometry, triangles: selected.length / 3 };
}

function facadeMaterial(source, kind, maps) {
  const plaster = kind === 'plaster_alt', stone = /^stone/.test(kind);
  const material = new THREE.MeshPhysicalMaterial({
    name: `Shop study 01 / ${kind}`, color: source.color.clone(), vertexColors: source.vertexColors,
    roughness: 1, metalness: 0, side: source.side,
    map: maps[0], normalMap: maps[1], roughnessMap: maps[2], aoMap: maps[3], aoMapIntensity: plaster ? .32 : .28,
    normalScale: new THREE.Vector2(plaster ? .30 : stone ? .32 : .20, plaster ? .30 : stone ? .32 : .20),
    clearcoat: plaster || stone ? 0 : .12, clearcoatRoughness: .32
  });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 detailSample = texture2D(map, vMapUv);
      float detailLuma = dot(detailSample.rgb, vec3(.2126,.7152,.0722));
      diffuseColor.rgb *= ${plaster ? 'mix(.78,1.13,clamp(detailLuma * 2.0,0.0,1.0))' : stone ? 'mix(.64,1.12,clamp(detailLuma * 2.2,0.0,1.0))' : 'mix(.69,1.11,clamp(detailLuma * 2.2,0.0,1.0))'};
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor, ${plaster ? '.68,.98' : stone ? '.52,.92' : '.38,.88'});`);
  };
  material.customProgramCacheKey = () => `shop-study-01-${kind}`;
  return material;
}

export async function setupEnvironment(renderer, scene, model, options = {}) {
  const previous = await setupPrevious(renderer, scene, model, options);
  scene.environmentIntensity = .31;
  scene.traverse(light => {
    if (light.isHemisphereLight) light.intensity = .20;
    if (light.isDirectionalLight) { light.intensity = .78; light.color.set(0xabc6ed); }
  });
  const geometryBefore = countTriangles(model);
  const [ground, bounds, wood, plaster, stone] = await Promise.all([
    setupGround(THREE, renderer, scene, model, options),
    fetch(new URL('./shop-study-01-bookshop-bounds.json', import.meta.url)).then(r => { if (!r.ok) throw new Error('Bookshop material bounds unavailable'); return r.json(); }),
    loadSurface(renderer, 'wood_planks_grey', 1.5), loadSurface(renderer, 'worn_plaster_wall', 1.8), loadSurface(renderer, 'cobblestone_floor_05', 2)
  ]);
  const resources = [], extraMeshes = [], selectedTriangles = {}, glassMeshes = [];
  model.updateMatrixWorld(true);
  const originals = []; model.traverse(p => { if (p.isMesh && !Array.isArray(p.material)) originals.push(p); });
  for (const part of originals) {
    const kind = stripName(part.material.name);
    if (!['wood', 'wood_light', 'teal', 'plaster_alt', 'stone', 'stone_light', 'glass'].includes(kind) || !bounds.materials[kind]) continue;
    const split = splitPart(part, bounds.materials[kind], kind === 'plaster_alt');
    if (!split) continue;
    selectedTriangles[kind] = (selectedTriangles[kind] || 0) + split.triangles;
    let material;
    if (kind === 'glass') {
      material = new THREE.MeshPhysicalMaterial({ name: 'Shop study 01 / thin old glazing', color: 0xc6d8cf, roughness: .12, metalness: 0, transparent: true, opacity: .18, depthWrite: false, side: THREE.FrontSide, envMapIntensity: .8 });
      // Thin pane: weak head-on reflection, stronger grazing reflection.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= .65 + 1.8 * pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 4.0);\n#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => 'shop-study-01-glass';
    } else material = facadeMaterial(part.material, kind, kind === 'plaster_alt' ? plaster : /^stone/.test(kind) ? stone : wood);
    const mesh = new THREE.Mesh(split.geometry, material);
    mesh.name = `Bookshop material study / ${kind}`;
    mesh.position.copy(part.position); mesh.quaternion.copy(part.quaternion); mesh.scale.copy(part.scale);
    mesh.castShadow = kind !== 'glass'; mesh.receiveShadow = kind !== 'glass';
    part.parent.add(mesh); extraMeshes.push(mesh); resources.push(material, split.geometry);
    if (kind === 'glass') glassMeshes.push(mesh);
    else previous.cameraOccluders.push(mesh);
  }
  // The old web approximation placed this light outdoors, flattening the facade.
  scene.traverse(part => {
    if (part.isPointLight && part.position.distanceTo(new THREE.Vector3(-1, 2.6, -.1)) < .02) part.intensity = 0;
    if (part.isPointLight && part.position.distanceTo(new THREE.Vector3(-7.7, 2.4, .1)) < .02) part.intensity = 8;
    if (part.isPointLight && part.position.distanceTo(new THREE.Vector3(5, 2.3, .1)) < .02) part.intensity = 12;
  });
  const indoor = new THREE.PointLight(0xffa45d, 48, 7, 2);
  indoor.name = 'Bookshop indoor light'; indoor.position.set(-1, 3.55, -2.8);
  indoor.castShadow = true; indoor.shadow.mapSize.set(512, 512);
  indoor.shadow.bias = -.00008; indoor.shadow.normalBias = .012;
  indoor.shadow.camera.near = .12; indoor.shadow.camera.far = 8;
  indoor.shadow.autoUpdate = false; indoor.shadow.needsUpdate = true;
  scene.add(indoor);
  const lamps = [-2.4, .4].map(x => {
    const light = new THREE.PointLight(0xffac60, 9, 3, 2); light.position.set(x, 3.10, -2.55); scene.add(light); return light;
  });
  const upstairs = [-2.28, .28].map(x => {
    const light = new THREE.PointLight(0xffaa58, 4, 2.5, 2); light.position.set(x, 6.5, -2.25); scene.add(light); return light;
  });

  // Capture the existing shop once. This adds local reflections without another
  // scene render per walking frame; it deliberately excludes the moving cat.
  const cube = new THREE.WebGLCubeRenderTarget(options.mobile ? 128 : 256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const probe = new THREE.CubeCamera(.1, 70, cube); probe.position.set(-1, 1.6, .35);
  const hidden = []; scene.traverse(part => { if ((part.isReflector || glassMeshes.includes(part)) && part.visible) { hidden.push(part); part.visible = false; } });
  scene.updateMatrixWorld(true); probe.update(renderer, scene); hidden.forEach(part => { part.visible = true; });
  const generator = new THREE.PMREMGenerator(renderer), localEnvironment = generator.fromCubemap(cube.texture);
  generator.dispose(); cube.dispose();
  glassMeshes.forEach(mesh => { mesh.material.envMap = localEnvironment.texture; mesh.material.needsUpdate = true; });
  const street = scene.getObjectByName('Refine ten metre street surface');
  if (street) { street.material.envMap = localEnvironment.texture; street.material.envMapIntensity = .75; street.material.needsUpdate = true; }
  const geometryAfter = countTriangles(model);
  const metadata = { geometryBefore, geometryAfter, selectedTriangles, staticReflectionProbes: 1, newProps: 0, ground: ground.metadata ?? null, sourceGeometryUnchanged: geometryBefore === geometryAfter };
  scene.userData.shopStudy = metadata;
  return {
    cameraOccluders: previous.cameraOccluders, metadata,
    update(time, state) { previous.update(time, state); ground.update?.(time, state); },
    dispose() {
      extraMeshes.forEach(mesh => mesh.removeFromParent()); resources.forEach(resource => resource.dispose());
      [indoor, ...lamps, ...upstairs].forEach(light => { light.shadow?.dispose(); light.removeFromParent(); });
      [...wood, ...plaster, ...stone].forEach(texture => texture.dispose()); localEnvironment.dispose(); ground.dispose?.(); previous.dispose();
    }
  };
}
