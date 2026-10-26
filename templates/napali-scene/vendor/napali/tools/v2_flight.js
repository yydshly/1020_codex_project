// [time s, x, y, z, lookX, lookY, lookZ, vfov deg]
const CINE = [
  [0, -470, 4, 240, 40, 70, 640, 56],
  [7, -370, 3.6, 305, 60, 60, 650, 56],
  [14, -255, 3.4, 380, 90, 50, 660, 56],
  [21, -135, 4, 445, 140, 30, 690, 58],
  [28, -20, 5, 495, 220, 20, 740, 58],
  [35, 85, 6, 535, 300, 15, 790, 58],
  [42, 175, 5, 612, 360, 12, 860, 58],
  [49, 245, 4.5, 685, 390, 14, 900, 58],
  [55, 290, 6, 745, 420, 18, 950, 58],
  [61, 330, 40.4, 815, 470, 28, 1060, 60],
  [68, 375, 52.5, 910, 520, 45, 1170, 60],
  [75, 420, 66.4, 1000, 560, 70, 1250, 60],
  [84, 400, 94.7, 905, 480, 50, 1210, 60],
  [94, 335, 300, 720, 370, 0, 1150, 56],
  [106, 205, 520, 430, 180, 0, 1000, 48],
  [117, 80, 790, 170, 40, 0, 900, 42],
  [128, 0, 1000, 0, 0, 0, 839.1, 38],
];
// Flight path: [x, y, z, speed m/s, look-at {x,y,z,w} | null]. Times come from distance / speed.
const FLIGHT_KEYS = [
  [-480, 3.5, 330, 56, null],
  [-240, 3, 440, 60, null],
  [10, 4.5, 524, 52, null],
  [105, 5, 574, 44, null],
  [190, 4.2, 640, 40, null],
  [262, 3.8, 704, 38, null],
  [318, 15.3, 768, 34, null],
  [348, 27.3, 812, 30, null],
  [372, 27.6, 868, 32, null],
  [402, 31, 950, 38, null],
  [440, 36.5, 1030, 42, null],
  [470, 45.4, 1100, 42, null],
  [420, 67.1, 1165, 40, null],
  [330, 150, 1195, 42, null],   // (r9 terrain) 84.7 -> 150 / 111.6 -> 195 / 165.7 -> 212 / 202.8 -> 222: clear of the new valley fins (>= 28 m)
  [230, 195, 1185, 46, null],
  [120, 222, 1120, 50, null],   // (r10 terrain, resumed) 212 -> 222: clear of the west wall raise (>= 28 m)
  [10, 236, 1040, 54, null],   // (r10 terrain) 222 -> 236 / 177.4 -> 200: clear of the raised west wall (>= 25 m)
  [-90, 200, 960, 58, null],
  [-160, 116.8, 900, 56, null],
  [-198, 30, 858, 54, null],
  [-240, 7, 822, 52, null],
  [-305, 3.8, 818, 52, null],
  [-400, 3.6, 858, 52, null],
  [-480, 3.6, 890, 48, null],
  [-540, 4, 908, 44, null],
  [-605, 5, 948, 40, null],
  [-628, 5.5, 1000, 38, null],
  [-631, 6, 1050, 38, null],
  [-646, 9, 1102, 40, null],
  [-722, 38, 1075, 55, null],
  [-792, 115, 935, 70, {x:-420,y:0,z:1060,w:0.4}],
  [-785, 270, 705, 85, {x:-150,y:0,z:980,w:0.6}],
  [-640, 470, 420, 95, {x:0,y:0,z:860,w:0.6}],
  [-380, 700, 160, 95, {x:0,y:0,z:839.1,w:0.8}],
  [-140, 905, 25, 70, {x:0,y:0,z:839.1,w:0.95}],
  [0, 1000, 0, 40, {x:0,y:0,z:839.1,w:1}],
];
const FLIGHT_HOLD = 4; // seconds holding the reference composition at the end

