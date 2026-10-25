import { createCat as createBase } from './cat-v10-body.js';
import { createLidMaterial } from './cat-v6-lid-material.js';

const columns = 32, rows = 10;
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v-a)/(b-a))); return t*t*(3-2*t); };
function interpolate(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x-xs[i-1])/(xs[i]-xs[i-1]); return ys[i-1]*(1-t)+ys[i]*t; }
  return ys[ys.length-1];
}

// These eyelids are separate curved, skinned surfaces. The original cat and
// its eyes never deform, so the forehead UVs do not stretch during a blink.
export async function createCat(THREE) {
  const base = await createBase(THREE);
  const response = await fetch(new URL('./models/cat-v6-lid-surface.json', import.meta.url));
  if (!response.ok) { base.dispose(); throw new Error('Eyelid surface data unavailable'); }
  const field = await response.json();
  let source;
  base.object.traverse(node => { if (node.isSkinnedMesh && !source) source = node; });
  if (!source) { base.dispose(); throw new Error('Cat skin unavailable'); }
  const look = createLidMaterial(THREE, source.material);
  const descriptors = [], indices = [], uv = [], lidUv = [], lidUpper = [];
  const patches = [];
  for (let eyeIndex = 0; eyeIndex < field.eyes.length; eyeIndex++) {
    const eye = field.eyes[eyeIndex];
    for (const upper of [true, false]) {
      const start = descriptors.length;
      const descriptor = (u, v, wall = false) => {
        const index = descriptors.length;
        descriptors.push({ eyeIndex, upper, u, v, wall });
        uv.push(...look.uvFor(eye.name, upper, u, v)); lidUv.push(u, v); lidUpper.push(upper ? 1 : 0);
        return index;
      };
      for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) descriptor(col/columns, row/rows);
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const a = start+row*(columns+1)+col, b = a+1, c = a+columns+1, d = c+1;
        // Upper v descends, lower v ascends; face normals both point outward.
        indices.push(...(upper ? [a,c,b,b,c,d] : [a,b,c,b,d,c]));
      }
      // A physical free rim and two sealed corners stop side views seeing
      // underneath a floating sheet. The rim sinks just inside the source skin.
      const borders = [Array.from({length: columns+1}, (_, i) => start+rows*(columns+1)+i),
        Array.from({length: rows+1}, (_, i) => start+i*(columns+1)),
        Array.from({length: rows+1}, (_, i) => start+i*(columns+1)+columns)];
      for (const border of borders) {
        const back = border.map(i => { const v = descriptors[i]; return descriptor(v.u, v.v, true); });
        for (let i = 0; i < border.length-1; i++) indices.push(border[i],back[i],border[i+1],border[i+1],back[i],back[i+1]);
      }
      patches.push({ start, end: descriptors.length, eyeIndex, upper });
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(descriptors.length*3), weights = new Float32Array(descriptors.length*4);
  const joints = new Uint16Array(descriptors.length*4), edges = new Float32Array(descriptors.length);
  for (let i = 0; i < descriptors.length; i++) joints.set(field.skinJoints, i*4);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('lidUv', new THREE.Float32BufferAttribute(lidUv, 2));
  geometry.setAttribute('lidUpper', new THREE.Float32BufferAttribute(lidUpper, 1));
  geometry.setAttribute('lidEdge', new THREE.BufferAttribute(edges, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  const lids = new THREE.SkinnedMesh(geometry, look.material);
  lids.name = 'Cat V6 curved upper and lower eyelids';
  lids.position.copy(source.position); lids.quaternion.copy(source.quaternion); lids.scale.copy(source.scale);
  lids.castShadow = false; lids.receiveShadow = true; lids.frustumCulled = false;
  source.parent.add(lids); lids.bind(source.skeleton, source.bindMatrix.clone());
  const blink = { mode: 'auto', amount: 0, left: 0, right: 0, count: 0, active: false };
  let clock = 0, nextBlink = 2.6, holdAmount = 0, disposed = false, previousLeft = -1, previousRight = -1;
  const sampleWeights = [0,0,0,0];
  function sample(eye, x, y) {
    const n = field.resolution, r = field.range;
    const gx = THREE.MathUtils.clamp((x-r.minX)/(r.maxX-r.minX)*(n-1), 0, n-1.000001);
    const gy = THREE.MathUtils.clamp((y-r.minY)/(r.maxY-r.minY)*(n-1), 0, n-1.000001);
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx-ix, fy = gy-iy;
    const ids = [iy*n+ix, iy*n+ix+1, (iy+1)*n+ix, (iy+1)*n+ix+1];
    const mix = [(1-fx)*(1-fy), fx*(1-fy), (1-fx)*fy, fx*fy];
    let height = 0;
    sampleWeights.fill(0);
    for (let i = 0; i < 4; i++) {
      height += eye.height[ids[i]]*mix[i];
      for (let j = 0; j < 4; j++) sampleWeights[j] += eye.weights[ids[i]*4+j]*mix[i];
    }
    return height;
  }
  function updateSurface(left, right) {
    if (left === previousLeft && right === previousRight) return;
    previousLeft = left; previousRight = right;
    lids.visible = Math.max(left, right) > .002;
    for (let i = 0; i < descriptors.length; i++) {
      const d = descriptors[i], eye = field.eyes[d.eyeIndex], curve = eye.curve;
      const amount = d.eyeIndex === 0 ? left : right;
      const x = THREE.MathUtils.lerp(curve.x[0]-.0006, curve.x[curve.x.length-1]+.0006, d.u);
      const upperY = interpolate(curve.x, curve.upper_y, x), lowerY = interpolate(curve.x, curve.lower_y, x);
      const boundary = d.upper ? upperY : lowerY;
      const outerY = boundary+(d.upper ? .0022 : -.0018);
      const openY = outerY+(d.upper ? -.00012 : .00012);
      const slit = eye.slit.intercept+eye.slit.slope*x-.0022*Math.sin(d.u*Math.PI);
      const innerY = THREE.MathUtils.lerp(openY, slit+(d.upper ? -.00020 : .00020), amount);
      const y = THREE.MathUtils.lerp(outerY, innerY, d.v);
      const height = sample(eye, x, y);
      const feather = smooth(0, .23, d.v)*smooth(0, .08, d.u)*(1-smooth(.92, 1, d.u));
      const offset = d.wall ? -.00012 : -.000035+(d.upper ? .00031 : .00022)*feather;
      const basis = eye.basis, z = height+offset;
      for (let axis = 0; axis < 3; axis++) positions[i*3+axis] = eye.center[axis]+basis.horizontal[axis]*x+basis.vertical[axis]*y+basis.outward[axis]*z;
      weights.set(sampleWeights, i*4);
      edges[i] = d.wall ? .8 : 1-smooth(0, .00020, Math.abs(y-innerY));
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.skinWeight.needsUpdate = true;
    geometry.attributes.lidEdge.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  function apply(left, right) {
    blink.left = left; blink.right = right; blink.amount = (left+right)/2; updateSurface(left, right);
  }
  function setBlink(options = {}) {
    if (['auto', 'open', 'closed'].includes(options.mode)) {
      blink.mode = options.mode; blink.active = false; clock = 0; nextBlink = 2.6;
      holdAmount = options.mode === 'closed' ? 1 : 0; apply(holdAmount, holdAmount);
    }
    if (Number.isFinite(options.amount)) { blink.mode = 'hold'; blink.active = false; holdAmount = THREE.MathUtils.clamp(options.amount, 0, 1); apply(holdAmount, holdAmount); }
    if (options.trigger) { if (blink.mode !== 'auto') blink.mode = 'open'; blink.active = true; clock = 0; holdAmount = 0; apply(0, 0); }
  }
  function curve(time) {
    if (time < 0) return 0;
    if (time < .085) return smooth(0, .085, time);
    if (time < .13) return 1;
    if (time < .28) return 1-smooth(.13, .28, time);
    return 0;
  }
  function update(delta, state = {}) {
    if (disposed) return;
    base.update(delta, state);
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    if (state.reset) { blink.active = false; clock = 0; nextBlink = 2.6; }
    clock += dt;
    if (blink.mode === 'closed' || blink.mode === 'hold') apply(holdAmount, holdAmount);
    else {
      if (!blink.active && blink.mode === 'auto' && clock >= nextBlink) { blink.active = true; clock = 0; }
      if (blink.active) {
        apply(curve(clock), curve(clock-.006));
        if (clock >= .286) { blink.active = false; blink.count++; clock = 0; nextBlink = 3.7+((blink.count*17)%29)/10; apply(0, 0); }
      } else apply(0, 0);
    }
  }
  apply(0, 0);
  return {
    object: base.object, update, setAttention: base.setAttention, setBlink,
    getDebugState() { return { ...base.getDebugState(), blink: { ...blink, duration: .28, kind: 'separate-skinned-eyelids', baseGeometryUnchanged: true, baseMorphCount: source.geometry.morphAttributes.position?.length ?? 0, addedTriangles: indices.length/3, addedVertices: descriptors.length, independentGaze: false, mouthControl: false } }; },
    dispose() { if (!disposed) { disposed = true; lids.removeFromParent(); geometry.dispose(); look.dispose(); base.dispose(); } }
  };
}
