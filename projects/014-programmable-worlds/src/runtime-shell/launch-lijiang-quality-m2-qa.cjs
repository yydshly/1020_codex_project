'use strict';
// Launch only the explicitly dispatched M2 QA in the existing packaged runtime.
// A packaged Electron ignores a loose .cjs application argument here: always
// verify resources/app/entry.cjs before spawning its dedicated flag.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const MODE_ARGUMENT = '--lijiang-quality-m2-qa';

function launchEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE' || /^NAPALI_/i.test(key)
      || /^LIJIANG_/i.test(key) && !/^LIJIANG_M2_/i.test(key)) delete env[key];
  }
  // Defensive hidden behavior even if a future packaging change regresses.
  // The dedicated dispatch validation below remains mandatory, not a fallback.
  env.NAPALI_QA = '1';
  return env;
}

function inspectEntryText(text) {
  // Ignore only comments; the first executable branch must be the M2 branch.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
  const match = code.match(/^(?:['"]use strict['"];?\s*)?if\s*\(\s*process\.argv\.includes\(\s*['"]--lijiang-quality-m2-qa['"]\s*\)\s*\)\s*\{([\s\S]*?)\}\s*else\b/);
  if (!match || !/require\s*\(\s*path\.join\s*\(\s*config\.workspaceDirectory\s*,\s*['"]projects['"]\s*,\s*['"]014-programmable-worlds['"]\s*,\s*['"]src['"]\s*,\s*['"]runtime-shell['"]\s*,\s*['"]lijiang-quality-m2-qa\.cjs['"]\s*\)\s*\)\s*;?\s*$/.test(match[1])) {
    throw new Error('Packaged entry does not begin with the explicit M2-only dispatch. Nothing was launched.');
  }
  if (/require\s*\(\s*['"].*(?:main|bridge)\.cjs['"]/.test(match[1])) {
    throw new Error('M2 dispatch contains another application require. Nothing was launched.');
  }
  return true;
}

function validatePackage() {
  const dist = path.join(__dirname, 'node_modules', 'electron', 'dist');
  const executable = path.join(dist, 'electron.exe');
  const appDirectory = path.join(dist, 'resources', 'app');
  const entry = path.join(appDirectory, 'entry.cjs');
  const harness = path.join(__dirname, 'lijiang-quality-m2-qa.cjs');
  for (const file of [executable, entry, harness]) {
    if (!fs.existsSync(file)) throw new Error('Required pinned M2 runtime file is missing: ' + file + '. Nothing was launched.');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(appDirectory, 'package.json'), 'utf8'));
  if (manifest.main !== 'entry.cjs') throw new Error('Packaged application main is not entry.cjs. Nothing was launched.');
  inspectEntryText(fs.readFileSync(entry, 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(appDirectory, 'renderer-config.json'), 'utf8'));
  const expectedWorkspace = path.resolve(__dirname, '../../../..');
  const configuredWorkspace = path.resolve(config.workspaceDirectory || '');
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!path.isAbsolute(config.workspaceDirectory || '') || normalize(expectedWorkspace) !== normalize(configuredWorkspace)) {
    throw new Error('Packaged M2 entry points to another workspace. Nothing was launched.');
  }
  return { executable, appDirectory, entry, harness, dispatchVerified: true };
}

async function launch() {
  const verified = validatePackage();
  return new Promise((resolve, reject) => {
    const child = spawn(verified.executable, [MODE_ARGUMENT, '--qa'], {
      cwd: __dirname, env: launchEnvironment(), stdio: 'inherit', windowsHide: true
    });
    child.once('error', error => reject(new Error('Could not start dedicated hidden M2 QA: ' + error.message)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ status: 'passed', pid: child.pid, dispatchVerified: true });
      else reject(new Error('Dedicated hidden M2 QA failed: ' + (signal ? 'signal ' + signal : 'exit code ' + code)));
    });
  });
}

if (require.main === module) launch().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
  .catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
module.exports = { launch, contracts: { MODE_ARGUMENT, launchEnvironment, inspectEntryText, validatePackage } };
