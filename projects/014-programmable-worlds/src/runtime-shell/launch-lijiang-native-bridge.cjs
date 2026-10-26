'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const SERVICE = 'lijiang-native-bridge';
const MODE_ARGUMENT = '--lijiang-native-bridge';
const URL = 'http://127.0.0.1:8798';
const LOG_DIRECTORY = 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-bridge-logs';
function launchEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) if (/(?:^|_)QA(?:_|$)/i.test(key) && /^(?:NAPALI|LIJIANG)_/i.test(key) || key === 'ELECTRON_RUN_AS_NODE') delete env[key];
  // The dedicated entry is authoritative; no inherited scene selection may
  // accidentally turn this request into a normal renderer or another QA run.
  for (const key of ['NAPALI_SCENE', 'NAPALI_BACKEND', 'NAPALI_COMPILE_ONLY']) delete env[key];
  return env;
}
function health() {
  return new Promise(resolve => {
    let finished = false;
    const finish = value => { if (!finished) { finished = true; resolve(value); } };
    const request = http.get(URL + '/health', response => { let body = ''; response.on('data', data => { body += data; if (body.length > 262144) request.destroy(); }); response.on('end', () => { try { finish({ available: true, statusCode: response.statusCode, body: JSON.parse(body) }); } catch { finish({ available: true, statusCode: response.statusCode, body: null }); } }); response.on('error', () => finish({ available: false })); });
    request.setTimeout(1500, () => request.destroy()); request.on('error', () => finish({ available: false }));
  });
}
function validHealth(result) { return result.available && result.statusCode === 200 && result.body?.service === SERVICE && result.body.version >= 5 && result.body.capabilities?.includes('native-fixed-frame-export') && result.body.capabilities.includes('authenticated-chunked-download') && result.body.capabilities.includes('native-live-settings') && result.body.capabilities.includes('native-lossless-live-frames') && result.body.capabilities.includes('native-live-viewport') && result.body.backend === 'gl' && result.body.duration === 45; }
async function launch() {
  const before = await health();
  if (validHealth(before)) return { service: SERVICE, alreadyRunning: true, pid: before.body.pid, url: URL };
  if (before.available) throw new Error('Port 8798 is occupied by an unexpected service; it was left untouched');
  const prepared = spawnSync(process.execPath, [path.join(__dirname, 'prepare-lijiang-native-bridge.cjs')], { windowsHide: true, encoding: 'utf8' });
  if (prepared.status !== 0) throw new Error(prepared.stderr || 'Could not prepare native bridge');
  const preparation = JSON.parse(prepared.stdout);
  if (preparation.modeArgument !== MODE_ARGUMENT || preparation.entryDispatchVerified !== true || preparation.service !== SERVICE) throw new Error('The dedicated hidden native bridge entry was not verified');
  const electron = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (!fs.existsSync(electron)) throw new Error('The pinned Electron runtime is missing');
  fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
  const stdout = fs.openSync(path.join(LOG_DIRECTORY, 'stdout.log'), 'a'), stderr = fs.openSync(path.join(LOG_DIRECTORY, 'stderr.log'), 'a');
  let child;
  try { child = spawn(electron, [MODE_ARGUMENT], { cwd: __dirname, env: launchEnvironment(), detached: true, stdio: ['ignore', stdout, stderr], windowsHide: true }); child.unref(); }
  finally { fs.closeSync(stdout); fs.closeSync(stderr); }
  let spawnError = null;
  child.on('error', error => { spawnError = error; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    const state = await health();
    if (validHealth(state)) return { service: SERVICE, alreadyRunning: false, pid: state.body.pid || child.pid, url: URL, profileDirectory: preparation.profileDirectory, logDirectory: LOG_DIRECTORY };
    if (state.available) throw new Error('Port 8798 responded with an unexpected service after launch; it was left untouched');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Hidden native bridge did not become ready; see its dedicated C: task logs');
}
if (require.main === module) launch().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
module.exports = { launch, contracts: { launchEnvironment, validHealth, SERVICE, MODE_ARGUMENT, URL, LOG_DIRECTORY } };
