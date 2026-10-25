// SPDX-License-Identifier: GPL-3.0-only
// Domain adapter over the existing stateless phrase-cue core.
import {compileNarrationCues,getNarrationCue} from '../core/narration-cues.mjs';
import {directorLessonCues} from '../data/director-lesson-cues.mjs?v=1';
import {directorLessonTiming} from '../data/director-lesson-timing.mjs?v=1';
const plans=new Map();
export function compileDirectorLesson(shot){
  const cues=directorLessonCues[shot?.id];if(!cues)return null;
  const timing=directorLessonTiming[shot.id],duration=shot.audio?.duration??timing?.duration;
  if(!timing||timing.text!==shot.narration||timing.duration!==duration)throw new TypeError('Director lesson timing must match the exact narration and audio');
  const cached=plans.get(shot.id);if(cached&&cached.text===shot.narration&&cached.duration===duration)return cached;
  const plan=compileNarrationCues({text:shot.narration,duration,cues,timing});plans.set(shot.id,plan);return plan;
}
export function getDirectorLessonCue(shot,seconds){
  const plan=compileDirectorLesson(shot);if(!plan)return null;
  if(!Number.isFinite(seconds))throw new TypeError('Director lesson time must be finite');
  const selected=getNarrationCue(plan,Math.max(0,Math.min(plan.duration,seconds)));
  return selected?Object.freeze({step:selected.cue.step,progress:selected.progress,quote:selected.cue.quote,start:selected.start,end:selected.end,estimated:true}):null;
}
