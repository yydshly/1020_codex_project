// SPDX-License-Identifier: GPL-3.0-only
// Offline acoustic-pause-assisted estimation. No network or speech generation.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {environmentGuides} from '../web/data/environment-guide.mjs';
import {environmentNarrationManifest} from '../web/assets/environment-narration/manifest.mjs';
import {narrationTextWeights} from '../web/core/narration-cues.mjs';
import {sha256} from './minimax-tts.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),web=resolve(root,'web');
const destination=resolve(web,'data/environment-cue-timing.mjs');
const METHOD='silence-assisted-text-estimate/v1';
const LIMITATIONS='Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset.';
const rounded=value=>Math.round(value*1000000)/1000000;
const check=(condition,message)=>{if(!condition)throw new TypeError(message);};

/** Parse only silencedetect events; never retain raw process logs or paths. */
export function parseDetectedSilences(log,duration){
  check(typeof log==='string'&&Number.isFinite(duration)&&duration>0,'Silence parsing requires text and a positive duration');
  const events=[...log.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)];
  const silences=[];let start=null;
  for(const event of events){
    const seconds=Math.max(0,Math.min(duration,Number(event[2])));
    if(event[1]==='start')start=seconds;
    else if(start!==null){if(seconds>start)silences.push({start:rounded(start),end:rounded(seconds),duration:rounded(seconds-start)});start=null;}
  }
  if(start!==null&&start<duration)silences.push({start:rounded(start),end:duration,duration:rounded(duration-start)});
  return silences;
}

/** Monotonic sequence matching, allowing both missed punctuation and extra pauses. */
export function matchPunctuationPauses(text,duration,silences){
  const weights=narrationTextWeights(text),total=weights.at(-1);
  check(Number.isFinite(duration)&&duration>0&&Array.isArray(silences),'Pause matching requires a positive duration and detected silences');
  let previous=-1;
  for(const silence of silences){
    check(silence&&Number.isFinite(silence.start)&&Number.isFinite(silence.end)&&silence.start>=0&&silence.end>silence.start&&silence.end<=duration&&silence.start>=previous,'Silences must be sorted, disjoint, finite clip intervals');
    previous=silence.end;
  }
  const punctuation=[...text.matchAll(/[，,、；;：:。！？.!?]/gu)].map(match=>({offset:match.index+match[0].length,mark:match[0]})).filter(point=>point.offset<text.length);
  const pauses=silences.filter(silence=>silence.end-silence.start>=.18&&silence.start>.1&&silence.end<duration-.1);
  const n=punctuation.length,m=pauses.length,dp=Array.from({length:n+1},()=>Array(m+1).fill(Infinity)),back=Array.from({length:n+1},()=>Array(m+1).fill(null));
  const full=mark=>/[。！？.!?]/u.test(mark),weak=mark=>mark==='、';
  const skipText=point=>full(point.mark)?3:weak(point.mark)?.9:1.8;
  const set=(i,j,cost,action)=>{if(cost<dp[i][j]){dp[i][j]=cost;back[i][j]=action;}};
  const scale=Math.max(.75,duration*.035),window=Math.max(1.6,Math.min(3.5,duration*.105));dp[0][0]=0;
  for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
    const cost=dp[i][j];if(!Number.isFinite(cost))continue;
    if(i<n)set(i+1,j,cost+skipText(punctuation[i]),'text');
    if(j<m)set(i,j+1,cost+.12,'pause');
    if(i<n&&j<m){
      const point=punctuation[i],pause=pauses[j],prediction=weights[point.offset]/total*duration,delta=pause.end-prediction;
      if(Math.abs(delta)<=window){
        const expected=full(point.mark)?.65:weak(point.mark)?.18:.35,observed=pause.end-pause.start;
        const durationPenalty=.12*((observed-expected)/.45)**2;
        set(i+1,j+1,cost+(delta/scale)**2+durationPenalty,'match');
      }
    }
  }
  let i=n,j=m;const matches=[];
  while(i||j){
    const action=back[i][j];
    if(action==='match'){
      const point=punctuation[i-1],pause=pauses[j-1],prediction=weights[point.offset]/total*duration;
      matches.push({offset:point.offset,seconds:pause.end,source:'detected-pause-end',punctuation:point.mark,pauseStart:pause.start,pauseEnd:pause.end,predictedSeconds:rounded(prediction),predictionCorrectionSeconds:rounded(pause.end-prediction)});i--;j--;
    }else if(action==='text')i--;
    else if(action==='pause')j--;
    else throw new Error('Pause sequence could not be resolved');
  }
  matches.reverse();
  const anchors=[{offset:0,seconds:0,source:'clip-start'},...matches,{offset:text.length,seconds:duration,source:'clip-end'}];
  const corrections=matches.map(match=>Math.abs(match.predictionCorrectionSeconds));
  return {anchors,quality:{punctuationBoundaries:n,detectedPauses:pauses.length,matchedPauses:matches.length,meanPredictionCorrectionSeconds:rounded(corrections.reduce((sum,value)=>sum+value,0)/Math.max(1,corrections.length)),maxPredictionCorrectionSeconds:rounded(Math.max(0,...corrections)),maxUnanchoredSeconds:rounded(Math.max(...anchors.slice(1).map((anchor,index)=>anchor.seconds-anchors[index].seconds)))}};
}

