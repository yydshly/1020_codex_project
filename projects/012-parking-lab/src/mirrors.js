import * as THREE from 'three';
import { BAY, CAR, localToWorld } from './vehicle.js';
import { createMirrorFrame, projectMirrorPoint } from './cockpit.js';
import { createMirrorOptics } from './mirror-optics.js';
import { mirrorObservation } from './mirror-observation.js';
import { createMirrorSurfaceGeometry, updateMirrorSurfaceGeometry } from './mirror-surface.js';
import { PAINT_SURFACE_Y } from './scene-geometry.js';
import { createMirrorClipPlane } from './mirror-clip.js';

// Finite convex-surface rays supply the UVs. A fitted virtual eye supplies
// scene colour: a measured near-field approximation, not scene ray tracing.
export function createMirrorRenderer({ renderer, world, carModel }) {
  const sides = ['left', 'right'], columns = 24, rows = 16;
  const cameras = sides.map(() => new THREE.PerspectiveCamera(25, 1.58, 0.04, 110));
  const targets = sides.map(() => new THREE.WebGLRenderTarget(512, 324, { colorSpace: THREE.SRGBColorSpace }));
  const surfaces = sides.map(side => carModel.mirrorSurfaces?.[side] ?? null);
  const hasPhysicalMirrors = surfaces.some(Boolean);
  surfaces.forEach((surface, i) => {
    if (!surface) return;
    surface.material = new THREE.MeshBasicMaterial({ map: targets[i].texture, toneMapped: false,
      side: THREE.FrontSide, depthTest: true, depthWrite: true });
    surface.castShadow = false; surface.receiveShadow = false;
    surface.userData.mirrorSide = sides[i];
  });
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const materials = targets.map(target => new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false, depthTest: false, depthWrite: false }));
  const geometries = sides.map(() => new THREE.PlaneGeometry(2, 2, columns, rows));
  const overlays = sides.map((_, i) => {
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometries[i], materials[i])); return scene;
  });
  const sceneElement = document.getElementById('scene');
  const images = sides.map(side => document.getElementById(`${side}-mirror-image`));
  const guideLayers = images.map(element => {
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    canvas.hidden = true; element.prepend(canvas); return canvas;
  });
  const markers = sides.map(side => ({ wheel: document.getElementById(`${side}-wheel-marker`), corner: document.getElementById(`${side}-corner-marker`) }));
  const recognitionMarkers = sides.map(side => ({ body: document.getElementById(`${side}-body-marker`), ground: document.getElementById(`${side}-ground-marker`) }));
  const stripeMarkers = sides.map(side => ({ sideLine: document.getElementById(`${side}-side-line-marker`), backLine: document.getElementById(`${side}-back-line-marker`), entranceLine: document.getElementById(`${side}-entrance-line-marker`) }));
  const opticalCache = sides.map(() => ({ key: '', optics: null, frame: null, surfaceKey: '' }));
  const raycaster = new THREE.Raycaster(), rayOrigin = new THREE.Vector3(), rayDirection = new THREE.Vector3();
  const localState = { x: 0, z: 0, heading: 0 };
  const rotated = (value, state) => ({ ...localToWorld({ x: 0, z: 0, heading: state.heading }, value.x, value.z), y: value.y });
  let observationGuides = false, recognitionGuides = false, dirty = true, rectangles = [];
  const observationCache = new Map();
  const observer = new ResizeObserver(() => { dirty = true; });
  observer.observe(sceneElement); images.forEach(element => observer.observe(element));

  function opticsFor(i, settings, syncPhysical = false) {
    const side = sides[i], cached = opticalCache[i];
    const rootY = carModel.car?.position.y ?? 0;
    const key = JSON.stringify([settings.seatHeight, settings.seatFore, settings[side].yaw, settings[side].pitch, rootY]);
    if (cached.key !== key) {
      const frame = createMirrorFrame(localState, side, settings);
      const optics = createMirrorOptics(frame, { columns, rows, aspect: 1.58 });
      geometries[i].getAttribute('uv').array.set(optics.uvs); geometries[i].getAttribute('uv').needsUpdate = true;
      cached.key = key; cached.optics = optics; cached.frame = frame;
    }
    const surface = surfaces[i];
    if (syncPhysical && surface && cached.surfaceKey !== key) {
      const expected = (columns + 1) * (rows + 1);
      if (surface.geometry.getAttribute('position')?.count !== expected) {
        const oldGeometry = surface.geometry;
        surface.geometry = createMirrorSurfaceGeometry(cached.frame, cached.optics, { rootY });
        oldGeometry.dispose();
      } else updateMirrorSurfaceGeometry(surface.geometry, cached.frame, cached.optics, { rootY });
      cached.surfaceKey = key;
    }
    return cached.optics;
  }
  function setCamera(i, state, settings, syncPhysical = false) {
    const optics = opticsFor(i, settings, syncPhysical), camera = cameras[i];
    const position = localToWorld(state, optics.position.x, optics.position.z);
    const direction = rotated(optics.forward, state), up = rotated(optics.up, state);
    camera.position.set(position.x, optics.position.y, position.z); camera.up.set(up.x, up.y, up.z);
    camera.lookAt(position.x + direction.x, optics.position.y + direction.y, position.z + direction.z);
    camera.aspect = optics.aspect; camera.fov = optics.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    return createMirrorFrame(state, sides[i], settings);
  }
  function drawObservation(context, frame, state, side, w, h, legend = false, settings) {
    const screen = value => { const p = referenceVisible(value, frame); return { x: p.x * w, y: p.y * h, visible: p.visible }; };
    const stroke = (a, b, color) => {
      for (let i = 0; i < 24; i++) {
        const position = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
        const start = screen(position(i / 24)), middle = screen(position((i + 0.5) / 24)), end = screen(position((i + 1) / 24));
        if (!start.visible || !middle.visible || !end.visible) continue;
        context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y);
        context.lineWidth = Math.max(5, w / 85); context.strokeStyle = '#152d38b8'; context.stroke();
        context.lineWidth = Math.max(2.5, w / 140); context.strokeStyle = color; context.stroke();
      }
    };
    const sign = side === 'left' ? 1 : -1;
    // A visible side-panel reference, at the same world height as recognition.
    // Keep clear of the rear wheel opening; this is not a ground-plane heading.
    const bodyA = localToWorld(state, sign * (CAR.width / 2 - .005), .25), bodyB = localToWorld(state, sign * (CAR.width / 2 - .005), 1.1);
    stroke({ ...bodyA, y: .65 }, { ...bodyB, y: .65 }, '#5fc5ff');
    const lineX = side === 'left' ? BAY.right : BAY.left;
    stroke({ x: lineX, y: PAINT_SURFACE_Y, z: BAY.entrance }, { x: lineX, y: PAINT_SURFACE_Y, z: BAY.back }, '#c78d18');
    if (legend) {
      const observation = mirrorObservation(state, side, settings, {
        acceptReference: sample => referenceVisible(sample.point, frame).visible,
      });
      // Use this capture's calibrated frame, not the default eye/mirror pose.
      for (const [name, text] of [['entranceLine', '库口外沿'], ['backLine', '库底线']]) {
        const reference = observation[name];
        const marker = referenceVisible(reference.point, frame);
        if (!reference.visible || !marker.visible) continue;
        const boxWidth = text.length * 14 + 12;
        const x = Math.max(boxWidth / 2 + 3, Math.min(w - boxWidth / 2 - 3, marker.x * w));
        const y = Math.max(22, Math.min(h - 48, marker.y * h));
        context.fillStyle = '#454331eb'; context.fillRect(x - boxWidth / 2, y - 17, boxWidth, 23);
        context.font = '14px sans-serif'; context.fillStyle = '#fff'; context.fillText(text, x - boxWidth / 2 + 6, y);
      }
      context.fillStyle = '#173c30e8'; context.fillRect(0, h - 30, w, 30);
      context.font = '15px sans-serif'; context.fillStyle = '#fff';
      context.fillText('教学标注 · 青：车身参照  金：库侧线', 10, h - 10);
    }
  }
  function opaqueVisible(object) {
    if (!object.isMesh) return false;
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const material = Array.isArray(object.material) ? object.material : [object.material];
    return material.some(value => value?.visible !== false && (!value?.transparent || value.opacity >= .95));
  }
  function referenceVisible(worldPoint, frame) {
    const projected = projectMirrorPoint(frame, worldPoint); let visible = projected.visible;
    if (visible) {
      rayOrigin.set(projected.origin.x, projected.origin.y, projected.origin.z);
      rayDirection.set(worldPoint.x, worldPoint.y, worldPoint.z).sub(rayOrigin);
      const distance = rayDirection.length(); rayDirection.normalize();
      raycaster.set(rayOrigin, rayDirection); raycaster.near = .015; raycaster.far = Math.max(.015, distance - .065);
      visible = !raycaster.intersectObjects(world.children, true).some(hit => opaqueVisible(hit.object));
    }
    return { ...projected, visible };
  }
  function updateLabel(element, worldPoint, frame, enabled) {
    if (!element) return;
    if (!enabled) { element.hidden = true; return; }
    const projected = referenceVisible(worldPoint, frame), visible = projected.visible;
    element.hidden = !visible;
    if (visible) { element.style.left = `${projected.x * 100}%`; element.style.top = `${projected.y * 100}%`; }
  }
  const carVisibility = () => [...new Set([carModel.cabin, carModel.cockpit, carModel.externalMirrors, ...surfaces].filter(Boolean))]
    .map(object => ({ object, visible: object.visible }));
  const restoreCar = visibility => visibility.forEach(({ object, visible }) => { object.visible = visible; });
  function reflectCar() {
    // New vehicles have one cabin/interior in all views. Only legacy fixtures
    // retain the old separate cockpit visibility convention.
    carModel.cabin.visible = true; carModel.cockpit.visible = hasPhysicalMirrors;
    carModel.externalMirrors.visible = false;
    // Also hide meshes explicitly: they may be mounted outside the shell group.
    for (const surface of surfaces) if (surface) surface.visible = false;
  }
  function saveRenderer() {
    return { target: renderer.getRenderTarget(), viewport: renderer.getViewport(new THREE.Vector4()),
      scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
      autoClear: renderer.autoClear, shadowUpdate: renderer.shadowMap.autoUpdate,
      clippingPlanes: renderer.clippingPlanes, localClippingEnabled: renderer.localClippingEnabled };
  }
  function restoreRenderer(previous) {
    renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
    renderer.setScissorTest(previous.scissorTest); renderer.autoClear = previous.autoClear;
    renderer.shadowMap.autoUpdate = previous.shadowUpdate;
    renderer.clippingPlanes = previous.clippingPlanes; renderer.localClippingEnabled = previous.localClippingEnabled;
  }
  function updateRectangles() {
    if (!dirty) return;
    const area = sceneElement.getBoundingClientRect();
    rectangles = images.map(element => {
      const rect = element.getBoundingClientRect();
      if (element.hidden || rect.width < 1 || rect.height < 1) return null;
      return { x: rect.left - area.left, y: area.height - (rect.top - area.top) - rect.height, width: rect.width, height: rect.height };
    });
    dirty = false;
  }

  function observeReferences(state, side, settings) {
    const key = JSON.stringify([state.x, state.z, state.heading, carModel.car?.position.y ?? 0, settings]);
    const previous = observationCache.get(side);
    if (previous?.key === key) return previous.value;
    const frame = createMirrorFrame(state, side, settings), visibility = carVisibility();
    let value;
    try {
      reflectCar(); world.updateMatrixWorld(true);
      value = { ...mirrorObservation(state, side, settings, {
        acceptReference: sample => referenceVisible(sample.point, frame).visible,
      }), occlusionChecked: true };
    } finally { restoreCar(visibility); }
    observationCache.set(side, { key, value });
    return value;
  }

  function prepare(state, settings, labels = false) {
    updateRectangles();
    const previous = saveRenderer(), visibility = carVisibility();
    try {
      reflectCar(); renderer.shadowMap.autoUpdate = false; renderer.setScissorTest(false);
      for (let i = 0; i < sides.length; i++) {
        const rect = rectangles[i];
        const frame = setCamera(i, state, settings, true), scale = Math.min(renderer.getPixelRatio(), 1.5);
        // Physical mirrors remain live when all DOM teaching cards are hidden.
        const w = Math.max(512, Math.round((rect?.width ?? 0) * scale)), h = Math.round(w / 1.58);
        if (targets[i].width !== w || targets[i].height !== h) targets[i].setSize(w, h);
        renderer.clippingPlanes = [...(previous.clippingPlanes || []), createMirrorClipPlane(frame)];
        renderer.setRenderTarget(targets[i]); renderer.autoClear = true; renderer.render(world, cameras[i]);
        const sign = sides[i] === 'left' ? 1 : -1;
        const wheel = localToWorld(state, sign * (CAR.trackWidth / 2 + CAR.tireWidth / 2), .10);
        updateLabel(markers[i].wheel, { ...wheel, y: .43 }, frame, labels);
        updateLabel(markers[i].corner, { x: sides[i] === 'left' ? BAY.right : BAY.left, y: PAINT_SURFACE_Y, z: BAY.entrance }, frame, labels);
        if (rect && (recognitionGuides || labels)) {
          const observation = observeReferences(state, sides[i], settings);
          for (const name of ['body', 'ground']) updateLabel(recognitionMarkers[i][name], observation[name].point, frame, recognitionGuides && observation[name].visible);
          for (const name of ['sideLine', 'backLine', 'entranceLine']) updateLabel(stripeMarkers[i][name], observation[name].point, frame, observation[name].visible);
        } else for (const element of [...Object.values(recognitionMarkers[i]), ...Object.values(stripeMarkers[i])]) if (element) element.hidden = true;
        const guide = guideLayers[i]; guide.hidden = !rect || !observationGuides || !labels;
        if (!guide.hidden) { guide.width = w; guide.height = h; drawObservation(guide.getContext('2d'), frame, state, sides[i], w, h, false, settings); }
      }
    } finally { restoreCar(visibility); restoreRenderer(previous); }
  }

  function renderOverlay() {
    updateRectangles();
    const previous = saveRenderer();
    try {
      renderer.autoClear = false; renderer.setScissorTest(true);
      for (let i = 0; i < sides.length; i++) {
        const rect = rectangles[i]; if (!rect) continue;
        renderer.setViewport(rect.x, rect.y, rect.width, rect.height); renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
        renderer.render(overlays[i], overlayCamera);
      }
    } finally { restoreRenderer(previous); }
  }

  return {
    invalidate() { dirty = true; observationCache.clear(); },
    setObservationGuides(enabled) { observationGuides = enabled; },
    setRecognitionGuides(enabled) { recognitionGuides = enabled; },
    prepare,
    renderOverlay,
    observe: observeReferences,
    // A review uses the same surface and warp, with explicit teaching overlays.
    capture(state, settings, { annotations = true } = {}) {
      const w = 480, h = 304;
      const source = new THREE.WebGLRenderTarget(640, 405, { colorSpace: THREE.SRGBColorSpace });
      const output = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
      const previous = saveRenderer();
      const visibility = carVisibility(), result = {};
      try {
        reflectCar(); renderer.shadowMap.autoUpdate = true; renderer.autoClear = true; renderer.setScissorTest(false);
        for (let i = 0; i < sides.length; i++) {
          const frame = setCamera(i, state, settings), material = materials[i], oldMap = material.map;
          try {
            renderer.clippingPlanes = [...(previous.clippingPlanes || []), createMirrorClipPlane(frame)];
            renderer.setRenderTarget(source); renderer.render(world, cameras[i]); material.map = source.texture;
            // The camera-specific world clip must not cut the flat teaching
            // image used for review. Retain the caller's original clip state.
            renderer.clippingPlanes = previous.clippingPlanes; renderer.localClippingEnabled = previous.localClippingEnabled;
            renderer.setRenderTarget(output); renderer.render(overlays[i], overlayCamera);
            const pixels = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(output, 0, 0, w, h, pixels);
            const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            const context = canvas.getContext('2d'), data = context.createImageData(w, h);
            // Only invert WebGL's rows: reflection is already in the ray UVs.
            for (let y = 0; y < h; y++) data.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
            context.putImageData(data, 0, 0);
            if (annotations) drawObservation(context, frame, state, sides[i], w, h, true, settings);
            result[sides[i]] = canvas.toDataURL('image/png');
          } finally { material.map = oldMap; }
        }
      } finally {
        restoreCar(visibility); restoreRenderer(previous);
        source.dispose(); output.dispose();
      }
      return result;
    },
    // Compatibility for old callers. New frames call prepare(), render the main
    // scene with the updated physical textures, then call renderOverlay().
    render(state, settings, labels = false) { prepare(state, settings, labels); renderOverlay(); },
  };
}
