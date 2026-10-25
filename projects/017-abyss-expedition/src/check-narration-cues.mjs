// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {compileNarrationCues,getNarrationCue,narrationTextWeights} from '../web/core/narration-cues.mjs';
import {parseDetectedSilences,matchPunctuationPauses} from './build-environment-cue-timing.mjs';
import {environmentGuides} from '../web/data/environment-guide.mjs';
import {environmentCueTracks} from '../web/data/environment-cue-tracks.mjs';
import {environmentCueTiming,environmentCueTimingInfo} from '../web/data/environment-cue-timing.mjs';
import {environmentNarrationManifest} from '../web/assets/environment-narration/manifest.mjs';
import {sha256} from './minimax-tts.mjs';

const text='先看岩壁。水流沿着谷底前行。颗粒缓缓下沉。';
const first=text.indexOf('水流'),second=text.indexOf('颗粒');
const cues=[{id:'wall',quote:'先看岩壁',kind:'wall',targetIds:['wall-a'],label:'岩壁',detail:'观察陡壁'},{id:'flow',quote:'水流沿着谷底前行',kind:'flow',targetIds:['channel-a']},{id:'snow',quote:'颗粒缓缓下沉',kind:'particles',parameters:{color:[1,.5,0]}}];
const timing={method:'silence-assisted-text-estimate/v1',text,duration:12,anchors:[{offset:0,seconds:0},{offset:first,seconds:6},{offset:second,seconds:9},{offset:text.length,seconds:12}],quality:{matchedPauses:2},limitations:'Fixture timings only; approximate within intervals.'};
const input={text,duration:12,cues,timing},plan=compileNarrationCues(input);
assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.cues)&&Object.isFrozen(plan.cues[0])&&Object.isFrozen(plan.cues[0].targetIds)&&Object.isFrozen(plan.anchors)&&Object.isFrozen(plan.anchors[0])&&Object.isFrozen(plan.alignment.quality));
assert.throws(()=>{plan.cues[0].targetIds.push('bad');},TypeError);
assert.equal(plan.cues[1].start,6);assert.equal(plan.cues[0].end,6);assert.equal(plan.cues[2].start,9);assert.equal(plan.cues.at(-1).end,12);
assert.equal(getNarrationCue(plan,0).cue.id,'wall');assert.equal(getNarrationCue(plan,5.999).cue.id,'wall');assert.equal(getNarrationCue(plan,6).cue.id,'flow');assert.equal(getNarrationCue(plan,9).cue.id,'snow');assert.equal(getNarrationCue(plan,12).progress,1);
assert.ok(Object.isFrozen(getNarrationCue(plan,6)));
const paused=getNarrationCue(plan,5.5);for(let i=0;i<100;i++)assert.deepEqual(getNarrationCue(plan,5.5),paused,'A long wall-clock pause must not advance a cue');
getNarrationCue(plan,11.9);getNarrationCue(plan,6);assert.deepEqual(getNarrationCue(plan,5.5),paused,'Backward seeks recompute from media time rather than retaining a later cue');
cues[0].targetIds.push('mutated');cues[0].quote='changed';timing.anchors[1].seconds=1;timing.quality.matchedPauses=99;
assert.equal(plan.cues[0].quote,'先看岩壁');assert.deepEqual(plan.cues[0].targetIds,['wall-a']);assert.equal(plan.cues[1].start,6);assert.equal(plan.alignment.quality.matchedPauses,2);
const delayed=compileNarrationCues({text:'片头说明。接着看目标。',duration:10,cues:[{id:'target',quote:'接着看目标'}]});assert.equal(getNarrationCue(delayed,0),null);assert.equal(getNarrationCue(delayed,delayed.cues[0].start).cue.id,'target');assert.equal(delayed.alignment.method,'weighted-text-estimate');assert.equal(delayed.alignment.estimated,true);
const fixture=()=>({text:'岩壁很高。水流前行。',duration:10,cues:[{id:'wall',quote:'岩壁很高'},{id:'flow',quote:'水流前行'}]});
for(const invalid of [NaN,Infinity,-Infinity,-.1,12.1,'6',null])assert.throws(()=>getNarrationCue(plan,invalid),TypeError);
for(const invalid of [null,{},JSON.parse(JSON.stringify(plan))])assert.throws(()=>getNarrationCue(invalid,0),TypeError);
for(const invalid of [
  null,{}, {...fixture(),text:''},{...fixture(),duration:0},{...fixture(),duration:NaN},{...fixture(),duration:Infinity},{...fixture(),cues:[]},
  {...fixture(),cues:[{id:'a',quote:'没有这个短语'}]},
  {...fixture(),text:'重复。重复。',cues:[{id:'a',quote:'重复'}]},
  {...fixture(),cues:[{id:'a',quote:'水流前行'},{id:'b',quote:'岩壁很高'}]},
  {...fixture(),cues:[{id:'same',quote:'岩壁很高'},{id:'same',quote:'水流前行'}]},
  {...fixture(),cues:[{id:'a',quote:'岩壁很高'},{id:'b',quote:'很高'}]},
  {...fixture(),cues:[{id:'a',quote:'岩壁很高',bad:()=>{}}]},
  {...fixture(),cues:[{id:'a',quote:'岩壁很高',bad:NaN}]},
])assert.throws(()=>compileNarrationCues(invalid),TypeError);
const withTiming=(patch={})=>{const base=fixture();return {...base,timing:{method:'fixture',text:base.text,duration:base.duration,anchors:[{offset:0,seconds:0},{offset:base.text.indexOf('水流'),seconds:5},{offset:base.text.length,seconds:10}],...patch}};};
for(const patch of [{text:'mismatch'},{duration:11},{method:''},{anchors:[]},{anchors:[{offset:0,seconds:0},{offset:0,seconds:10}]},{anchors:[{offset:0,seconds:0},{offset:5,seconds:NaN},{offset:11,seconds:10}]},{anchors:[{offset:1,seconds:0},{offset:11,seconds:10}]},{anchors:[{offset:0,seconds:0},{offset:11,seconds:11}]},{anchors:[{offset:0,seconds:0},{offset:4,seconds:8},{offset:8,seconds:7},{offset:11,seconds:10}]}])assert.throws(()=>compileNarrationCues(withTiming(patch)),TypeError);
const getter=fixture();Object.defineProperty(getter.cues[0],'bad',{get(){throw new Error('Accessor must not run');},enumerable:true});assert.throws(()=>compileNarrationCues(getter),TypeError);
const cycle=fixture();cycle.cues[0].cycle=cycle;assert.throws(()=>compileNarrationCues(cycle),TypeError);
const sparse=fixture();sparse.cues.length=3;assert.throws(()=>compileNarrationCues(sparse),TypeError);
assert.equal(getNarrationCue(plan,6).cue.id,'flow','Rejected calls must not damage an earlier compiled plan');
const unicodeWeights=narrationTextWeights('看🌊。 A');assert.equal(unicodeWeights.length,'看🌊。 A'.length+1);assert.ok(unicodeWeights.every((value,index,array)=>index===0||value>array[index-1]));assert.ok(Object.isFrozen(unicodeWeights));
const warehouse=compileNarrationCues({text:'Inspect rack A. Check aisle B.',duration:8,cues:[{id:'rack',quote:'rack A',kind:'inspection',targetIds:['rack']},{id:'aisle',quote:'aisle B',kind:'navigation'}]});assert.equal(getNarrationCue(warehouse,warehouse.cues[1].start).cue.id,'aisle');

