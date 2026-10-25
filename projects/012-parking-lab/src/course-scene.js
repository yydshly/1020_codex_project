import * as THREE from 'three';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createDrivingYard } from './driving-yard.js';
import { createCockpitSettings } from './cockpit.js';
import { createCourseMirrorRenderer } from './course-mirrors.js';
import { driverVerticalFov } from './driver-view.js';
import { courseObservationFrame, COURSE_GAZES } from './course-observation.js';
import { createCourseInteriorMirror } from './course-interior-mirror.js';
import { getCourseMirrorCollisionContext } from './course-mirror-collision.js';
import { createCourseRouteGuide, courseRouteCamera, COURSE_ROUTE_LAYER } from './course-route-guide.js';
import { CAR } from './vehicle.js';
import { createCourseEnvironment } from './course-environment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createCourseOperationVisuals, createCourseDistanceTrack, sampleCourseDistance, isExteriorCourseLamp, courseLightState } from './course-operation-visuals.js';

const UP = new THREE.Vector3(0, 1, 0);
const ROAD_Y = .025, PAINT_Y = .03;

/** Full-course demonstration renderer. The caller owns the animation clock.
 * Physical mirrors use the same finite convex-mirror UV model as the parking
 * lab. No screen card, rear camera, or arbitrary broad-angle camera is used. */
