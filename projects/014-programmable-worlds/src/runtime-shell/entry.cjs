'use strict';
// One explicit packaged entry point prevents a background bridge launch from
// accidentally falling through to the normal visible research hub.
if (process.argv.includes('--lijiang-quality-m2-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m2-qa.cjs'));
}
else if (process.argv.includes('--lijiang-quality-m3-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m3-qa.cjs'));
}
else if (process.argv.includes('--lijiang-quality-m4-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m4-qa.cjs'));
}
else if (process.argv.includes('--lijiang-quality-m5-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m5-qa.cjs'));
}
else if (process.argv.includes('--lijiang-quality-m6-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m6-qa.cjs'));
}
else if (process.argv.includes('--lijiang-quality-m7-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m7-qa.cjs'));
}
else if (process.argv.includes('--lijiang-quality-m7-parent-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m7-parent-qa.cjs'));
}
else if (process.argv.includes('--lijiang-quality-m8-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m8-qa.cjs'));
}
else if (process.argv.includes('--world-hub-wrapup-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','world-hub-wrapup-qa.cjs'));
}
else if (process.argv.includes('--napali-template-qa')) {
  const path=require('node:path');
  const config=require('./renderer-config.json');
  require(path.join(config.workspaceDirectory,'templates','napali-scene','tools','electron-acceptance.cjs'));
}
else if (process.argv.includes('--lijiang-native-bridge')) require('./lijiang-native-bridge-main.cjs');
else if (process.argv.includes('--source-bridge')) require('./source-bridge-main.cjs');
else require('./main.cjs');