export async function buildEnvironmentCueTiming({write=true,log=console.log}={}){
  const timings={},summaries=[];
  for(const [mission,guide] of Object.entries(environmentGuides))for(const chapter of guide.chapters){
    const clip=environmentNarrationManifest.clips[chapter.id];
    check(clip&&clip.text===chapter.narration&&Number.isFinite(clip.duration)&&clip.duration>0,`Narration metadata must match ${chapter.id}`);
    check(/^assets\/environment-narration\/[a-z][a-z0-9-]*-[a-f0-9]{12}\.mp3$/.test(clip.file),'Audio must come from the existing environment narration directory');
    const audioPath=resolve(web,clip.file),within=relative(web,audioPath);check(within&&!isAbsolute(within)&&within!=='..'&&!within.startsWith(`..${sep}`),'Audio must remain inside the web project');
    const bytes=await readFile(audioPath);check(bytes.length===clip.bytes&&sha256(bytes)===clip.sha256,`Audio hash must match ${chapter.id}`);
    const analysis=spawnSync('ffmpeg',['-hide_banner','-nostats','-xerror','-i',audioPath,'-af','silencedetect=noise=-42dB:d=0.10','-f','null','-'],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
    check(analysis.status===0,`Local silence analysis failed for ${chapter.id}`);
    const silences=parseDetectedSilences(analysis.stderr,clip.duration),matched=matchPunctuationPauses(chapter.narration,clip.duration,silences);
    timings[chapter.id]={method:METHOD,text:chapter.narration,duration:clip.duration,audioSha256:clip.sha256,textSha256:sha256(chapter.narration),anchors:matched.anchors,quality:matched.quality,detectedSilences:silences,limitations:LIMITATIONS};
    summaries.push({id:chapter.id,mission,duration:clip.duration,...matched.quality});
  }
  const info={schema:'abyss-environment-cue-timing/v1',method:METHOD,detector:{tool:'ffmpeg silencedetect',noiseDb:-42,minimumSeconds:.1,minimumMatchedPauseSeconds:.18},limitations:LIMITATIONS};
  if(write){
    const module=`// SPDX-License-Identifier: GPL-3.0-only\n// Generated locally from unchanged MP3 pauses and exact public narration text.\n// Approximate phrase timing, NOT word-level forced alignment.\nconst freezeDeep=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;};\nexport const environmentCueTimingInfo = freezeDeep(${JSON.stringify(info,null,2)});\nexport const environmentCueTiming = freezeDeep(${JSON.stringify(timings,null,2)});\n`;
    const temporary=`${destination}.${process.pid}.tmp`;await writeFile(temporary,module,'utf8');await rename(temporary,destination);
  }
  log(JSON.stringify({written:write,chapters:summaries.length,networkCalls:0,audioFilesModified:0,method:METHOD,limitations:LIMITATIONS,summaries},null,2));
  return {timings,info,summaries};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--dry-run')){console.error('Only --dry-run is supported; no remote service or audio generation is used.');process.exitCode=1;}
  else buildEnvironmentCueTiming({write:!args.includes('--dry-run')}).catch(()=>{console.error('Environment cue timing could not be built. Check local ffmpeg, guide text, hashes and writable output.');process.exitCode=1;});
}
