'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project=path.resolve(__dirname,'../..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=directory=>fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort();
const hashDirectory=directory=>Object.fromEntries(files(directory).map(name=>[name,sha(fs.readFileSync(path.join(directory,name)))]));
function assert(value,message){if(!value)throw new Error(message);}
function verifyM5(){
  const pinned=JSON.parse(fs.readFileSync(path.join(__dirname,'lijiang-m6-m5-baseline.json'),'utf8'));
  const actual=hashDirectory(path.join(project,'web/lijiang-m5'));
  assert(JSON.stringify(actual)===JSON.stringify(pinned.web),'Protected M5 inventory/bytes differ from the pinned pre-M6 baseline');
  for(const [name,hash] of Object.entries(pinned.harness))assert(sha(fs.readFileSync(path.join(__dirname,name)))===hash,'Protected M5 QA changed: '+name);
  return{fileCount:Object.keys(actual).length,harnessFiles:Object.keys(pinned.harness),pinnedAt:pinned.pinnedAt,unchanged:true};
}
function freezeM6(output){
  const directory=path.join(project,'web/lijiang-m6'),snapshot=path.join(output,'source');fs.mkdirSync(snapshot,{recursive:true});
  const hashes=hashDirectory(directory);for(const name of Object.keys(hashes))fs.copyFileSync(path.join(directory,name),path.join(snapshot,name));
  const frozen={directory,snapshot,sha256:hashes,fileCount:Object.keys(hashes).length,verifiedUnchanged:false};
  fs.writeFileSync(path.join(snapshot,'source-freeze-manifest.json'),JSON.stringify(frozen,null,2));return frozen;
}
function verifyM6(frozen){assert(JSON.stringify(hashDirectory(frozen.directory))===JSON.stringify(frozen.sha256),'M6 source changed during actual QA');frozen.verifiedUnchanged=true;fs.writeFileSync(path.join(frozen.snapshot,'source-freeze-manifest.json'),JSON.stringify(frozen,null,2));}
module.exports={project,sha,files,hashDirectory,assert,verifyM5,freezeM6,verifyM6};
