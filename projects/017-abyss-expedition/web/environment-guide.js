// SPDX-License-Identifier: GPL-3.0-only
// Environmental listening reuses the film clock and media adapter. Camera
// guidance is an explicit user action delegated to the scene; piloting stays
// independent, and the guide never selects a mission event or writes a sample.
import {createDirector} from './core/director-core.mjs';
import {createNarrationPlayer,createNarrationAssetCache} from './rendering/narration-player.mjs?v=5';
import {environmentGuides,environmentSources} from './data/environment-guide.mjs?v=1';
import {environmentNarrationManifest} from './assets/environment-narration/manifest.mjs?v=1';
import {describeEnvironmentPosition} from './core/environment-location.mjs';
import {compileNarrationCues,getNarrationCue} from './core/narration-cues.mjs';
import {environmentCueTracks} from './data/environment-cue-tracks.mjs';
import {environmentCueTiming} from './data/environment-cue-timing.mjs';

const make=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const button=(id,text)=>{const node=make('button',text);node.id=id;node.type='button';return node;};
const time=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;

export function createEnvironmentGuide({onPlay=()=>{},onCue=()=>{},onFocus=()=>false,onRestoreView=()=>false,getCueStatus=()=>null}={}){
  const stage=document.querySelector('.scene-stage');
  let clock=null,unsubscribe=null,frame=0,stamp=0,visible=false,destroyed=false,rate=1,previousId='',mediaSync=false,missionId=null;
  const cuePlans=new Map();let previousCueId='',focusPending=false,localRestoreAvailable=false,focusOperation=0,lastPilotState=null;
  const sourceIndex=new Map(environmentSources.map(source=>[source.id,source]));
  const root=make('aside',undefined,'environment-guide');root.id='environment-guide';root.hidden=true;root.setAttribute('aria-label','海洋环境语音导览');
  const top=make('div',undefined,'environment-guide-top'),code=make('p','海洋环境导览 · 先认识这里'),fold=button('environment-fold','收起');fold.setAttribute('aria-expanded','true');top.append(code,fold);
  const location=make('p','你在深海科考场景中','environment-location');location.id='environment-location';
  const title=make('h2','我们身处怎样的海洋环境');title.id='environment-title';
  const summary=make('p',undefined,'environment-summary');summary.id='environment-summary';
  const cuePanel=make('div',undefined,'environment-cue-panel'),cuePhase=make('span','当前画面提示'),cueLabel=make('strong','跟随语音标出观察对象'),cueDetail=make('p','讲到的对象会在场景里高亮；看不清时可主动对准，潜器位置保持不变。');cuePanel.id='environment-cue-panel';cuePhase.id='environment-cue-phase';cueLabel.id='environment-cue-label';cueDetail.id='environment-cue-detail';cuePanel.append(cuePhase,cueLabel,cueDetail);
  const focusActions=make('div',undefined,'environment-focus-actions'),focusObject=button('environment-focus','◎ 看清当前对象'),restoreView=button('environment-restore-view','回到我的镜头');restoreView.hidden=true;focusObject.disabled=true;focusActions.append(focusObject,restoreView);
  const viewHint=make('p','自由驾驶和镜头始终可用；需要时点“看清当前对象”。','environment-view-hint');viewHint.id='environment-view-hint';viewHint.setAttribute('role','status');viewHint.setAttribute('aria-live','polite');
  const chapterLabel=make('label',undefined,'environment-chapter-label');chapterLabel.append(make('span','环境主题'));
  const chapters=make('select');chapters.id='environment-chapters';chapters.setAttribute('aria-label','选择海洋环境讲解');chapterLabel.append(chapters);
  const cueButtons=make('div',undefined,'environment-cue-buttons');cueButtons.id='environment-cue-buttons';cueButtons.setAttribute('role','group');cueButtons.setAttribute('aria-label','本段画面提示，可暂停定位');
  const transport=make('div',undefined,'environment-transport'),previous=button('environment-previous','上一段'),play=button('environment-play','▶ 听环境总览'),next=button('environment-next','下一段');transport.append(previous,play,next);
  const progressRow=make('div',undefined,'environment-progress-row'),elapsed=make('span','0:00'),progress=make('input'),duration=make('span','0:00');progress.id='environment-progress';progress.type='range';progress.min='0';progress.max='1';progress.step='.1';progress.value='0';progress.setAttribute('aria-label','当前环境讲解进度（秒）');progressRow.append(elapsed,progress,duration);
  const options=make('div',undefined,'environment-options'),autoLabel=make('label'),auto=make('input');auto.type='checkbox';auto.checked=true;auto.id='environment-auto';autoLabel.append(auto,document.createTextNode('连续听六段'));
  const cuesLabel=make('label'),cuesEnabled=make('input');cuesEnabled.type='checkbox';cuesEnabled.checked=true;cuesEnabled.id='environment-cues-enabled';cuesLabel.append(cuesEnabled,document.createTextNode('画面提示'));
  const speedLabel=make('label'),speed=make('select');speed.id='environment-speed';speed.setAttribute('aria-label','环境讲解速度');for(const value of [1,1.25,1.5,2]){const option=make('option',value+'×');option.value=String(value);speed.append(option);}speedLabel.append(document.createTextNode('语速 '),speed);options.append(cuesLabel,autoLabel,speedLabel);
  const status=make('p','MiniMax 环境讲解 · 点击开始','environment-audio-status');status.id='environment-audio-status';status.setAttribute('role','status');
  const retry=button('environment-retry','重试环境语音');retry.hidden=true;
  const reading=make('details',undefined,'environment-reading');reading.append(make('summary','看哪里 · 完整解说与资料'));
  const lookFor=make('ol'),narration=make('p'),sources=make('div',undefined,'environment-sources');lookFor.id='environment-look-for';narration.id='environment-narration';reading.append(lookFor,narration,sources);
  const note=make('p','可边驾驶边听。点击画面提示可暂停定位语音；“看清当前对象”只调整镜头，拖动或操纵潜器即可继续自由探索。','environment-note');
  const audio=make('audio');audio.id='environment-audio';audio.hidden=true;audio.preload='auto';audio.setAttribute('aria-label','MiniMax海洋环境旁白');
  root.append(top,location,title,summary,cuePanel,focusActions,viewHint,chapterLabel,cueButtons,transport,progressRow,options,status,retry,reading,note,audio);stage.append(root);
  const listeners=[],listen=(node,event,handler)=>{node.addEventListener(event,handler);listeners.push(()=>node.removeEventListener(event,handler));};
  const assets=createNarrationAssetCache();
  const narrator=createNarrationPlayer({audio,resolveSource:assets.resolve,onStatus:({kind,text})=>{status.textContent=text==='MiniMax 语音讲解'?'MiniMax 正在讲解海洋环境':text.replace('讲解','环境讲解').replace('镜头同步等待','可以继续驾驶').replace('重试语音','重试环境语音');status.dataset.kind=kind;retry.hidden=!['error','blocked'].includes(kind);},onBlocked:()=>clock?.pause()});
  const view=()=>clock?.getView();
  function setViewHint(text){if(viewHint.textContent!==text)viewHint.textContent=text;}
  function setFolded(folded){root.classList.toggle('is-folded',folded);fold.textContent=folded?'展开':'收起';fold.setAttribute('aria-expanded',String(!folded));}
  function refreshViewStatus(){
    const state=view(),enabled=Boolean(visible&&state&&!state.completed&&cuesEnabled.checked&&cuePanel.dataset.kind!=='off');
    focusObject.disabled=!enabled||focusPending;
    const data=getCueStatus()||{},focus=data.focus||{},targets=Array.isArray(data.targets)?data.targets:[],viewpoint=data.viewpoint||lastPilotState?.viewpoint||{},remote=focus.active||viewpoint.mode==='remote',canRestore=typeof focus.canRestore==='boolean'?focus.canRestore:typeof data.canRestore==='boolean'?data.canRestore:localRestoreAvailable;
    root.classList.toggle('is-remote-view',Boolean(remote));
    restoreView.hidden=!canRestore;restoreView.disabled=focusPending;
    focusObject.setAttribute('aria-pressed',String(Boolean(focus.active)));
    if(focusPending)return;
    if(!enabled){setViewHint(state?.completed?'可以继续自由驾驶，或选择一段重新观察。':'开启画面提示后，可对准当前讲解对象。');return;}
    if(data.observation?.visible){setViewHint(`近景窗：${data.observation.label||cueLabel.textContent}。只是显示远处对象，潜器仍由你驾驶。`);return;}
    const shown=targets.find(target=>target.visibility==='画面中'&&target.labelVisible!==false),label=focus.label||shown?.label||cueLabel.textContent;
    if(focus.active){setViewHint(`远处观察：${label}。只切换镜头；操纵可回原镜头，拖动可自由观察。`);return;}
    if(shown){setViewHint(remote?`镜头看${shown.label}；潜器仍在自己的航行位置。点驾驶台“返回潜器”可恢复跟随。`:`画面中：${shown.label}。连线末端与发光区域就是观察对象。`);return;}
    if(remote){setViewHint('自由镜头与潜器位置分开。可继续转动观察，或点驾驶台“返回潜器”恢复跟随。');return;}
    const blocked=targets.some(target=>target.visibility==='岩壁遮挡');
    setViewHint(blocked?'对象被岩壁挡住，点“看清当前对象”换一个安全观察角度。':targets.length?'对象在当前镜头外，点“看清当前对象”对准；潜器位置不变。':'高亮会优先选镜头里的对象；看不清时点“看清当前对象”。');
  }
  async function focusCurrentObject(){
    if(focusObject.disabled||focusPending)return;const operation=++focusOperation;focusPending=true;focusObject.disabled=true;setFolded(true);reading.open=false;setViewHint('正在寻找能看清对象的安全角度…');
    try{
      const result=await onFocus();if(destroyed||operation!==focusOperation)return;
      if(result===false||result?.ok===false){setViewHint(result?.reason||'暂时没有合适的观察角度，请继续自由转动镜头。');return;}
      localRestoreAvailable=true;setFolded(true);reading.open=false;
      setViewHint(`远处观察：${result?.label||cueLabel.textContent}。只切换镜头；操纵可回原镜头，拖动可自由观察。`);
    }catch{if(!destroyed&&operation===focusOperation)setViewHint('当前对象暂时无法对准，仍可自由驾驶和转动镜头。');}
    finally{if(!destroyed&&operation===focusOperation){focusPending=false;focusObject.disabled=false;restoreView.hidden=!localRestoreAvailable;restoreView.disabled=false;}}
  }
  async function restorePreviousView(){
    if(focusPending)return;const operation=++focusOperation;focusPending=true;restoreView.disabled=true;setViewHint('正在恢复你的观察镜头…');
    try{const result=await onRestoreView();if(destroyed||operation!==focusOperation)return;if(result===false||result?.ok===false){setViewHint(result?.reason||'原镜头暂时无法恢复，可继续自由拖动观察。');return;}localRestoreAvailable=false;restoreView.hidden=true;setViewHint('已回到你的镜头，继续自由驾驶和观察。');}
    catch{if(!destroyed&&operation===focusOperation)setViewHint('原镜头暂时无法恢复，可继续自由拖动观察。');}
    finally{if(!destroyed&&operation===focusOperation){focusPending=false;focusObject.disabled=false;restoreView.disabled=false;}}
  }
  function cancelLoop(){if(frame)cancelAnimationFrame(frame);frame=0;stamp=0;}
  function applyCue(state){
    if(!state||!visible||!cuesEnabled.checked||state.completed){onCue(null);cuePanel.dataset.kind='off';delete cuePanel.dataset.cue;cuePhase.textContent=cuesEnabled.checked?'画面提示':'已关闭画面提示';if(state?.completed){cueLabel.textContent='本轮画面提示已结束';cueDetail.textContent='可继续自由驾驶，或重听环境导览。';}else if(!cuesEnabled.checked){cueLabel.textContent='语音可继续播放';cueDetail.textContent='重新勾选画面提示，即可恢复高亮和动画。';previousCueId='';if(state)narration.textContent=state.shot.narration;for(const node of cueButtons.children)node.setAttribute('aria-pressed','false');}refreshViewStatus();return;}
    const plan=cuePlans.get(state.shot.id),seconds=Math.min(plan.duration,Math.max(0,state.shotElapsed)),selected=getNarrationCue(plan,seconds);
    if(!selected){onCue(null);cueLabel.textContent='跟随语音标出观察对象';focusObject.disabled=true;return;}
    const cue=selected.cue;cuePanel.dataset.kind=cue.kind;cuePanel.dataset.cue=cue.id;cuePanel.dataset.time=seconds.toFixed(2);cuePhase.textContent=`${state.playing?'此刻讲到':'当前高亮'} · ${selected.index+1} / ${plan.cues.length}`;cueLabel.textContent=cue.label;cueDetail.textContent=cue.detail;
    for(const node of cueButtons.children)node.setAttribute('aria-pressed',String(node.dataset.cue===cue.id));
    if(previousCueId!==cue.id){previousCueId=cue.id;const mark=make('mark',cue.quote);narration.replaceChildren(document.createTextNode(state.shot.narration.slice(0,cue.quoteStart)),mark,document.createTextNode(state.shot.narration.slice(cue.quoteEnd)));}
    onCue({...cue,chapterId:state.shot.id,elapsed:seconds,playing:state.playing,progress:selected.progress});
    refreshViewStatus();
  }
  function render(state,action={type:'CONFIGURE'}){
    if(mediaSync)action={type:'TICK'};
    narrator.sync(state,{rate,discontinuity:['ENTER','SEEK','SEEK_SHOT','NEXT','PREVIOUS'].includes(action.type)||(action.type==='PLAY'&&state.completed)});
    const shot=state.shot;
    if(shot.id!==previousId){
      previousId=shot.id;title.textContent=shot.title;summary.textContent=shot.summary;chapters.value=String(state.index);code.textContent=`海洋环境导览 · ${state.index+1} / ${state.shots.length}`;
      lookFor.replaceChildren(...shot.lookFor.map(text=>make('li',text)));narration.textContent=shot.narration;
      sources.replaceChildren(...shot.sourceIds.map(id=>sourceIndex.get(id)).filter(Boolean).map(source=>{const a=make('a',source.title+' ↗');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';return a;}));
      cueButtons.replaceChildren(...cuePlans.get(shot.id).cues.map(cue=>{const control=button('',cue.label);control.dataset.cue=cue.id;control.dataset.time=cue.start.toFixed(3);control.removeAttribute('id');control.setAttribute('aria-label',`定位画面提示：${cue.label}`);control.addEventListener('click',()=>{const state=view(),start=state.elapsed-state.shotElapsed;clock.pause();clock.seek(start+Math.min(shot.audio.duration,cue.start+.02));});return control;}));
    }
    const singleCompleted=!auto.checked&&state.shotElapsed>=shot.audio.duration-.05;
    play.textContent=state.playing?'暂停讲解':state.completed?'重听六段':singleCompleted?'重听这一段':state.shotElapsed>.1?'继续讲解':state.index===0?'▶ 听环境总览':'▶ 听这一段';
    play.setAttribute('aria-label',state.playing?'暂停海洋环境讲解':state.completed?'重听海洋环境导览':singleCompleted?'重听当前环境讲解':'播放海洋环境讲解');play.setAttribute('aria-pressed',String(state.playing));
    previous.disabled=state.index===0&&state.shotElapsed<.1;next.disabled=state.index===state.shots.length-1;
    const clipDuration=shot.audio.duration;progress.max=String(clipDuration);progress.value=String(Math.min(clipDuration,state.shotElapsed));elapsed.textContent=time(Math.min(clipDuration,state.shotElapsed));duration.textContent=time(clipDuration);
    if(state.completed)status.textContent='六段环境导览已完成 · 可以继续驾驶探索';
    applyCue(state);
    if(!state.playing||!visible)cancelLoop();else if(!frame)frame=requestAnimationFrame(step);
  }
  function step(now){
    frame=0;const state=view();if(destroyed||!visible||!state?.playing)return;
    const delta=stamp?Math.min(.1,(now-stamp)/1000):0;stamp=now;let advance=narrator.advance(state,delta*rate);
    if(!auto.checked&&state.shotElapsed+advance>=state.shot.duration){clock.pause();clock.seek(state.elapsed-state.shotElapsed+state.shot.audio.duration);status.textContent='本段已讲完 · 可选择下一段或重听';return;}
    if(advance>.24){mediaSync=true;try{clock.seek(Math.min(state.duration,state.elapsed+advance));}finally{mediaSync=false;}}
    else clock.tick(advance);
    if(view()?.playing&&visible&&!frame)frame=requestAnimationFrame(step);
  }
  function configure(data){
    pause();onCue(null);cancelLoop();unsubscribe?.();clock?.destroy();missionId=data.id;previousId='';previousCueId='';cuePlans.clear();rate=1;speed.value='1';reading.open=false;focusOperation++;focusPending=false;localRestoreAvailable=false;lastPilotState=null;restoreView.hidden=true;root.classList.remove('is-remote-view');
    const guide=environmentGuides[data.id];if(!guide)throw new TypeError('未配置这个海域的环境导览');
    const shots=guide.chapters.map(chapter=>{const clip=environmentNarrationManifest.clips[chapter.id];if(!clip||clip.text!==chapter.narration)throw new Error(`环境讲解与音轨不匹配：${chapter.id}`);return {...chapter,audio:clip,entityId:chapter.entityIds[0]||'environment',eventId:chapter.id,framing:'environment',duration:Math.ceil((clip.duration+.8)*10)/10};});
    for(const shot of shots)cuePlans.set(shot.id,compileNarrationCues({text:shot.narration,duration:shot.audio.duration,cues:environmentCueTracks[shot.id],timing:environmentCueTiming[shot.id]}));
    chapters.replaceChildren(...shots.map((shot,index)=>{const option=make('option',`${index+1} · ${shot.title}`);option.value=String(index);return option;}));
    clock=createDirector(shots);unsubscribe=clock.subscribe(render);clock.enter({index:0,playing:false});location.textContent=guide.title;setFolded(true);return view();
  }
  function setVisible(value){visible=Boolean(value);root.hidden=!visible||!clock;if(!visible){pause();onCue(null);}else if(view())applyCue(view());}
  function pause(){if(view()?.playing)clock.pause();cancelLoop();}
  function open({playing=false,fromStart=false}={}){setVisible(true);setFolded(false);if(fromStart){clock.pause();clock.seekShot(0);}if(playing)resume();}
  function resume(){if(!clock)return;onPlay();setVisible(true);setFolded(true);reading.open=false;if(view().completed)clock.enter({index:0,playing:true});else{if(!auto.checked&&view().shotElapsed>=view().shot.audio.duration-.05)clock.seekShot(view().index);clock.play();}}
  function setPilotState(state){lastPilotState=state;if(!visible||!missionId)return;const description=describeEnvironmentPosition(missionId,state),region=typeof state?.viewpoint?.vehicleRegion==='string'?state.viewpoint.vehicleRegion:description.label;location.textContent='潜器所在：'+region;location.title=description.detail+' 所在区域按潜器位置说明；观察镜头可以在另一处。';if(view())applyCue(view());}
  listen(play,'click',()=>view()?.playing?pause():resume());
  listen(previous,'click',()=>{clock.pause();clock.previous();});listen(next,'click',()=>{clock.pause();clock.next();});
  listen(chapters,'change',()=>{clock.pause();clock.seekShot(Number(chapters.value));});
  listen(progress,'input',()=>{const state=view(),seconds=Number(progress.value);clock.pause();clock.seek(state.elapsed-state.shotElapsed+Math.min(seconds,state.shot.audio.duration));});
  listen(speed,'change',()=>{rate=Number(speed.value);if(view())narrator.sync(view(),{rate});});
  listen(auto,'change',()=>{if(view())render(view(),{type:'OPTIONS'});});
  listen(cuesEnabled,'change',()=>{if(view())applyCue(view());});
  listen(focusObject,'click',focusCurrentObject);listen(restoreView,'click',restorePreviousView);
  listen(retry,'click',()=>{narrator.retry();resume();});
  listen(fold,'click',()=>setFolded(!root.classList.contains('is-folded')));
  listen(document,'visibilitychange',()=>{if(document.hidden)pause();});listen(window,'pagehide',pause);
  const viewStatusTimer=setInterval(()=>{if(visible&&!destroyed)refreshViewStatus();},350);
  return {configure,setVisible,setPilotState,open,pause,getView:view,destroy(){if(destroyed)return;pause();onCue(null);destroyed=true;clearInterval(viewStatusTimer);unsubscribe?.();clock?.destroy();narrator.destroy();assets.destroy();listeners.forEach(remove=>remove());root.remove();}};
}
