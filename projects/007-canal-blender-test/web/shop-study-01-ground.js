// Shop study 01 only. Reuses the refined street plane and leaves every saved
// GLB, navigation surface, and previous look-development version intact.
export const SHOP_GROUND = Object.freeze({
  minX: -7, maxX: 3, minZ: -1.06, maxZ: 1.55, height: .853,
  textureCoverageMetres: 2,
  source: "https://polyhaven.com/a/cobblestone_floor_05",
  license: "CC0-1.0"
});

const SURFACE_NAME = "Refine ten metre street surface";
const TEXTURE_BASE = new URL("./textures/shop-study-01/cobblestone_floor_05/", import.meta.url);

const WET_STONE_GLSL = `
varying vec3 vShopGroundWorld;
float shopGroundHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float shopGroundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shopGroundHash(i), shopGroundHash(i + vec2(1.0, 0.0)), f.x),
             mix(shopGroundHash(i + vec2(0.0, 1.0)), shopGroundHash(i + vec2(1.0)), f.x), f.y);
}
`;

function applyWetStoneShader(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>",
      "#include <common>\nvarying vec3 vShopGroundWorld;");
    shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvShopGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
      "#include <common>\n" + WET_STONE_GLSL);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      vec2 shopGroundXZ = vShopGroundWorld.xz;
      float shopBroad = shopGroundNoise(shopGroundXZ * .71 + vec2(6.3, 1.8));
      float shopMedium = shopGroundNoise(shopGroundXZ * 2.37 + vec2(2.1, 8.6));
      float shopDampField = shopBroad * .76 + shopMedium * .24;
      // Rain drains toward the canal, while the wall-side strip remains drier.
      float shopCanalSide = smoothstep(-.7, 1.5, shopGroundXZ.y);
      float shopWet = smoothstep(.30, .66, shopDampField + shopCanalSide * .075);
      float shopFilm = smoothstep(.54, .75, shopDampField + shopCanalSide * .085);
      // Most stones remain visibly rough. Only small low spots hold a film.
      diffuseColor.rgb *= mix(1.025, .61, shopWet);
      diffuseColor.rgb *= .965 + .07 * shopGroundNoise(shopGroundXZ * .29);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      float shopDryRoughness = clamp(.31 + roughnessFactor * .57, .57, .91);
      float shopDampRoughness = clamp(.17 + roughnessFactor * .24, .26, .46);
      roughnessFactor = mix(shopDryRoughness, shopDampRoughness, shopWet);
      roughnessFactor = mix(roughnessFactor, .16, shopFilm * .72);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      vec3 shopUnperturbedNormal = normal;
      #include <normal_fragment_maps>
      normal = normalize(mix(normal, shopUnperturbedNormal, shopFilm * .42));
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", `
      #include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoat = .015 + shopWet * .055 + shopFilm * .33;
        material.clearcoatRoughness = mix(.32, .14, shopFilm);
      #endif
    `);
  };
  material.customProgramCacheKey = () => "shop-study-01-cobblestone-wet-01";
}

function refineCoping(model) {
  const replacements = [], cache = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    const original = object.material;
    const materials = Array.isArray(original) ? original : [original];
    const next = materials.map(source => {
      if (!/^ROAM01_PBR \/ stone(?:_alt|_light)?(?: \/|$)/.test(source.name)) return source;
      if (cache.has(source)) return cache.get(source);
      const material = source.clone();
      material.name = source.name + " / shop study coping";
      const previousCompile = source.onBeforeCompile;
      const previousKey = source.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader.replace("#include <common>",
          "#include <common>\nvarying vec3 vShopGroundWorld;");
        shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nvShopGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
          "#include <common>\n" + WET_STONE_GLSL);
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
          #include <color_fragment>
          // Material batches also contain facades: this mask affects only the
          // existing canal coping within the ten-metre demonstration length.
          float shopCopingMask = smoothstep(-7.0, -6.9, vShopGroundWorld.x)
            * (1.0 - smoothstep(2.9, 3.0, vShopGroundWorld.x))
            * smoothstep(1.48, 1.54, vShopGroundWorld.z)
            * (1.0 - smoothstep(2.10, 2.18, vShopGroundWorld.z))
            * smoothstep(.12, .30, vShopGroundWorld.y)
            * (1.0 - smoothstep(.94, 1.02, vShopGroundWorld.y));
          float shopCopingGrain = shopGroundNoise(vShopGroundWorld.xz * 42.0 + vShopGroundWorld.y * 26.0);
          float shopCopingDamp = (1.0 - smoothstep(.20, .83, vShopGroundWorld.y))
            * (.30 + .70 * shopGroundNoise(vec2(vShopGroundWorld.x * 3.1, vShopGroundWorld.y * .8)));
          vec3 shopCopingTint = vec3(.87, .93, .98)
            * (.82 + shopCopingGrain * .12) * (1.0 - shopCopingDamp * .30);
          diffuseColor.rgb *= mix(vec3(1.0), shopCopingTint, shopCopingMask);
        `);
        // Append after the inherited roughness calculation so its local
        // refinement cannot turn the damp coping back into pale smooth tile.
        shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", `
          roughnessFactor = mix(roughnessFactor, .70 - shopCopingDamp * .24 + shopCopingGrain * .10, shopCopingMask);
          #include <lights_physical_fragment>
        `);
      };
      material.customProgramCacheKey = () => previousKey + "/shop-study-01-coping-01";
      cache.set(source, material);
      return material;
    });
    if (next.some((material, index) => material !== materials[index])) {
      const replacement = Array.isArray(original) ? next : next[0];
      object.material = replacement;
      replacements.push({ object, original, replacement });
    }
  });
  return {
    count: cache.size,
    dispose() {
      for (const { object, original, replacement } of replacements) {
        if (object.material === replacement) object.material = original;
      }
      for (const material of cache.values()) material.dispose();
    }
  };
}

export async function setupGround(THREE, renderer, scene, model, { mobile = false } = {}) {
  const surface = scene.getObjectByName(SURFACE_NAME);
  if (!surface?.isMesh) {
    throw new Error("Shop study ground requires setupEnvironment() from roam-environment-refine.js first.");
  }

  const loader = new THREE.TextureLoader();
  const files = ["diff_1k.jpg", "nor_gl_1k.png", "rough_1k.jpg", "ao_1k.jpg"];
  const loaded = await Promise.allSettled(files.map(file => loader.loadAsync(
    new URL("cobblestone_floor_05_" + file, TEXTURE_BASE).href
  )));
  const textures = loaded.filter(entry => entry.status === "fulfilled").map(entry => entry.value);
  const failed = loaded.find(entry => entry.status === "rejected");
  if (failed) {
    textures.forEach(texture => texture.dispose());
    throw new Error("Could not load the shop study stone maps.", { cause: failed.reason });
  }

  const [map, normalMap, roughnessMap, aoMap] = textures;
  for (const texture of textures) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    // The source scan covers 2 x 2 metres; retain honest stone dimensions.
    texture.repeat.set((SHOP_GROUND.maxX - SHOP_GROUND.minX) / 2,
      (SHOP_GROUND.maxZ - SHOP_GROUND.minZ) / 2);
    texture.anisotropy = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = texture === map ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  }
  const material = new THREE.MeshPhysicalMaterial({
    name: "Shop study 01 / scanned worn stone and local rain film",
    map, normalMap, roughnessMap, aoMap,
    normalScale: new THREE.Vector2(.56, .56),
    aoMapIntensity: .58,
    roughness: 1,
    metalness: 0,
    clearcoat: .4,
    clearcoatRoughness: .22,
    envMapIntensity: .82,
    dithering: true
  });
  applyWetStoneShader(material);

  const previousMaterial = surface.material;
  surface.material = material;
  const coping = refineCoping(model);
  const metadata = Object.freeze({
    ...SHOP_GROUND,
    textureResolution: 1024,
    mapCount: textures.length,
    copingMaterialCount: coping.count,
    copingBounds: { minX: -7, maxX: 3, minZ: 1.48, maxZ: 2.18, minY: .12, maxY: 1.02 },
    addedMeshes: 0,
    addedTriangles: 0,
    additionalReflectionPasses: 0,
    geometryAndNavigationUnchanged: true,
    normalMapConvention: "OpenGL",
    wetness: "World-space local rain film, no displacement or continuous reflection pass"
  });
  scene.userData.shopStudyGround = metadata;
  let disposed = false;
  return {
    surface,
    metadata,
    update() {},
    // Call this before the base environment disposer, which owns the plane.
    dispose() {
      if (disposed) return;
      disposed = true;
      if (surface.material === material) surface.material = previousMaterial;
      if (scene.userData.shopStudyGround === metadata) delete scene.userData.shopStudyGround;
      material.dispose();
      coping.dispose();
      textures.forEach(texture => texture.dispose());
    }
  };
}
