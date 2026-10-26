'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const base=require('./launch-lijiang-quality-m2-qa.cjs');
const MODE_ARGUMENT='--lijiang-quality-m6-qa';
function validatePackage(){
  const verified=base.contracts.validatePackage();
  const code=fs.readFileSync(verified.entry,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  const branch=code.match(/else\s+if\s*\(process\.argv\.includes\('--lijiang-quality-m6-qa'\)\)\s*\{([\s\S]*?)\}/);
  if(!branch||!/^\s*const path=require\('node:path'\);\s*const config=require\('\.\/renderer-config\.json'\);\s*require\(path\.join\(config\.workspaceDirectory,'projects','014-programmable-worlds','src','runtime-shell','lijiang-quality-m6-qa\.cjs'\)\);\s*$/.test(branch[1]))throw new Error('Explicit M6 hidden dispatch missing or different. Nothing launched.');
  if(!fs.existsSync(path.join(__dirname,'lijiang-quality-m6-qa.cjs')))throw new Error('M6 harness missing. Nothing launched.');
  return verified;
}
function launchEnvironment(source=process.env){
  const env={...source};
  for(const key of Object.keys(env))if(key.toUpperCase()==='ELECTRON_RUN_AS_NODE'||/^NAPALI_/i.test(key)||/^LIJIANG_/i.test(key)&&!/^LIJIANG_M6_/i.test(key))delete env[key];
  env.NAPALI_QA='1';return env;
}
async function launch(){
  const verified=validatePackage();
  return new Promise((resolve,reject)=>{
    const child=spawn(verified.executable,[MODE_ARGUMENT,'--qa'],{cwd:__dirname,env:launchEnvironment(),windowsHide:true,stdio:'inherit'});
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve({status:'passed',pid:child.pid,dispatchVerified:true}):reject(new Error('Hidden M6 QA failed: '+(signal||code))));
  });
}
if(require.main===module)launch().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
module.exports={launch,contracts:{validatePackage,launchEnvironment,MODE_ARGUMENT}};