// natural cubic spline through (t_i, y_i)
function spline1(ts, ys) {
  const n = ts.length, h = [], al = [0], l = [1], mu = [0], z = [0], c = new Array(n).fill(0), b = [], d = [];
  for (let i = 0; i < n - 1; i++) h.push(ts[i + 1] - ts[i]);
  for (let i = 1; i < n - 1; i++) al.push(3 / h[i] * (ys[i + 1] - ys[i]) - 3 / h[i - 1] * (ys[i] - ys[i - 1]));
  for (let i = 1; i < n - 1; i++) { l.push(2 * (ts[i + 1] - ts[i - 1]) - h[i - 1] * mu[i - 1]); mu.push(h[i] / l[i]); z.push((al[i] - h[i - 1] * z[i - 1]) / l[i]); }
  for (let j = n - 2; j >= 0; j--) { c[j] = (j + 1 < n - 1 ? z[j] - mu[j] * c[j + 1] : z[j]); }
  c[n - 1] = 0;
  for (let j = 0; j < n - 1; j++) { b.push((ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3); d.push((c[j + 1] - c[j]) / (3 * h[j])); }
  return (t) => {
    t = Math.min(Math.max(t, ts[0]), ts[n - 1]);
    let i = 0; while (i < n - 2 && t >= ts[i + 1]) i++;
    const x = t - ts[i];
    return ys[i] + b[i] * x + c[i] * x * x + d[i] * x * x * x;
  };
}
function buildFlight(keys) {
  const T = [0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    T.push(T[i - 1] + dist / ((a[3] + b[3]) * 0.5));
  }
  const sx = spline1(T, keys.map((k) => k[0])), sy = spline1(T, keys.map((k) => k[1])), sz = spline1(T, keys.map((k) => k[2]));
  // look-at weights: piecewise smooth interpolation
  // targets carry backward from the next key that has one (weight 0 until then)
  const look = keys.map((k) => k[4] ? { ...k[4] } : null);
  let nxt = { x: 0, y: 0, z: 0, w: 0 };
  for (let i = look.length - 1; i >= 0; i--) { if (look[i]) nxt = look[i]; else look[i] = { x: nxt.x, y: nxt.y, z: nxt.z, w: 0 }; }
  const lw = spline1(T, look.map((l) => l.w)), lx = spline1(T, look.map((l) => l.x)), ly = spline1(T, look.map((l) => l.y)), lz = spline1(T, look.map((l) => l.z));
  return { T, end: T[T.length - 1], pos: (t) => [sx(t), sy(t), sz(t)], look: (t) => ({ x: lx(t), y: ly(t), z: lz(t), w: Math.min(1, Math.max(0, lw(t))) }) };
}
const FL = buildFlight(FLIGHT_KEYS);
let FLIGHT_END = FL.end + FLIGHT_HOLD;

const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]), norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Physically driven FPV camera: the craft tilts its thrust vector to accelerate and
// fight drag, the camera (uptilted on the frame) follows, turns bank naturally.
var flightCam = function (t, ground = () => 0) {
  const tf = Math.min(t, FL.end);
  const e = 0.12;
  const P = (tt) => FL.pos(Math.min(Math.max(tt, 0), FL.end));
  const p = P(tf);
  // velocity / acceleration from the spline, smoothed over a short window (kept inside the path at the ends)
  const tc = Math.min(Math.max(tf, e + 0.15), FL.end - e - 0.15);
  let v = [0, 0, 0], a = [0, 0, 0];
  for (const o of [-0.15, -0.05, 0.05, 0.15]) {
    const pa = P(tc + o - e), pb = P(tc + o), pc = P(tc + o + e);
    v = v3.add(v, v3.mul(v3.sub(pc, pa), 1 / (2 * e) / 4));
    a = v3.add(a, v3.mul(v3.add(v3.sub(pc, v3.mul(pb, 2)), pa), 1 / (e * e) / 4));
  }
  const speed = v3.len(v);
  const d = speed > 0.5 ? v3.norm(v) : [0, 0, 1];
  const T = v3.len(v3.add(v3.add(a, [0, 9.81, 0]), v3.mul(v, 0.006 * speed)));
  // FPV pilots fly where the camera looks: forward follows the flight path, a little nose-down
  let f = v3.norm(v3.add(d, [0, -0.1 - 0.06 * smoothstep(25, 55, speed), 0]));
  // limit how steeply the camera points down / up (a pilot keeps the horizon near the frame)
  const maxDown = Math.sin(62 * DEG), maxUp = Math.sin(12 * DEG);
  if (f[1] < -maxDown || f[1] > maxUp) {
    const fy = Math.max(-maxDown, Math.min(maxUp, f[1]));
    let hx = f[0], hzz = f[2], hz = Math.hypot(hx, hzz);
    if (hz < 0.35) { // near-vertical flight: take the heading from the wider path direction
      const wd = v3.sub(P(tc + 0.8), P(tc - 0.8)); const wl2 = Math.hypot(wd[0], wd[2]) || 1;
      const k2 = smoothstep(0.35, 0.1, hz);
      hx = hx * (1 - k2) + wd[0] / wl2 * k2; hzz = hzz * (1 - k2) + wd[2] / wl2 * k2; hz = Math.hypot(hx, hzz) || 1;
    }
    const k = Math.sqrt(1 - fy * fy) / hz;
    f = [hx * k, fy, hzz * k];
  }
  // bank: camera up follows the coordinated-turn thrust direction (lateral accel + gravity)
  const aPerp = v3.sub(a, v3.mul(d, v3.dot(a, d)));
  let ur = v3.add(aPerp, [0, 9.81, 0]);
  ur = v3.sub(ur, v3.mul(f, v3.dot(ur, f)));
  let wu = v3.sub([0, 1, 0], v3.mul(f, f[1]));
  const lr = v3.len(ur);
  wu = v3.norm(wu); ur = v3.norm(ur);
  // bank angle from the coordinated-turn up vector, softened and clamped
  const rgt = v3.norm(v3.cross(wu, f));
  let bank = Math.atan2(v3.dot(ur, rgt), v3.dot(ur, wu)) * 0.62 * smoothstep(1.5, 5, lr);
  bank = 0.8 * Math.tanh(bank / 0.8);
  let u = v3.norm(v3.add(v3.mul(wu, Math.cos(bank)), v3.mul(rgt, Math.sin(bank))));
  // scripted look-at (reveal / reference frame)
  const L = FL.look(tf);
  if (L.w > 0) {
    const toT = v3.norm(v3.sub([L.x, L.y, L.z], p));
    // blend in yaw / pitch space (the pilot yaws the quad toward the subject; never flips through vertical)
    const wl = L.w;
    const yaw0 = Math.atan2(f[0], f[2]), pit0 = Math.asin(Math.max(-1, Math.min(1, f[1])));
    const yaw1 = Math.atan2(toT[0], toT[2]), pit1 = Math.asin(Math.max(-1, Math.min(1, toT[1])));
    let dy = yaw1 - yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yy = yaw0 + dy * wl, pp = pit0 + (pit1 - pit0) * wl;
    f = [Math.sin(yy) * Math.cos(pp), Math.sin(pp), Math.cos(yy) * Math.cos(pp)];
    u = v3.norm(v3.mix(u, [0, 1, 0], wl));
  }
  // settle exactly onto the reference camera at the end
  const settle = smoothstep(FL.end - 2.5, FL.end, t);
  let fov = 74 - 36 * smoothstep(FL.end - 9, FL.end, t);
  if (settle > 0) {
    const { r: rr, u: uu, f: ff } = camBasis(0, STILL.pitch);
    f = v3.norm(v3.mix(f, ff, settle)); u = v3.norm(v3.mix(u, uu, settle));
    fov = fov + (STILL.vfov / DEG - fov) * settle;
  }
  // vibration: prop wash + frame resonance, scaled with throttle; none when settled
  const vib = (1 - settle) * (0.0016 + 0.0003 * Math.min(T, 25));
  const n1 = Math.sin(t * 61.7) * 0.5 + Math.sin(t * 97.3 + 1.3) * 0.3 + Math.sin(t * 41.1 + 2.1) * 0.4;
  const n2 = Math.sin(t * 53.9 + 0.7) * 0.5 + Math.sin(t * 83.1 + 2.9) * 0.3 + Math.sin(t * 37.7) * 0.4;
  const wob = (1 - settle) * 0.006;
  let r = v3.norm(v3.cross(u, f));
  u = v3.norm(v3.cross(f, r));
  f = v3.norm(v3.add(f, v3.add(v3.mul(u, n1 * vib + Math.sin(t * 2.3) * wob), v3.mul(r, n2 * vib + Math.sin(t * 1.7 + 1) * wob))));
  r = v3.norm(v3.cross(u, f)); u = v3.norm(v3.cross(f, r));
  const pos = settle >= 1 ? [0, STILL.h, 0] : p;
  return { pos, mat: basisMatrix(r, u, f), vfov: fov * DEG, speed, thrust: T, f, u, r, settle };
}

