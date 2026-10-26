// Local static server + frame sink. The page POSTs raw RGBA frames here.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };

export function startServer(onFrame, port = 0, onLog = null) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/frame') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          const buf = Buffer.concat(chunks);
          try { await onFrame({ buf, w: +url.searchParams.get('w'), h: +url.searchParams.get('h'), i: +url.searchParams.get('i'), name: url.searchParams.get('name') }); res.writeHead(200); res.end('ok'); }
          catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/log') {
        let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { console.log('[page]', s); onLog && onLog(s); res.writeHead(200); res.end(); });
        return;
      }
      try {
        const f = path.join(ROOT, decodeURIComponent(url.pathname));
        if (!f.startsWith(ROOT)) throw new Error('bad path');
        const data = await readFile(f);
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
      } catch { res.writeHead(404); res.end('404'); }
    });
    srv.listen(port, '127.0.0.1', () => resolve({ srv, port: srv.address().port, close: () => srv.close() }));
  });
}
