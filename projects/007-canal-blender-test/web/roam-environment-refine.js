import * as THREE from "three";
import { setupEnvironment as setupBaseEnvironment } from "./roam-environment.js";

// The refinement is an overlay in this independent viewer. The exported model,
// earlier viewer and navigation heights are deliberately left intact.
export const REFINED_STREET = Object.freeze({ minX: -7, maxX: 3, minZ: -1.06, maxZ: 1.55, height: .853 });

function hash(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 91.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function makeStoneTextures(renderer, mobile) {
  const size = mobile ? 512 : 1024;
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const rows = 11;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / size * 4, pz = y / size * 4;
      const row = Math.floor(pz / 4 * rows);
      const zLocal = (pz / 4 * rows - row) * (4 / rows);
      const columnWidth = row % 3 === 0 ? .8 : row % 3 === 1 ? 4 / 7 : 4 / 6;
      const offset = (row % 2) * columnWidth * .43;
      const column = Math.floor((px + offset) / columnWidth);
      const xLocal = (px + offset) - column * columnWidth;
      const grain = noise(px * 43, pz * 43, 9);
      const chippedEdge = (noise(px * 29, pz * 29, 4) - .5) * .009;
      const edge = Math.min(xLocal, columnWidth - xLocal, zLocal, 4 / rows - zLocal) + chippedEdge;
      const bevel = THREE.MathUtils.smoothstep(edge, .0045, .022);
      const stone = hash(column, row, 33);
      const mineral = noise(px * 6, pz * 6, 12) * .55 + noise(px * 24, pz * 24, 17) * .28 + grain * .17;
      const damp = THREE.MathUtils.smoothstep(noise(px * .85, pz * .85, 1), .30, .72);
      const broad = .78 + .24 * stone;
      const mottled = .82 + mineral * .30;
      const wetDarkening = 1 - damp * .16;
      const value = broad * mottled * wetDarkening;
      const i = y * size + x, j = i * 4;
      const mortar = .42 + grain * .05;
      color[j] = Math.round((123 * value) * bevel + 93 * mortar * (1 - bevel));
      color[j + 1] = Math.round((124 * value) * bevel + 96 * mortar * (1 - bevel));
      color[j + 2] = Math.round((117 * value) * bevel + 88 * mortar * (1 - bevel));
      color[j + 3] = 255;
      const r = Math.round(255 * ((.63 - damp * .29) * bevel + .76 * (1 - bevel)));
      roughness[j] = roughness[j + 1] = roughness[j + 2] = r;
      roughness[j + 3] = 255;
      heights[i] = bevel * (.006 + (mineral - .5) * .0016) + grain * .0002;
    }
  }
  const spacing = 4 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (heights[y * size + (x + 1) % size] - heights[y * size + (x - 1 + size) % size]) / (2 * spacing);
      const dy = (heights[((y + 1) % size) * size + x] - heights[((y - 1 + size) % size) * size + x]) / (2 * spacing);
      const length = Math.hypot(dx, dy, 1), j = (y * size + x) * 4;
      normal[j] = Math.round((-dx / length * .5 + .5) * 255);
      normal[j + 1] = Math.round((-dy / length * .5 + .5) * 255);
      normal[j + 2] = Math.round((1 / length * .5 + .5) * 255);
      normal[j + 3] = 255;
    }
  }
  const textures = [color, normal, roughness].map(data => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.5, (REFINED_STREET.maxZ - REFINED_STREET.minZ) / 4);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  });
  textures[0].colorSpace = THREE.SRGBColorSpace;
  return textures;
}

const shaderCommon = `
varying vec3 vRefineWorld;
float refineHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float refineNoise(vec3 p) {
 vec3 a=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(refineHash(a),refineHash(a+vec3(1,0,0)),f.x),mix(refineHash(a+vec3(0,1,0)),refineHash(a+vec3(1,1,0)),f.x),f.y),
 mix(mix(refineHash(a+vec3(0,0,1)),refineHash(a+vec3(1,0,1)),f.x),mix(refineHash(a+vec3(0,1,1)),refineHash(a+vec3(1,1,1)),f.x),f.y),f.z);
}
float refineMask() {
 return smoothstep(-7.5,-6.8,vRefineWorld.x)*(1.0-smoothstep(2.8,3.5,vRefineWorld.x))*(1.0-smoothstep(1.6,2.0,vRefineWorld.z));
}
vec3 refineBump(vec3 surfaceNormal, float height) {
 vec3 dx=dFdx(-vViewPosition), dy=dFdy(-vViewPosition);
 vec3 rx=cross(dy,surfaceNormal), ry=cross(surfaceNormal,dx);
 float determinant=dot(dx,rx);
 return normalize(abs(determinant)*surfaceNormal-sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry));
}
`;

