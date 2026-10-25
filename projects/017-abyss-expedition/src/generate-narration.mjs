// SPDX-License-Identifier: GPL-3.0-only
// Native server-side MiniMax generation; this script never runs in the browser.
import {readFile,writeFile,mkdir,realpath,rename} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,basename,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {getDirectorShots} from '../web/data/director-shots.mjs';
import {
  MiniMaxTtsError,parsePrivateEnv,miniMaxConfig,publicMiniMaxConfig,
  audioFileFor,cachedClipMatches,manifestMatchesConfig,selectNarrationKeys,
  requestFingerprint,sha256,synthesizeMiniMax,safeMiniMaxError,
} from './minimax-tts.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const webRoot=resolve(projectRoot,'web'),outputRoot=resolve(webRoot,'assets/narration');
const manifestPath=resolve(outputRoot,'manifest.json'),modulePath=resolve(outputRoot,'manifest.mjs');
const storyPath=resolve(webRoot,'data/director-shots.mjs');
const HELP=`Generate authentic MiniMax narration for the two director storyboards.

  node src/generate-narration.mjs --env-file ABSOLUTE_EXTERNAL_ENV --dry-run
  node src/generate-narration.mjs --env-file ABSOLUTE_EXTERNAL_ENV

--env-file P   Private .env outside this project. Process environment takes priority.
--key ID       Select a shot ID, NOT a credential. Repeat or separate IDs by commas.
--limit N      Process at most N selected clips, including cache hits.
--interval-ms N Minimum request-start spacing, integer 6500–60000 ms (default 6500).
--force        Explicitly regenerate selected clips even when verified cache exists.
--dry-run      Validate inputs and list clip IDs/counts without requests or writes.
--help         Show this help. No API credential is accepted on the command line.

Defaults: speech-2.8-hd / male-qn-qingse / speed 0.95 / MP3 32kHz 128kbps mono.
No automatic retries or provider fallback. Writes versioned MP3s and matching
web/assets/narration/manifest.json + manifest.mjs. API duration is in seconds.
`;
const reject=(code,message)=>{throw new MiniMaxTtsError(code,message);};

export function narrationCatalog() {
  const catalog={};
  for(const mission of ['vents','canyon'])for(const shot of getDirectorShots(mission)){
    if(Object.hasOwn(catalog,shot.id))reject('DUPLICATE_CLIP','Storyboard shot IDs must be unique across missions.');
    if(typeof shot.narration!=='string'||!shot.narration.trim())reject('INVALID_TEXT','A storyboard narration is empty.');
    catalog[shot.id]={mission,text:shot.narration};
  }
  return catalog;
}

export function parseArguments(argv) {
  const options={keys:[],limit:Infinity,intervalMs:6500,force:false,envFile:null,dryRun:false,help:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--help'||arg==='-h')options.help=true;
    else if(arg==='--force')options.force=true;
    else if(arg==='--dry-run')options.dryRun=true;
    else if(['--key','--limit','--env-file','--interval-ms'].includes(arg)){
      const value=argv[++i];
      if(!value||value.startsWith('--'))reject('CLI_ARGUMENT','An option is missing its value. Use --help.');
      if(arg==='--key')options.keys.push(...value.split(',').map(key=>key.trim()).filter(Boolean));
      if(arg==='--limit')options.limit=Number(value);
      if(arg==='--env-file')options.envFile=value;
      if(arg==='--interval-ms'){
        if(!/^\d+$/.test(value)||!Number.isInteger(Number(value))||Number(value)<6500||Number(value)>60000)reject('INVALID_INTERVAL','--interval-ms must be an integer from 6500 through 60000.');
        options.intervalMs=Number(value);
      }
    }else reject('CLI_ARGUMENT','Unrecognized command-line option. Use --help; credentials belong in private environment settings.');
  }
  return options;
}

export async function loadPrivateEnvironment(file,environment=process.env) {
  let privateValues={};
  if(file){
    if(!isAbsolute(file))reject('ENV_PATH','--env-file requires an absolute path outside this project.');
    let resolved;
    try{resolved=await realpath(file);}catch{reject('ENV_READ','Could not read the explicitly supplied private environment file.');}
    const within=relative(await realpath(projectRoot),resolved);
    if(!within||!isAbsolute(within)&&within!=='..'&&!within.startsWith(`..${sep}`))reject('ENV_PATH','Keep credentials outside this project and supply that absolute --env-file path.');
    try{privateValues=parsePrivateEnv(await readFile(resolved,'utf8'));}
    catch(error){if(error instanceof MiniMaxTtsError)throw error;reject('ENV_READ','Could not read the explicitly supplied private environment file.');}
  }
  return {...privateValues,...Object.fromEntries(Object.entries(environment).filter(([,value])=>value!==undefined&&value!==''))};
}

