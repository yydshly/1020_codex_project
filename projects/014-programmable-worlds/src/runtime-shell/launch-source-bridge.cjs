'use strict';
const path=require('node:path'),fs=require('node:fs');
const {spawn,spawnSync}=require('node:child_process');
const http=require('node:http');
const workspace=path.resolve(__dirname,'../../../..');
const electron=path.join(__dirname,'node_modules','electron','dist','electron.exe');
const logDirectory=path.join(workspace,'.cache','napali-source-bridge');
fs.mkdirSync(logDirectory,{recursive:true});
function health(){return new Promise(resolve=>{const request=http.get('http://127.0.0.1:8797/health',response=>{let body='';response.on('data',data=>body+=data);response.on('end',()=>{try{resolve(JSON.parse(body).service==='napali-source-bridge');}catch{resolve(false);}});});request.setTimeout(1500,()=>request.destroy());request.on('error',()=>resolve(false));});}
(async()=>{
  if(await health()){process.stdout.write('Source bridge already running on 127.0.0.1:8797\n');return;}
  const prepared=spawnSync(process.execPath,[path.join(__dirname,'prepare-source-bridge.cjs')],{windowsHide:true,encoding:'utf8'});
  if(prepared.status!==0)throw new Error(prepared.stderr||'Could not prepare source bridge');
  const preparation=JSON.parse(prepared.stdout);
  if(preparation.modeArgument!=='--source-bridge')throw new Error('Background source bridge entry was not verified');
  const out=fs.openSync(path.join(logDirectory,'stdout.log'),'a'),error=fs.openSync(path.join(logDirectory,'stderr.log'),'a');
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('NAPALI_QA')||key==='ELECTRON_RUN_AS_NODE')delete env[key];
  const child=spawn(electron,[preparation.modeArgument],{cwd:__dirname,env,detached:true,stdio:['ignore',out,error],windowsHide:true});
  child.unref();fs.closeSync(out);fs.closeSync(error);
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){if(await health()){process.stdout.write(JSON.stringify({service:'napali-source-bridge',pid:child.pid,url:'http://127.0.0.1:8797'})+'\n');return;}await new Promise(resolve=>setTimeout(resolve,200));}
  throw new Error('Hidden source bridge did not become ready; see .cache/napali-source-bridge logs');
})().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
