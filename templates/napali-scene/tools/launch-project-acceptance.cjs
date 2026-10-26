'use strict';
// Reuse the existing project runtime only if its explicit hidden dispatch exists.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const dist=path.join(root,'projects','014-programmable-worlds','src','runtime-shell','node_modules','electron','dist');
const entry=path.join(dist,'resources','app','entry.cjs'),exe=path.join(dist,'electron.exe');
if(!fs.existsSync(exe)||!fs.existsSync(entry))throw Error('Existing project renderer unavailable; install official Electron to use electron-acceptance.cjs separately. Nothing launched.');
const code=fs.readFileSync(entry,'utf8');
if(!code.includes("else if (process.argv.includes('--napali-template-qa'))")||!code.includes("require(path.join(config.workspaceDirectory,'templates','napali-scene','tools','electron-acceptance.cjs'))"))throw Error('Explicit hidden template dispatch missing. Nothing launched.');
const env={...process.env,NAPALI_QA:'1'};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(exe,['--napali-template-qa','--qa'],{cwd:root,env,windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
