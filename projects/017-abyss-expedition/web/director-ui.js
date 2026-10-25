// SPDX-License-Identifier: GPL-3.0-only
// Browser adapter for the reusable shot clock. No personal records are changed.
import {createDirector} from './core/director-core.mjs';
import {getDirectorShots,directorMissionBriefs} from './data/director-shots.mjs?v=4';
import {narrationManifest} from './assets/narration/manifest.mjs?v=4';
import {createNarrationPlayer,createNarrationAssetCache} from './rendering/narration-player.mjs?v=5';
import {createLearningExperience} from './learning-ui.js?v=10';
import {getDirectorLessonCue} from './rendering/director-lesson-timeline.mjs?v=1';

const $=id=>document.getElementById(id);
const frameNames={establishing:'全景交代',approach:'靠近跟拍',orbit:'环绕观察',detail:'局部特写',compare:'对照观察',departure:'拉远返航'};
const timeLabel=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;

export function createDirectorExperience({scene,onEnter=()=>{},onShot=()=>{},onExit=()=>{},onState=()=>{}}){
  let clock=null,unsubscribe=null,frameId=0,stamp=0,previousShot='',rate=1,destroyed=false,mediaSynchronizing=false,narrationText=null,narrationQuote=null;
  const audioAssets=createNarrationAssetCache();
  const narrator=createNarrationPlayer({audio:$('director-audio'),resolveSource:audioAssets.resolve,onStatus:({kind,text})=>{$('director-audio-status').textContent=text;$('director-audio-status').dataset.kind=kind;$('director-audio-retry').hidden=!['error','blocked'].includes(kind);},onBlocked:()=>{if(clock?.getView().playing)clock.pause();}});
  const framingOverrides=new Map(),listeners=[];let missionEntities=new Map();
  const learning=createLearningExperience({scene,onPause:()=>clock?.pause(),onPlay:()=>clock?.play(),onSeek:index=>{clock?.pause();clock?.seekShot(index);},onOpenEquipment:()=>{const index=view()?.shots.findIndex(shot=>shot.explanation==='equipment');if(index>=0){if(!view().active)start({index,playing:false});else{clock.pause();clock.seekShot(index);}}}});
  const listen=(element,type,handler)=>{element.addEventListener(type,handler);listeners.push(()=>element.removeEventListener(type,handler));};
  const view=()=>clock?.getView()||null;
  function cancelLoop(){if(frameId)cancelAnimationFrame(frameId);frameId=0;stamp=0;}
  function ensureLoop(state){
    if(!state.active||!state.playing){cancelLoop();return;}
    if(!frameId)frameId=requestAnimationFrame(step);
  }
  function step(now){
    frameId=0;if(destroyed||!view()?.playing||!view()?.active)return;
    const delta=stamp?Math.min(.1,(now-stamp)/1000):0;stamp=now;
    const state=view(),advance=narrator.advance(state,delta*rate);
    if(advance>.24){mediaSynchronizing=true;try{clock.seek(Math.min(state.duration,state.elapsed+advance));}finally{mediaSynchronizing=false;}}
    else clock.tick(advance);
    if(view()?.playing&&!frameId)frameId=requestAnimationFrame(step);
  }
  function applyFrame(state,{jump=false}={}){
    const framing=framingOverrides.get(state.shot.id)||state.shot.framing;
    const lesson=getDirectorLessonCue(state.shot,state.shotElapsed);
    scene.setDirectorFrame?.({...state.shot,shotId:state.shot.id,framing,motionFraming:state.shot.framing,progress:state.shotProgress,duration:state.shot.duration,playing:state.playing,elapsed:state.elapsed,shotElapsed:state.shotElapsed,lessonStep:lesson?.step,lessonProgress:lesson?.progress,jump});
    const explanatory=state.shot.explanation&&state.shot.explanation!=='summary';$('director-framing-name').textContent=explanatory?'原理动画':frameNames[framing]||framing;$('director-framing').disabled=Boolean(explanatory);
  }
  function updateEnvironment(state){
    const environment=scene.getEnvironmentState?.();if(!environment)return;
    const vehicle=environment.vehicle||environment,departing=state.shot.framing==='departure',establishing=state.shot.framing==='establishing',transit=departing||establishing,diagram=Boolean(environment.diagram),entity=missionEntities.get(state.shot.entityId),column=$('director-water-column');
    column.hidden=diagram||state.shot.learning==='mission'&&vehicle.phase==='surface';
    const phaseNames={surface:departing?'水面 · 母船回收位':'水面 · 科考母船',descent:departing?'水下 · 上浮返航':'水下 · 正在下潜',seabed:departing?'海床 · 沿标记返航':'深海海床 · 灯光观察'};
    $('director-environment').textContent=diagram?'独立原理模型':transit?phaseNames[vehicle.phase]||'压缩水柱':`${entity?.label||'当前科考站'} · 教学站点`;
    column.querySelector('.water-column-track').hidden=!transit;
    column.dataset.phase=vehicle.phase;column.dataset.mode=transit?'transit':'station';
    const progress=Math.min(1,Math.max(0,establishing?(state.shotProgress-.25)/.60:state.shotProgress)),percent=Math.round(progress*100);
    column.querySelector('.depth-estimate').textContent=transit?`${departing?'返航':'下潜'}进度 · 距离与时间压缩`:'站点设计水深 · 非实测';
    $('director-depth').textContent=transit?`${percent}%`:Number.isFinite(entity?.depth)?`${entity.depth.toLocaleString('zh-CN')} m`:'—';
    $('director-depth-marker').style.top=`${departing?100-percent:percent}%`;
    $('director-model-clearance').hidden=transit||!Number.isFinite(vehicle.clearance);
    $('director-model-clearance').textContent=Number.isFinite(vehicle.clearance)?`模型离底 ${vehicle.clearance.toFixed(1)} · 场景单位`:'';
  }
  function updateNarration(state){
    const text=state.shot.narration,quote=getDirectorLessonCue(state.shot,state.shotElapsed)?.quote||'';
    if(text===narrationText&&quote===narrationQuote)return;
    narrationText=text;narrationQuote=quote;
    const caption=$('director-narration'),start=quote?text.indexOf(quote):-1;
    if(start<0){caption.textContent=text;return;}
    const current=document.createElement('mark');current.className='director-current-phrase';current.textContent=quote;current.title='当前讲解';
    caption.replaceChildren(document.createTextNode(text.slice(0,start)),current,document.createTextNode(text.slice(start+quote.length)));
  }
  function render(state,action={type:'CONFIGURE'}){
    if(mediaSynchronizing)action={type:'TICK'};
    narrator.sync(state,{rate,discontinuity:['ENTER','SEEK','SEEK_SHOT','NEXT','PREVIOUS'].includes(action.type)||(action.type==='PLAY'&&state.elapsed===0)});
    $('director-overlay').hidden=!state.active;$('director-button').setAttribute('aria-pressed',state.active);$('director-button').textContent=state.active?'退出导演':'导演模式';
    learning.sync(state,action);
    if(!state.active){ensureLoop(state);return;}
    const chapterChanged=previousShot!==state.shot.id;
    if(chapterChanged){
      previousShot=state.shot.id;onShot(state.shot,state);
      $('director-shot-title').textContent=state.shot.title;$('director-objective').textContent=`本镜观察 · ${state.shot.objective}`;
      $('director-chapter-number').textContent=`镜头 ${String(state.index+1).padStart(2,'0')} / ${String(state.shots.length).padStart(2,'0')}`;
      $('director-chapters').value=String(state.index);$('director-framing').value=framingOverrides.has(state.shot.id)?framingOverrides.get(state.shot.id):'script';
      $('director-callouts').replaceChildren();for(const item of state.shot.callouts||[]){const card=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span');title.textContent=item.label;detail.textContent=item.detail;card.append(title,detail);$('director-callouts').append(card);}
      for(const [index,node] of [...$('director-journey').children].entries()){node.classList.toggle('current',index===state.index);node.classList.toggle('done',index<state.index);node.setAttribute('aria-current',index===state.index?'step':'false');if(index===state.index)node.scrollIntoView({block:'nearest',inline:'nearest'});}
    }
    updateNarration(state);
    applyFrame(state,{jump:['ENTER','SEEK','SEEK_SHOT','NEXT','PREVIOUS'].includes(action.type)});
    updateEnvironment(state);
    $('director-progress').value=state.elapsed;$('director-progress').setAttribute('aria-valuetext',`${timeLabel(state.elapsed)}，全片 ${timeLabel(state.duration)}`);$('director-time').textContent=timeLabel(state.elapsed);
    $('director-play').textContent=state.playing?'暂停':state.completed?'重播全片':'继续';$('director-play').setAttribute('aria-label',state.playing?'暂停导演放映':state.completed?'重播导演影片':'继续导演放映');$('director-play').setAttribute('aria-pressed',state.playing);
    $('director-previous').disabled=state.index===0&&state.shotElapsed<.05;$('director-next').disabled=state.completed;
    const last=state.index===state.shots.length-1;$('director-next').textContent=last?'完成放映':'下一镜 →';$('director-next').setAttribute('aria-label',last?'完成导演放映':'下一导演镜头');$('director-completion').hidden=!state.completed;
    ensureLoop(state);if(action.type!=='TICK'||chapterChanged)onState(state,action);
  }
  function configure(missionId,missionData){
    if(view()?.active)stop({focus:false});cancelLoop();unsubscribe?.();clock?.destroy();
    framingOverrides.clear();missionEntities=new Map((missionData?.entities||[]).map(entity=>[entity.id,entity]));previousShot='';rate=1;$('director-speed').value='1';
    const shots=getDirectorShots(missionId).map(shot=>{const audio=narrationManifest.clips[shot.id];if(!audio||audio.text!==shot.narration)throw new Error(`导演讲解与语音不匹配：${shot.id}`);return {...shot,audio,duration:Math.max(shot.duration,Math.ceil((audio.duration+1)*10)/10)};}),brief=directorMissionBriefs[missionId];clock=createDirector(shots);unsubscribe=clock.subscribe(render);
    learning.configure(missionId,missionData);
    $('director-film-title').textContent=brief.title;$('director-chapters').replaceChildren();shots.forEach((shot,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${String(index+1).padStart(2,'0')} · ${shot.title}`;$('director-chapters').append(option);});
    $('director-progress').max=clock.getView().duration;$('director-total').textContent=timeLabel(clock.getView().duration);
    $('director-journey').setAttribute('aria-label',`本次调查的${shots.length}个步骤`);$('director-journey').replaceChildren();shots.forEach((shot,index)=>{const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=`${String(index+1).padStart(2,'0')} ${shot.title}`;button.addEventListener('click',()=>{clock.pause();clock.seekShot(index);});item.append(button);$('director-journey').append(item);});
    $('mission-context-title').textContent=brief.location;$('mission-context-summary').textContent=`${brief.role}${brief.mission}`;
    render(clock.getView());return clock.getView();
  }
  function start({index=0,playing=true}={}){
    if(!clock)return;if(!Number.isInteger(index)||index<0||index>=view().shots.length||typeof playing!=='boolean')throw new TypeError('导演入口参数无效');if(!view().active){onEnter();scene.setDirectorEnabled?.(true);document.body.classList.add('director-mode');previousShot='';}
    $('director-overlay').classList.remove('captions-hidden');$('director-caption-toggle').textContent='收起解说';$('director-caption-toggle').setAttribute('aria-pressed','true');
    const state=clock.enter({index,playing});$('director-play').focus({preventScroll:true});return state;
  }
  function stop({focus=true}={}){
    if(!view()?.active)return;cancelLoop();clock.exit();scene.setDirectorEnabled?.(false);document.body.classList.remove('director-mode');onExit({focus});if(focus)document.querySelector('#ocean-scene canvas')?.focus({preventScroll:true});onState(view(),{type:'EXIT'});
  }
  function toggle(){if(!clock)return;if(!view().active)start();else if(view().playing)clock.pause();else clock.play();}
  const pause=()=>view()?.active?clock.pause():view();
  listen($('director-button'),'click',()=>view()?.active?stop():start());listen($('director-entry'),'click',()=>start());listen($('director-exit'),'click',()=>stop());
  listen($('director-play'),'click',toggle);listen($('director-previous'),'click',()=>clock?.previous());listen($('director-next'),'click',()=>clock?.next());
  listen($('director-review-summary'),'click',()=>{const index=view()?.shots.findIndex(shot=>shot.learning==='summary');if(index>=0){clock.pause();clock.seekShot(index);}});
  listen($('director-chapters'),'change',event=>{previousShot='';clock?.pause();clock?.seekShot(Number(event.target.value));});
  listen($('director-progress'),'input',event=>{const seconds=Number(event.target.value);clock?.pause();clock?.seek(seconds);});
  listen($('director-speed'),'change',event=>{rate=Number(event.target.value);narrator.sync(view(),{rate});});
  listen($('director-audio-toggle'),'click',()=>{const enabled=narrator.setEnabled(!narrator.enabled);$('director-audio-toggle').textContent=enabled?'语音：开':'语音：关';$('director-audio-toggle').setAttribute('aria-pressed',enabled);narrator.sync(view(),{rate});});
  listen($('director-audio-retry'),'click',()=>{narrator.retry();clock?.play();});
  listen($('director-framing'),'change',event=>{if(!view()?.active)return;clock.pause();const id=view().shot.id;if(event.target.value==='script')framingOverrides.delete(id);else framingOverrides.set(id,event.target.value);applyFrame(view(),{jump:true});});
  listen($('director-caption-toggle'),'click',()=>{const hidden=$('director-overlay').classList.toggle('captions-hidden');$('director-caption-toggle').textContent=hidden?'显示解说':'收起解说';$('director-caption-toggle').setAttribute('aria-pressed',!hidden);});
  listen(document,'visibilitychange',()=>{if(document.hidden)pause();});
  listen(document,'keydown',event=>{
    if(!view()?.active||document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){event.preventDefault();stop();return;}
    if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName)||event.target.isContentEditable)return;
    if(event.code==='Space'){event.preventDefault();toggle();}else if(event.key==='ArrowRight'){event.preventDefault();clock.next();}else if(event.key==='ArrowLeft'){event.preventDefault();clock.previous();}
  });
  // A paused chapter cut is positioned by the renderer on its next frame.
  // Refresh passive readouts too; this never ticks speech or the film clock.
  const environmentTimer=setInterval(()=>{if(!destroyed&&view()?.active)updateEnvironment(view());},200);
  return {configure,start,stop,pause,toggle,getView:view,get active(){return Boolean(view()?.active);},destroy(){stop({focus:false});destroyed=true;clearInterval(environmentTimer);cancelLoop();unsubscribe?.();clock?.destroy();narrator.destroy();audioAssets.destroy();learning.destroy();listeners.forEach(remove=>remove());}};
}