export function createCourseScene({ container, onReady = () => {}, mirrorZoomElement = null }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Shadow maps are invalidated by a changed pose/chapter, never by an idle RAF.
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-label', '科目二科目三三维示范场景');
  container.appendChild(renderer.domElement);
  const world = new THREE.Scene();
  world.background = new THREE.Color('#d4dfdf');
  world.fog = new THREE.Fog('#d4dfdf', 75, 230);
  const camera = new THREE.PerspectiveCamera(52, 1, .06, 450);
  const hemi = new THREE.HemisphereLight('#e0ecf3', '#817b69', 1.8);
  const sun = new THREE.DirectionalLight('#fff0d5', 2.35);
  sun.position.set(-26, 44, -18); sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 130 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00012;
  world.add(hemi, sun, sun.target);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { zenith: { value: new THREE.Color('#8eafc5') }, horizon: { value: new THREE.Color('#d4dfdf') } },
    vertexShader: 'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z=gl_Position.w*0.9999; }',
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 direction;
      void main(){
        float h=pow(clamp(normalize(direction).y,0.0,1.0),0.55);
        gl_FragColor=vec4(mix(horizon,zenith,h),1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), skyMaterial);
  sky.frustumCulled = false; sky.renderOrder = -10; world.add(sky);
  const carModel = createTrainingCar({ world });
  let settings = createCockpitSettings(), mirrorZoom = null, mirrorZoomProjection = 'driver';
  const zoomElement = mirrorZoomElement || document.getElementById('course-mirror-zoom-image');
  const assets = new Set(), sharedMaterials = new Set();
  let decor = new THREE.Group(); world.add(decor);
  let chapter = null, pose = { x: 0, z: -12, heading: 0, speed: 0, steer: 0, t: 0 };
  let routeGuide = null, routeGuideEnabled = false;
  let view = 'driver', gaze = 'forward', elapsed = 0, night = false, mirrorDirty = true, poseKey = '';
  let frameDirty = true, shadowDirty = true, shadowPoseKey = '', disposed = false;
  const restoreFrame = () => {
    if (disposed) return;
    frameDirty = true; mirrorDirty = true; shadowDirty = true; mirrorRenderer.invalidate(); interiorMirror.invalidate(); onReady();
  };
  renderer.domElement.addEventListener('webglcontextrestored', restoreFrame);
  let inspectionPerson = null, crossingPerson = null, trafficActors = [], signals = [];
  let safetyObjects = [], safetyObjectIndex = 0;
  let streetLights = [];
  const target = new THREE.Vector3(), eye = new THREE.Vector3(), forward = new THREE.Vector3();
  const yQuaternion = new THREE.Quaternion(), pitchQuaternion = new THREE.Quaternion();
  const rootLocal = new THREE.Vector3();
  const matCache = new Map();
  function material(color, options = {}) {
    const key = JSON.stringify([color, options]);
    if (!matCache.has(key)) {
      const value = new THREE.MeshStandardMaterial({ color, roughness: .9, ...options });
      matCache.set(key, value); sharedMaterials.add(value);
    }
    return matCache.get(key);
  }
  const asphalt = new THREE.TextureLoader().load(new URL('../assets/textures/yard-asphalt-v1.png', import.meta.url).href, () => {
    if (disposed) return;
    for (const texture of assets) if (texture.source === asphalt.source) texture.needsUpdate = true;
    mirrorDirty = true; frameDirty = true; onReady();
  });
  asphalt.colorSpace = THREE.SRGBColorSpace; asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4); assets.add(asphalt);
  const roadMaterial = new THREE.MeshStandardMaterial({ map: asphalt, color: '#dededc', roughness: .98 });
  sharedMaterials.add(roadMaterial);
  const white = material('#e8e7dc'), yellow = material('#e4c658');
  const curbMaterial = material('#b7b8ae'), pavement = material('#aeb1a8'), grass = material('#939d7e');

  // The same shared cockpit geometry and optical eye remain in use. Slightly
  // lifted charcoal plus a local bounced-light approximation keeps controls
  // legible through a shaded cabin, without turning the road into a lit room.
  const cabinMaterials = new Map();
  carModel.cockpit.traverse(object => {
    if (!object.material?.isMeshStandardMaterial) return;
    if (!cabinMaterials.has(object.material)) {
      const value = object.material.clone();
      if (object.material.color.getHexString() === '303438') value.color.set('#424649');
      if (object.material.color.getHexString() === '24282b') value.color.set('#303538');
      cabinMaterials.set(object.material, value);
    }
    object.material = cabinMaterials.get(object.material);
  });
  const cabinBounce = new THREE.PointLight('#d9e3e8', 1.1, 2.6, 2);
  cabinBounce.position.set(0, 1.28, 1.32); carModel.car.add(cabinBounce);
  const operationVisuals = createCourseOperationVisuals(carModel);
  for (const texture of operationVisuals.textures) assets.add(texture);
  let operation = null, operationKey = '', distanceTrack = [];

  function mesh(geometry, mat, x, y, z, parent = decor) {
    const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z);
    object.receiveShadow = true; object.castShadow = true; parent.add(object); return object;
  }
  function box(w, h, d, mat, x, y, z, parent = decor) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function safetyObject(object, label, type = 'obstacle', dimensions = null) {
    const record = { id: `${chapter?.id ?? 'course'}-${type}-${++safetyObjectIndex}`, object, label, type };
    if (dimensions) Object.assign(record, dimensions);
    else {
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox, size = bounds.getSize(new THREE.Vector3());
      record.width = size.x; record.length = size.z; record.height = size.y;
      record.offset = bounds.getCenter(new THREE.Vector3()); record.centerY = true;
    }
    safetyObjects.push(record); return object;
  }
  function plane(w, d, mat, x, z, y = ROAD_Y, parent = decor) {
    const geometry = new THREE.PlaneGeometry(w, d);
    if (mat === roadMaterial) {
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * d / 2);
    }
    const object = mesh(geometry, mat, x, y, z, parent); object.rotation.x = -Math.PI / 2;
    object.castShadow = false; return object;
  }
  function ribbon(points, width, mat, yOffset = ROAD_Y) {
    const positions = [], uvs = [], indices = [];
    let distance = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i], prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const dx = next.x - prev.x, dz = next.z - prev.z, norm = Math.hypot(dx, dz) || 1;
      const nx = dz / norm, nz = -dx / norm;
      if (i) distance += Math.hypot(point.x - prev.x, point.z - prev.z);
      for (const sign of [1, -1]) {
        positions.push(point.x + sign * nx * width / 2, (point.y ?? 0) + yOffset, point.z + sign * nz * width / 2);
        uvs.push(sign === 1 ? width / 2 : 0, distance / 2);
      }
      if (i) { const a = 2 * i - 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return mesh(geometry, mat, 0, 0, 0);
  }
  function edgeRibbon(points, width, mat = yellow) {
    for (const side of [-1, 1]) {
      const edge = points.map((point, i) => {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        const norm = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        return { x: point.x + side * (b.z - a.z) / norm * width / 2,
          y: point.y ?? 0, z: point.z - side * (b.x - a.x) / norm * width / 2 };
      });
      ribbon(edge, .1, mat, PAINT_Y);
    }
  }
  function sign(text, x, z, { width = 2.5, height = .85, color = '#ffffff', background = '#356d88', y = 2.8, yaw = Math.PI } = {}) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = background; context.fillRect(0, 0, 768, 256);
    context.strokeStyle = '#ffffff'; context.lineWidth = 8; context.strokeRect(10, 10, 748, 236);
    context.font = `600 ${text.length > 11 ? 47 : 65}px "Microsoft YaHei",sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color; context.fillText(text, 384, 128);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; assets.add(texture);
    const panel = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }), x, y, z);
    panel.rotation.y = yaw;
    safetyObject(box(.065, y - height / 2, .065, material('#707b7d', { metalness: .45 }), x, (y - height / 2) / 2, z), '标志杆');
    return panel;
  }
  function bollard(x, z, height = 0) {
    const p = safetyObject(box(.20, .55, .20, material('#e2aa4c'), x, height + .275, z), '训练标柱');
    box(.205, .12, .205, material('#f1ece0'), x, height + .35, z); return p;
  }
  function person(color = '#507685') {
    const group = new THREE.Group(); decor.add(group);
    safetyObject(group, '行人', 'pedestrian', { width: .64, length: .60, height: 1.74, baseOffset: .01, offset: new THREE.Vector3(), radius: .32 });
    const suit = material(color), dark = material('#283438'), skin = material('#c69c7c');
    mesh(new THREE.SphereGeometry(.14, 12, 9), skin, 0, 1.6, 0, group);
    box(.36, .55, .22, suit, 0, 1.18, 0, group);
    const legs = [-1, 1].map(side => box(.125, .65, .14, dark, side * .105, .53, 0, group));
    const arms = [-1, 1].map(side => box(.10, .55, .11, suit, side * .24, 1.12, 0, group));
    for (const side of [-1, 1]) box(.14, .09, .26, dark, side * .105, .055, .06, group);
    return { group, legs, arms };
  }
  function updateWalker(actor, x, z, heading, phase) {
    actor.group.position.set(x, 0, z); actor.group.rotation.y = heading;
    actor.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(phase) * .25 * (i ? -1 : 1); });
    actor.arms.forEach((arm, i) => { arm.rotation.x = Math.sin(phase) * .27 * (i ? 1 : -1); });
  }
  function simpleCar(x, z, color, heading = 0) {
    const group = new THREE.Group(); decor.add(group);
    const paint = material(color, { roughness: .35, metalness: .12 });
    mesh(new RoundedBoxGeometry(1.76, .65, 4.15, 2, .13), paint, 0, .62, 1.15, group);
    mesh(new RoundedBoxGeometry(1.42, .53, 1.9, 2, .13), material('#536771', { roughness: .22, metalness: .15 }), 0, 1.10, 1.05, group);
    mesh(new RoundedBoxGeometry(1.45, .07, 1.7, 2, .03), paint, 0, 1.38, 1.05, group);
    box(1.4, .11, .06, material('#343d3e'), 0, .50, 3.24, group);
    for (const xx of [-.82, .82]) for (const zz of [0, 2.65]) {
      const wheel = mesh(new THREE.CylinderGeometry(.33, .33, .22, 16), material('#23272a'), xx, .34, zz, group); wheel.rotation.z = Math.PI / 2;
    }
    for (const xx of [-.6, .6]) {
      box(.32, .12, .05, material('#e5e4c8', { emissive: '#e5dfb7', emissiveIntensity: .7 }), xx, .75, 3.24, group);
      box(.30, .12, .05, material('#8d3836'), xx, .75, -.94, group);
    }
    group.position.set(x, 0, z); group.rotation.y = heading;
    safetyObject(group, '道路车辆', 'vehicle', { width: 1.86, length: 4.24, height: 1.405, baseOffset: .01, offset: new THREE.Vector3(0, 0, 1.1525) });
    return group;
  }
  function surroundings() {
    plane(480, 650, grass, 0, 100, -.04);
    // Broad tonal changes add terrain depth while staying below every road.
    plane(42, 550, material('#9ba385'), -48, 100, -.036);
    plane(50, 580, material('#889774'), 52, 100, -.035);
    createCourseEnvironment({ parent: decor, sceneType: chapter.sceneType, material, night });
  }
  function roadSurface(w = 7, intersection = false) {
    // All demonstration poses see continuing road beyond the fog. Extending
    // scenery never changes a lesson stop line, route or intersection position.
    const roadLength = 550, roadCenter = 95;
    plane(w + 3, roadLength, pavement, 0, roadCenter, .015);
    plane(w, roadLength, roadMaterial, 0, roadCenter);
    for (const x of [-w / 2 + .15, w / 2 - .15]) {
      if (intersection) { plane(.1, 192, white, x, -84, PAINT_Y); plane(.1, 342, white, x, 199, PAINT_Y); }
      else plane(.1, roadLength, white, x, roadCenter, PAINT_Y);
    }
    for (const x of [-.08, .08]) {
      if (intersection) {
        plane(.09, 192, yellow, x, -84, PAINT_Y); plane(.09, 342, yellow, x, 199, PAINT_Y);
      } else plane(.09, roadLength, yellow, x, roadCenter, PAINT_Y);
    }
    if (w > 8) {
      const zs = Array.from({ length: 79 }, (_, i) => -180 + i * 7);
      const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(.12, 3.6), white, zs.length * 2);
      const transform = new THREE.Object3D(); transform.rotation.x = -Math.PI / 2;
      let index = 0;
      for (const x of [-3.5, 3.5]) for (const z of zs) {
        transform.position.set(x, PAINT_Y, z); transform.updateMatrix(); dashes.setMatrixAt(index++, transform.matrix);
      }
      dashes.instanceMatrix.needsUpdate = true; dashes.receiveShadow = true; dashes.computeBoundingSphere(); decor.add(dashes);
    }
    const curbXs = [-w / 2 - .12, w / 2 + .12];
    for (const x of curbXs) {
      if (intersection || chapter?.sceneType === 'bus' && x < 0) { box(.2, .14, 192, curbMaterial, x, .07, -84); box(.2, .14, 342, curbMaterial, x, .07, 199); }
      else box(.2, .14, roadLength, curbMaterial, x, .07, roadCenter);
    }
    for (let z = -30; z < 110; z += 22) {
      const pole = safetyObject(box(.09, 5.5, .09, material('#758282'), -w / 2 - .9, 2.75, z), '路灯杆');
      box(1.2, .07, .08, material('#758282'), pole.position.x + .5, 5.5, z);
      const bulb = box(.55, .045, .22, material('#f1edcf', { emissive: '#f1d890', emissiveIntensity: .2 }), pole.position.x + 1, 5.45, z);
      if (streetLights.length < 5) {
        const light = new THREE.PointLight('#ffe1a9', 0, 23, 2); light.position.copy(bulb.position); decor.add(light); streetLights.push(light);
      }
    }
  }
  function zebra(z, width = 7) {
    for (let x = -width / 2 + .5; x < width / 2; x += 1) plane(.5, 3.3, white, x, z, PAINT_Y + .002);
  }
  function trafficLight(x, z) {
    safetyObject(box(.12, 4.1, .12, material('#5d6767'), x, 2.05, z), '信号灯杆');
    box(.43, 1.22, .30, material('#252b2d'), x, 3.85, z);
    const lights = ['#a82b27', '#a18b31', '#4b8c5d'].map((color, i) => {
      const mat = new THREE.MeshBasicMaterial({ color });
      const lamp = mesh(new THREE.CircleGeometry(.125, 20), mat, x, 4.23 - i * .38, z - .16);
      lamp.rotation.y = Math.PI; return mat;
    });
    signals.push(lights);
  }
  function intersectionScene() {
    roadSurface(7, true);
    plane(550, 10, pavement, 0, 20, .015); plane(550, 7, roadMaterial, 0, 20);
    for (const z of [16.65, 23.35]) {
      plane(269, .1, white, -140.5, z, PAINT_Y); plane(269, .1, white, 140.5, z, PAINT_Y);
    }
    for (const z of [19.92, 20.08]) {
      plane(269, .09, yellow, -140.5, z, PAINT_Y); plane(269, .09, yellow, 140.5, z, PAINT_Y);
    }
    // Turning apron matches the actual curb opening and safety-model union.
    // Markings end at z=12/28 instead of cutting across the legal turn path.
    plane(12, 16, roadMaterial, 0, 20, ROAD_Y + .001);
    zebra(12); zebra(28);
    plane(3.5, .3, white, -1.75, 9.8, PAINT_Y);
    trafficLight(-4.5, 27); trafficLight(4.5, 11);
    sign('前方路口', -5.1, -3, { width: 2, height: .65 });
  }
  function trainingScene(type) {
    surroundings();
    if (type === 'hill') {
      const points = [{ x: 0, z: -180, y: 0 }, { x: 0, z: 0, y: 0 }, { x: 0, z: 18, y: 1.8 },
        { x: 0, z: 55, y: 1.8 }, { x: 0, z: 73, y: 0 }, { x: 0, z: 275, y: 0 }];
      const wedge = new THREE.BufferGeometry();
      wedge.setAttribute('position', new THREE.Float32BufferAttribute([-4,0,0, -4,0,18, -4,1.8,18, 4,0,0, 4,0,18, 4,1.8,18], 3));
      wedge.setIndex([0,1,2, 3,5,4, 0,3,4, 0,4,1, 0,2,5, 0,5,3, 1,4,5, 1,5,2]); wedge.computeVertexNormals();
      mesh(wedge, curbMaterial, 0, 0, 0);
      box(8, 1.8, 37, curbMaterial, 0, .9, 36.5);
      const descent = mesh(wedge.clone(), curbMaterial, 0, 0, 73); descent.rotation.y = Math.PI;
      ribbon(points, 7, roadMaterial); edgeRibbon(points, 7);
      const stopZ = (chapter.scene?.stopZ ?? 12.25) + CAR.length - CAR.rearOverhang;
      const stop = [{ x: -3.5, z: stopZ, y: stopZ * .1 }, { x: 3.5, z: stopZ, y: stopZ * .1 }]; ribbon(stop, .18, yellow, PAINT_Y);
      sign('坡道定点停车和起步', -5.5, 12, { width: 3.5, y: 3.4 });
      for (let z = 0; z < 20; z += 2) for (const x of [-3.75, 3.75]) bollard(x, z, Math.min(1.8, z * .1));
    } else if (type === 'side') {
      plane(13, 32, roadMaterial, -1.5, -1);
      plane(3.5, 163, roadMaterial, 0, -98.5); plane(3.5, 235, roadMaterial, 0, 132.5);
      for (const x of [-4.5, -1.9]) plane(.1, 7, yellow, x, -7, PAINT_Y);
      for (const z of [-10.5, -3.5]) plane(2.7, .1, yellow, -3.2, z, PAINT_Y);
      for (const x of [-1.75, 1.75]) plane(.1, 430, yellow, x, 35, PAINT_Y);
      sign('侧方停车', -6, -5); bollard(-4.9, -3.1); bollard(-4.9, -10.9);
    } else if (type === 'curve') {
      const points = Array.from({ length: 101 }, (_, i) => { const u = i / 100; return { x: 5 * Math.sin(2 * Math.PI * u), z: -20 + 52 * u }; });
      const tangent = 10 * Math.PI / 52, length = 30;
      const continuation = (u, side) => ({ x: side * tangent * length * (u - u * u + u ** 3 / 3), z: (side < 0 ? -20 : 32) + side * length * u });
      const approach = Array.from({ length: 16 }, (_, i) => continuation((16 - i) / 16, -1));
      const exit = Array.from({ length: 16 }, (_, i) => continuation((i + 1) / 16, 1));
      const complete = [{ x: -tangent * length / 3, z: -180 }, ...approach, ...points, ...exit, { x: tangent * length / 3, z: 275 }];
      ribbon(complete, 3.5, roadMaterial); edgeRibbon(complete, 3.5);
      sign('曲线行驶', -5, -17); for (let i = 0; i < points.length; i += 15) bollard(points[i].x + 3.2, points[i].z);
    } else if (type === 'angle') {
      plane(3.5, 28.6, roadMaterial, 0, -7.45);
      plane(25, 3.5, roadMaterial, 10.75, 5.1, ROAD_Y + .001);
      plane(3.5, 158.25, roadMaterial, 0, -100.875);
      plane(251.75, 3.5, roadMaterial, 149.125, 5.1, ROAD_Y + .001);
      plane(.1, 26.6, yellow, -1.75, -6.45, PAINT_Y); plane(.1, 22.6, yellow, 1.75, -8.45, PAINT_Y);
      plane(25, .1, yellow, 10.75, 6.85, PAINT_Y); plane(21.5, .1, yellow, 12.5, 3.35, PAINT_Y);
      for (const x of [-1.75, 1.75]) plane(.1, 160.25, yellow, x, -99.875, PAINT_Y);
      for (const z of [3.35, 6.85]) plane(251.75, .1, yellow, 149.125, z, PAINT_Y);
      sign('直角转弯', -4.8, -7); bollard(2.1, 3); bollard(-2.1, 7.2);
    }
  }
  function buildScene() {
    inspectionPerson = null; crossingPerson = null; trafficActors = []; signals = []; streetLights = [];
    const type = chapter?.sceneType ?? 'prepare';
    if (type === 'parking') {
      const helpers = new THREE.Group(); decor.add(helpers);
      // Texture.clone() marks a not-yet-loaded image for upload. Share its
      // source without requesting an upload until the loader has image data.
      const map = new THREE.Texture(); map.source = asphalt.source; map.colorSpace = asphalt.colorSpace;
      map.wrapS = asphalt.wrapS; map.wrapT = asphalt.wrapT; map.anisotropy = asphalt.anisotropy;
      map.repeat.set(31 / 2, 23.2 / 2); if (map.image) map.needsUpdate = true; assets.add(map);
      createDrivingYard({ world: decor, helpers, asphaltMap: map });
      return;
    }
    if (['hill', 'side', 'curve', 'angle'].includes(type)) { trainingScene(type); return; }
    surroundings();
    if (['intersection', 'left_turn', 'right_turn'].includes(type)) intersectionScene();
    else if (type === 'uturn') {
      plane(20, 24, roadMaterial, 2, 12);
      plane(3.5, 180, roadMaterial, -1.75, -90); plane(3.5, 180, roadMaterial, 7.85, -90);
      box(5.7, .12, 180, curbMaterial, 3.05, .06, -90);
      for (const x of [-3.5, 0, 6.1, 9.6]) plane(.1, 180, yellow, x, -90, PAINT_Y);
      sign('前方允许掉头', -5.6, -4, { width: 2.8 });
    } else roadSurface(type === 'road_lanes' ? 14 : 7);
    if (type === 'prepare') {
      inspectionPerson = person('#b5bb72');
      sign('上车准备 · 检查车辆周围', -5.8, 9, { width: 3.7 });
      for (const x of [-4.3, 4.3]) for (let z = -8; z <= 12; z += 5) bollard(x, z);
    }
    if (type === 'lights') sign('模拟夜间灯光', -5.4, 12, { width: 3.3 });
    if (type === 'school') {
      sign('前方学校 · 减速观察', -5.6, 4, { width: 3.3, background: '#9a7d31' });
      sign('育新学校', -7.4, 12, { width: 3, height: .9, y: 3.5 });
      zebra(19);
      const pupil = person('#d2a765'); pupil.group.position.set(-5.1, 0, 19);
      const guardian = person('#687e94'); guardian.group.position.set(-5.6, 0, 20);
    }
    if (type === 'bus') {
      plane(3.2, 16, roadMaterial, -5.1, 20);
      box(2.2, .12, 15, pavement, -7.6, .06, 20);
      box(2, .12, 5, material('#506c77'), -7.5, 2.5, 20);
      for (const z of [17.7, 22.3]) safetyObject(box(.07, 2.5, .07, material('#566b73'), -8.2, 1.25, z), '候车亭立柱');
      box(.12, .5, 3, material('#7b6c59'), -7.5, .4, 20);
      const busPaint = material('#508d83', { roughness: .55 }), busGlass = material('#4d646d', { roughness: .25 });
      safetyObject(box(2.3, 2.25, 9.5, busPaint, -5.15, 1.45, 20), '停靠公交车', 'vehicle');
      box(2.28, .12, 9.4, material('#d9ddd8'), -5.15, 2.62, 20);
      for (const x of [-6.315, -3.985]) for (let z = 16.3; z < 24; z += 1.55) box(.025, 1, 1.3, busGlass, x, 1.97, z);
      for (const x of [-6.2, -4.1]) for (const z of [17, 23]) {
        const wheel = mesh(new THREE.CylinderGeometry(.47, .47, .2, 18), material('#272d2c'), x, .47, z); wheel.rotation.z = Math.PI / 2;
      }
      for (const x of [-5.95, -4.35]) box(.25, .2, .03, material('#9d3932'), x, .8, 15.23);
      sign('公共汽车站', -4.8, 16, { width: 1.5, height: .9, background: '#397780', y: 2.8 });
      const passenger = person('#9f716b'); passenger.group.position.set(-7.1, .12, 21);
      sign('通过公交站 · 观察行人', -5.3, 3, { width: 3.5 });
    }
    if (type === 'crosswalk') {
      zebra(chapter.scene?.crossingZ ?? 15); sign('前方人行横道', -5.4, 3, { width: 3 }); crossingPerson = person('#aa7864');
      plane(3.1, .15, white, -1.75, chapter.scene?.stopLineZ ?? 12.6, PAINT_Y);
    }
    if (type === 'meeting' || type === 'night') {
      const actor = chapter.scene?.oncoming ?? { x: 1.75, z: 80, speed: 4 };
      trafficActors.push({ group: simpleCar(actor.x, actor.z, '#7a8991', Math.PI), kind: 'oncoming', ...actor });
    }
    if (chapter?.id?.includes('overtake') || chapter?.kind === 'overtake') {
      const actor = chapter.scene?.leadVehicle ?? { x: -5.25, z: 4, speed: 1.2 };
      trafficActors.push({ group: simpleCar(actor.x, actor.z, '#818c82'), kind: 'lead', ...actor });
    }
    if (['straight', 'gears', 'start', 'pull_over', 'road_lanes', 'night'].includes(type)) {
      sign(type === 'pull_over' ? '靠边停车示范区' : type === 'gears' ? '平稳加减挡 · 不低头看挡' : type === 'road_lanes' ? '同向双车道示范' : type === 'night' ? '夜间道路 · 正确使用灯光' : 'C1 道路驾驶项目示范',
        type === 'road_lanes' ? -9 : -5.5, 17, { width: 3.5 });
    }
  }

  const mirrorRenderer = createCourseMirrorRenderer({ renderer, world, carModel, settings });
  const interiorMirror = createCourseInteriorMirror({ renderer, world, carModel, settings });
  const indicators = [];
  for (const signValue of [1, -1]) {
    const mat = new THREE.MeshStandardMaterial({ color: '#735a2e', emissive: '#ffad32', emissiveIntensity: 0, roughness: .35 });
    for (const z of [-.83, 3.43]) box(.16, .10, .04, mat, signValue * .78, .76, z, carModel.car);
    indicators.push({ side: signValue === 1 ? 'left' : 'right', material: mat });
  }
  const headLights = [];
  for (const x of [-.6, .6]) {
    const light = new THREE.SpotLight('#fff5d4', 0, 75, .36, .7, 2);
    light.position.set(x, .76, 3.44); const lightTarget = new THREE.Object3D(); lightTarget.position.set(x, .1, 28);
    carModel.car.add(light, lightTarget); light.target = lightTarget; headLights.push(light);
  }
  const frontLampMaterials = [], rearLampMaterials = [];
  carModel.car.traverse(object => {
    // Control stalk groups also have descriptive headlight-* names; only the
    // four exterior lamp meshes own the emissive materials controlled here.
    if (isExteriorCourseLamp(object)) {
      object.material = object.material.clone();
      (object.name.startsWith('headlight-') ? frontLampMaterials : rearLampMaterials).push(object.material);
    }
  });

  function setPose(next) {
    if (disposed) return;
    pose = { ...next, t: next.t ?? next.time ?? elapsed };
    const t = pose.t ?? pose.time ?? elapsed;
    const wheelDistance = Number.isFinite(pose.distance) ? pose.distance : sampleCourseDistance(distanceTrack, t);
    const nextKey = JSON.stringify([pose.x, pose.y, pose.z, pose.heading, pose.steer, t, wheelDistance,
      pose.speed, pose.leftSignal, pose.rightSignal, pose.brake, pose.lightMode, pose.gear,
      pose.clutch, pose.clutchState, pose.clutchValue, pose.brakeValue, pose.throttle, pose.parkingBrake]);
    if (nextKey !== poseKey) { mirrorDirty = true; frameDirty = true; poseKey = nextKey; }
    const pedestrianStart = chapter?.pedestrianStart ?? 8, pedestrianEnd = chapter?.pedestrianEnd ?? 14;
    const walkerMoving = crossingPerson && t > pedestrianStart && t < pedestrianEnd;
    const pedestrianProgress = crossingPerson ? Math.max(0, Math.min(1, (t - pedestrianStart) / Math.max(.1, pedestrianEnd - pedestrianStart))) : null;
    const nextShadowKey = JSON.stringify([pose.x, pose.y, pose.z, pose.heading, pose.steer,
      wheelDistance, inspectionPerson && t < 7 ? t : null, walkerMoving ? t : null,
      pedestrianProgress, trafficActors.length ? t : null]);
    if (nextShadowKey !== shadowPoseKey) { shadowDirty = true; shadowPoseKey = nextShadowKey; }
    const type = chapter?.sceneType;
    // The raised structure is 8 m wide: a free-driving pose off its sides is
    // on ground, even if it inherited the demonstration's elevated pose.y.
    const onRamp = type === 'hill' && Math.abs(pose.x || 0) <= 4 && pose.z > 0 && pose.z < 73;
    const slope = onRamp ? pose.z < 18 ? .1 : pose.z > 55 ? -.1 : 0 : 0;
    const height = type === 'hill' ? onRamp ? pose.z < 18 ? pose.z * .1 : pose.z > 55 ? (73 - pose.z) * .1 : 1.8 : 0 : Number(pose.y) || 0;
    carModel.car.position.set(pose.x || 0, CAR_VISUAL_ROOT_Y + height, pose.z || 0);
    yQuaternion.setFromAxisAngle(UP, pose.heading || 0);
    pitchQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan(slope * Math.cos(pose.heading || 0)));
    carModel.car.quaternion.copy(yQuaternion).multiply(pitchQuaternion);
    // Keep the finite high-resolution shadow area around the moving lesson car.
    sun.position.set((pose.x || 0) - 26, height + 44, (pose.z || 0) - 18);
    sun.target.position.set(pose.x || 0, height, (pose.z || 0) + 8);
    sky.position.copy(carModel.car.position);
    for (const pivot of carModel.frontPivots) pivot.rotation.y = pose.steer || 0;
    carModel.steering.rotation.z = (pose.steer || 0) * -12;
    for (const wheel of carModel.wheels) wheel.rotation.x = wheelDistance / .33;
    if (operationVisuals.update(pose, operation, { prepare: type === 'prepare' })) {
      frameDirty = true; mirrorDirty = true; shadowDirty = true;
    }
    carModel.car.updateMatrixWorld(true);
    routeGuide?.setVehicleTransform(carModel.car.matrixWorld);
    const lights = courseLightState({ ...pose, lightMode: pose.lightMode || (night ? 'low' : 'off') });
    const { high, blink } = lights;
    for (const indicator of indicators) indicator.material.emissiveIntensity = (indicator.side === 'left' ? lights.leftSignal : lights.rightSignal) && blink ? 4 : 0;
    for (const light of headLights) {
      light.intensity = lights.beamIntensity;
      light.distance = high ? 120 : 65; light.angle = high ? .28 : .40;
      light.target.position.z = high ? 65 : 26;
    }
    for (const mat of frontLampMaterials) { mat.emissive.set('#fff0c2'); mat.emissiveIntensity = lights.frontEmission; }
    for (const mat of rearLampMaterials) { mat.emissive.set('#ff221a'); mat.emissiveIntensity = lights.rearEmission; }
    const signalIndex = chapter?.scene?.signal === 'red' ? 0 : chapter?.scene?.signal === 'yellow' ? 1 : 2;
    for (const lamps of signals) lamps.forEach((mat, index) => mat.color.set(index === signalIndex ? ['#ff3a24', '#f5d052', '#54e578'][index] : '#28332f'));
    if (inspectionPerson) {
      inspectionPerson.group.visible = t < 7;
      const points = [[2.2, 1.3], [2.2, -2.2], [-2.2, -2.2], [-2.2, 4.6], [2.2, 4.6], [2.2, 1.3]];
      const u = Math.min(1, t / 7) * 5, index = Math.min(4, Math.floor(u)), f = u - index;
      const a = points[index], b = points[index + 1];
      const local = rootLocal.set(a[0] + (b[0] - a[0]) * f, 0, a[1] + (b[1] - a[1]) * f).applyQuaternion(yQuaternion).add(carModel.car.position);
      updateWalker(inspectionPerson, local.x, local.z, Math.atan2(b[0] - a[0], b[1] - a[1]) + (pose.heading || 0), t * 7);
    }
    if (crossingPerson) {
      updateWalker(crossingPerson, -5.5 + 11 * pedestrianProgress, chapter.scene?.crossingZ ?? 15, Math.PI / 2, walkerMoving ? t * 7 : 0);
    }
    for (const actor of trafficActors) actor.group.position.z = actor.kind === 'oncoming' ? actor.z - t * actor.speed : actor.z + t * actor.speed;
  }
  function updateCamera() {
    const car = carModel.car;
    const overview = routeGuideEnabled && routeGuide && ['orbit', 'top'].includes(view);
    if (routeGuide) routeGuide.group.visible = Boolean(overview);
    if (overview) camera.layers.enable(COURSE_ROUTE_LAYER); else camera.layers.disable(COURSE_ROUTE_LAYER);
    if (overview) {
      const fitted = courseRouteCamera(routeGuide.data, { aspect: camera.aspect, top: view === 'top' });
      camera.position.set(fitted.position.x, fitted.position.y, fitted.position.z); target.set(fitted.target.x, fitted.target.y, fitted.target.z);
      camera.up.set(fitted.up.x, fitted.up.y, fitted.up.z); camera.fov = fitted.fov;
    } else if (view === 'driver') {
      const observation = courseObservationFrame(settings, gaze);
      eye.set(observation.eye.x, observation.eye.y - CAR_VISUAL_ROOT_Y, observation.eye.z).applyMatrix4(car.matrixWorld);
      forward.set(observation.direction.x, observation.direction.y, observation.direction.z).applyQuaternion(car.quaternion).normalize();
      camera.position.copy(eye); target.copy(eye).addScaledVector(forward, 20);
      camera.up.copy(UP).applyQuaternion(car.quaternion); camera.fov = driverVerticalFov(camera.aspect);
    } else if (view === 'controls') {
      // An explicitly chosen teaching close-up, separate from the calibrated
      // driving eye. No mirror aperture, source camera or driver FOV changes.
      const closeup = operationVisuals.cameraPose(operation?.target, camera.aspect);
      camera.position.copy(rootLocal.fromArray(closeup.position).applyMatrix4(car.matrixWorld));
      target.fromArray(closeup.target).applyMatrix4(car.matrixWorld);
      camera.up.copy(UP).applyQuaternion(car.quaternion); camera.fov = closeup.fov;
    } else {
      target.set(0, .8, 1.1).applyMatrix4(car.matrixWorld);
      if (view === 'top') { camera.position.set(target.x, target.y + (chapter?.sceneType === 'parking' ? 31 : 27), target.z - .01); camera.up.set(0, 0, 1); camera.fov = 52; }
      else { camera.position.copy(rootLocal.set(10, 8, -11).applyQuaternion(yQuaternion).add(target)); camera.up.copy(UP); camera.fov = 52; }
    }
    camera.lookAt(target); camera.updateProjectionMatrix();
  }
  function render(dt = 0) {
    elapsed += Math.max(0, Number(dt) || 0);
    if (disposed || !chapter || !frameDirty && !mirrorDirty) return;
    updateCamera();
    // One shadow update serves the two mirror passes and the forward view.
    // With autoUpdate disabled, an unchanged paused lesson costs no GPU passes.
    renderer.shadowMap.needsUpdate = shadowDirty;
    interiorMirror.prepare({ dirty: mirrorDirty });
    mirrorRenderer.prepare({ dirty: mirrorDirty, zoomSide: mirrorZoom, zoomElement });
    mirrorDirty = false;
    renderer.render(world, camera);
    mirrorRenderer.renderOverlay({ side: mirrorZoom, element: zoomElement, projection: mirrorZoomProjection });
    frameDirty = false; shadowDirty = false;
  }
  function releaseDecor() {
    routeGuide?.dispose(); routeGuide = null;
    safetyObjects = []; safetyObjectIndex = 0;
    world.remove(decor);
    const geometries = new Set(), materials = new Set(), maps = new Set();
    decor.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      const values = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of values) if (mat && !sharedMaterials.has(mat)) {
        if (mat.map) maps.add(mat.map);
        materials.add(mat);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    for (const map of maps) { map.dispose(); assets.delete(map); }
    decor = new THREE.Group(); world.add(decor);
  }
  function setChapter(next) {
    if (disposed) return;
    chapter = next; elapsed = 0; mirrorDirty = true; frameDirty = true; shadowDirty = true;
    poseKey = ''; shadowPoseKey = ''; releaseDecor();
    operation = null; operationKey = ''; distanceTrack = createCourseDistanceTrack(next.poses || []);
    night = ['night', 'lights'].includes(next.sceneType);
    world.background.set(night ? '#172a3b' : '#d4dfdf'); world.fog.color.copy(world.background);
    world.fog.near = night ? 40 : 75; world.fog.far = night ? 185 : 230;
    skyMaterial.uniforms.zenith.value.set(night ? '#07111e' : '#8eafc5');
    skyMaterial.uniforms.horizon.value.copy(world.background);
    hemi.intensity = night ? .42 : 1.8; sun.intensity = night ? .17 : 2.35;
    cabinBounce.intensity = night ? .32 : 1.1;
    renderer.toneMappingExposure = night ? 1.12 : 1.02;
    buildScene(); for (const light of streetLights) light.intensity = night ? 95 : 0;
    routeGuide = createCourseRouteGuide(next); world.add(routeGuide.group);
    const size = renderer.getSize(new THREE.Vector2()); routeGuide.setResolution(size.x, size.y);
    if (next.poses?.length) setPose(next.poses[0]);
  }
  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    routeGuide?.setResolution(w, h);
    frameDirty = true;
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
  function dispose() {
    if (disposed) return;
    disposed = true; resizeObserver.disconnect();
    renderer.domElement.removeEventListener('webglcontextrestored', restoreFrame); releaseDecor();
    const geometries = new Set(), materials = new Set([...sharedMaterials, ...cabinMaterials.keys()]);
    world.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of mats) if (mat) materials.add(mat);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    for (const texture of assets) texture.dispose(); mirrorRenderer.dispose(); interiorMirror.dispose();
    renderer.dispose(); renderer.domElement.remove();
  }
  return { setChapter, setPose, resize, render, dispose,
    setRouteGuide(enabled) {
      const next = Boolean(enabled);
      if (disposed || next === routeGuideEnabled) return;
      routeGuideEnabled = next; frameDirty = true;
    },
    setMirrorSettings(next) {
      if (disposed) return;
      mirrorRenderer.setSettings(next); settings = mirrorRenderer.getSettings(); interiorMirror.setSettings(settings);
      frameDirty = true; mirrorDirty = true;
    },
    getMirrorSettings() { return mirrorRenderer.getSettings(); },
    getMirrorRecognition(side, { displayRect = null, projection = 'driver' } = {}) {
      if (disposed || !chapter || !['left', 'right'].includes(side)) return null;
      world.updateMatrixWorld(true); updateCamera(); camera.updateMatrixWorld(true);
      return mirrorRenderer.recognize?.({ side, chapterId: chapter.id, camera,
        canvasRect: renderer.domElement.getBoundingClientRect(), displayRect, projection,
        pose: { ...pose, y: carModel.car.position.y - CAR_VISUAL_ROOT_Y } }) ?? null;
    },
    getInteriorMirrorAdjustment() { return interiorMirror.getAdjustment(); },
    setInteriorMirrorAdjustment(next) {
      if (disposed) return false;
      const applied = interiorMirror.setAdjustment(next);
      if (applied) { frameDirty = true; mirrorDirty = true; shadowDirty = true; }
      return applied;
    },
    recommendInteriorMirror() {
      if (disposed) return null;
      const result = interiorMirror.recommendForSeat();
      frameDirty = true; mirrorDirty = true; shadowDirty = true; return result;
    },
    setMirrorZoom(side) {
      if (disposed) return;
      const next = ['left', 'right'].includes(side) ? side : null;
      if (next !== mirrorZoom) { mirrorZoom = next; frameDirty = true; }
    },
    setMirrorZoomProjection(next) {
      if (disposed || !['driver', 'unfolded'].includes(next)) return;
      if (next !== mirrorZoomProjection) { mirrorZoomProjection = next; frameDirty = true; }
    },
    setOperation(next) {
      if (disposed) return;
      const key = JSON.stringify(next || null);
      if (key === operationKey) return;
      operationKey = key; operation = next ? { ...next } : null;
      if (operationVisuals.update(pose, operation, { prepare: chapter?.sceneType === 'prepare' })) {
        frameDirty = true; shadowDirty = true; mirrorDirty = true;
      }
      frameDirty = true;
    },
    setView(next) { if (['driver', 'orbit', 'top', 'controls'].includes(next) && view !== next) { view = next; frameDirty = true; } },
    setGaze(next) { if (COURSE_GAZES.includes(next) && gaze !== next) { gaze = next; frameDirty = true; } },
    getSafetyContext() {
      world.updateMatrixWorld(true);
      const actors = safetyObjects.filter(entry => {
        for (let node = entry.object; node; node = node.parent) if (!node.visible) return false;
        return true;
      }).map(entry => {
        const center = entry.offset.clone().applyMatrix4(entry.object.matrixWorld);
        const scale = entry.object.getWorldScale(new THREE.Vector3());
        const headingVector = new THREE.Vector3(0, 0, 1).transformDirection(entry.object.matrixWorld);
        const height = entry.height * Math.abs(scale.y);
        return { id: entry.id, type: entry.type, label: entry.label, x: center.x, z: center.z,
          heading: Math.atan2(headingVector.x, headingVector.z), width: entry.width * Math.abs(scale.x), length: entry.length * Math.abs(scale.z),
          height, baseY: entry.centerY ? center.y - height / 2 : center.y + (entry.baseOffset ?? 0),
          ...(entry.radius ? { radius: entry.radius * Math.max(Math.abs(scale.x), Math.abs(scale.z)) } : {}) };
      });
      return { actors, ...getCourseMirrorCollisionContext(carModel), time: pose.t, chapterId: chapter?.id, gaze, view };
    },
    getVehiclePose() { return { ...pose, y: carModel.car.position.y - CAR_VISUAL_ROOT_Y }; },
  };
}
