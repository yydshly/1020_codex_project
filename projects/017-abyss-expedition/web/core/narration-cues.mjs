// SPDX-License-Identifier: GPL-3.0-only
// Pure, reusable text-anchor cue planning. Callers supply media.currentTime;
// this module never schedules a clock, accesses a player, or mutates a scene.

const plans=new WeakSet();
const fail=message=>{throw new TypeError(message);};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const plain=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const nonempty=value=>typeof value==='string'&&value.trim().length>0;

function copyData(value,parents=new Set()){
  if(value===null||typeof value==='string'||typeof value==='boolean'||finite(value))return value;
  if(!Array.isArray(value)&&!plain(value))fail('Cue metadata must contain finite, plain JSON data');
  if(parents.has(value))fail('Cue metadata cannot be cyclic');parents.add(value);
  let result;
  if(Array.isArray(value)){
    if(Reflect.ownKeys(value).length!==value.length+1)fail('Cue arrays must be dense without extra properties');
    result=[];
    for(let i=0;i<value.length;i++){
      const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
      if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('Cue arrays cannot contain holes or accessors');
      result.push(copyData(descriptor.value,parents));
    }
  }else{
    result={};
    for(const key of Reflect.ownKeys(value)){
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('Cue objects require plain enumerable data fields');
      Object.defineProperty(result,key,{value:copyData(descriptor.value,parents),enumerable:true,writable:true,configurable:true});
    }
  }
  parents.delete(value);return result;
}
function freezeDeep(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;}
function checkText(text){if(!nonempty(text)||text.length>100000)fail('Narration text must be a nonempty string of at most 100000 code units');}

/** Cumulative speech/punctuation weights at JavaScript UTF-16 text offsets. */
export function narrationTextWeights(text){
  checkText(text);const weights=[0];let total=0;
  for(let offset=0;offset<text.length;){
    const character=String.fromCodePoint(text.codePointAt(offset)),width=character.length;
    let weight=1;
    if(/\s/u.test(character))weight=.05;
    else if(/[。！？.!?]/u.test(character))weight=2.3;
    else if(/[；;]/u.test(character))weight=1.7;
    else if(/[，,：:]/u.test(character))weight=1.25;
    else if(/[、]/u.test(character))weight=.6;
    else if(/[“”‘’「」『』（）()《》<>—…]/u.test(character))weight=.1;
    else if(/[A-Za-z]/u.test(character))weight=.45;
    else if(/[0-9]/u.test(character))weight=.75;
    for(let index=1;index<=width;index++)weights.push(total+weight*index/width);
    total+=weight;offset+=width;
  }
  return Object.freeze(weights);
}

function timingAnchors(timing,text,duration){
  if(timing===undefined||timing===null)return {
    anchors:[{offset:0,seconds:0},{offset:text.length,seconds:duration}],
    alignment:{method:'weighted-text-estimate',estimated:true,limitations:'Text and punctuation weights only; no acoustic or word-level alignment.'},
  };
  const owned=copyData(timing);
  if(!plain(owned)||owned.text!==text||owned.duration!==duration)fail('Timing must match the exact narration text and audio duration');
  if(!nonempty(owned.method)||!Array.isArray(owned.anchors)||owned.anchors.length<2)fail('Timing requires a method and at least two anchors');
  let previousOffset=-1,previousSeconds=-1;
  for(const anchor of owned.anchors){
    if(!plain(anchor)||!Number.isInteger(anchor.offset)||anchor.offset<0||anchor.offset>text.length||!finite(anchor.seconds)||anchor.seconds<0||anchor.seconds>duration)fail('Timing anchors require bounded integer text offsets and finite seconds');
    if(anchor.offset<=previousOffset||anchor.seconds<=previousSeconds)fail('Timing anchors must increase strictly in both text and time');
    previousOffset=anchor.offset;previousSeconds=anchor.seconds;
  }
  const first=owned.anchors[0],last=owned.anchors.at(-1);
  if(first.offset!==0||first.seconds!==0||last.offset!==text.length||last.seconds!==duration)fail('Timing anchors must cover the full text and clip');
  return {anchors:owned.anchors,alignment:{...owned,anchors:undefined,text:undefined,duration:undefined,estimated:true}};
}

