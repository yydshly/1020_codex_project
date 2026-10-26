import { Reflector } from '../lijiang-flythrough/node_modules/three/examples/jsm/objects/Reflector.js';
import { Sky } from '../lijiang-flythrough/node_modules/three/examples/jsm/objects/Sky.js';

// Metres, shared with the independent native landform. Neither the sky nor
// water loads an image, model, HDR, normal map or other scene asset.
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const riverCenter = z => 46 * Math.sin((z + 140) * .00168)
  + 28 * Math.sin((z - 70) * .0031) - 430 * (1 - smooth(-1350, -350, z));
export const riverWidth = z => 340 * (1 + .11 * Math.sin(z * .0013 - .4) + .055 * Math.cos(z * .0037));

// The shader clamps wave strength to [0,2], multiplies by .75, and every
// sine/filter has magnitude <=1. This is a bound for ALL animation times.
const WAVE_AMPLITUDES=[.008,.005,.0035,.003,.0022,.0016,.0012,.0007,.00045,.00025,.00014,.00007];
export const RIVER_MAX_WAVE_DISPLACEMENT_METRES=WAVE_AMPLITUDES.reduce((sum,value)=>sum+value,0)*2*.75;
const REFLECTION_BOUNDS_PADDING_METRES=.01;

const waveGLSL = /* glsl */`
uniform float uTime, uWaveStrength, uWaveSpeed;
// The same 12 analytic components displace vertices and define the exact
// normal derivatives. Only a pixel-footprint filter differs in the fragment.
vec3 riverWave(vec2 p,float footprint){
  const float L[12]=float[12](19.,13.,8.,5.8,3.4,2.2,1.5,.9,.5,.28,.14,.07);
  const float A[12]=float[12](${WAVE_AMPLITUDES.map(value=>value.toFixed(8)).join(',')});
  vec3 value=vec3(0.);
  for(int i=0;i<12;i++){
    float filterWeight=1.-smoothstep(.18,.48,max(footprint,.0001)/L[i]);
    float fi=float(i);
    float angle=i<3?.31+sin(fi*2.17+.8)*.84:.31+(fi-3.)*2.39996323;
    vec2 axis=vec2(sin(angle),cos(angle));
    float k=6.28318530718/L[i];
    float omega=sqrt((9.81*k+.000074*k*k*k)*tanh(k*3.5));
    float amplitude=A[i]*filterWeight*clamp(uWaveStrength,0.,2.)*.75;
    float phase=dot(p,axis)*k-omega*uTime*uWaveSpeed+fi*2.39996323;
    value.x+=amplitude*sin(phase);
    value.yz+=amplitude*k*cos(phase)*axis;
  }
  return value;
}
`;

const waterVertex = /* glsl */`
uniform mat4 textureMatrix;
attribute float riverAcross;
attribute float riverHalfWidth;
varying vec3 vRiverWorld, vRiverLocal;
varying vec4 vMirrorCoord;
varying vec2 vRiverUV;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
${waveGLSL}
void main(){
  vec3 displaced=position;
  // The mesh is in local XY with +Z as the water normal; rotation -PI/2
  // maps (x,y,z) to world (x,z,-y), keeping Reflector's plane exact at y=0.
  vec2 riverXZ=vec2(position.x,-position.y);
  displaced.z=riverWave(riverXZ,0.).x;
  vec4 worldPosition=modelMatrix*vec4(displaced,1.);
  vRiverWorld=worldPosition.xyz;
  vRiverLocal=displaced;
  vRiverUV=vec2(riverAcross,riverHalfWidth);
  vMirrorCoord=textureMatrix*vec4(displaced,1.);
  vec4 mvPosition=modelViewMatrix*vec4(displaced,1.);
  gl_Position=projectionMatrix*mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const waterFragment = /* glsl */`
