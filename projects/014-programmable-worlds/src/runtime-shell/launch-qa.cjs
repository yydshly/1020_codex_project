'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const electron = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(electron, ['--qa'], {
  cwd: __dirname,
  env: { ...process.env, NAPALI_QA: '1' },
  stdio: 'inherit',
  windowsHide: true
});
child.on('error', error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
