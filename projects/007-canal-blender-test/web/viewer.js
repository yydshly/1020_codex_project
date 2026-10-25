const loadButton = document.getElementById("scene-load");
const status = document.getElementById("scene-status");
const selector = document.getElementById("scene-version");
const appearanceSelector = document.getElementById("scene-appearance");
const canvasHost = document.getElementById("scene-canvas");
const stage = document.getElementById("scene-stage");
const toolbar = document.getElementById("scene-toolbar");
const manifestFiles = { v3: "models/viewer-manifest-v3.json", v4: "models/viewer-manifest-v4.json" };
let viewer;
let currentView = "main";
let currentVersion = "v4";
let currentAppearance = "enhanced";
let busy = false;

loadButton.hidden = false;

function setStatus(message) {
  status.textContent = message;
}

function setBusy(value) {
  busy = value;
  loadButton.disabled = value;
  selector.disabled = value;
  appearanceSelector.disabled = value;
  stage.setAttribute("aria-busy", String(value));
}

function releaseModel(model) {
  if (!model) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const bitmaps = new Set();
  model.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => {
    Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    material.dispose();
  });
  textures.forEach(texture => {
    if (texture.source?.data?.close) bitmaps.add(texture.source.data);
    texture.dispose();
  });
  bitmaps.forEach(bitmap => bitmap.close());
}

async function createViewer() {
  const [THREE, orbitModule, loaderModule] = await Promise.all([
    import("three"),
    import("three/addons/controls/OrbitControls.js"),
    import("three/addons/loaders/GLTFLoader.js")
  ]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "可交互的 Blender 场景三维网格");
  renderer.domElement.setAttribute("aria-describedby", "scene-instructions");
  canvasHost.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d4dee0");
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1800);
  const controls = new orbitModule.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 1;
  controls.maxDistance = 280;
  controls.listenToKeyEvents(renderer.domElement);
  const baselineLights = new THREE.Group();
  baselineLights.add(new THREE.HemisphereLight(0xd6e5f5, 0x807059, 2.6));
  const sunlight = new THREE.DirectionalLight(0xffe2bb, 3.1);
  sunlight.position.set(-15, 35, 12);
  baselineLights.add(sunlight);
  const fill = new THREE.DirectionalLight(0xc7d7ef, 1.4);
  fill.position.set(20, 16, -25);
  baselineLights.add(fill);
  scene.add(baselineLights);
  let frame;
  function render() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      renderer.render(scene, camera);
    });
  }
  function resize() {
    const width = canvasHost.clientWidth;
    const height = canvasHost.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (viewer?.manifest && stage.dataset.view !== "free") setView(currentView);
    render();
  }
  controls.addEventListener("change", render);
  controls.addEventListener("start", () => {
    document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", "false"));
    stage.dataset.view = "free";
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvasHost);
  renderer.domElement.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    setStatus("显卡上下文已中断。请刷新页面重新载入；GLB 下载和静态对照仍可使用。");
  });
  resize();
  return { THREE, renderer, scene, camera, controls, render, baselineLights, loader: new loaderModule.GLTFLoader(), model: null, manifest: null, lookdev: null };
}

function setView(name) {
  if (!viewer?.manifest) return;
  currentView = name;
  const { camera, controls, THREE, manifest } = viewer;
  const bounds = manifest.focus_bounds_glTF || manifest.bounds_glTF;
  const center = new THREE.Vector3(...bounds.center);
  const span = Math.max(bounds.size[0], bounds.size[1] * 1.6, bounds.size[2], 10);
  if (name === "main") {
    camera.position.fromArray(manifest.camera_glTF.position);
    controls.target.fromArray(manifest.camera_glTF.target);
    camera.fov = manifest.camera_glTF.fov_y_degrees;
  } else {
    const offset = name === "back" ? [0.25, 0.5, -0.8] : [-0.65, 0.6, 0.8];
    const aspectFit = Math.max(1, 1.25 / camera.aspect);
    camera.position.copy(center).add(new THREE.Vector3(...offset).multiplyScalar(span * aspectFit));
    controls.target.copy(center);
    camera.fov = 45;
  }
  camera.updateProjectionMatrix();
  controls.update();
  document.querySelectorAll("[data-view]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.view === name));
  });
  stage.dataset.view = name;
  viewer.render();
}

