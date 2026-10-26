// Shared world-space air for terrain, independent trees and the planar river.
// This is opt-in: creating it does not alter materials until attach() is used.
// No screen veil, texture, terrain query or volumetric ray march is introduced.
const AIR_REVISION = 'lijiang-raster-analytic-air-1';

const airFunctions = /* glsl */`
uniform float uLiAirTime, uLiAirDensity, uLiMistHeight, uLiMistDensity;
uniform vec3 uLiAirSun, uLiAirColor, uLiMistColor;
float liAirErf(float x){
  float a=abs(x),q=1./(1.+.3275911*a);
  float y=1.-(((((1.061405429*q-1.453152027)*q)+1.421413741)*q-.284496736)*q+.254829592)*q*exp(-a*a);
  return sign(x)*y;
}
float liAirBank(vec3 ro,vec3 rd,float distance,vec3 centre,vec3 axes){
  vec3 o=(ro-centre)/axes,d=rd/axes;
  float a=max(dot(d,d),1e-10),b=dot(o,d),c=dot(o,o);
  float root=sqrt(a*.5),shift=b/a;
  float peak=exp(-.5*max(0.,c-b*b/a));
  return peak*1.253314137/sqrt(a)*max(0.,liAirErf(root*(distance+shift))-liAirErf(root*shift));
}
vec3 liAirApply(vec3 col,vec3 position){
  vec3 ro=cameraPosition;
  vec3 delta=position-ro;
  float distance=length(delta);
  if(distance<.0001)return col;
  vec3 rd=delta/distance;
  // Reflector renders with a virtual camera below y=0. Its fog starts at the
  // real water reflection point. The main water material later integrates
  // the camera-to-water leg, so the foreground air is never counted twice.
  if(ro.y<0.&&rd.y>.00001){
    float toWater=clamp(-ro.y/rd.y,0.,distance);
    ro+=rd*toWater;distance-=toWater;
  }
  float h=1./430.,k=rd.y*h;
  float airPath=exp(-max(ro.y,-20.)*h)*(abs(k)>1e-7?(1.-exp(-distance*k))/k:distance);
  float tau=max(0.,uLiAirDensity*airPath);
  float forward=pow(max(dot(rd,uLiAirSun),0.),8.);
  vec3 airColor=uLiAirColor+vec3(.07,.052,.032)*forward;
  col=mix(col,airColor,1.-exp(-tau));
  vec3 drift=vec3(uLiAirTime*.20,0.,uLiAirTime*.085);
  float scaleH=clamp(uLiMistHeight/70.,.15,5.);
  float path=0.;
  path+=.70*liAirBank(ro,rd,distance,vec3(-90.,18.,970.)+drift,vec3(480.,8.*scaleH,170.));
  path+=liAirBank(ro,rd,distance,vec3(90.,31.,200.)+drift,vec3(510.,12.*scaleH,210.));
  path+=.82*liAirBank(ro,rd,distance,vec3(-170.,24.,-470.)+drift,vec3(440.,10.*scaleH,190.));
  path+=.75*liAirBank(ro,rd,distance,vec3(-330.,43.,-1200.)+drift,vec3(570.,16.*scaleH,240.));
  path+=.58*liAirBank(ro,rd,distance,vec3(180.,34.,-1820.)+drift,vec3(600.,14.*scaleH,220.));
  float mistTau=max(0.,uLiAirDensity*uLiMistDensity*path*.72);
  vec3 mistColor=uLiMistColor+vec3(.10,.080,.052)*forward;
  return mix(col,mistColor,1.-exp(-mistTau));
}
`;

const vertexWorld = /* glsl */`
vec4 liAirWorldPosition=vec4(transformed,1.);
#ifdef USE_BATCHING
  liAirWorldPosition=batchingMatrix*liAirWorldPosition;
#endif
#ifdef USE_INSTANCING
  liAirWorldPosition=instanceMatrix*liAirWorldPosition;
#endif
vLiAirWorld=(modelMatrix*liAirWorldPosition).xyz;
`;

