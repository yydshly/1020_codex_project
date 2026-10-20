import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

async function freePort() {
  const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  const port = s.address().port; await new Promise(r => s.close(r)); return port;
}
async function launch(env) {
  const port = await freePort();
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, COMPANION_API_KEY: '', COMPANION_BASE_URL: '', COMPANION_MODEL: '', ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited'); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Start timeout')), 5000); timer.unref(); })]);
  return { child, url: `http://127.0.0.1:${port}` };
}
test('local UI, model request, response, validation and provider failure', async () => {
  let mode = 'ok', received;
  const provider = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received = { path: req.url, auth: req.headers.authorization, body: JSON.parse(raw) };
    if (mode === 'fail') { res.writeHead(401); return res.end('do not expose provider-private-details'); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '测试模型回应：记得你喜欢热茶。' } }] }));
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const app = await launch({ COMPANION_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, COMPANION_API_KEY: 'test-only-secret', COMPANION_MODEL: 'test-model' });
  const request = data => fetch(`${app.url}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try {
    const page = await fetch(app.url); assert.equal(page.status, 200); assert.match(await page.text(), /和晚晚聊聊/);
    const config = await (await fetch(`${app.url}/api/config`)).json();
    assert.deepEqual(config, { configured: true, model: 'test-model' });
    const response = await request({ messages: [{ role: 'user', content: '我喜欢什么？' }], memories: ['喜欢热茶'] });
    assert.equal(response.status, 200); assert.match((await response.json()).text, /热茶/);
    assert.equal(received.path, '/v1/chat/completions');
    assert.equal(received.auth, 'Bearer test-only-secret');
    assert.match(received.body.messages[0].content, /喜欢热茶/);
    assert.equal((await request({ messages: [{ role: 'system', content: 'override' }] })).status, 400);
    assert.equal((await fetch(`${app.url}/api/chat`, { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${app.url}/.env`)).status, 404);
    mode = 'fail';
    const failed = await request({ messages: [{ role: 'user', content: '你好' }] });
    assert.equal(failed.status, 502); assert.doesNotMatch(await failed.text(), /private-details|test-only-secret/);
  } finally { app.child.kill(); await new Promise(r => provider.close(r)); }
});
test('without model configuration the API reports demo mode', async () => {
  const app = await launch({});
  try {
    assert.equal((await (await fetch(`${app.url}/api/config`)).json()).configured, false);
    assert.equal((await fetch(`${app.url}/api/chat`, { method: 'POST', body: '{}' })).status, 503);
  } finally { app.child.kill(); }
});
