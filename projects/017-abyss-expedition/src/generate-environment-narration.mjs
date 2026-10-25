// SPDX-License-Identifier: GPL-3.0-only
// Server-side MiniMax generation for environment guides, separate from the film.
import {readFile,writeFile,mkdir,realpath,rename} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,basename,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {environmentGuides} from '../web/data/environment-guide.mjs';
import {
  MiniMaxTtsError,parsePrivateEnv,miniMaxConfig,publicMiniMaxConfig,
  audioFileFor,cachedClipMatches,manifestMatchesConfig,selectNarrationKeys,
  requestFingerprint,sha256,synthesizeMiniMax,safeMiniMaxError,
} from './minimax-tts.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const webRoot=resolve(projectRoot,'web');
export const ENVIRONMENT_AUDIO_DIRECTORY='assets/environment-narration';
const outputRoot=resolve(webRoot,ENVIRONMENT_AUDIO_DIRECTORY);
const manifestPath=resolve(outputRoot,'manifest.json'),modulePath=resolve(outputRoot,'manifest.mjs');
const storyPath=resolve(webRoot,'data/environment-guide.mjs');
const reject=(code,message)=>{throw new MiniMaxTtsError(code,message);};
const HELP=`Generate authentic MiniMax speech for the independent environment guide.

  node src/generate-environment-narration.mjs --env-file ABSOLUTE_EXTERNAL_ENV --dry-run
  node src/generate-environment-narration.mjs --env-file ABSOLUTE_EXTERNAL_ENV

--env-file P   Explicit private .env outside this project; environment wins.
--key ID       Select guide chapter IDs, NOT a credential; repeat or comma-separate.
--limit N      Process at most N selected clips, including verified cache hits.
--interval-ms N Request-start spacing: integer 6500–60000 ms (default 6500).
--dry-run      Validate and list public clip IDs/counts; no requests or writes.
--help         Show this help. Credentials are never accepted on the command line.

Defaults: speech-2.8-hd / male-qn-qingse / speed .95 / MP3 32kHz 128kbps mono.
No automatic retries, provider fallback or forced regeneration. Existing director
audio and its manifest are never read or written. Matching text/config/hash audio
is reused in assets/environment-narration; old versioned files are not deleted.
`;

export function environmentNarrationCatalog(guides=environmentGuides){
  const catalog={};
  for(const mission of ['vents','canyon']){
    const chapters=guides?.[mission]?.chapters;
    if(!Array.isArray(chapters)||!chapters.length)reject('INVALID_GUIDE','Every environment guide requires a nonempty chapter list.');
    for(const chapter of chapters){
      const id=chapter?.id,text=chapter?.narration;
      if(typeof id!=='string'||!/^[a-z][a-z0-9-]*$/.test(id))reject('INVALID_CLIP','Environment chapter IDs must be safe lowercase identifiers.');
      if(Object.hasOwn(catalog,id))reject('DUPLICATE_CLIP','Environment chapter IDs must be unique across missions.');
      if(typeof text!=='string'||!text.trim()||text.length>=10000)reject('INVALID_TEXT','Environment narration must contain between 1 and 9999 characters.');
      catalog[id]={mission,text};
    }
  }
  return catalog;
}

export function parseEnvironmentArguments(argv){
  const options={keys:[],limit:Infinity,intervalMs:6500,envFile:null,dryRun:false,help:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--help'||arg==='-h')options.help=true;
    else if(arg==='--dry-run')options.dryRun=true;
    else if(['--key','--limit','--env-file','--interval-ms'].includes(arg)){
      const value=argv[++i];if(!value||value.startsWith('--'))reject('CLI_ARGUMENT','An option is missing its value. Use --help.');
      if(arg==='--key'){
        const keys=value.split(',').map(key=>key.trim());
        if(keys.some(key=>!key))reject('CLI_ARGUMENT','--key requires nonempty chapter identifiers.');
        options.keys.push(...keys);
      }
      if(arg==='--limit')options.limit=Number(value);
      if(arg==='--env-file')options.envFile=value;
      if(arg==='--interval-ms'){
        if(!/^\d+$/.test(value)||!Number.isInteger(Number(value))||Number(value)<6500||Number(value)>60000)reject('INVALID_INTERVAL','--interval-ms must be an integer from 6500 through 60000.');
        options.intervalMs=Number(value);
      }
    }else reject('CLI_ARGUMENT','Unsupported option. Use --help; credentials belong in private environment settings.');
  }
  return options;
}

export async function loadEnvironmentPrivateSettings(file,environment=process.env){
  let privateValues={};
  if(file){
    if(!isAbsolute(file))reject('ENV_PATH','--env-file requires an absolute path outside this project.');
    let resolved;try{resolved=await realpath(file);}catch{reject('ENV_READ','Could not read the explicitly supplied private environment file.');}
    const within=relative(await realpath(projectRoot),resolved);
    if(!within||!isAbsolute(within)&&within!=='..'&&!within.startsWith(`..${sep}`))reject('ENV_PATH','Keep credentials outside this project and supply that absolute --env-file path.');
    try{privateValues=parsePrivateEnv(await readFile(resolved,'utf8'));}
    catch(error){if(error instanceof MiniMaxTtsError)throw error;reject('ENV_READ','Could not read the explicitly supplied private environment file.');}
  }
  return {...privateValues,...Object.fromEntries(Object.entries(environment).filter(([,value])=>value!==undefined&&value!==''))};
}

