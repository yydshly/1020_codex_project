import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { Reflector } from "three/addons/objects/Reflector.js";

const noiseShader = `
  varying vec3 vLookdevPosition;
  float lookdevHash(vec3 point) {
    return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float lookdevNoise(vec3 point) {
    vec3 cell = floor(point);
    vec3 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(mix(mix(lookdevHash(cell), lookdevHash(cell + vec3(1,0,0)), blend.x),
      mix(lookdevHash(cell + vec3(0,1,0)), lookdevHash(cell + vec3(1,1,0)), blend.x), blend.y),
      mix(mix(lookdevHash(cell + vec3(0,0,1)), lookdevHash(cell + vec3(1,0,1)), blend.x),
      mix(lookdevHash(cell + vec3(0,1,1)), lookdevHash(cell + vec3(1,1,1)), blend.x), blend.y), blend.z);
  }
`;

function wetMaterial(source, kind) {
  const material = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: source.color.clone(),
    roughness: source.roughness,
    metalness: source.metalness,
    side: source.side,
    clearcoat: kind === "paving" ? 0.82 : 0,
    clearcoatRoughness: 0.1
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLookdevPosition;");
    shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvLookdevPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${noiseShader}`);
    const variation = kind === "paving"
      ? `float lookdevWet = smoothstep(0.36, 0.67, lookdevNoise(vLookdevPosition * 0.78));
         diffuseColor.rgb *= mix(0.82, 0.57, lookdevWet) * mix(0.86, 1.12, lookdevNoise(vLookdevPosition * 7.0));`
      : `float lookdevWet = 0.0;
         float moss = (1.0 - smoothstep(-0.05, 0.72, vLookdevPosition.y)) * smoothstep(0.38, 0.70, lookdevNoise(vLookdevPosition * 3.8));
         diffuseColor.rgb *= mix(0.57, 0.92, lookdevNoise(vLookdevPosition * 4.3));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.107, 0.047), moss * 0.64);`;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>\n${variation}`);
    if (kind === "paving") {
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.48, 0.065, lookdevWet);");
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\nmaterial.clearcoat = mix(0.025, 0.82, lookdevWet);\nmaterial.clearcoatRoughness = mix(0.30, 0.055, lookdevWet);");
    }
  };
  material.customProgramCacheKey = () => `canal-wet-v1-${kind}`;
  return material;
}