async function loadManifest() {
  try{return JSON.parse(await readFile(manifestPath,'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;reject('MANIFEST_READ','The existing narration manifest is unreadable and has been left intact.');}
}
async function writeManifest(manifest) {
  const json=`${JSON.stringify(manifest,null,2)}\n`;
  const module=`// SPDX-License-Identifier: GPL-3.0-only\n// Generated public metadata only. API credentials are never stored here.\nexport const narrationManifest = ${JSON.stringify(manifest,null,2)};\n`;
  const temporaryJson=`${manifestPath}.${process.pid}.tmp`,temporaryModule=`${modulePath}.${process.pid}.tmp`;
  await writeFile(temporaryJson,json,'utf8');await writeFile(temporaryModule,module,'utf8');
  await rename(temporaryJson,manifestPath);await rename(temporaryModule,modulePath);
}

export async function generateNarration({argv=process.argv.slice(2),environment=process.env,fetchImpl=globalThis.fetch,log=console.log,sleep=delay}={}) {
  const options=parseArguments(argv);
  if(options.help){log(HELP);return {generated:0,cached:0};}
  const catalog=narrationCatalog(),keys=selectNarrationKeys(catalog,options.keys,options.limit);
  const config=miniMaxConfig(await loadPrivateEnvironment(options.envFile,environment));
  if(options.dryRun){
    const plan={...publicMiniMaxConfig(config),selected:keys.length,characters:keys.reduce((sum,key)=>sum+catalog[key].text.length,0),intervalMs:options.intervalMs,clips:keys.map(key=>({id:key,mission:catalog[key].mission,characters:catalog[key].text.length}))};
    log(JSON.stringify(plan,null,2));return {generated:0,cached:0,plan};
  }
  const storyHash=sha256(await readFile(storyPath));
  const oldManifest=await loadManifest();
  // The public manifest describes the current storyboard only. Superseded
  // versioned MP3 files remain on disk; no cleanup or deletion is performed.
  const retained=manifestMatchesConfig(oldManifest,config)?Object.fromEntries(Object.entries(oldManifest.clips||{}).filter(([id])=>Object.hasOwn(catalog,id))):{};
  const manifest={schema:'abyss-director-narration/v1',...publicMiniMaxConfig(config),state:'partial',clips:retained};
  let generated=0,cached=0,previousRequestStartedAt=null;
  for(const key of keys){
    const {text,mission}=catalog[key],file=audioFileFor(key,config,text),destination=resolve(outputRoot,basename(file));
    let existing;
    try{existing=await readFile(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!options.force&&cachedClipMatches(manifest,key,text,config,existing)){cached++;log(`${key}: cached (${existing.length} bytes)`);continue;}
    if(sha256(await readFile(storyPath))!==storyHash)reject('STORY_CHANGED','Storyboard changed during generation. Completed clips remain cached; no further request was sent.');
    if(previousRequestStartedAt!==null){const waitMs=Math.max(0,options.intervalMs-(performance.now()-previousRequestStartedAt));if(waitMs>0)await sleep(waitMs);}
    previousRequestStartedAt=performance.now();
    const audio=await synthesizeMiniMax(text,config,{fetchImpl});
    await mkdir(outputRoot,{recursive:true});
    const temporaryAudio=`${destination}.${process.pid}.tmp`;
    await writeFile(temporaryAudio,audio.bytes);await rename(temporaryAudio,destination);
    manifest.clips[key]={file,duration:audio.duration,text,sha256:sha256(audio.bytes),bytes:audio.bytes.length,mission,requestHash:requestFingerprint(config,text)};
    manifest.generatedAt=new Date().toISOString();
    manifest.state=Object.entries(catalog).every(([id,entry])=>manifest.clips[id]?.text===entry.text&&manifest.clips[id]?.file===audioFileFor(id,config,entry.text))?'ready':'partial';
    await writeManifest(manifest);generated++;
    log(`${key}: generated (${audio.bytes.length} bytes, ${audio.duration.toFixed(2)} seconds)`);
  }
  // Cache-only invocations also repair the paired JS metadata file without calls.
  if(cached&&!generated){await mkdir(outputRoot,{recursive:true});manifest.generatedAt=oldManifest?.generatedAt||new Date().toISOString();manifest.state=Object.entries(catalog).every(([id,entry])=>manifest.clips[id]?.text===entry.text&&manifest.clips[id]?.file===audioFileFor(id,config,entry.text))?'ready':'partial';await writeManifest(manifest);}
  log(`MiniMax director narration: ${generated} generated, ${cached} cached.`);
  return {generated,cached,manifest};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  generateNarration().catch(error=>{console.error(safeMiniMaxError(error));process.exitCode=1;});
}