async function loadManifest(){
  try{return JSON.parse(await readFile(manifestPath,'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;reject('MANIFEST_READ','Existing environment metadata is unreadable and has been left intact.');}
}
async function writeManifest(manifest){
  const data=JSON.stringify(manifest,null,2),json=`${data}\n`;
  const module=`// SPDX-License-Identifier: GPL-3.0-only\n// Generated public metadata only. No private provider settings.\nexport const environmentNarrationManifest = ${data};\n`;
  const temporaryJson=`${manifestPath}.${process.pid}.tmp`,temporaryModule=`${modulePath}.${process.pid}.tmp`;
  await writeFile(temporaryJson,json,'utf8');await writeFile(temporaryModule,module,'utf8');
  await rename(temporaryJson,manifestPath);await rename(temporaryModule,modulePath);
}
const clipFields=['file','duration','text','sha256','bytes','mission','requestHash'];
const publicClip=clip=>Object.fromEntries(clipFields.map(field=>[field,clip[field]]));

export async function generateEnvironmentNarration({argv=process.argv.slice(2),environment=process.env,fetchImpl=globalThis.fetch,log=console.log,sleep=delay}={}){
  const options=parseEnvironmentArguments(argv);
  if(options.help){log(HELP);return {generated:0,cached:0};}
  const catalog=environmentNarrationCatalog(),keys=selectNarrationKeys(catalog,options.keys,options.limit);
  const config=miniMaxConfig(await loadEnvironmentPrivateSettings(options.envFile,environment));
  if(options.dryRun){
    const plan={...publicMiniMaxConfig(config),selected:keys.length,characters:keys.reduce((sum,key)=>sum+catalog[key].text.length,0),intervalMs:options.intervalMs,clips:keys.map(key=>({id:key,mission:catalog[key].mission,characters:catalog[key].text.length}))};
    log(JSON.stringify(plan,null,2));return {generated:0,cached:0,plan};
  }
  const storyHash=sha256(await readFile(storyPath)),oldManifest=await loadManifest();
  const manifest={schema:'abyss-environment-narration/v1',...publicMiniMaxConfig(config),state:'partial',clips:{}};
  // Validate all retained clips before marking a subset invocation ready. Public
  // fields are explicitly copied, so old metadata cannot introduce new secrets.
  if(manifestMatchesConfig(oldManifest,config))for(const [key,{text,mission}] of Object.entries(catalog)){
    const file=audioFileFor(key,config,text,ENVIRONMENT_AUDIO_DIRECTORY);
    let bytes;try{bytes=await readFile(resolve(outputRoot,basename(file)));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(cachedClipMatches(oldManifest,key,text,config,bytes,ENVIRONMENT_AUDIO_DIRECTORY)){
      manifest.clips[key]={...publicClip(oldManifest.clips[key]),mission,requestHash:requestFingerprint(config,text)};
    }
  }
  let generated=0,cached=0,previousRequestStartedAt=null;
  const storyUnchanged=async()=>{if(sha256(await readFile(storyPath))!==storyHash)reject('STORY_CHANGED','Environment guide changed during generation. Completed clips remain cached; no further request was sent.');};
  const refreshState=()=>{manifest.state=Object.keys(catalog).every(id=>Object.hasOwn(manifest.clips,id))?'ready':'partial';};
  for(const key of keys){
    const {text,mission}=catalog[key],file=audioFileFor(key,config,text,ENVIRONMENT_AUDIO_DIRECTORY),destination=resolve(outputRoot,basename(file));
    if(manifest.clips[key]){cached++;log(`${key}: cached (${manifest.clips[key].bytes} bytes)`);continue;}
    if(previousRequestStartedAt!==null){const waitMs=Math.max(0,options.intervalMs-(performance.now()-previousRequestStartedAt));if(waitMs>0)await sleep(waitMs);}
    await storyUnchanged();previousRequestStartedAt=performance.now();
    const audio=await synthesizeMiniMax(text,config,{fetchImpl});
    await mkdir(outputRoot,{recursive:true});
    const temporaryAudio=`${destination}.${process.pid}.tmp`;await writeFile(temporaryAudio,audio.bytes);await rename(temporaryAudio,destination);
    manifest.clips[key]={file,duration:audio.duration,text,sha256:sha256(audio.bytes),bytes:audio.bytes.length,mission,requestHash:requestFingerprint(config,text)};
    manifest.generatedAt=new Date().toISOString();refreshState();await writeManifest(manifest);generated++;
    log(`${key}: generated (${audio.bytes.length} bytes, ${audio.duration.toFixed(3)} seconds)`);
    await storyUnchanged();
  }
  if(cached&&!generated){await mkdir(outputRoot,{recursive:true});await storyUnchanged();manifest.generatedAt=oldManifest?.generatedAt||new Date().toISOString();refreshState();await writeManifest(manifest);}
  log(`MiniMax environment narration: ${generated} generated, ${cached} cached.`);
  return {generated,cached,manifest};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  generateEnvironmentNarration().catch(error=>{console.error(safeMiniMaxError(error));process.exitCode=1;});
}
