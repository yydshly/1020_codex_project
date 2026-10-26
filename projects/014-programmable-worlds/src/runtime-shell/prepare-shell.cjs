'use strict';
const fs = require('node:fs');
const path = require('node:path');

const sourceDirectory = __dirname;
const workspaceDirectory = path.resolve(sourceDirectory, '../../../..');
const dist = path.join(sourceDirectory, 'node_modules', 'electron', 'dist');
const executable = path.join(dist, 'electron.exe');
if (!fs.existsSync(executable)) throw new Error('Install the pinned official Electron dependency first.');
const appDirectory = path.join(dist, 'resources', 'app');
fs.mkdirSync(appDirectory, { recursive: true });
if(fs.existsSync(path.join(sourceDirectory,'lijiang-raster-interaction-acceptance.cjs')))fs.copyFileSync(path.join(sourceDirectory,'lijiang-raster-interaction-acceptance.cjs'),path.join(appDirectory,'lijiang-raster-interaction-acceptance.cjs'));
const configPath = path.join(sourceDirectory, 'renderer-config.json');
let backend = 'gl';
if (fs.existsSync(configPath)) {
  const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (['vulkan', 'gl', 'd3d11'].includes(existing.backend)) backend = existing.backend;
}
const config = {
  backend,
  workspaceDirectory,
  profileDirectory: path.join(workspaceDirectory, '.cache', 'napali-electron-hub-profile')
};
const packagedManifest = {
  name: 'napali-local-renderer',
  version: '1.0.0',
  private: true,
  main: 'entry.cjs'
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
for (const file of ['entry.cjs', 'source-bridge-main.cjs', 'source-stream-engine.js', 'main.cjs', 'acceptance.cjs', 'demo-acceptance.cjs', 'calibration-acceptance.cjs', 'look-acceptance.cjs', 'water-acceptance.cjs', 'compile-acceptance.cjs', 'hub-acceptance.cjs', 'source-live-acceptance.cjs', 'navigation-preload.cjs']) fs.copyFileSync(path.join(sourceDirectory, file), path.join(appDirectory, file));
if (fs.existsSync(path.join(sourceDirectory, 'canal-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'canal-acceptance.cjs'), path.join(appDirectory, 'canal-acceptance.cjs'));
if (fs.existsSync(path.join(sourceDirectory, 'station-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'station-acceptance.cjs'), path.join(appDirectory, 'station-acceptance.cjs'));
fs.writeFileSync(path.join(appDirectory, 'package.json'), JSON.stringify(packagedManifest, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(appDirectory, 'renderer-config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ executable, appDirectory, backend, profileDirectory: config.profileDirectory }, null, 2));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-acceptance.cjs'), path.join(appDirectory, 'lijiang-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-hub-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-hub-acceptance.cjs'), path.join(appDirectory, 'lijiang-hub-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-native-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-native-acceptance.cjs'), path.join(appDirectory, 'lijiang-native-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-native-client-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-native-client-acceptance.cjs'), path.join(appDirectory, 'lijiang-native-client-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-native-hub-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-native-hub-acceptance.cjs'), path.join(appDirectory, 'lijiang-native-hub-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-native-performance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-native-performance.cjs'), path.join(appDirectory, 'lijiang-native-performance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-raster-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-raster-acceptance.cjs'), path.join(appDirectory, 'lijiang-raster-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-native-idle-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-native-idle-acceptance.cjs'), path.join(appDirectory, 'lijiang-native-idle-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-native-idle-client-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-native-idle-client-acceptance.cjs'), path.join(appDirectory, 'lijiang-native-idle-client-acceptance.cjs'));

if (fs.existsSync(path.join(sourceDirectory, 'lijiang-native-sdf-acceptance.cjs'))) fs.copyFileSync(path.join(sourceDirectory, 'lijiang-native-sdf-acceptance.cjs'), path.join(appDirectory, 'lijiang-native-sdf-acceptance.cjs'));

if(fs.existsSync(path.join(sourceDirectory,'lijiang-raster-hub-acceptance.cjs')))fs.copyFileSync(path.join(sourceDirectory,'lijiang-raster-hub-acceptance.cjs'),path.join(appDirectory,'lijiang-raster-hub-acceptance.cjs'));
