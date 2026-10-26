import * as THREE from 'three';

const DURATION=25;
const KEYFRAMES=[
 {t:0,p:[-11.7,2.45,13.7],target:[7.3,1.7,-4.7],fov:52},
 {t:6,p:[-9.35,3.06,11.8],target:[8.3,2.9,3.1],fov:52},
 {t:12,p:[-8.7,2.8,11.2],target:[10.9,2,6.4],fov:52},
 {t:18,p:[4.8,1.8,5.1],target:[10.9,2,6.4],fov:48},
 {t:25,p:[4.65,1.35,9.8],target:[.95,.075,5.3],fov:50}
];
const PHASES=[
 {t:0,key:'window',chapter:'01 / 窗边',title:'雨停以后，记得打开窗。',description:'有些故事，从每天看见的地方开始。'},
 {t:6,key:'threshold',chapter:'02 / 窗外',title:'窗外的光，仍在流动。',description:'沿着水面，走向对岸留下的那盏灯。'},
 {t:12,key:'shop',chapter:'03 / 灯下',title:'有人还在等一封信。',description:'书页、旧木与暖光，都留在这条河岸。'},
 {t:18,key:'letter',chapter:'04 / 来信',title:'它没有写地址。',description:'水把一封信送到身边。下一段旅程，由你决定。'}
];

// Elapsed time is measured against a monotonic clock, rather than counting
// frames. Pausing stores the exact elapsed seconds and removes paused time.
export function createTour({camera,controls,onCaption=()=>{}}){
 const state={playing:false,elapsed:0,duration:DURATION,phase:'window',ended:false};
 let anchor=0,lastCaption=null,resumeAt=0,pendingEndpoint=false;
 const resumePosition=new THREE.Vector3(),resumeTarget=new THREE.Vector3(),position=new THREE.Vector3(),target=new THREE.Vector3();
 function advance(now=performance.now()){
  if(state.playing){state.elapsed=THREE.MathUtils.clamp((now-anchor)/1000,0,DURATION);if(state.elapsed>=DURATION){state.ended=true;state.playing=false;pendingEndpoint=true;controls.enableDamping=true;}}
  const phase=[...PHASES].reverse().find(p=>state.elapsed>=p.t)||PHASES[0];state.phase=phase.key;return phase;
 }
 function apply(now=performance.now(),force=false){
  const wasPlaying=state.playing,phase=advance(now);if(!wasPlaying&&!force&&!pendingEndpoint)return;
  let a=KEYFRAMES[0],b=KEYFRAMES[1];for(let i=0;i<KEYFRAMES.length-1;i++)if(state.elapsed>=KEYFRAMES[i].t){a=KEYFRAMES[i];b=KEYFRAMES[i+1];}
  const raw=THREE.MathUtils.clamp((state.elapsed-a.t)/(b.t-a.t),0,1),s=raw*raw*(3-2*raw);
  position.fromArray(a.p).lerp(new THREE.Vector3(...b.p),s);target.fromArray(a.target).lerp(new THREE.Vector3(...b.target),s);
  const resume=THREE.MathUtils.clamp((now-resumeAt)/700,0,1),ease=resume*resume*(3-2*resume);
  camera.position.lerpVectors(resumePosition,position,ease);controls.target.lerpVectors(resumeTarget,target,ease);
  camera.fov=THREE.MathUtils.lerp(a.fov,b.fov,s);camera.updateProjectionMatrix();
  pendingEndpoint=false;
  if(lastCaption!==phase.key){lastCaption=phase.key;onCaption(phase);}
 }
 function play(){if(state.ended)return restart();const now=performance.now();anchor=now-state.elapsed*1000;resumeAt=now;resumePosition.copy(camera.position);resumeTarget.copy(controls.target);state.playing=true;state.ended=false;controls.enableDamping=false;return getState();}
 function pause(value=true){if(!value)return play();advance();state.playing=false;pendingEndpoint=false;controls.enableDamping=true;return getState();}
 function restart({play:autoplay=true}={}){state.playing=false;state.elapsed=0;state.ended=false;lastCaption=null;resumeAt=performance.now()-1000;resumePosition.fromArray(KEYFRAMES[0].p);resumeTarget.fromArray(KEYFRAMES[0].target);apply(performance.now(),true);controls.update();if(autoplay)play();return getState();}
 function seek(seconds,{play:autoplay=false}={}){if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw new Error('Tour time must be within 0–25 seconds');state.playing=false;state.elapsed=seconds;state.ended=seconds===DURATION;lastCaption=null;resumeAt=performance.now()-1000;resumePosition.copy(camera.position);resumeTarget.copy(controls.target);apply(performance.now(),true);controls.update();if(autoplay&&seconds<DURATION)play();return getState();}
 function getState(){advance();return {...state};}
 return {play,pause,restart,seek,update:apply,getState};
}
