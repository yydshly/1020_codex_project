// SPDX-License-Identifier: GPL-3.0-only
// Exact lesson phrases, real unchanged MP3 hashes, and shared clock boundaries.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getDirectorShots} from '../web/data/director-shots.mjs';
import {narrationManifest} from '../web/assets/narration/manifest.mjs';
import {directorLessonCues} from '../web/data/director-lesson-cues.mjs';
import {directorLessonTiming,directorLessonTimingInfo} from '../web/data/director-lesson-timing.mjs';
import {lessonStages} from '../web/data/learning-content.mjs';
import {compileDirectorLesson,getDirectorLessonCue} from '../web/rendering/director-lesson-timeline.mjs';
import {sha256} from './minimax-tts.mjs';
let chapters=0,cues=0,anchors=0;const summary=[];
for(const mission of ['vents','canyon'])for(const original of getDirectorShots(mission)){
  const clip=narrationManifest.clips[original.id],shot={...original,audio:clip};
  if(!shot.explanation){assert.equal(getDirectorLessonCue(shot,0),null);continue;}
  const plan=compileDirectorLesson(shot),definitions=directorLessonCues[shot.id],timing=directorLessonTiming[shot.id];
  assert.ok(plan&&definitions?.length&&timing,`Missing lesson plan for ${shot.id}`);assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.cues));
  assert.equal(timing.text,shot.narration);assert.equal(timing.duration,clip.duration);assert.equal(timing.audioSha256,clip.sha256);assert.equal(timing.textSha256,sha256(shot.narration));
  const bytes=await readFile(new URL('../web/'+clip.file,import.meta.url));assert.equal(sha256(bytes),clip.sha256);assert.equal(bytes.length,clip.bytes);
  assert.equal(plan.cues[0].start,0,'Opening explanation must have a corresponding model step');
  const count=lessonStages[shot.explanation].steps.length;
  for(let index=0;index<plan.cues.length;index++){
    const cue=plan.cues[index];assert.ok(Number.isInteger(cue.step)&&cue.step>=0&&cue.step<count);
    assert.equal(shot.narration.slice(cue.quoteStart,cue.quoteEnd),cue.quote);assert.equal(shot.narration.indexOf(cue.quote,cue.quoteStart+1),-1);
    assert.ok(cue.start<cue.end&&cue.end<=clip.duration);
    const at=getDirectorLessonCue(shot,cue.start),middle=getDirectorLessonCue(shot,(cue.start+cue.end)*.5),beforeEnd=getDirectorLessonCue(shot,cue.end-1e-7);
    assert.equal(at.step,cue.step);assert.equal(at.progress,0);assert.equal(middle.step,cue.step);assert.ok(Math.abs(middle.progress-.5)<1e-10);assert.equal(beforeEnd.step,cue.step);
    // Repeat, advance, and seek backward: there is no internal player clock.
    getDirectorLessonCue(shot,clip.duration);assert.deepEqual(getDirectorLessonCue(shot,(cue.start+cue.end)*.5),middle);
    assert.ok(Object.isFrozen(at));cues++;
  }
  assert.equal(getDirectorLessonCue(shot,clip.duration+4).step,plan.cues.at(-1).step,'The final visual beat must retain the last spoken step');
  for(const anchor of timing.anchors)if(anchor.source==='detected-pause-end')assert.ok(timing.detectedSilences.some(p=>Math.abs(p.end-anchor.seconds)<1e-6),'Acoustic anchor must trace to an actual measured pause');
  assert.throws(()=>getDirectorLessonCue(shot,NaN));assert.throws(()=>compileDirectorLesson({...shot,narration:shot.narration+'x'}));
  anchors+=timing.anchors.length;chapters++;summary.push({id:shot.id,steps:plan.cues.map(c=>({step:c.step,start:Number(c.start.toFixed(3))}))});
}
assert.equal(chapters,10);assert.equal(Object.keys(directorLessonCues).length,chapters);assert.equal(Object.keys(directorLessonTiming).length,chapters);
const equipment={...getDirectorShots('vents')[1],audio:narrationManifest.clips['vents-equipment']};
assert.equal(getDirectorLessonCue(equipment,0).step,7,'The opening sentence is about people on the ship, before camera and lamps are mentioned');
assert.equal(getDirectorLessonCue(equipment,9.5).step,1,'The sonar phrase must not use the old equal-duration equipment step');
assert.equal(getDirectorLessonCue(equipment,30).step,6,'The sampling bottle phrase must highlight bottles');
assert.equal(getDirectorLessonCue(equipment,38).step,7,'The winch phrase must highlight the ship/control group');
const fluid={...getDirectorShots('vents').find(s=>s.id==='vents-fluid'),audio:narrationManifest.clips['vents-fluid']};
assert.equal(getDirectorLessonCue(fluid,fluid.audio.duration).step,3,'Do not advance to mineral mixing before that process is narrated in the next chapter');