let groundCPU = null; // coarse max-height grid for AGL readout
function groundAt(x, z) {
  if (!groundCPU) return 0;
  const { N, d } = groundCPU;
  const u = Math.min(N - 1, Math.max(0, Math.floor((x - RECT[0]) / RECT[2] * N))), v = Math.min(N - 1, Math.max(0, Math.floor((z - RECT[1]) / RECT[2] * N)));
  return d[v * N + u];
}
async function readGround() {
  const N = 512, F = 4, step = Math.max(1, Math.round(HRES / N / F));
  const P = prog(GLSL_COMMON + `
uniform sampler2D uH; out vec4 o;
void main(){ float m=-1e9; ivec2 b=ivec2(floor(gl_FragCoord.xy))*${F};
  for(int j=uZero;j<${F};j++)for(int i=uZero;i<${F};i++) m=max(m,texelFetch(uH,(b+ivec2(i,j))*${step},0).r);
  o=vec4(m,0,0,1); }`);
  const t = tex(N, N, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
  gl.useProgram(P.p); bindTex(0, world.hTex); gl.uniform1i(P.u.uH, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(t)); gl.viewport(0, 0, N, N); gl.drawArrays(gl.TRIANGLES, 0, 3);
  const px = new Float32Array(N * N * 4); gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, px);
  const d = new Float32Array(N * N); for (let i = 0; i < N * N; i++) d[i] = px[i * 4];
  groundCPU = { N, d };
}