uniform sampler2D tDiffuse;
uniform mat4 textureMatrix;
uniform vec3 color, uSunDirection, uSunColor;
uniform vec2 uReflectionResolution;
uniform float uReflectionStrength, uDistortion, uTurbidity;
varying vec3 vRiverWorld, vRiverLocal;
varying vec4 vMirrorCoord;
varying vec2 vRiverUV;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${waveGLSL}
float alluvialNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  vec4 q=vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+1.,vec2(127.1,311.7)));
  vec4 h=fract(sin(q)*43758.5453);
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}
void main(){
  #include <logdepthbuf_fragment>
  // Derivatives already include the stretching of a screen pixel on the
  // grazing water plane. Short waves fade smoothly before they can sparkle.
  float footprint=max(length(dFdx(vRiverWorld.xz)),length(dFdy(vRiverWorld.xz)));
  vec3 wave=riverWave(vRiverWorld.xz,footprint);
  vec3 N=normalize(vec3(-wave.y,1.,-wave.z));
  vec3 V=normalize(cameraPosition-vRiverWorld);
  if(V.y<0.)N=-N;
  float NdotV=max(dot(N,V),0.);
  vec3 reflectedDirection=reflect(-V,N);
  float viewDistance=length(cameraPosition-vRiverWorld);
  // Project a real perturbed reflected ray into the actual mirrored camera.
  // A flat normal produces exactly the unperturbed projective coordinate.
  float anchorDistance=450.+min(viewDistance,1400.)*.35;
  vec3 localDirection=vec3(reflectedDirection.x,-reflectedDirection.z,reflectedDirection.y);
  vec4 perturbed=textureMatrix*vec4(vRiverLocal+localDirection*anchorDistance,1.);
  vec2 uv0=vMirrorCoord.xy/max(vMirrorCoord.w,.0001);
  vec2 uv1=perturbed.xy/max(perturbed.w,.0001);
  vec2 delta=clamp(uv1-uv0,vec2(-.018),vec2(.018))*uDistortion;
  vec2 edge=1.5/uReflectionResolution;
  vec2 uv=clamp(uv0+delta,edge,vec2(1.)-edge);
  vec3 reflection=texture2D(tDiffuse,uv).rgb;
  reflection*=vec3(.98,1.,.995);

  float shoreDistance=max(0.,(1.-abs(vRiverUV.x))*vRiverUV.y);
  float bankDeposit=alluvialNoise(vRiverWorld.xz*.038+17.);
  float channelDepth=.14+(5.2+.6*bankDeposit)*(1.-exp(-pow(shoreDistance/(12.+5.*bankDeposit),1.18)));
  float shallow=exp(-channelDepth*.7);
  float grain=.7*alluvialNoise(vRiverWorld.xz*.43)+.3*alluvialNoise(vRiverWorld.xz*1.9);
  // Suspended alluvium and freshwater absorption, with a subdued warm bed
  // near the wet bank. No marine cyan shelf, breakers, foam or swash.
  vec3 deep=vec3(.019,.086,.052);
  vec3 bed=mix(vec3(.079,.095,.061),vec3(.142,.151,.094),grain);
  vec3 scatter=mix(deep,bed,shallow*.75);
  scatter+=vec3(.022,.035,.026)*uTurbidity;
  scatter*=.8+.24*max(dot(N,uSunDirection),0.);
  float fresnel=.0204+.9796*pow(1.-NdotV,5.);
  float reflectedShare=clamp(fresnel*uReflectionStrength+.045,0.,.98);
  vec3 col=mix(scatter,reflection,reflectedShare);
  // A small finite solar lobe complements the sun disc in the real reflection.
  vec3 H=normalize(V+uSunDirection);
  float spec=pow(max(dot(N,H),0.),1800.);
  col+=uSunColor*min(spec*1.8,.85)*(1.-shallow*.3);
  col=max(col,vec3(0.));
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function buildRiverGeometry(THREE, rect = [-2400, -2400, 4800]) {
  const z0 = rect[1], size = rect[2];
  // The centimetre displacement does not need a huge ocean mesh. Reflected
  // detail comes from the analytic, pixel-filtered normal at every fragment.
  const along = Math.max(160, Math.ceil(size / 10));
  const across = 32;
  const count = (along + 1) * (across + 1);
  const positions = new Float32Array(count * 3);
  const transverse = new Float32Array(count);
  const widths = new Float32Array(count);
  const indices = new Uint32Array(along * across * 6);
  for (let row = 0; row <= along; row++) {
    const z = z0 + size * row / along;
    const center = riverCenter(z), halfWidth = riverWidth(z) * .5;
    for (let column = 0; column <= across; column++) {
      const index = row * (across + 1) + column;
      const u = column / across * 2 - 1;
      // The native coast is a sampled polygon/height field. Extend water
      // beneath its solid bank so sub-metre approximation differences cannot
      // expose the sky between two independently generated surfaces.
      positions[index * 3] = center + u * (halfWidth + 8);
      positions[index * 3 + 1] = -z;
      positions[index * 3 + 2] = 0;
      transverse[index] = u * (halfWidth + 8) / halfWidth;widths[index] = halfWidth;
    }
  }
  let cursor = 0;
  for (let row = 0; row < along; row++) for (let column = 0; column < across; column++) {
    const a = row * (across + 1) + column, b = a + 1, c = a + across + 1, d = c + 1;
    // Positive local Z faces upward after the reflector's world rotation.
    indices.set([a, c, b, b, c, d], cursor);cursor += 6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('riverAcross', new THREE.BufferAttribute(transverse, 1));
  geometry.setAttribute('riverHalfWidth', new THREE.BufferAttribute(widths, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.riverGrid={along,across};
  return geometry;
}

/** Conservative local boxes for the actual triangles in adjacent river rows.
 * Expanding all axes by 1cm also covers float conversion and boundary contact.
 * No occlusion inference, projected-size threshold, or reflection downsampling.
 */
export function buildRiverReflectionBands(THREE,geometry){
  const positions=geometry.getAttribute('position'),grid=geometry.userData.riverGrid,boxes=[];
  if(!positions)return boxes;
  const stride=grid?.across+1,validGrid=Number.isInteger(grid?.along)&&grid.along>0&&Number.isInteger(stride)&&stride>1&&(grid.along+1)*stride===positions.count;
  const bands=validGrid?grid.along:1,point=new THREE.Vector3();
  for(let band=0;band<bands;band++){
    const box=new THREE.Box3(),start=validGrid?band*stride:0,end=validGrid?(band+2)*stride:positions.count;
    for(let i=start;i<end;i++)box.expandByPoint(point.fromBufferAttribute(positions,i));
    box.expandByScalar(REFLECTION_BOUNDS_PADDING_METRES);
    box.min.z-=RIVER_MAX_WAVE_DISPLACEMENT_METRES;box.max.z+=RIVER_MAX_WAVE_DISPLACEMENT_METRES;
    boxes.push(box);
  }
  return boxes;
}

export function createRiverReflectionVisibility(THREE,geometry){
  const localBands=buildRiverReflectionBands(THREE,geometry),worldBands=localBands.map(box=>box.clone());
  const frustum=new THREE.Frustum(),projectionView=new THREE.Matrix4(),previousWorld=new THREE.Matrix4();
  let haveWorld=false,disposed=false,lastKey=null,cachedVisible=true;
  const stats={revision:'m6-conservative-water-row-frustum-1',checks:0,evaluations:0,cacheHits:0,
    bandCount:localBands.length,lastVisible:true,lastTestedBands:0,totalTestedBands:0,
    totalCheckMilliseconds:0,lastCheckMilliseconds:0,maxCheckMilliseconds:0,worldBoundsRebuilds:0,
    maximumWaveDisplacementMetres:RIVER_MAX_WAVE_DISPLACEMENT_METRES,paddingMetres:REFLECTION_BOUNDS_PADDING_METRES,
    scope:'Only skip a mirror pass when every padded water-row box is outside the actual camera frustum; no occlusion or size heuristic'};
  function intersects(viewCamera,worldMatrix){
    const began=performance.now();stats.checks++;stats.lastTestedBands=0;
    const done=(visible,reason)=>{const ms=performance.now()-began;stats.lastVisible=visible;stats.lastReason=reason;stats.lastCheckMilliseconds=ms;stats.totalCheckMilliseconds+=ms;stats.maxCheckMilliseconds=Math.max(stats.maxCheckMilliseconds,ms);return visible;};
    if(disposed||!localBands.length||!viewCamera?.isCamera||viewCamera.isArrayCamera||!worldMatrix?.elements)return done(true,'conservative-fallback');
    // Camera transforms may have changed since the preceding environment update.
    viewCamera.updateWorldMatrix(true,false);
    const key=[...viewCamera.projectionMatrix.elements,...viewCamera.matrixWorld.elements,...worldMatrix.elements,viewCamera.coordinateSystem??THREE.WebGLCoordinateSystem];
    if(!key.every(Number.isFinite))return done(true,'non-finite-transform');
    if(lastKey&&key.every((v,i)=>v===lastKey[i])){stats.cacheHits++;return done(cachedVisible,'cached-frustum');}
    lastKey=key;stats.evaluations++;
    if(!haveWorld||!worldMatrix.equals(previousWorld)){
      for(let i=0;i<localBands.length;i++)worldBands[i].copy(localBands[i]).applyMatrix4(worldMatrix);
      previousWorld.copy(worldMatrix);haveWorld=true;stats.worldBoundsRebuilds++;
    }
    projectionView.multiplyMatrices(viewCamera.projectionMatrix,viewCamera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionView,viewCamera.coordinateSystem??THREE.WebGLCoordinateSystem);
    for(const box of worldBands){stats.lastTestedBands++;stats.totalTestedBands++;if(frustum.intersectsBox(box)){cachedVisible=true;return done(true,'water-band-intersects');}}
    cachedVisible=false;return done(false,'all-water-bands-outside');
  }
  return {intersects,getState:()=>({...stats,disposed}),dispose(){disposed=true;localBands.length=0;worldBands.length=0;lastKey=null;}};
}

export function createRasterEnvironment({ THREE, renderer, scene, camera,
  rect = [-2400, -2400, 4800], terrain = null, reflectionSize = 1024 }) {
  if (!THREE || !renderer || !scene || !camera) throw new Error('Raster environment needs THREE, renderer, scene and camera');
  const group = new THREE.Group();group.name = 'Li River · procedural sky and fresh water';
  const sunDirection = new THREE.Vector3();
  const sunColor = new THREE.Color(0xffead0);
  const sky = new Sky();sky.name = 'Humid morning · analytic atmosphere';sky.scale.setScalar(40000);
  sky.frustumCulled = false;sky.renderOrder = -1000;
  group.add(sky);
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 7;
  skyUniforms.rayleigh.value = 1.4;
  skyUniforms.mieCoefficient.value = .008;
  skyUniforms.mieDirectionalG.value = .78;
  if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value = .28;
  if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value = .24;
  if (skyUniforms.cloudScale) skyUniforms.cloudScale.value = .00012;
  if (skyUniforms.cloudSpeed) skyUniforms.cloudSpeed.value = .000004;
  if (skyUniforms.cloudElevation) skyUniforms.cloudElevation.value = .45;

  const geometry = buildRiverGeometry(THREE, rect);
  let longSide = Math.min(1536, Math.max(256, Math.round(Number(reflectionSize) || 1024)));
  const water = new Reflector(geometry, {
    textureWidth: longSide, textureHeight: longSide, clipBias: .0001,
    color: 0xffffff, multisample: 0,
    shader: {
      name: 'Li River · one planar reflection and shared analytic waves',
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { color: { value: new THREE.Color(0xffffff) }, tDiffuse: { value: null },
          textureMatrix: { value: new THREE.Matrix4() },
          uTime: { value: 0 }, uWaveStrength: { value: .85 }, uWaveSpeed: { value: 1 },
          uSunDirection: { value: sunDirection.clone() }, uSunColor: { value: sunColor.clone() },
          uReflectionResolution: { value: new THREE.Vector2(longSide, longSide) },
          uReflectionStrength: { value: .95 }, uDistortion: { value: .72 }, uTurbidity: { value: .6 } }
      ]),
      vertexShader: waterVertex, fragmentShader: waterFragment
    }
  });
  water.name = 'Li River · real reflected scene';water.rotation.x = -Math.PI / 2;
  water.material.fog = true;
  water.material.side = THREE.FrontSide;
  water.frustumCulled = false;
  group.add(water);scene.add(group);

  const originalEnvironment = scene.environment;
  let environmentTarget = null, disposed = false, renderedReflections = 0, skippedOutsideFrustum = 0, time = 0;
  const reflectionVisibility=createRiverReflectionVisibility(THREE,geometry);
  let settings = { sunElevation: 14, sunAzimuth: -55, turbidity: 7, rayleigh: 1.4,
    mieCoefficient: .008, waveStrength: .85, waveSpeed: 1, reflectionStrength: .95,
    distortion: .72, waterTurbidity: .6 };

  function refreshEnvironment() {
    // Only the procedural sky enters the lighting map. Terrain/forest are
    // neither baked into images nor captured again for a refraction pass.
    const environmentScene = new THREE.Scene();
    const lightingSky = new Sky();lightingSky.scale.setScalar(40000);
    for (const key of Object.keys(lightingSky.material.uniforms)) {
      const source = skyUniforms[key];if (!source) continue;
      const target = lightingSky.material.uniforms[key];
      if (target.value?.copy && source.value) target.value.copy(source.value);
      else target.value = source.value;
    }
    if (lightingSky.material.uniforms.showSunDisc) lightingSky.material.uniforms.showSunDisc.value = 0;
    environmentScene.add(lightingSky);
    const generator = new THREE.PMREMGenerator(renderer);
    const oldTarget = renderer.getRenderTarget();
    const oldXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    try {
      const result = generator.fromScene(environmentScene, .02, .1, 100000, { size: 128 });
      if (environmentTarget) environmentTarget.dispose();
      environmentTarget = result;scene.environment = result.texture;
    } finally {
      renderer.setRenderTarget(oldTarget);renderer.xr.enabled = oldXr;
      lightingSky.geometry.dispose();lightingSky.material.dispose();generator.dispose();
    }
  }

  function updateSky(next = {}, { refreshLighting = true } = {}) {
    if (disposed) return;
    settings = { ...settings, ...next };
    const el = THREE.MathUtils.degToRad(Math.max(2, Math.min(80, settings.sunElevation)));
    const az = THREE.MathUtils.degToRad(settings.sunAzimuth);
    sunDirection.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    skyUniforms.sunPosition.value.copy(sunDirection).multiplyScalar(10000);
    skyUniforms.turbidity.value = settings.turbidity;
    skyUniforms.rayleigh.value = settings.rayleigh;
    skyUniforms.mieCoefficient.value = settings.mieCoefficient;
    const uniforms = water.material.uniforms;
    uniforms.uSunDirection.value.copy(sunDirection);uniforms.uSunColor.value.copy(sunColor);
    uniforms.uWaveStrength.value = settings.waveStrength;uniforms.uWaveSpeed.value = settings.waveSpeed;
    uniforms.uReflectionStrength.value = settings.reflectionStrength;
    uniforms.uDistortion.value = settings.distortion;uniforms.uTurbidity.value = settings.waterTurbidity;
    if (refreshLighting) refreshEnvironment();
  }

  function updateView(viewCamera = camera) {
    if (disposed) return;
    sky.position.copy(viewCamera.position);
    const aspect = Math.max(.2, Math.min(5, viewCamera.aspect || 1));
    const width = Math.max(128, Math.round(longSide * Math.min(1, aspect)));
    const height = Math.max(128, Math.round(longSide / Math.max(1, aspect)));
    const target = water.getRenderTarget();
    if (target.width !== width || target.height !== height) target.setSize(width, height);
    water.material.uniforms.uReflectionResolution.value.set(width, height);
  }

  const reflectBeforeRender = water.onBeforeRender;
  water.onBeforeRender = function (...args) {
    if (disposed) return;
    const viewCamera=args[2]||camera;
    // Keep the water/material in the normal render. Only its full mirrored
    // scene pass is redundant when NO water triangle can reach this view.
    water.updateWorldMatrix(true,false);
    if(!reflectionVisibility.intersects(viewCamera,water.matrixWorld)){skippedOutsideFrustum++;return;}
    updateView(viewCamera);
    reflectBeforeRender.apply(this, args);
    renderedReflections++;
  };

  function update(seconds = time) {
    if (disposed) return;
    time = Number.isFinite(seconds) ? seconds : time;
    water.material.uniforms.uTime.value = time;
    if (skyUniforms.time) skyUniforms.time.value = time;
  }

  function beforeRender() { updateView(camera); }
  function dispose() {
    if (disposed) return;disposed = true;
    scene.remove(group);reflectionVisibility.dispose();water.dispose();geometry.dispose();sky.geometry.dispose();sky.material.dispose();
    if (scene.environment === environmentTarget?.texture) scene.environment = originalEnvironment;
    environmentTarget?.dispose();environmentTarget = null;
  }
  updateSky();beforeRender();
  return {
    group, water, sky, sunDirection, sunColor, terrain,
    lighting: { sunIntensity: 2.7, hemisphereIntensity: .7, sunColor, sunDirection },
    update, beforeRender, updateSky, dispose,
    setReflectionSize(size){longSide=Math.min(1536,Math.max(256,Math.round(Number(size)||1024)));beforeRender();},
    get environmentMap() { return environmentTarget?.texture || null; },
    getState() { return { sceneId: 'lijiang-raster', time, settings: { ...settings },
      reflectionFrames: renderedReflections,reflectionSkippedOutsideFrustum:skippedOutsideFrustum,
      reflectionVisibilityChecks:reflectionVisibility.getState().checks,reflectionVisibility:reflectionVisibility.getState(),
      reflectionSize: [water.getRenderTarget().width, water.getRenderTarget().height],
      reflectionKind: 'actual-one-bounce-planar-scene', waveComponents: 12,
      maximumUndampedWaveHeightMetres: .0195825 * settings.waveStrength,
      externalSceneAssets: 0, disposed }; }
  };
}