async function loadVersion(version) {
  if (busy) return;
  const appearance = version === "v4" ? appearanceSelector.value : "structural";
  const manifestFile = appearance === "enhanced" ? "models/lookdev-v4-manifest.json" : manifestFiles[version];
  const preserveCamera = viewer?.model && currentVersion === version;
  let pendingModel;
  let pendingLookdev;
  setBusy(true);
  setStatus("读取本地场景与导出记录…");
  try {
    if (!viewer) viewer = await createViewer();
    const response = await fetch(manifestFile);
    if (!response.ok) throw new Error(`导出记录 HTTP ${response.status}`);
    const manifest = await response.json();
    const assetUrl = new URL(manifest.asset, new URL(manifestFile, document.baseURI));
    const gltf = await viewer.loader.loadAsync(assetUrl.href, event => {
      const total = event.total || manifest.bytes;
      setStatus(total ? `载入真实几何 ${Math.min(100, Math.round(event.loaded / total * 100))}%` : "载入真实几何…");
    });
    pendingModel = gltf.scene;
    if (appearance === "enhanced") {
      setStatus("载入烘焙材质与原场景天空，准备实时倒影…");
      const { prepareLookdev } = await import("./viewer-lookdev.js");
      pendingLookdev = await prepareLookdev(viewer.renderer, pendingModel, manifest);
    }
    viewer.lookdev?.dispose();
    viewer.lookdev = null;
    if (viewer.model) {
      viewer.scene.remove(viewer.model);
      releaseModel(viewer.model);
    }
    viewer.model = gltf.scene;
    pendingModel = null;
    viewer.manifest = manifest;
    viewer.scene.add(gltf.scene);
    viewer.baselineLights.visible = appearance === "structural";
    if (pendingLookdev) {
      viewer.lookdev = pendingLookdev;
      pendingLookdev = null;
      viewer.lookdev.activate(viewer.scene);
    } else {
      viewer.scene.background = new viewer.THREE.Color("#d4dee0");
      viewer.scene.environment = null;
      viewer.scene.fog = null;
      viewer.renderer.toneMapping = viewer.THREE.ACESFilmicToneMapping;
      viewer.renderer.toneMappingExposure = 1.1;
      viewer.renderer.shadowMap.enabled = false;
    }
    currentVersion = version;
    currentAppearance = appearance;
    selector.value = version;
    appearanceSelector.value = appearance;
    appearanceSelector.querySelector('[value="enhanced"]').disabled = version !== "v4";
    document.getElementById("scene-wireframe").setAttribute("aria-pressed", "false");
    document.getElementById("scene-download").href = assetUrl.href;
    document.getElementById("scene-manifest").href = manifestFile;
    document.getElementById("scene-placeholder").hidden = true;
    document.getElementById("scene-live-badge").hidden = false;
    toolbar.hidden = false;
    stage.dataset.loaded = version;
    stage.dataset.appearance = appearance;
    if (preserveCamera) {
      viewer.render();
    } else setView(currentView);
    document.getElementById("scene-live-badge").textContent = appearance === "enhanced" ? "真实 3D · 烘焙光照 + 实时倒影" : "真实 3D · 原结构预览";
    const triangles = manifest.geometry.triangles?.toLocaleString("zh-CN") || "已载入";
    setStatus(`${version.toUpperCase()} · ${triangles} 三角面 · ${(manifest.bytes / 1024 / 1024).toFixed(1)} MB GLB · ${appearance === "enhanced" ? "增强光影，不增加模型面数" : "原结构预览"}`);
    let meshCount = 0;
    let triangleCount = 0;
    viewer.model.traverse(object => {
      if (!object.isMesh) return;
      meshCount += 1;
      triangleCount += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
    });
    stage.dataset.meshes = String(meshCount);
    stage.dataset.triangles = String(triangleCount);
  } catch (error) {
    pendingLookdev?.dispose();
    releaseModel(pendingModel);
    selector.value = currentVersion;
    appearanceSelector.value = currentAppearance;
    setStatus(`3D 载入失败：${error.message}。可重试，或下载 GLB；建议使用支持 WebGL 2 的浏览器。`);
    loadButton.textContent = "重试载入 3D";
    if (!viewer?.model) {
      document.getElementById("scene-placeholder").hidden = false;
      appearanceSelector.value = "structural";
      loadButton.textContent = "以基础模式重试 3D";
    }
  } finally {
    setBusy(false);
  }
}

loadButton.addEventListener("click", () => loadVersion(selector.value));
selector.addEventListener("change", () => loadVersion(selector.value));
appearanceSelector.addEventListener("change", () => loadVersion(selector.value));
document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.getElementById("scene-reset").addEventListener("click", () => setView("overview"));
document.getElementById("scene-wireframe").addEventListener("click", event => {
  if (!viewer?.model) return;
  const enabled = event.currentTarget.getAttribute("aria-pressed") !== "true";
  viewer.model.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => { material.wireframe = enabled; });
  });
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  viewer.render();
});