// --- FPV OSD (Betaflight-style), drawn to a canvas and composited in post
const hudCv = document.createElement('canvas'); const hctx = hudCv.getContext('2d');
let hudTex = null, hudOn = Q.get('hud') === '1';   // clean cinematic output by default
function drawHUD(t, cam) {
  const W = cv.width, H = cv.height; if (hudCv.width !== W || hudCv.height !== H) { hudCv.width = W; hudCv.height = H; }
  const s = H / 1080, c = hctx; c.clearRect(0, 0, W, H);
  const fade = 1 - smoothstep(FL.end - 2.5, FL.end - 0.5, t);
  if (!hudOn || fade <= 0) return;
  c.save(); c.globalAlpha = fade;
  const mono = (px) => `bold ${Math.round(px * s)}px ui-monospace, Consolas, monospace`;
  c.textBaseline = 'middle'; c.lineJoin = 'round';
  const txt = (str, x, y, al = 'left', px = 26) => { c.font = mono(px); c.textAlign = al; c.lineWidth = 4 * s; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(str, x, y); c.fillStyle = '#fff'; c.fillText(str, x, y); };
  const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  const volts = (16.8 - t * 0.012 - Math.min(cam.thrust, 30) * 0.02).toFixed(1);
  const amps = (4 + cam.thrust * 2.1).toFixed(1);
  const mah = Math.round(t * 38 + t * t * 0.4);
  const agl = Math.max(0, cam.pos[1] - Math.max(groundAt(cam.pos[0], cam.pos[2]), 0));
  txt(`${volts}V`, 70 * s, 70 * s); txt(`${amps}A`, 70 * s, 108 * s); txt(`${mah}mAh`, 70 * s, 146 * s);
  txt(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, W - 70 * s, 70 * s, 'right');
  txt(`RSSI ${Math.round(98 - Math.max(0, Math.hypot(cam.pos[0] + 640, cam.pos[2] - 236) - 400) / 30)}`, W - 70 * s, 108 * s, 'right');
  txt(`${Math.round(cam.speed * 3.6)} KM/H`, 70 * s, H - 70 * s);
  txt(`ALT ${Math.round(cam.pos[1])}M`, W - 70 * s, H - 70 * s, 'right');
  txt(`AGL ${Math.round(agl)}M`, W - 70 * s, H - 108 * s, 'right', 22);
  txt('ACRO', W / 2, H - 70 * s, 'center', 22);
  // crosshair
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2.5 * s; c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 3 * s;
  c.beginPath(); c.moveTo(W / 2 - 22 * s, H / 2); c.lineTo(W / 2 - 8 * s, H / 2); c.moveTo(W / 2 + 8 * s, H / 2); c.lineTo(W / 2 + 22 * s, H / 2); c.moveTo(W / 2, H / 2 - 8 * s); c.lineTo(W / 2, H / 2 - 14 * s); c.stroke();
  // artificial horizon from camera roll / pitch
  const roll = Math.atan2(-cam.r[1], cam.u[1]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, cam.f[1])));
  const py = Math.tan(pitch) / Math.tan(cam.vfov / 2) * H / 2;
  c.save(); c.translate(W / 2, H / 2 + py); c.rotate(-roll);
  c.beginPath(); c.moveTo(-200 * s, 0); c.lineTo(-60 * s, 0); c.moveTo(60 * s, 0); c.lineTo(200 * s, 0); c.stroke();
  c.restore();
  c.restore();
}
function uploadHUD() {
  if (!hudTex) hudTex = tex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, hudTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, hudCv); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}
