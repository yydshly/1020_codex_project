// Render the still frame headlessly: node shot.mjs out.png "k=v&k2=v2" [w h]
import { launch } from './cdp.mjs';
import { startServer } from './server.mjs';
import { spawnSync } from 'node:child_process';
const [out = 'render.png', query = '', W = '1672', H = '941'] = process.argv.slice(2);
const t0 = Date.now();
let done, failed;
let finished = new Promise((r, j) => { done = r; failed = j; });
const server = await startServer(async ({ buf, w, h }) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', '-vf', 'vflip', out], { input: buf, maxBuffer: 1 << 30 });
  if (r.status) throw new Error(r.stderr.toString());
  done();
}, 0, (msg) => { if (msg.startsWith('FATAL')) failed(new Error(msg)); });
let ok = false;
for (let attempt = 0; attempt < 8 && !ok; attempt++) {
  let b;
  try { b = await launch({ width: +W, height: +H }); } catch (e) { console.log('attempt', attempt, 'failed:', e.message); continue; }   // (merge r4: a slow Chrome start is retried, not fatal)
  const timer = setTimeout(() => failed(new Error("TIMEOUT")), 600000);
  try {
    await b.navigate(`http://127.0.0.1:${server.port}/index.html?mode=still&post=1&${query}`);
    await finished;
    ok = true;
    console.log(`saved ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log('attempt', attempt, 'failed:', e.message);
    finished = new Promise((r, j) => { done = r; failed = j; });
  } finally { clearTimeout(timer); await b.close(); }
}
server.close();
process.exit(ok ? 0 : 1);