// Run the actual UI sync function in a minimal state harness. A paused manual
// equipment selection must survive an ordinary refresh, but an explicit seek
// in the same chapter must relinquish that override to the spoken timeline.
const learningSource=await readFile(new URL('../web/learning-ui.js',import.meta.url),'utf8'),syncStart=learningSource.indexOf('  function sync('),syncEnd=learningSource.indexOf('\n  renderReference();',syncStart);
assert.ok(syncStart>=0&&syncEnd>syncStart);
const runSync=new Function('getDirectorLessonCue','lessonStages',`return function(next,type,selected=6,runningSample=false){
  let state=null,manualStep=selected,manualSummaryTab=true,lastShot=next.shot.id,activeRole=null,activeEntity=null,samplingFrame=runningSample?1:0,summaryTab='known';
  const events=[],controls=new Map(),session={getState:()=>({samples:{}})},panel={};let shown=null;
  const $=id=>{if(!controls.has(id))controls.set(id,{hidden:false,querySelectorAll:()=>[]});return controls.get(id);};
  const cancelEquipment=()=>events.push('cancel-equipment'),cancelSampling=()=>{events.push('cancel-sampling');samplingFrame=0;},scene={setLearningStep:value=>events.push(['step',value])};
  const updateStep=index=>{shown=index;};
  ${learningSource.slice(syncStart,syncEnd)}
  sync(next,{type});return {manualStep,manualSummaryTab,shown,events,autoHidden:$('learning-auto').hidden,samplingFrame};
};`)(getDirectorLessonCue,lessonStages);
const paused={active:true,playing:false,elapsed:35,shotElapsed:9.5,shotProgress:9.5/equipment.audio.duration,shot:equipment};
for(const action of ['TICK','PAUSE']){const result=runSync(paused,action);assert.equal(result.manualStep,6);assert.equal(result.shown,6);assert.deepEqual(result.events,[],'A paused manual choice is not a timeline discontinuity');}
for(const action of ['ENTER','SEEK','SEEK_SHOT','NEXT','PREVIOUS']){const result=runSync(paused,action);assert.equal(result.manualStep,null);assert.equal(result.shown,1);assert.ok(result.autoHidden);assert.equal(result.manualSummaryTab,false);assert.ok(result.events.some(e=>Array.isArray(e)&&e[0]==='step'&&e[1]===null));assert.ok(result.events.includes('cancel-equipment'));assert.ok(result.events.includes('cancel-sampling'));}
const resumed=runSync({...paused,playing:true},'PLAY',6,true);assert.equal(resumed.manualStep,null);assert.equal(resumed.shown,1);assert.equal(resumed.samplingFrame,0,'Resuming speech cancels a paused standalone sampling animation');

// Exercise the actual caption adapter with a small DOM stand-in: retain every
// word, highlight the same phrase as the model, and do no per-frame DOM rebuild.
const directorSource=await readFile(new URL('../web/director-ui.js',import.meta.url),'utf8'),captionStart=directorSource.indexOf('  function updateNarration('),captionEnd=directorSource.indexOf('\n  function render(',captionStart);
assert.ok(captionStart>=0&&captionEnd>captionStart);
const textNode=text=>({textContent:text}),caption={children:[],writes:0,replaceChildren(...items){this.children=items;this.writes++;},set textContent(text){this.replaceChildren(textNode(text));},get textContent(){return this.children.map(item=>item.textContent).join('');}};
const renderCaption=new Function('getDirectorLessonCue','document','caption',`let narrationText=null,narrationQuote=null;const $=()=>caption;${directorSource.slice(captionStart,captionEnd)}return updateNarration;`)(getDirectorLessonCue,{createElement:tag=>({tagName:tag.toUpperCase(),textContent:''}),createTextNode:textNode},caption);
renderCaption(paused);assert.equal(caption.textContent,equipment.narration);assert.equal(caption.children[1].tagName,'MARK');assert.equal(caption.children[1].textContent,getDirectorLessonCue(equipment,9.5).quote);
const firstWrite=caption.writes;renderCaption({...paused,shotElapsed:9.6});assert.equal(caption.writes,firstWrite,'An ordinary frame inside a phrase must not rebuild caption DOM');
renderCaption({...paused,shotElapsed:6});assert.equal(caption.writes,firstWrite+1);assert.equal(caption.children[1].textContent,getDirectorLessonCue(equipment,6).quote);assert.equal(caption.textContent,equipment.narration);
const mission=getDirectorShots('vents')[0];renderCaption({...paused,shot:mission,shotElapsed:0});assert.equal(caption.textContent,mission.narration);assert.equal(caption.children.length,1,'A chapter without lesson cues retains its full unmarked narration');