/**
 * compileNarrationCues({text,duration,cues,timing?}) -> frozen plan.
 * Each cue requires id and a unique, exact, nonoverlapping quote in text order.
 * Other finite JSON cue fields are owned and preserved without domain rules.
 * timing.anchors map UTF-16 offsets to clip seconds; intervals between anchors
 * use speech/punctuation-weight interpolation, not word-level forced alignment.
 */
export function compileNarrationCues(options){
  if(!plain(options))fail('Cue planning requires an options object');
  for(const key of Reflect.ownKeys(options)){
    const descriptor=Object.getOwnPropertyDescriptor(options,key);
    if(!['text','duration','cues','timing'].includes(key)||!Object.hasOwn(descriptor,'value'))fail('Cue planning only accepts plain text, duration, cues and timing fields');
  }
  const {text,duration}=options;checkText(text);
  if(!finite(duration)||duration<=0||duration>86400)fail('Cue duration must be a positive finite number of seconds, at most one day');
  const cues=copyData(options.cues);
  if(!Array.isArray(cues)||!cues.length)fail('At least one cue is required');
  const {anchors,alignment}=timingAnchors(options.timing,text,duration),weights=narrationTextWeights(text);
  const secondsAt=offset=>{
    if(offset===text.length)return duration;
    let index=0;while(index<anchors.length-2&&offset>=anchors[index+1].offset)index++;
    const a=anchors[index],b=anchors[index+1],span=weights[b.offset]-weights[a.offset];
    return a.seconds+(b.seconds-a.seconds)*(weights[offset]-weights[a.offset])/span;
  };
  const ids=new Set();let previousEnd=0,previousStart=-1;
  for(const cue of cues){
    if(!plain(cue)||!nonempty(cue.id)||cue.id!==cue.id.trim()||!nonempty(cue.quote))fail('Every cue requires a stable id and nonempty exact quote');
    if(ids.has(cue.id))fail('Cue IDs must be unique');ids.add(cue.id);
    const start=text.indexOf(cue.quote);
    if(start<0||text.indexOf(cue.quote,start+1)>=0)fail('Every cue quote must occur exactly once in the narration');
    const end=start+cue.quote.length;
    if(start<previousEnd)fail('Cue quotes must be nonoverlapping and follow narration order');
    cue.quoteStart=start;cue.quoteEnd=end;cue.start=secondsAt(start);cue.quoteEndTime=secondsAt(end);
    if(cue.start<=previousStart||!finite(cue.start)||!finite(cue.quoteEndTime)||cue.start>=duration)fail('Cue start times must increase within the clip');
    previousEnd=end;previousStart=cue.start;
  }
  for(let index=0;index<cues.length;index++)cues[index].end=cues[index+1]?.start??duration;
  // Remove undefined fields after taking an owned copy of useful timing metadata.
  const cleanAlignment=Object.fromEntries(Object.entries(alignment).filter(([,value])=>value!==undefined));
  const plan=freezeDeep({text,duration,cues,anchors,alignment:cleanAlignment});plans.add(plan);return plan;
}

/** Stateless media-time lookup: same time gives the same cue after pause/seek. */
export function getNarrationCue(plan,seconds){
  if(!plans.has(plan))fail('getNarrationCue requires a compiled plan');
  if(!finite(seconds)||seconds<0||seconds>plan.duration)fail('Cue time must be finite and within the audio duration');
  if(seconds<plan.cues[0].start)return null;
  let low=0,high=plan.cues.length;
  while(low+1<high){const middle=Math.floor((low+high)/2);if(plan.cues[middle].start<=seconds)low=middle;else high=middle;}
  const cue=plan.cues[low],elapsed=seconds-cue.start;
  return Object.freeze({cue,index:low,start:cue.start,end:cue.end,elapsed,progress:Math.min(1,elapsed/(cue.end-cue.start)),seconds});
}