function setLook(cam) { LOOK.lens = 0; LOOK.ca = 0; LOOK.grain = 0.006 * (1 - cam.settle); }
// Offline renderer hook: accumulate spp sub-frames across the shutter interval (motion blur + AA)
window.renderAt = async (t, spp = 4, shutter = 0.5, idx = 0, fps = 30) => {
  clearAcc();
  for (let k = 0; k < spp; k++) {
    const tk = t + ((k + 0.5) / spp - 0.5) * shutter / fps;
    renderSample(flightCam(tk), tk, spp > 1 ? jitter(k) : [0, 0], false);
  }
  const cam = flightCam(t);
  setLook(cam); drawHUD(t, cam); uploadHUD();
  present(true);
  await postFrame(idx);
};
function startDrone() {
  if (Q.has('offline')) { window.__ready = true; return; }
  let t = num('t', 0), last = performance.now(), paused = false, rs = num('rs', 0.5), slow = 0, fast = 0;
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') paused = !paused;
    else if (e.key === 'h' || e.key === 'H') hudOn = !hudOn;
    else if (e.key === 'r' || e.key === 'R') t = 0;
    else if (e.key === 'ArrowRight') t = Math.min(t + 5, FLIGHT_END);
    else if (e.key === 'ArrowLeft') t = Math.max(t - 5, 0);
    else if (e.key === 'f' || e.key === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  });
  addEventListener('resize', () => { cv.width = innerWidth; cv.height = innerHeight; });
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (!paused) { t += dt; if (t > FLIGHT_END) t = 0; }
    if (dt > 0.05) { slow++; fast = 0; } else if (dt < 0.03) { fast++; slow = 0; }
    if (slow > 6) { rs = Math.max(0.25, rs - 0.05); slow = 0; } if (fast > 40) { rs = Math.min(1, rs + 0.05); fast = 0; }
    resize(Math.round(cv.width * rs), Math.round(cv.height * rs));
    const cam = flightCam(t);
    clearAcc(); renderSample(cam, t, [0, 0], false);
    setLook(cam); drawHUD(t, cam); uploadHUD();
    present(true);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ============================================================================