function detailedMaterial(source, kind) {
  const material = new THREE.MeshPhysicalMaterial({
    name: source.name + " / ten metre refinement", color: source.color,
    vertexColors: source.vertexColors, roughness: source.roughness, metalness: source.metalness,
    side: source.side, emissive: source.emissive, emissiveIntensity: source.emissiveIntensity,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRefineWorld;");
    shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvRefineWorld=(modelMatrix*vec4(transformed,1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + shaderCommon);
    let detail, bump, rough;
    if (kind === "wood") {
      detail = `float refineAmount=refineMask();
       float refineGrain=refineNoise(vec3(vRefineWorld.x*75.0,vRefineWorld.y*3.5,vRefineWorld.z*75.0));
       float refineBroad=refineNoise(vRefineWorld*vec3(7.0,1.5,7.0));
       diffuseColor.rgb*=mix(1.0,.88+refineGrain*.09+refineBroad*.11,refineAmount);
       float refineHeight=(refineGrain-.5)*.00024*refineAmount;`;
      rough = "roughnessFactor=mix(roughnessFactor,.43+refineGrain*.17,refineAmount);";
    } else if (kind === "plaster") {
      detail = `float refineAmount=refineMask();
       float refineGrain=refineNoise(vRefineWorld*85.0);
       float refineBroad=refineNoise(vRefineWorld*3.7);
       float refineDamp=(1.0-smoothstep(.92,1.75,vRefineWorld.y))*(.4+.6*refineNoise(vRefineWorld*5.0));
       diffuseColor.rgb*=mix(1.0,(.78+refineBroad*.27+refineGrain*.10)*(1.0-refineDamp*.32),refineAmount);
       float refineHeight=((refineGrain-.5)*.0012+(refineNoise(vRefineWorld*24.0)-.5)*.0022)*refineAmount;`;
      rough = "roughnessFactor=mix(roughnessFactor,.85,refineAmount);";
    } else {
      detail = `float refineAmount=refineMask();
       float refineGrain=refineNoise(vRefineWorld*49.0);
       float refineBroad=refineNoise(vRefineWorld*8.0);
       diffuseColor.rgb*=mix(1.0,.77+refineBroad*.24+refineGrain*.12,refineAmount);
       float refineHeight=((refineGrain-.5)*.0016+(refineBroad-.5)*.003)*refineAmount;`;
      rough = "roughnessFactor=mix(roughnessFactor,.69,refineAmount);";
    }
    bump = "normal=refineBump(normal,refineHeight);";
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n" + detail);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + bump);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + rough);
  };
  material.customProgramCacheKey = () => "refine-01-" + kind;
  return material;
}

function maskOldPaving(material) {
  // Keep all original paving outside this patch. Clipping prevents the old wide
  // seams and uneven tops from poking through the new surface; no GLB edit.
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
      if(vRoamPosition.x > -7.0 && vRoamPosition.x < 3.0 && vRoamPosition.z > -1.06 && vRoamPosition.z < 1.55 && vRoamPosition.y > .72 && vRoamPosition.y < .86) discard;`);
  };
  material.customProgramCacheKey = () => "refine-01-clipped-old-paving";
  material.needsUpdate = true;
}

function groundingStrip() {
  const data = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 25;
    data[i * 4 + 3] = Math.round(Math.pow(1 - i / 63, 2.8) * 76);
  }
  const texture = new THREE.DataTexture(data, 1, 64, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const geometry = new THREE.PlaneGeometry(10, .43);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Refine wall-ground ambient contact";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(-2, .854, -.845);
  mesh.renderOrder = 2;
  return { mesh, dispose() { texture.dispose(); material.dispose(); geometry.dispose(); } };
}

function catContactShadow() {
  const size = 96, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot((x / (size - 1) - .5) * 2, (y / (size - 1) - .5) * 2);
      const i = (y * size + x) * 4;
      data[i] = 20; data[i + 1] = 25; data[i + 2] = 28;
      data[i + 3] = Math.round(Math.pow(Math.max(0, 1 - distance), 1.6) * 80);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const geometry = new THREE.PlaneGeometry(.48, .86);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = -.045;
  mesh.renderOrder = 3;
  const root = new THREE.Group(); root.name = "Refine cat soft ambient contact";
  root.visible = false; root.add(mesh);
  return { root, dispose() { texture.dispose(); material.dispose(); geometry.dispose(); } };
}

export async function setupEnvironment(renderer, scene, model, options = {}) {
  const base = await setupBaseEnvironment(renderer, scene, model, options);
  const mobile = options.mobile ?? false;
  scene.fog.density = .0048;
  scene.fog.color.set(0x8394a5);
  scene.environmentIntensity = .42;
  scene.backgroundIntensity = .80;
  scene.backgroundBlurriness = .08;
  renderer.toneMappingExposure = .96;
  scene.traverse(object => {
    if (object.isHemisphereLight) object.intensity = .29;
    if (object.isDirectionalLight) {
      object.intensity = 1.05;
      object.position.set(-8, 18, 12);
      object.target.position.set(-2, 1, -.5);
      object.shadow.normalBias = .007;
      object.shadow.bias = -.00004;
      // Concentrate the existing shadow budget on the ten-metre sample.
      Object.assign(object.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 48 });
      object.shadow.camera.updateProjectionMatrix();
      object.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    }
    if (object.isPointLight) object.intensity = 21;
  });
  const createdMaterials = [];
  const cache = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    const next = list.map(material => {
      const name = material.name.replace(/^ROAM01_PBR \/ /, "");
      if (/^paving(?:_alt)?$/.test(name)) {
        if (!cache.has(material)) { maskOldPaving(material); cache.set(material, material); }
        object.castShadow = false;
        return material;
      }
      const kind = /^(wood|wood_light|teal|olive)$/.test(name) ? "wood" : /^plaster(?:_alt)?$/.test(name) ? "plaster" : /^stone(?:_alt|_light)?$/.test(name) ? "stone" : null;
      if (!kind) return material;
      if (!cache.has(material)) {
        const refined = detailedMaterial(material, kind);
        cache.set(material, refined); createdMaterials.push(refined);
      }
      return cache.get(material);
    });
    object.material = Array.isArray(object.material) ? next : next[0];
  });
  const textures = makeStoneTextures(renderer, mobile);
  const material = new THREE.MeshPhysicalMaterial({ name: "Refine wet limestone paving", map: textures[0], normalMap: textures[1], roughnessMap: textures[2], roughness: 1, metalness: 0, clearcoat: .12, clearcoatRoughness: .24 });
  const geometry = new THREE.PlaneGeometry(10, REFINED_STREET.maxZ - REFINED_STREET.minZ);
  const surface = new THREE.Mesh(geometry, material);
  surface.name = "Refine ten metre street surface";
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(-2, REFINED_STREET.height, (REFINED_STREET.minZ + REFINED_STREET.maxZ) / 2);
  surface.receiveShadow = true;
  scene.add(surface);
  const grounding = groundingStrip();
  scene.add(grounding.mesh);
  const catShadow = catContactShadow();
  scene.add(catShadow.root);
  scene.userData.streetRefinement = { ...REFINED_STREET, textureSize: mobile ? 512 : 1024, localSurfaceOnly: true, exportedModelUnmodified: true };
  return {
    cameraOccluders: base.cameraOccluders,
    update(time, state = {}) {
      base.update(time);
      const cat = state.cat;
      catShadow.root.visible = Boolean(cat && cat.position.x >= -7 && cat.position.x <= 3 && cat.position.z >= -1.06 && cat.position.z <= 1.55);
      if (catShadow.root.visible) {
        catShadow.root.position.copy(cat.position);
        catShadow.root.position.y = Math.max(cat.position.y + .004, REFINED_STREET.height + .001);
        catShadow.root.rotation.y = cat.rotation.y;
      }
    },
    dispose() {
      grounding.mesh.removeFromParent(); grounding.dispose();
      catShadow.root.removeFromParent(); catShadow.dispose();
      surface.removeFromParent(); geometry.dispose(); material.dispose();
      textures.forEach(texture => texture.dispose());
      createdMaterials.forEach(entry => entry.dispose());
      base.dispose();
    }
  };
}