export function createRasterAtmosphere({ THREE, scene, camera = null,
  sunDirection = new THREE.Vector3(-.504, .309, .806), density = .0002,
  mistHeight = 70, mistDensity = 2.3,
  airColor = new THREE.Color().setRGB(.34, .41, .45),
  mistColor = new THREE.Color().setRGB(.29, .35, .36) }) {
  if (!THREE || !scene) throw new Error('Analytic atmosphere needs THREE and a scene');
  const uniforms = {
    uLiAirTime: { value: 0 }, uLiAirDensity: { value: density },
    uLiMistHeight: { value: mistHeight }, uLiMistDensity: { value: mistDensity },
    uLiAirSun: { value: sunDirection.clone().normalize() },
    uLiAirColor: { value: airColor.clone() }, uLiMistColor: { value: mistColor.clone() }
  };
  const attached = new Map();
  let disposed = false;

  function attach(material, { worldVarying = null } = {}) {
    if (disposed) throw new Error('Analytic atmosphere was disposed');
    if (Array.isArray(material)) return material.map(value => attach(value, { worldVarying }));
    if (!material || attached.has(material)) return material;
    const oldHook = material.onBeforeCompile;
    const oldKey = material.customProgramCacheKey;
    const oldFog = material.fog;
    const originalDefaultKey = oldHook.toString();
    const hook = function (shader, renderer) {
      oldHook.call(this, shader, renderer);
      if (!shader.fragmentShader.includes('#include <tonemapping_fragment>')
        || !shader.fragmentShader.includes('#include <fog_fragment>')) {
        throw new Error('Analytic air needs a material with tone-mapping and fog shader boundaries');
      }
      const varying = worldVarying || 'vLiAirWorld';
      if (!worldVarying) {
        if (!shader.vertexShader.includes('#include <begin_vertex>') || !shader.vertexShader.includes('#include <fog_vertex>')) {
          throw new Error('Custom material must supply its existing worldVarying for analytic air');
        }
        shader.vertexShader = 'varying vec3 vLiAirWorld;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + vertexWorld);
        shader.fragmentShader = 'varying vec3 vLiAirWorld;\n' + shader.fragmentShader;
      }
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = airFunctions + '\n' + shader.fragmentShader;
      // Scatter linear radiance before the one final display transform. The
      // mirrored HDR target gets this same air without a second tone map.
      shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>',
        `gl_FragColor.rgb=liAirApply(gl_FragColor.rgb,${varying});\n#include <tonemapping_fragment>`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', '/* world-space Li River air already integrated */');
    };
    const key = function () {
      const previous = oldKey === THREE.Material.prototype.customProgramCacheKey
        ? originalDefaultKey : oldKey.call(this);
      return previous + '|' + AIR_REVISION + '|' + (worldVarying || 'transformed-world');
    };
    attached.set(material, { oldHook, oldKey, oldFog, hook, key });
    material.onBeforeCompile = hook;material.customProgramCacheKey = key;
    material.fog = true;material.needsUpdate = true;
    return material;
  }

  function attachObject(object) {
    object.traverse(child => { if (child.material && !child.isSky) attach(child.material); });
    return object;
  }

  function update(time = uniforms.uLiAirTime.value, settings = {}) {
    if (disposed) return;
    if (Number.isFinite(time)) uniforms.uLiAirTime.value = time;
    if (Number.isFinite(settings.density)) uniforms.uLiAirDensity.value = Math.max(0, settings.density);
    if (Number.isFinite(settings.mistHeight)) uniforms.uLiMistHeight.value = Math.max(10.5, settings.mistHeight);
    if (Number.isFinite(settings.mistDensity)) uniforms.uLiMistDensity.value = Math.max(0, settings.mistDensity);
    if (settings.sunDirection) uniforms.uLiAirSun.value.copy(settings.sunDirection).normalize();
    if (settings.airColor) uniforms.uLiAirColor.value.copy(settings.airColor);
    if (settings.mistColor) uniforms.uLiMistColor.value.copy(settings.mistColor);
  }

  function dispose() {
    if (disposed) return;
    for (const [material, state] of attached) {
      if (material.onBeforeCompile === state.hook) material.onBeforeCompile = state.oldHook;
      if (material.customProgramCacheKey === state.key) material.customProgramCacheKey = state.oldKey;
      material.fog = state.oldFog;material.needsUpdate = true;
    }
    attached.clear();disposed = true;
  }
  return { attach, attachObject, update, dispose, uniforms,
    getState() { return { revision: AIR_REVISION, attachedMaterials: attached.size,
      time: uniforms.uLiAirTime.value, density: uniforms.uLiAirDensity.value,
      mistHeight: uniforms.uLiMistHeight.value, mistDensity: uniforms.uLiMistDensity.value,
      banks: 5, externalAssets: 0, extraTerrainQueries: 0,
      reflectionStartsAtWaterPlane: true, cameraAssigned: !!camera, disposed }; } };
}
