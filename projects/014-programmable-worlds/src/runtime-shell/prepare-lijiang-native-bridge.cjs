'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const MODE_ARGUMENT = '--lijiang-native-bridge';
const MODULE_NAME = './lijiang-native-bridge-main.cjs';
function assertEntry(entrySource) {
  const requested = [];
  vm.runInNewContext(entrySource, { process: { argv: ['electron.exe', MODE_ARGUMENT] }, require: name => { requested.push(name); return {}; } }, { filename: 'packaged-entry-static-check.cjs', timeout: 1000 });
  if (requested.length !== 1 || requested[0] !== MODULE_NAME) throw new Error('The packaged native bridge argument must dispatch only to its dedicated background module');
  return true;
}
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function prepare() {
  // The normal preparation installs the root-owned dispatcher. Never replace
  // that dispatcher here or launch Electron to test it.
  assertEntry(fs.readFileSync(path.join(__dirname, 'entry.cjs'), 'utf8'));
  const prepared = spawnSync(process.execPath, [path.join(__dirname, 'prepare-shell.cjs')], { windowsHide: true, encoding: 'utf8' });
  if (prepared.status !== 0) throw new Error(prepared.stderr || 'Could not prepare packaged native bridge');
  let result;
  try { result = JSON.parse(prepared.stdout); } catch { throw new Error('Shell preparation did not return its JSON package location'); }
  const bridge = result.appDirectory;
  const manifest = JSON.parse(fs.readFileSync(path.join(bridge, 'package.json'), 'utf8'));
  if (manifest.main !== 'entry.cjs') throw new Error('The native background bridge requires the explicit safe entry dispatcher');
  assertEntry(fs.readFileSync(path.join(bridge, 'entry.cjs'), 'utf8'));
  const files = ['lijiang-native-bridge-main.cjs', 'source-stream-engine.js'];
  const copied = files.map(name => {
    const source = path.join(__dirname, name), destination = path.join(bridge, name);
    fs.copyFileSync(source, destination);
    const sourceSha256 = digest(source), packagedSha256 = digest(destination);
    if (sourceSha256 !== packagedSha256) throw new Error('Packaged native bridge copy failed SHA-256 verification: ' + name);
    return { name, sha256: sourceSha256 };
  });
  return { bridgeDirectory: bridge, executable: result.executable, modeArgument: MODE_ARGUMENT, entryDispatchVerified: true, copied, service: 'lijiang-native-bridge', url: 'http://127.0.0.1:8798', profileDirectory: 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-bridge-profile', logDirectory: 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-bridge-logs', rendererStarted: false };
}
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(prepare()) + '\n'); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = { prepare, contracts: { assertEntry, MODE_ARGUMENT, MODULE_NAME } };
