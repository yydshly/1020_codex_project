// SPDX-License-Identifier: GPL-3.0-only
// Offline phrase timing for the existing director MP3s. No TTS or network.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {directorLessonCues} from '../web/data/director-lesson-cues.mjs';
import {getDirectorShots} from '../web/data/director-shots.mjs';
import {narrationManifest} from '../web/assets/narration/manifest.mjs';
import {compileNarrationCues} from '../web/core/narration-cues.mjs';
import {parseDetectedSilences,matchPunctuationPauses} from './build-environment-cue-timing.mjs';
import {sha256} from './minimax-tts.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),web=resolve(root,'web'),destination=resolve(web,'data/director-lesson-timing.mjs');
const METHOD='silence-assisted-text-estimate/v1',LIMITATIONS='Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment.';
const check=(condition,message)=>{if(!condition)throw new TypeError(message);};
export async function buildDirectorLessonTiming({write=true,log=console.log}={}){
  const timings={},summaries=[];
  for(const mission of ['vents','canyon'])for(const shot of getDirectorShots(mission)){
    const cues=directorLessonCues[shot.id];if(!cues)continue;const clip=narrationManifest.clips[shot.id];
    check(clip&&clip.text===shot.narration,`Director text/audio mismatch: ${shot.id}`);
    compileNarrationCues({text:shot.narration,duration:clip.duration,cues});
    check(/^assets\/narration\/[a-z][a-z0-9-]*-[a-f0-9]{12}\.mp3$/.test(clip.file),'Director audio must stay in the local narration directory');
    const audio=resolve(web,clip.file),within=relative(web,audio);check(within&&!isAbsolute(within)&&within!=='..'&&!within.startsWith(`..${sep}`),'Audio must remain inside the web project');
    const bytes=await readFile(audio);check(bytes.length===clip.bytes&&sha256(bytes)===clip.sha256,`Director audio hash mismatch: ${shot.id}`);
    const result=spawnSync('ffmpeg',['-hide_banner','-nostats','-xerror','-i',audio,'-af','silencedetect=noise=-42dB:d=0.10','-f','null','-'],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
    check(result.status===0,`Local director pause analysis failed: ${shot.id}`);
    const silences=parseDetectedSilences(result.stderr,clip.duration),matched=matchPunctuationPauses(shot.narration,clip.duration,silences);
    timings[shot.id]={method:METHOD,text:shot.narration,duration:clip.duration,audioSha256:clip.sha256,textSha256:sha256(shot.narration),anchors:matched.anchors,detectedSilences:silences,quality:matched.quality,limitations:LIMITATIONS};
    const plan=compileNarrationCues({text:shot.narration,duration:clip.duration,cues,timing:timings[shot.id]});summaries.push({id:shot.id,steps:plan.cues.map(c=>({step:c.step,start:Number(c.start.toFixed(3))})),...matched.quality});
  }
  const info={schema:'abyss-director-lesson-timing/v1',method:METHOD,limitations:LIMITATIONS};
  if(write){const text=`// SPDX-License-Identifier: GPL-3.0-only\n// Locally generated from unchanged director MP3s and exact public phrases.\nconst freezeDeep=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;};\nexport const directorLessonTimingInfo=freezeDeep(${JSON.stringify(info,null,2)});\nexport const directorLessonTiming=freezeDeep(${JSON.stringify(timings,null,2)});\n`,temporary=`${destination}.${process.pid}.tmp`;await writeFile(temporary,text,'utf8');await rename(temporary,destination);}
  log(JSON.stringify({passed:true,written:write,chapters:summaries.length,networkCalls:0,audioFilesModified:0,summaries},null,2));return {timings,info,summaries};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const args=process.argv.slice(2);if(args.some(arg=>arg!=='--dry-run'))throw new TypeError('Only --dry-run is supported');await buildDirectorLessonTiming({write:!args.includes('--dry-run')});}
