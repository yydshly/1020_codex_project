// Minimal Chrome DevTools Protocol driver (no dependencies, Node 22+).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir, setPriority, constants as osConst } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || ({ win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe', darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }[process.platform] ?? 'google-chrome');

// ---- machine-wide GPU lock: only ONE headless render may use the GPU at a time (shared by every
// render process on this machine). Running several at once can overload an integrated GPU.
const LOCK = process.env.GPU_LOCK || path.join(tmpdir(), 'napali-gpu-lock');
let lockHeld = false;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function acquireGpu() {
  for (;;) {
    try { mkdirSync(LOCK); writeFileSync(LOCK + '/owner', String(process.pid)); lockHeld = true; return; }
    catch {
      try {
        const pid = +readFileSync(LOCK + '/owner', 'utf8');
        const age = Date.now() - statSync(LOCK).mtimeMs;
        if ((pid && !alive(pid)) || age > 20 * 60 * 1000) rmSync(LOCK, { recursive: true, force: true });
      } catch { try { if (Date.now() - statSync(LOCK).mtimeMs > 30000) rmSync(LOCK, { recursive: true, force: true }); } catch {} }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
function releaseGpu() { if (lockHeld) { lockHeld = false; try { rmSync(LOCK, { recursive: true, force: true }); } catch {} } }
process.on('exit', releaseGpu);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { releaseGpu(); process.exit(1); });

export async function launch({ width = 1672, height = 941, port = 9333 + Math.floor(Math.random() * 500) } = {}) {
  await acquireGpu();
  // persistent profile => Chrome's GPU shader cache survives between runs (big win on D3D11)
  const backend = process.env.ANGLE || 'd3d11';
  // persistent profile (GPU shader cache) only pays off for D3D11; others get a fresh temp profile
  const profile = process.env.CDP_PROFILE || (backend === 'd3d11' ? path.join(tmpdir(), 'cdp-prof-cache') : mkdtempSync(path.join(tmpdir(), 'cdp-prof-')));
  const tmpProfile = !process.env.CDP_PROFILE && backend !== 'd3d11';
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--use-angle=' + (process.env.ANGLE || 'd3d11'),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--mute-audio',
    ...(process.env.CHROME_LOG ? ['--enable-logging', '--v=0', '--log-file=' + process.env.CHROME_LOG + '.' + Date.now() + '.log'] : []),
    ...(process.env.CHROME_FLAGS ? process.env.CHROME_FLAGS.split(' ').filter(Boolean) : []),
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  try { setPriority(proc.pid, osConst.priority.PRIORITY_BELOW_NORMAL); } catch {}
  // children (GPU / renderer processes) get below-normal CPU priority too, once they exist
  setTimeout(() => spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "ParentProcessId=${proc.pid}" | ForEach-Object { try { (Get-Process -Id $_.ProcessId).PriorityClass='BelowNormal' } catch {} }`], { stdio: 'ignore' }), 2500);
  let wsUrl;
  for (let i = 0; i < 1200; i++) {   // (merge r4: ~3 min instead of 15 s -- Chrome starts very slowly when the machine is at 100 % CPU)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!wsUrl) { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F']); releaseGpu(); if (tmpProfile) { try { rmSync(profile, { recursive: true, force: true }); } catch {} } throw new Error('chrome did not start'); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('[page]', m.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      console.log('[page-exception]', JSON.stringify(m.params.exceptionDetails).slice(0, 2000));
    }
  });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 2000));
    return r.result.value;
  };
  const navigate = async (url) => {
    await send('Page.navigate', { url });
  };
  const waitFor = async (expr, timeout = 600000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await evaluate(expr, false)) return; } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('timeout waiting for ' + expr);
  };
  const grabCanvas = async (type = 'image/png', q = 0.95) => {
    const url = await evaluate(`document.getElementById('c').toDataURL('${type}', ${q})`, false);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };
  // read raw pixels via WebGL readPixels and convert to PNG/JPG with ffmpeg
  const grabPixels = async (out) => {
    const v = await evaluate('window.__pixels()', false);
    const i = v.indexOf(':'), [w, h] = v.slice(0, i).split('x').map(Number);
    const raw = Buffer.from(v.slice(i + 1), 'base64');
    if (out) { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', w + 'x' + h, '-i', '-', '-vf', 'vflip', out], { input: raw, maxBuffer: 1 << 30 }); if (r.status) throw new Error(r.stderr.toString()); }
    return { w, h, raw };
  };
  const screenshot = async (format = 'png', quality = 95) => {
    const r = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? quality : undefined, captureBeyondViewport: false });
    return Buffer.from(r.data, 'base64');
  };
  const close = async () => { try { ws.close(); } catch {} spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F']); await new Promise((r) => setTimeout(r, +(process.env.GPU_COOLDOWN_MS || 20000))); releaseGpu(); if (tmpProfile) { try { rmSync(profile, { recursive: true, force: true }); } catch {} } };   // let the GPU process fully exit before the next launch; delete the throw-away profile (they leaked ~50-90 MB per render)
  return { send, evaluate, navigate, waitFor, screenshot, grabCanvas, grabPixels, close };
}