// Acoustic parsing and sequence matching tolerate extra/missing pauses without
// assigning words to arbitrary low-energy fragments or relying on a player.
const parsed=parseDetectedSilences('silence_start: 0\nsilence_end: 0.2 | silence_duration: 0.2\nsilence_start: 3.5\nsilence_end: 4\nsilence_start: 9.5',10);
assert.deepEqual(parsed,[{start:0,end:.2,duration:.2},{start:3.5,end:4,duration:.5},{start:9.5,end:10,duration:.5}]);
const acoustic=matchPunctuationPauses('看岩壁。看水流。',10,parsed);assert.ok(acoustic.quality.matchedPauses>=1);assert.equal(acoustic.anchors[0].seconds,0);assert.equal(acoustic.anchors.at(-1).seconds,10);
const noPauses=matchPunctuationPauses('只有连续一句话',5,[]);assert.equal(noPauses.quality.matchedPauses,0);assert.equal(noPauses.quality.maxUnanchoredSeconds,5);
assert.throws(()=>matchPunctuationPauses('示例。',5,[{start:2,end:4},{start:3,end:4.5}]),TypeError);

// Validate every authored cue against exact narration and real frozen audio.
assert.equal(environmentCueTimingInfo.method,'silence-assisted-text-estimate/v1');
let totalCues=0,totalPauseAnchors=0,maxUnanchored=0;const realPlans=[];
for(const guide of Object.values(environmentGuides))for(const chapter of guide.chapters){
  const clip=environmentNarrationManifest.clips[chapter.id],track=environmentCueTracks[chapter.id],matched=environmentCueTiming[chapter.id];
  assert.ok(track&&matched,`Every chapter needs cue and timing data: ${chapter.id}`);
  assert.equal(matched.text,chapter.narration);assert.equal(matched.duration,clip.duration);assert.equal(matched.audioSha256,clip.sha256);assert.equal(matched.textSha256,sha256(chapter.narration));
  const audio=await readFile(fileURLToPath(new URL(`../web/${clip.file}`,import.meta.url)));assert.equal(sha256(audio),matched.audioSha256,'Existing audio remains unchanged');
  const actual=compileNarrationCues({text:chapter.narration,duration:clip.duration,cues:track,timing:matched});
  assert.equal(actual.alignment.estimated,true);
  for(let index=0;index<actual.cues.length;index++){
    const cue=actual.cues[index];assert.equal(getNarrationCue(actual,cue.start).index,index);assert.equal(cue.end,index===actual.cues.length-1?clip.duration:actual.cues[index+1].start);assert.ok(cue.start<cue.end&&cue.quoteEndTime<=clip.duration);
    const inside=(cue.start+cue.end)/2;assert.equal(getNarrationCue(actual,inside).cue.id,cue.id);
    getNarrationCue(actual,clip.duration);assert.equal(getNarrationCue(actual,cue.start).cue.id,cue.id,'Seeking back to any cue must be deterministic');
  }
  assert.equal(getNarrationCue(actual,clip.duration).progress,1);
  for(const anchor of matched.anchors.filter(item=>item.source==='detected-pause-end'))assert.ok(matched.detectedSilences.some(silence=>silence.end===anchor.seconds),'Every matched acoustic anchor must come from the measured MP3');
  totalCues+=actual.cues.length;totalPauseAnchors+=matched.quality.matchedPauses;maxUnanchored=Math.max(maxUnanchored,matched.quality.maxUnanchoredSeconds);
  realPlans.push({id:chapter.id,cues:actual.cues.map(cue=>({id:cue.id,start:Number(cue.start.toFixed(3)),end:Number(cue.end.toFixed(3))}))});
}
assert.equal(Object.keys(environmentCueTiming).length,realPlans.length);assert.equal(Object.keys(environmentCueTracks).length,realPlans.length);
console.log(JSON.stringify({passed:true,chapters:realPlans.length,cues:totalCues,measuredPauseAnchors:totalPauseAnchors,maxUnanchoredSeconds:maxUnanchored,networkCalls:0,audioFilesModified:0,precision:'Acoustic pause timestamps plus heuristic punctuation association and intra-phrase interpolation; no guaranteed word-level error bound.',checks:['exact unique ordered nonoverlapping quote anchors','frozen owned plans and domain-independent metadata','boundary, completion, long pause and backward seek lookup','malformed timing/input rejection without changing prior plans','UTF-16 offsets and non-ocean fixture','offline silence parsing and monotonic pause matching','all authored cues match current text, duration and audio SHA','all acoustic anchors trace to measured pauses'],plans:realPlans},null,2));
