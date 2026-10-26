// Offline drone-flight renderer.
//   node video.mjs out.mp4 [W H fps spp query]            -> full H.264 video
//   node video.mjs --sheet sheet.png "0,6,12" [W H query] -> contact sheet of single frames
import { launch } from './cdp.mjs';
import { startServer } from './server.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const args = process.argv.slice(2);
const sheet = args[0] === '--sheet';
let out, times, W, H, fps, spp, query;
if (sheet) { [, out, times, W = '960', H = '540', query = ''] = args; times = times.split(',').map(Number); fps = 30; spp = 1; }
else { [out = 'drone.mp4', W = '1920', H = '1080', fps = '30', spp = '4', query = ''] = args; fps = +fps; spp = +spp; }
W = +W; H = +H;

let DURATION = +(process.env.DURATION || 0); // seconds; 0 = read FLIGHT_END from the page
const SPEED = +(process.env.SPEED || 1);     // flight seconds per video second (2.5 = flight plays 2.5x faster); T0/T1 stay in video seconds
let total = sheet ? times.length : (DURATION ? Math.round(DURATION / SPEED * fps) : Infinity);
const tmp = 'sheet_tmp'; if (sheet) { rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp); }

let ff = null;
if (!sheet) {
  ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-vf', 'vflip', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
}
let fatal = null;
const server = await startServer(async ({ buf, w, h, i }) => {
  if (sheet) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', '-vf', 'vflip', `${tmp}/f${String(i).padStart(3, '0')}.png`], { input: buf, maxBuffer: 1 << 30 });
    if (r.status) throw new Error(r.stderr.toString());
  } else if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}, 0, (msg) => { if (msg.startsWith('FATAL')) fatal = msg; });

const t0 = Date.now();
let i = sheet ? 0 : Math.round((+process.env.T0 || 0) * fps), attempts = 0;
while (i < total && attempts < 6) {
  const b = await launch({ width: W, height: H });
  try {
    fatal = null;
    await b.navigate(`http://127.0.0.1:${server.port}/${process.env.PAGE || "index.html"}?mode=drone&offline=1&post=1&${query}`);
    const tw = Date.now();
    while (true) {
      if (fatal) throw new Error(fatal);
      if (await b.evaluate('window.__ready === true', false).catch(() => false)) break;
      if (Date.now() - tw > 240000) throw new Error('load timeout');
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!sheet && !DURATION) { DURATION = await b.evaluate('FLIGHT_END', false); total = Math.round(DURATION / SPEED * fps); console.log('duration', DURATION.toFixed(2), 's flight at', SPEED + 'x,', total, 'frames'); }
    if (!sheet && process.env.T1) total = Math.min(total, Math.round(+process.env.T1 * fps));
    for (; i < total; i++) {
      const t = sheet ? times[i] : i * SPEED / fps;
      const tf0 = Date.now();
      // the shutter spans 0.5 of a video frame, i.e. 0.5*SPEED/fps flight seconds, so motion blur matches the faster flight
      const ok = await b.evaluate(`renderAt(${t}, ${spp}, 0.5, ${i}, ${sheet ? fps : fps / SPEED}).then(() => !document.getElementById('c').getContext('webgl2').isContextLost())`);
      if (!ok || fatal) throw new Error('context lost at frame ' + i);
      if (process.env.VERBOSE) console.log('frame', i, ((Date.now() - tf0) / 1000).toFixed(2) + 's');
      if (process.env.FRAME_PAUSE_MS) await new Promise((r) => setTimeout(r, +process.env.FRAME_PAUSE_MS));   // let the GPU idle between frames
      if (!sheet && (i % 30 === 0 || i === total - 1)) {
        const el = (Date.now() - t0) / 1000, eta = el / (i + 1) * (total - i - 1);
        console.log(`frame ${i + 1}/${total}  ${el.toFixed(0)}s elapsed  ETA ${(eta / 60).toFixed(1)} min`);
      }
    }
  } catch (e) {
    attempts++; console.log('restart after error:', e.message);
  } finally { await b.close(); }
}
server.close();
if (sheet) {
  const n = times.length, cols = Math.min(4, n), rows = Math.ceil(n / cols);
  const inputs = times.flatMap((_, k) => ['-i', `${tmp}/f${String(k).padStart(3, '0')}.png`]);
  const lay = times.map((_, k) => `${(k % cols)}*w0_${Math.floor(k / cols)}*h0`).join('|');
  const filt = times.map((_, k) => `[${k}]scale=480:270,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='t=${times[k]}':x=8:y=8:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.5[v${k}]`).join(';') +
    ';' + times.map((_, k) => `[v${k}]`).join('') + `xstack=inputs=${n}:layout=${times.map((_, k) => `${(k % cols) * 480}_${Math.floor(k / cols) * 270}`).join('|')}:fill=black`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filt, out]);
  if (r.status) console.log(r.stderr.toString());
  console.log('sheet saved', out, ((Date.now() - t0) / 1000).toFixed(0) + 's');
} else {
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  console.log(`video saved ${out} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
process.exit(0);