//  Cinematic drone flight (gimbal-stabilised): replaces the FPV camera
// ============================================================================
// monotone cubic Hermite (Fritsch-Carlson): smooth, never overshoots between keys
function pchip(ts, ys) {
  const n = ts.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i]));
  m[0] = d[0]; m[n - 1] = 0;   // ease out into the final hold
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * (ts[i + 1] - ts[i]) + (ts[i] - ts[i - 1]), w2 = (ts[i + 1] - ts[i]) + 2 * (ts[i] - ts[i - 1]); m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (t) => {
    t = Math.min(Math.max(t, ts[0]), ts[n - 1]);
    let i = 0; while (i < n - 2 && t >= ts[i + 1]) i++;
    const hh = ts[i + 1] - ts[i], u = (t - ts[i]) / hh, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * hh * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * hh * m[i + 1];
  };
}
const CS = (() => {
  const T = CINE.map((k) => k[0]);
  const col = (i) => pchip(T, CINE.map((k) => k[i]));
  return { T, end: T[T.length - 1], x: col(1), y: col(2), z: col(3), lx: col(4), ly: col(5), lz: col(6), fov: col(7) };
})();
const CINE_HOLD = 4;
function cineCam(t) {
  const tf = Math.min(Math.max(t, 0), CS.end);
  const pos = [CS.x(tf), CS.y(tf), CS.z(tf)];
  const tgt = [CS.lx(tf), CS.ly(tf), CS.lz(tf)];
  let f = v3.norm(v3.sub(tgt, pos));
  // gentle bank from the yaw rate (a real gimbal keeps the horizon almost level)
  const e = 0.3, pa = [CS.x(Math.max(tf - e, 0)), 0, CS.z(Math.max(tf - e, 0))], pb = [CS.x(Math.min(tf + e, CS.end)), 0, CS.z(Math.min(tf + e, CS.end))];
  const fa = v3.norm(v3.sub([CS.lx(Math.max(tf - e, 0)), 0, CS.lz(Math.max(tf - e, 0))], pa)), fb = v3.norm(v3.sub([CS.lx(Math.min(tf + e, CS.end)), 0, CS.lz(Math.min(tf + e, CS.end))], pb));
  let dyaw = Math.atan2(fb[0], fb[2]) - Math.atan2(fa[0], fa[2]); dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const roll = Math.max(-0.05, Math.min(0.05, -dyaw / (2 * e) * 0.08));
  let r = v3.norm(v3.cross([0, 1, 0], f));
  let u = v3.norm(v3.cross(f, r));
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const r2 = v3.add(v3.mul(r, cr), v3.mul(u, sr)), u2 = v3.sub(v3.mul(u, cr), v3.mul(r, sr));
  // exact reference camera at the end
  const settle = smoothstep(CS.end - 1.5, CS.end, t);
  let fov = CS.fov(tf), R = r2, U = u2, F = f, P = pos;
  if (settle > 0) {
    const { r: rr, u: uu, f: ff } = camBasis(0, STILL.pitch);
    F = v3.norm(v3.mix(F, ff, settle)); U = v3.norm(v3.mix(U, uu, settle)); R = v3.norm(v3.cross(U, F)); U = v3.norm(v3.cross(F, R));
    fov = fov + (STILL.vfov / DEG - fov) * settle;
    P = v3.mix(P, [0, STILL.h, 0], settle);
  }
  const sp = v3.len(v3.sub([CS.x(Math.min(tf + .05, CS.end)), CS.y(Math.min(tf + .05, CS.end)), CS.z(Math.min(tf + .05, CS.end))], pos)) / .05;
  return { pos: P, mat: basisMatrix(R, U, F), vfov: fov * DEG, speed: sp, thrust: 9.81, f: F, u: U, r: R, settle };
}

FLIGHT_END = CS.end + CINE_HOLD;
const fpvCam = flightCam;
flightCam = (t) => cineCam(t);
