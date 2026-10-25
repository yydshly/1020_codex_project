export function createCat(THREE) {
  const object = new THREE.Group();
  object.name = "RoamCat";
  object.userData.forwardAxis = "+Z";
  object.userData.upAxis = "+Y";
  object.userData.groundAnchor = "paw soles";
  const geometries = new Set();
  const materials = new Set();
  let disposed = false;
  let animationTime = 0;
  let gaitPhase = 0;
  let movement = 0;

  function material(color, roughness = 0.76) {
    const entry = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.add(entry);
    return entry;
  }

  function geometry(entry) {
    geometries.add(entry);
    return entry;
  }

  const fur = material("#da9958");
  const stripe = material("#b97742");
  const cream = material("#f4eddf");
  const earPink = material("#dba89b");
  const nosePink = material("#bd827c", 0.58);
  const dark = material("#322a25", 0.3);
  const whiskerMaterial = material("#d9cfba");
  const sphere = geometry(new THREE.SphereGeometry(1, 20, 14));

  function addMesh(parent, shape, surface, name, position, scale) {
    const part = new THREE.Mesh(shape, surface);
    part.name = name;
    part.position.set(...position);
    if (scale) part.scale.set(...scale);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }

  function roundPart(parent, surface, name, position, scale) {
    return addMesh(parent, sphere, surface, name, position, scale);
  }

  function tube(parent, surface, name, points, radius, segments = 16) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    return addMesh(parent, geometry(new THREE.TubeGeometry(curve, segments, radius, 7, false)), surface, name, [0, 0, 0]);
  }

  const torso = new THREE.Group();
  torso.name = "CatBodySway";
  object.add(torso);
  roundPart(torso, fur, "OrangeBody", [0, 0.265, -0.025], [0.128, 0.14, 0.235]);
  roundPart(torso, cream, "WhiteBelly", [0, 0.201, -0.01], [0.106, 0.085, 0.195]);
  roundPart(torso, cream, "WhiteChest", [0, 0.276, 0.17], [0.087, 0.101, 0.052]);

  for (const side of [-1, 1]) {
    roundPart(torso, fur, "RoundedHaunch", [side * 0.089, 0.218, -0.16], [0.07, 0.1, 0.096]);
  }

  const head = new THREE.Group();
  head.name = "CatHead";
  head.position.set(0, 0.39, 0.205);
  torso.add(head);
  roundPart(head, fur, "RoundFace", [0, 0, 0], [0.15, 0.122, 0.125]);
  roundPart(head, cream, "LeftMuzzle", [-0.029, -0.038, 0.112], [0.043, 0.033, 0.035]);
  roundPart(head, cream, "RightMuzzle", [0.029, -0.038, 0.112], [0.043, 0.033, 0.035]);
  roundPart(head, cream, "Chin", [0, -0.064, 0.111], [0.039, 0.021, 0.029]);
  roundPart(head, nosePink, "PinkNose", [0, -0.027, 0.148], [0.014, 0.01, 0.01]);
  tube(head, dark, "MuzzleLine", [[0, -0.035, 0.154], [0, -0.046, 0.154], [-0.013, -0.05, 0.15]], 0.0017, 8);
  tube(head, dark, "MuzzleSmile", [[0, -0.046, 0.154], [0.008, -0.05, 0.153], [0.016, -0.049, 0.148]], 0.0017, 8);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.name = side < 0 ? "LeftEyeBlink" : "RightEyeBlink";
    eye.position.set(side * 0.065, 0.015, 0.11);
    head.add(eye);
    roundPart(eye, dark, "SoftDarkEye", [0, 0, 0], [0.022, 0.025, 0.013]);
    roundPart(eye, cream, "EyeCatchlight", [-0.006, 0.008, 0.011], [0.005, 0.006, 0.003]);
    eyes.push(eye);
    for (const whiskerOffset of [-0.011, 0.009]) {
      tube(head, whiskerMaterial, "FineWhisker", [[side * 0.041, -0.038, 0.144], [side * 0.092, -0.036 + whiskerOffset, 0.139], [side * 0.136, -0.032 + whiskerOffset * 1.8, 0.122]], 0.0011, 9);
    }
  }

  const earShape = geometry(new THREE.BufferGeometry());
  earShape.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.04, 0, 0.025, 0.04, 0, 0.025, 0, 0.09, 0.003,
    -0.04, 0, -0.025, 0.04, 0, -0.025, 0, 0.09, -0.012
  ], 3));
  earShape.setIndex([0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0]);
  earShape.computeVertexNormals();
  const innerEarShape = geometry(new THREE.BufferGeometry());
  innerEarShape.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.024, 0.013, 0.0225, 0.024, 0.013, 0.0225, 0, 0.069, 0.0105
  ], 3));
  innerEarShape.computeVertexNormals();
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.name = side < 0 ? "LeftEar" : "RightEar";
    ear.position.set(side * 0.09, 0.082, 0);
    ear.rotation.z = -side * 0.2;
    head.add(ear);
    addMesh(ear, earShape, fur, "SolidTriangularEar", [0, 0, 0]);
    addMesh(ear, innerEarShape, earPink, "SoftInnerEar", [0, 0, 0]);
    ears.push({ object: ear, neutral: ear.rotation.z });
  }

  for (const [offset, angle] of [[-0.035, -0.25], [0, 0], [0.035, 0.25]]) {
    const mark = roundPart(head, stripe, "ForeheadMark", [offset, 0.071, 0.097], [0.01, 0.025, 0.007]);
    mark.rotation.z = angle;
  }

  const legs = [];
  for (const front of [false, true]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = `${front ? "Front" : "Hind"}${side < 0 ? "Left" : "Right"}Leg`;
      leg.position.set(side * 0.088, 0.235, front ? 0.15 : -0.17);
      object.add(leg);
      roundPart(leg, fur, "RoundedUpperLeg", [0, -0.078, 0], [0.036, 0.084, 0.039]);
      roundPart(leg, cream, "WhiteSock", [0, -0.157, 0.01], [0.031, 0.047, 0.037]);
      const paw = roundPart(leg, cream, "SoftWhitePaw", [0, -0.2, 0.022], [0.044, 0.035, 0.059]);
      legs.push({ object: leg, paw, phase: (front === (side < 0)) ? 0 : Math.PI });
    }
  }

  const tail = new THREE.Group();
  tail.name = "SlowCurvedTail";
  tail.position.set(0, 0.29, -0.235);
  torso.add(tail);
  const tailPoints = [[0, 0, 0], [-0.02, 0.045, -0.105], [-0.04, 0.12, -0.17], [-0.018, 0.2, -0.163], [0.025, 0.235, -0.105]];
  tube(tail, fur, "CurvedOrangeTail", tailPoints, 0.027, 28);
  roundPart(tail, cream, "TailTip", tailPoints[tailPoints.length - 1], [0.028, 0.03, 0.028]);
  const tailCurve = new THREE.CatmullRomCurve3(tailPoints.map(point => new THREE.Vector3(...point)));
  for (const start of [0.42, 0.7]) {
    const points = [start, start + 0.035, start + 0.07].map(fraction => tailCurve.getPoint(fraction).toArray());
    tube(tail, stripe, "TailStripe", points, 0.028, 7);
  }

  function update(delta, state = {}) {
    if (disposed) return;
    const elapsed = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const speed = Number.isFinite(state.speed) ? Math.min(5, Math.abs(state.speed)) : (state.moving ? 0.7 : 0);
    const moving = state.moving ?? speed > 0.01;
    const activeSpeed = moving ? speed : 0;
    const targetMovement = Math.min(1, activeSpeed / 0.65);
    movement += (targetMovement - movement) * (1 - Math.exp(-10 * elapsed));
    animationTime = Number.isFinite(state.time) ? state.time : animationTime + elapsed;
    gaitPhase = (gaitPhase + elapsed * activeSpeed / 0.46 * Math.PI * 2) % (Math.PI * 2);
    const idle = 1 - movement;
    torso.position.y = Math.sin(animationTime * 2.1) * 0.002 * idle + (1 - Math.cos(gaitPhase * 2)) * 0.003 * movement;
    torso.scale.y = 1 + Math.sin(animationTime * 2.1) * 0.008 * idle;
    torso.rotation.z = Math.sin(gaitPhase) * 0.022 * movement;
    torso.rotation.x = Math.sin(gaitPhase * 2) * 0.012 * movement;
    head.rotation.y = Math.sin(animationTime * 0.67) * 0.065 * idle;
    head.rotation.x = -0.025 + Math.sin(gaitPhase * 2) * 0.012 * movement;
    head.rotation.z = -torso.rotation.z * 0.6;
    for (const leg of legs) {
      const phase = gaitPhase + leg.phase;
      const angle = Math.sin(phase) * 0.55 * movement;
      const lift = Math.max(0, Math.sin(phase)) * 0.03 * movement;
      leg.object.rotation.x = angle;
      leg.object.position.y = 0.235 + 0.2 * (Math.cos(angle) - 1) + 0.022 * Math.sin(angle) + lift;
      leg.paw.rotation.x = -angle;
    }
    tail.rotation.y = Math.sin(animationTime * 1.25) * (0.22 + movement * 0.11);
    tail.rotation.z = Math.sin(animationTime * 0.83 + 0.4) * 0.1;
    const blinkTime = ((animationTime + 1.7) % 4.9 + 4.9) % 4.9;
    const blink = blinkTime < 0.18 ? Math.sin(blinkTime / 0.18 * Math.PI) : 0;
    eyes.forEach(eye => { eye.scale.y = 1 - blink * 0.94; });
    ears.forEach((ear, index) => {
      ear.object.rotation.z = ear.neutral + Math.sin(animationTime * 0.73 + index * 2.1) * 0.018 * idle;
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    object.removeFromParent();
    geometries.forEach(entry => entry.dispose());
    materials.forEach(entry => entry.dispose());
    geometries.clear();
    materials.clear();
  }

  update(0);
  return { object, update, dispose };
}