function reflectedWater(model) {
  let original;
  model.traverse(object => {
    if (object.isMesh && object.material.name.endsWith("Canal water")) original = object;
  });
  if (!original) throw new Error("增强场景缺少原水面网格");
  model.updateMatrixWorld(true);
  const geometry = original.geometry.clone().applyMatrix4(original.matrixWorld).rotateX(Math.PI / 2);
  const reflection = new Reflector(geometry, {
    color: "#263e3c",
    textureWidth: 512,
    textureHeight: 512,
    multisample: 0,
    clipBias: 0.003,
    shader: {
      name: "Canal water / planar reflection",
      uniforms: THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms),
      vertexShader: `
        uniform mat4 textureMatrix;
        varying vec4 vReflectionUv;
        varying vec3 vWaterPosition;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vReflectionUv = textureMatrix * vec4(position, 1.0);
          vWaterPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        varying vec4 vReflectionUv;
        varying vec3 vWaterPosition;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float ripple = sin(vWaterPosition.z * 18.0 + sin(vWaterPosition.x * 5.1) * 1.7);
          float crossing = sin(vWaterPosition.z * 32.0 + vWaterPosition.x * 7.3);
          vec2 offset = vec2(ripple * 0.0014, crossing * 0.0019);
          vec2 reflectionUv = vReflectionUv.xy / vReflectionUv.w + offset;
          vec3 reflected = texture2D(tDiffuse, clamp(reflectionUv, vec2(0.001), vec2(0.999))).rgb;
          vec3 normal = normalize(vec3(ripple * 0.06, 1.0, crossing * 0.09));
          vec3 viewDirection = normalize(cameraPosition - vWaterPosition);
          float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
          float fresnel = 0.02037 + 0.97963 * pow(1.0 - facing, 5.0);
          gl_FragColor = vec4(mix(color * 0.55, reflected * 0.8, 0.15 + 0.85 * fresnel), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    }
  });
  reflection.name = original.name;
  reflection.rotation.x = -Math.PI / 2;
  original.removeFromParent();
  original.geometry.dispose();
  original.material.dispose();
  model.add(reflection);
  return reflection;
}

export async function prepareLookdev(renderer, model, manifest) {
  const response = await fetch("data/viewer-source-audit.json");
  if (!response.ok) throw new Error("无法读取源场景光照记录");
  const audit = await response.json();
  const environmentUrl = new URL(manifest.environment.asset, new URL("models/", document.baseURI));
  const sky = await new HDRLoader().loadAsync(environmentUrl.href);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(sky);
  generator.dispose();
  const lights = new THREE.Group();
  lights.name = "Three realtime light approximations";
  const ambient = new THREE.HemisphereLight(0xbed5f5, 0x413b31, 0.18);
  lights.add(ambient);
  const sourceKey = audit.lights.find(light => light.name === "Soft cool dusk fill");
  const key = new THREE.DirectionalLight(new THREE.Color(...sourceKey.color_linear), 1.15);
  key.position.fromArray(sourceKey.position_gltf);
  key.target.position.copy(key.position).add(new THREE.Vector3(...sourceKey.direction_gltf).multiplyScalar(20));
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -21, right: 21, top: 17, bottom: -17, near: 0.5, far: 65 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.035;
  lights.add(key, key.target);
  const sourceWarm = audit.lights.find(light => light.name.includes("Lamp ") && light.name.includes("warm light"));
  const warm = new THREE.PointLight(new THREE.Color(...sourceWarm.color_linear), 80, 16, 2);
  warm.position.fromArray(sourceWarm.position_gltf);
  lights.add(warm);
  model.traverse(object => {
    if (!object.isMesh) return;
    let material = object.material;
    const name = material.name.replace(/^(Viewer|Baked V4) \/ /, "");
    if (name === "roof" || name === "roof_alt") {
      const source = manifest.materials.find(entry => entry.name === name);
      const replacement = new THREE.MeshStandardMaterial({
        name: `Viewer / ${name}`,
        color: new THREE.Color(...source.base_color_linear.slice(0, 3)),
        roughness: source.roughness,
        metalness: source.metallic,
        side: material.side
      });
      material.map?.dispose();
      material.map?.source?.data?.close?.();
      material.dispose();
      object.material = replacement;
      material = replacement;
    }
    object.castShadow = !material.transparent && name !== "Canal water";
    object.receiveShadow = !material.isMeshBasicMaterial;
    if (material.isMeshStandardMaterial && /^(paving|stone)(?:_alt|_light)?$/.test(name)) {
      object.material = wetMaterial(material, name.startsWith("paving") ? "paving" : "stone");
      material.dispose();
    }
    if (name === "glass") {
      material.opacity = 0.13;
      material.depthWrite = false;
      material.roughness = 0.008;
      material.envMapIntensity = 0.65;
    }
  });
  const reflection = reflectedWater(model);
  return {
    activate(scene) {
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.75;
      scene.background = sky;
      scene.backgroundIntensity = 1;
      scene.fog = new THREE.FogExp2(0x89959e, 0.0045);
      scene.add(lights);
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = Math.pow(2, audit.color_management.exposure);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
    },
    dispose() {
      lights.removeFromParent();
      key.shadow.map?.dispose();
      environment.dispose();
      sky.dispose();
      reflection.dispose();
    },
    profile: {
      modelTriangles: manifest.geometry.triangles,
      reflectionResolution: 512,
      realtimeLights: 3,
      shadowMapResolution: 1024,
      continuousAnimation: false
    }
  };
}