// Site depths are authored metadata. A compressed world-space height is not a
// measurement in metres and must not masquerade as the sampling station depth.
const environmentStart=directorSource.indexOf('  function updateEnvironment('),environmentEnd=directorSource.indexOf('\n  function updateNarration(',environmentStart);assert.ok(environmentStart>=0&&environmentEnd>environmentStart);
const hudNodes=new Map(),hudNode=id=>{if(!hudNodes.has(id))hudNodes.set(id,{textContent:'',hidden:false,style:{},dataset:{},querySelector:selector=>hudNode(id+selector)});return hudNodes.get(id);};
let environment={vehicle:{phase:'seabed',depth:2192,baseDepth:2750,clearance:21.2},diagram:false};
const canyonData=JSON.parse(await readFile(new URL('../web/data/canyon.json',import.meta.url),'utf8')),missionEntities=new Map(canyonData.entities.map(entity=>[entity.id,entity]));
const updateHud=new Function('scene','$','missionEntities',`${directorSource.slice(environmentStart,environmentEnd)}return updateEnvironment;`)({getEnvironmentState:()=>environment},hudNode,missionEntities);
const bShot=getDirectorShots('canyon').find(shot=>shot.id==='canyon-channel');updateHud({shot:bShot,shotProgress:.45});assert.equal(hudNode('director-depth').textContent,'2,850 m');assert.equal(hudNode('director-water-column.depth-estimate').textContent,'站点设计水深 · 非实测');assert.ok(hudNode('director-water-column.water-column-track').hidden);assert.match(hudNode('director-model-clearance').textContent,/21\.2.*场景单位/);assert.ok(!hudNode('director-model-clearance').textContent.includes(' m'));
environment={...environment,vehicle:{...environment.vehicle,phase:'descent'}};updateHud({shot:getDirectorShots('canyon')[0],shotProgress:.55});assert.equal(hudNode('director-depth').textContent,'50%');assert.match(hudNode('director-water-column.depth-estimate').textContent,/下潜进度/);assert.ok(!hudNode('director-water-column.water-column-track').hidden);
updateHud({shot:getDirectorShots('canyon').at(-1),shotProgress:.8});assert.equal(hudNode('director-depth').textContent,'80%');assert.match(hudNode('director-water-column.depth-estimate').textContent,/返航进度/);assert.equal(hudNode('director-depth-marker').style.top,'20%');assert.ok(hudNode('director-model-clearance').hidden);
environment={...environment,diagram:true};updateHud({shot:bShot,shotProgress:.45});assert.ok(hudNode('director-water-column').hidden,'An independent explanatory model has no ocean-depth HUD');

// A device list scrolls inside its own body while its explanation stays fixed.
// Model desktop vertical choices and phone horizontal chips using real helper.
const revealStart=learningSource.indexOf('  function revealSelectedStep('),revealEnd=learningSource.indexOf('\n  function roleShot(',revealStart);assert.ok(revealStart>=0&&revealEnd>revealStart);
const reveal=new Function('item','choices','body',`const $=()=>choices;${learningSource.slice(revealStart,revealEnd)}return revealSelectedStep;`);
const region=bounds=>({scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>bounds});
const desktopItem={getBoundingClientRect:()=>({left:10,right:220,top:350,bottom:380})},desktopList=region({left:0,right:236,top:180,bottom:500}),desktopBody=region({left:0,right:236,top:180,bottom:280});desktopList.querySelector=()=>desktopItem;
reveal(desktopItem,desktopList,desktopBody)();assert.equal(desktopBody.scrollTop,100);assert.equal(desktopList.scrollLeft,0);
const phoneItem={getBoundingClientRect:()=>({left:450,right:570,top:105,bottom:131})},phoneList=region({left:0,right:330,top:105,bottom:131}),phoneBody=region({left:0,right:330,top:100,bottom:140});phoneList.querySelector=()=>phoneItem;
reveal(phoneItem,phoneList,phoneBody)();assert.equal(phoneList.scrollLeft,240);assert.equal(phoneBody.scrollTop,0);
console.log(JSON.stringify({passed:true,chapters,cues,acousticAnchors:anchors,audioFilesModified:0,networkCalls:0,method:directorLessonTimingInfo.method,sharedUiAndModelLookup:true,manualExplorationStillAvailable:true,sameChapterSeekClearsManualOverride:true,pausedManualChoicePreserved:true,currentPhraseHighlight:true,captionDomStableWithinPhrase:true,independentStepListScroll:true,siteDepthSeparateFromModelCoordinates:true,transitProgressHasNoFalseMetres:true,summary}));
