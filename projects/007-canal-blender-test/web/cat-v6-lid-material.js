// Local three-dimensional eyelid surfaces. Texture samples stay inside measured
// fur-only UV islands of the existing licensed cat atlas. No image is edited.
// Geometry contract: uv from uvFor(), plus lidUv vec2, lidEdge float (0 skin/1 rim).
const PATCHES = Object.freeze({
  screenLeft: { upper: [39, 392, 6], lower: [40, 392, 4] },
  screenRight: { upper: [36, 926, 7], lower: [34, 923, 4] }
});

export function createLidMaterial(THREE, sourceMaterial) {
  if (!sourceMaterial?.map) throw new Error('Eyelid material requires the original cat colour map');
  const material = sourceMaterial.clone();
  material.name = 'Cat V6 / textured local eyelid skin';
  material.color.copy(sourceMaterial.color);
  material.vertexColors = false;
  material.metalness = 0;
  material.roughness = .94;
  material.side = THREE.DoubleSide;
  // The original cat has no bump map. Turning its striped colour atlas into
  // relief made the tiny lids look like carved leather, so retain a soft fur
  // response and keep the sampled colour independent of packed roughness data.
  material.bumpMap = null;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.transparent = true;
  material.opacity = 1;
  material.depthWrite = true;
  material.alphaTest = .025;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 lidUv;
      attribute float lidEdge;
      attribute float lidUpper;
      varying vec2 vLidUv;
      varying float vLidEdge;
      varying float vLidUpper;`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLidUv = lidUv;
      vLidEdge = lidEdge;
      vLidUpper = lidUpper;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vLidUv;
      varying float vLidEdge;
      varying float vLidUpper;
      float lidGrain(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        vec4 h = fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1),vec2(127.1,311.7))))*43758.5453);
        return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      // A narrow dark waterline follows the moving inner edge. Keep the full
      // skin opaque; only the buried outer rim feathers into the original fur.
      // The new fur donors are the lighter periocular coat: source averages
      // ~181/153/124 sRGB above and ~213/182/151 below. This modest linear
      // channel correction approaches the adjacent cream/grey guard hairs.
      diffuseColor.rgb *= mix(.96, .75, vLidUpper);
      // The small atlas patch supplies coat colour. A restrained, elongated
      // colour grain prevents magnification looking like a smooth skin patch.
      diffuseColor.rgb *= .94 + .12*lidGrain(vLidUv*vec2(74.0,15.0));
      float lidWaterline = max(pow(clamp(vLidEdge, 0.0, 1.0), 8.0), smoothstep(.985, .999, vLidUv.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.038, .026, .017), lidWaterline * .78);
      diffuseColor.a *= mix(smoothstep(0.0, .075, vLidUv.y), 1.0, clamp(vLidEdge, 0.0, 1.0));
    `);
  };
  material.customProgramCacheKey = () => 'cat-v6-fur-eyelid-02';
  let disposed = false;
  return {
    material,
    // `upper` is boolean. Names refer to the supplied face-view coordinate
    // systems, not anatomical left/right. V is the glTF atlas V convention.
    uvFor(eyeName, upper, u, v) {
      const name = eyeName === 'left' ? 'screenLeft' : eyeName === 'right' ? 'screenRight' : eyeName;
      const patch = PATCHES[name]?.[upper ? 'upper' : 'lower'];
      if (!patch) throw new Error(`Unknown eyelid texture region: ${eyeName}`);
      const [x, y, radius] = patch;
      const insetRadius = radius - 1.5;
      const uu = THREE.MathUtils.clamp(u, 0, 1), vv = THREE.MathUtils.clamp(v, 0, 1);
      return [(x + (uu * 2 - 1) * insetRadius) / 1024, (y + (vv * 2 - 1) * insetRadius) / 1024];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // These textures belong to the original cat and are intentionally shared.
      material.dispose();
    }
  };
}
