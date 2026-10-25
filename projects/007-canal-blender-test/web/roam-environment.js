import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { Reflector } from "three/addons/objects/Reflector.js";

const surfaceNoise = `
  varying vec3 vRoamPosition;
  float roamHash(vec3 point) { return fract(sin(dot(point, vec3(127.1,311.7,74.7))) * 43758.5453); }
  float roamNoise(vec3 point) {
    vec3 cell = floor(point); vec3 blend = fract(point); blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(mix(mix(roamHash(cell),roamHash(cell+vec3(1,0,0)),blend.x),mix(roamHash(cell+vec3(0,1,0)),roamHash(cell+vec3(1,1,0)),blend.x),blend.y),
      mix(mix(roamHash(cell+vec3(0,0,1)),roamHash(cell+vec3(1,0,1)),blend.x),mix(roamHash(cell+vec3(0,1,1)),roamHash(cell+vec3(1,1,1)),blend.x),blend.y),blend.z);
  }
`;

function surfaceMaterial(source, kind) {
  const material = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: source.color.clone(),
    roughness: source.roughness,
    metalness: source.metalness,
    side: source.side,
    vertexColors: source.vertexColors,
    emissive: source.emissive,
    emissiveIntensity: source.emissiveIntensity,
    clearcoat: kind === "paving" ? .7 : .03,
    clearcoatRoughness: .15
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRoamPosition;");
    shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvRoamPosition = (modelMatrix * vec4(transformed,1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${surfaceNoise}`);
    let detail;
    if (kind === "paving") {
      detail = `float roamWet = smoothstep(.39,.67,roamNoise(vRoamPosition*.78));
        diffuseColor.rgb *= mix(.88,.62,roamWet) * mix(.92,1.06,roamNoise(vRoamPosition*8.0));`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(.56,.11,roamWet);");
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\nmaterial.clearcoat = mix(.07,.78,roamWet); material.clearcoatRoughness = mix(.24,.09,roamWet);");
    } else if (kind === "stone") {
      detail = `diffuseColor.rgb *= mix(.77,1.06,roamNoise(vRoamPosition*4.0));
        float roamMoss = (1.0-smoothstep(.1,.85,vRoamPosition.y))*smoothstep(.4,.7,roamNoise(vRoamPosition*3.0));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.11,.14,.08),roamMoss*.35);`;
    } else {
      detail = `diffuseColor.rgb *= mix(.79,1.08,roamNoise(vRoamPosition*2.3)) * mix(.95,1.03,roamNoise(vRoamPosition*35.0));`;
    }
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>\n${detail}`);
  };
  material.customProgramCacheKey = () => `roam-surface-01-${kind}`;
  return material;
}

function makeWater(model, mobile) {
  const waterMeshes = [];
  model.traverse(object => {
    if (object.isMesh && !Array.isArray(object.material) && /canal water/i.test(object.material.name)) waterMeshes.push(object);
  });
  if (!waterMeshes.length) return { update() {}, dispose() {}, reflection: null };
  model.updateMatrixWorld(true);
  const original = waterMeshes[0];
  const geometry = original.geometry.clone().applyMatrix4(original.matrixWorld).rotateX(Math.PI / 2);
  const reflection = new Reflector(geometry, {
    textureWidth: mobile ? 256 : 512,
    textureHeight: mobile ? 256 : 512,
    clipBias: .003,
    multisample: 0,
    shader: {
      name: "Roam water",
      uniforms: { ...THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms), ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: { value: 0 } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vReflectionUv; varying vec3 vWaterPosition;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vReflectionUv=textureMatrix*vec4(position,1.0);
          vWaterPosition=(modelMatrix*vec4(position,1.0)).xyz;
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec4 vReflectionUv; varying vec3 vWaterPosition;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          float ripple=sin(vWaterPosition.z*16.0+sin(vWaterPosition.x*4.5+time*.28)*1.5+time*.5);
          float crossing=sin(vWaterPosition.z*28.0+vWaterPosition.x*6.2-time*.35);
          vec2 sampleUv=vReflectionUv.xy/vReflectionUv.w+vec2(ripple*.0013,crossing*.0018);
          vec3 reflected=texture2D(tDiffuse,clamp(sampleUv,vec2(.001),vec2(.999))).rgb;
          vec3 waterNormal=normalize(vec3(ripple*.08,1.0,crossing*.1));
          vec3 direction=normalize(cameraPosition-vWaterPosition);
          float facing=clamp(dot(waterNormal,direction),0.0,1.0);
          float fresnel=.02037+.97963*pow(1.0-facing,5.0);
          gl_FragColor=vec4(mix(vec3(.035,.075,.073),reflected*.82,.16+.84*fresnel),1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`
    }
  });
  reflection.rotation.x = -Math.PI / 2;
  reflection.name = "Roaming reflective canal";
  reflection.material.fog = true;
  for (const object of waterMeshes) object.visible = false;
  model.add(reflection);
  return {
    reflection,
    update(time) { reflection.material.uniforms.time.value = time; },
    dispose() { reflection.dispose(); geometry.dispose(); }
  };
}

export async function setupEnvironment(renderer, scene, model, options = {}) {
  const mobile = options.mobile ?? false;
  scene.background = new THREE.Color("#71838c");
  scene.fog = new THREE.FogExp2(0x607582, .009);
  const hemisphere = new THREE.HemisphereLight(0xb1c6e2, 0x423e32, .5);
  const key = new THREE.DirectionalLight(0xb4c9e5, .85);
  key.position.set(-16, 28, 15);
  key.target.position.set(-4, 0, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -27, right: 27, top: 24, bottom: -24, near: .5, far: 75 });
  key.shadow.bias = -.0003;
  key.shadow.normalBias = .035;
  scene.add(hemisphere, key, key.target);
  const warmPositions = [[-7.7, 2.4, .1], [-1, 2.6, -.1], [5, 2.3, .1], [-9.2, 3.3, 1.2], [7.8, 3.3, 1.2], [8.5, 3.3, 11.75]];
  const warmLights = warmPositions.map(position => {
    const light = new THREE.PointLight(0xffb665, 38, 8, 2);
    light.position.fromArray(position);
    scene.add(light);
    return light;
  });
  const materialCache = new Map();
  const cameraOccluders = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    const sources = Array.isArray(object.material) ? object.material : [object.material];
    const replacements = sources.map(material => {
      const name = material.name.replace(/^(Viewer|Roam|ROAM01_PBR) \/ /, "");
      if (/canal water/i.test(name)) return material;
      if (/glass/i.test(name)) {
        material.transparent = true;
        material.opacity = .15;
        material.depthWrite = false;
        material.roughness = .06;
        return material;
      }
      const kind = /^paving(?:_alt)?$/.test(name) ? "paving" : /^stone(?:_alt|_light)?$/.test(name) ? "stone" : /^plaster(?:_alt)?$/.test(name) ? "plaster" : null;
      if (!kind) return material;
      if (!materialCache.has(material)) materialCache.set(material, surfaceMaterial(material, kind));
      return materialCache.get(material);
    });
    object.material = Array.isArray(object.material) ? replacements : replacements[0];
    object.castShadow = sources.every(material => !material.transparent && !/water/i.test(material.name));
    object.receiveShadow = !sources.some(material => /water/i.test(material.name));
    if (sources.some(material => /plaster|roof|wood|stone/i.test(material.name)) && !sources.some(material => /glass|water|olive|leaf/i.test(material.name))) cameraOccluders.push(object);
  });
  let sky;
  let environment;
  try {
    sky = await new HDRLoader().loadAsync("textures/lookdev-v4-world.hdr");
    sky.mapping = THREE.EquirectangularReflectionMapping;
    const generator = new THREE.PMREMGenerator(renderer);
    environment = generator.fromEquirectangular(sky);
    generator.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = .3;
    scene.background = sky;
    scene.backgroundIntensity = .65;
    scene.backgroundBlurriness = .18;
  } catch {
    scene.background = new THREE.Color("#71838c");
  }
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const water = makeWater(model, mobile);
  return {
    cameraOccluders,
    update(time) { water.update(time); },
    dispose() {
      water.dispose();
      environment?.dispose();
      sky?.dispose();
      for (const light of [hemisphere, key, ...warmLights]) light.removeFromParent();
      for (const material of materialCache.values()) material.dispose();
    }
  };
}
