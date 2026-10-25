// SPDX-License-Identifier: GPL-3.0-only
import {createExplorer} from './core/temporal-core.mjs';
import {createEntityIndex} from './core/entity-index.mjs';
import {interpolateTrack} from './core/track.mjs';
import {createLatestTask} from './core/latest-task.mjs';
import {encodeCameraState,decodeCameraState,isSameCameraState} from './core/camera-state.mjs';
import {missions} from './data/missions.mjs?v=2';
import {createOceanScene} from './scene.js?v=50';
import {createDirectorExperience} from './director-ui.js?v=20';
import {createPilotExperience} from './pilot-ui.js?v=4';
import {encodePilotPose,decodePilotPose} from './core/pilot-core.mjs?v=2';
import {createEnvironmentGuide} from './environment-guide.js?v=9';

const $=id=>document.getElementById(id);
const kindNames={lander:'潜器与平台',vent:'热液活动区',coral:'深海生态站',ridge:'地形观察站',sampling:'环境采样站',wreck:'海底遗迹'};
const shortKinds={lander:'潜器平台',vent:'热液区',coral:'生态站',ridge:'地形站',sampling:'采样站',wreck:'海底遗迹'};
const appearanceKinds={'recovery-beacon':['返航定位站','定位站'],'water-sampler':['水体采样站','采水站'],'sediment-corer':['沉积对照站','沉积站'],'current-meter':['水流观测站','流速站']};
const entityType=(entity,short=false)=>appearanceKinds[entity.appearance]?.[short?1:0]||(short?shortKinds[entity.kind]:kindNames[entity.kind])||'观察站';
const sourceNames={'whoi-vents':'WHOI · 热液','noaa-chemosynthesis':'NOAA · 化能合成','noaa-corals':'NOAA · 深海珊瑚','noaa-rov':'NOAA · 遥操作潜器','noaa-seafloor':'NOAA · 海底测绘'};
const storageKey='abyss-expedition.samples.v1';
let dataset=null,store=null,index=null,unsubscribe=null,activeEntity=null,cameraMode='overview',speed=1;
let samples={},lastContext='',noticeTimer=null,playingTimer=null,playStamp=0,sceneFailed=false;
let sceneReady=false,missionReady=false,lastUrlWrite=0;
let presentationMode='survey',tourIndex=-1,cameraUrlTimer=null,observationNotes={};
let film=null,filmPreviousImmersive=false,pilot=null,pilotPreviousImmersive=false,environmentGuide=null;
const sources=new Map(),loadGate=createLatestTask(),dataCache=new Map();
try { const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))samples=saved; } catch { /* Browsing still works if storage is unavailable. */ }
const svgNS='http://www.w3.org/2000/svg';
const svg=(tag,attrs={},text)=>{const node=document.createElementNS(svgNS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
const clock=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(Math.floor(minutes%60)).padStart(2,'0')}`;
function showNotice(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,4200);}
function showLoading(message='展开海底地形与航次记录…',failed=false){$('loading-screen').hidden=false;$('loading-screen').querySelector('h2').textContent=failed?'暂时无法展开海底':'正在下潜';$('loading-screen').querySelector('p').textContent=message;$('retry-button').hidden=!failed;}
function reveal(){if(sceneReady&&missionReady&&!sceneFailed)$('loading-screen').hidden=true;}

const ocean=createOceanScene({container:$('ocean-scene'),onSelect:id=>{if(pilot?.active)inspectPilotStation(id);else selectEntity(id);},onReady:()=>{sceneReady=true;reveal();},onCameraChange:()=>{if(!missionReady)return;clearTimeout(cameraUrlTimer);cameraUrlTimer=setTimeout(()=>updateUrl(true),120);},onError:error=>{sceneFailed=true;showLoading('当前浏览器无法建立 WebGL 三维场景。请确认硬件加速可用后重新加载。站点和任务记录仍可阅读。',true);console.error(error);}});
film=createDirectorExperience({scene:ocean,onEnter:()=>{pilot?.stop();if(store)store.dispatch({type:'SET_PLAYING',playing:false});tourIndex=-1;renderGoal();setCatalog(false);filmPreviousImmersive=document.body.classList.contains('immersive');setImmersive(true);cameraMode='overview';document.querySelectorAll('[data-camera]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.camera==='overview'));setPresentation('dive',{write:false});ocean.setContextLabels?.(true);},onShot:shot=>act({type:'SELECT_EVENT',id:shot.eventId},{pause:true,fromTour:true,focus:false,fromDirector:true}),onExit:({focus})=>{ocean.setContextLabels?.($('context-labels').checked);setImmersive(filmPreviousImmersive);if(focus)focusCurrentStation({force:true});},onState:()=>updateUrl(true)});

pilot=createPilotExperience({scene:ocean,onEnter:()=>{
  if(!missionReady||sceneFailed)return false;
  film?.stop({focus:false});store.dispatch({type:'SET_PLAYING',playing:false});tourIndex=-1;renderGoal();setCatalog(false);
  pilotPreviousImmersive=document.body.classList.contains('immersive');setImmersive(true);setPresentation('dive',{write:false});
  $('layer-menu').hidden=true;environmentGuide?.setVisible(true);return true;
},onExit:()=>{environmentGuide?.setVisible(false);const restoreFocus=Boolean(document.activeElement?.closest('#pilot-console'));setImmersive(pilotPreviousImmersive);render(store.getView());focusCurrentStation({force:true});updateUrl(true);if(restoreFocus)$('pilot-button').focus({preventScroll:true});},onChange:state=>{updateUrl(true);environmentGuide?.setPilotState(state);},onInspect:inspectPilotStation
});
environmentGuide=createEnvironmentGuide({onPlay:()=>{film?.pause();store?.dispatch({type:'SET_PLAYING',playing:false});},onCue:cue=>ocean.setEnvironmentCue?.(cue),onFocus:()=>ocean.focusEnvironmentCue?.(),onRestoreView:()=>ocean.restoreEnvironmentCueCamera?.(),getCueStatus:()=>ocean.getEnvironmentCueStatus?.()});
function inspectPilotStation(id){
  const entity=dataset?.entities.find(item=>item.id===id);if(!entity)return;
  ocean.stopPilot();$('pilot-inspect-title').textContent=entity.label;$('pilot-inspect-description').textContent=entity.description;
  $('pilot-inspect-observation').textContent=entity.observation||'对照地形与设备，观察它们所在的位置。';$('pilot-inspect-dialog').showModal();
}

function act(action,{pause=false,fromTour=false,focus=true,fromDirector=false}={}){if(!store)return;try{if(pilot?.active&&['SELECT_EVENT','SET_TIME','NEXT','PREVIOUS','SET_PLAYING'].includes(action.type))pilot.stop();if(!fromDirector&&film?.active&&['SELECT_EVENT','SET_TIME','NEXT','PREVIOUS','SET_PLAYING'].includes(action.type))film.stop({focus:false});if(!fromTour&&['SELECT_EVENT','SET_TIME','NEXT','PREVIOUS','SET_PLAYING'].includes(action.type)&&tourIndex>=0){tourIndex=-1;renderGoal();}if(pause&&store.getState().playing)store.dispatch({type:'SET_PLAYING',playing:false});store.dispatch(action);if(focus&&(['SELECT_EVENT','NEXT','PREVIOUS'].includes(action.type)||(action.type==='SET_TIME'&&pause))){focusCurrentStation();setCatalog(false);}}catch(error){showNotice(error.message);}}
function setCatalog(open){const panel=$('mission-catalog'),restoreFocus=!open&&panel.contains(document.activeElement);panel.hidden=!open;$('catalog-backdrop').hidden=!open;$('catalog-button').setAttribute('aria-expanded',open);document.documentElement.classList.toggle('catalog-open',open);document.querySelector('.ocean-workspace').inert=open;document.querySelector('.timeline-dock').inert=open;if(open&&store?.getState().playing)act({type:'SET_PLAYING',playing:false},{fromTour:true});if(restoreFocus)$('catalog-button').focus();}
function setImmersive(immersive){document.body.classList.toggle('immersive',immersive);$('immersive-button').setAttribute('aria-pressed',immersive);$('immersive-button').textContent=immersive?'显示记录':'沉浸观测';$('collapse-card').setAttribute('aria-expanded',!immersive);if(immersive&&$('observation-card').contains(document.activeElement))$('immersive-button').focus();}
function focusCurrentStation({force=false}={}){if(!activeEntity)return;if(!force&&cameraMode==='top')return;if(!force&&cameraMode==='follow'){setCamera('follow');return;}setCamera('overview',{presentation:'dive'});ocean.focusEntity(activeEntity.id);}
function navigateStation(direction){if(!dataset||!activeEntity)return;if(tourIndex>=0){if(direction>0)advanceTour();else if(tourIndex>0){tourIndex--;selectEntity(dataset.entities[tourIndex].id,{fromTour:true});}return;}const index=dataset.entities.findIndex(entity=>entity.id===activeEntity.id),entity=dataset.entities[index+direction];if(entity)selectEntity(entity.id);}
function selectEntity(id,{fromTour=false}={}){
  if(!dataset)return;const event=dataset.events.find(item=>item.entityId===id);
  if(!event){showNotice('这个站点暂时没有任务记录。');return;}
  act({type:'SELECT_EVENT',id:event.id},{pause:true,fromTour,focus:false});$('search-results').hidden=true;
  focusCurrentStation({force:true});setCatalog(false);renderGoal();
}
function renderGoal(){
  if(!dataset)return;const count=validSampleCount();$('goal-count').textContent=`${count} / 3`;$('goal-progress').value=Math.min(count,3);$('scene-goal').textContent=`发现 ${count} / 3`;
  if(tourIndex>=0){const next=dataset.entities[tourIndex+1];$('tour-button').textContent=next?`下一站：${next.label} →`:'查看航次报告 →';$('tour-status').textContent=`站点导览 ${tourIndex+1} / ${dataset.entities.length} · ${dataset.entities[tourIndex].label}`;}
  else{$('tour-button').textContent='开始站点导览 →';$('tour-status').textContent=count>=3?'三项发现已记录，可打开航次报告比较。':'按顺序观察站点，记录三项发现。';}
  const finishing=tourIndex===dataset.entities.length-1;$('scene-next-station').textContent=finishing?'完成导览 →':'下一站 →';$('scene-next-station').setAttribute('aria-label',finishing?'完成站点导览':'下一科考站');$('scene-next-station').disabled=tourIndex<0&&activeEntity?.id===dataset.entities.at(-1).id;if(tourIndex>=0)$('scene-goal').textContent=`导览 ${tourIndex+1}/${dataset.entities.length} · 发现 ${count}/3`;
}
function advanceTour(){
  if(!dataset)return;tourIndex++;
  if(tourIndex>=dataset.entities.length){tourIndex=-1;renderGoal();renderSamples();$('report-dialog').showModal();return;}
  selectEntity(dataset.entities[tourIndex].id,{fromTour:true});
}
function collected(){const records=samples[dataset?.id];return records&&typeof records==='object'&&!Array.isArray(records)?records:{};}
function sampleEntities(){return dataset?.entities.filter(entity=>entity.sample)||[];}
function validSampleCount(){return sampleEntities().filter(entity=>collected()[entity.sample.id]).length;}
function saveSamples(){try{localStorage.setItem(storageKey,JSON.stringify(samples));return true;}catch{return false;}}
function collectSample(){
  if(!activeEntity?.sample)return;const sample=activeEntity.sample;if(collected()[sample.id])return;
  act({type:'SET_PLAYING',playing:false},{fromTour:true});const view=store.getView(),event=view.selectedEvent||view.visitedEvents.at(-1);
  const records={...collected(),[sample.id]:{entityId:activeEntity.id,eventId:event?.id,missionTime:view.state.time,recordedAt:new Date().toISOString()}};
  samples[dataset.id]=records;const persisted=saveSamples();renderObservation(view,activeEntity);renderSamples();updateStationStates(activeEntity.id);
  showNotice(!persisted?'样本已记录，但仅本次会话有效；请立即导出报告。':validSampleCount()>=3?`已记录「${sample.name}」。已完成三项记录，可打开报告比较。`:`已记录「${sample.name}」，继续寻找其他发现。`);
}

function buildLists(){
  $('station-total').textContent=dataset.entities.length;
  $('mission-stations').replaceChildren();$('mission-events').replaceChildren();$('phase-track').replaceChildren();
  dataset.entities.forEach((entity,i)=>{const button=document.createElement('button');button.type='button';button.className='station-row';button.dataset.entity=entity.id;button.setAttribute('aria-pressed','false');const number=document.createElement('span');number.className='station-number';number.textContent=String(i+1).padStart(2,'0');const body=document.createElement('span');body.className='station-row-text';const name=document.createElement('strong');name.textContent=entity.label;const meta=document.createElement('small');meta.textContent=`${entityType(entity,true)} · ${entity.depth} m`;body.append(name,meta);const badge=document.createElement('span');badge.className='sample-mark';badge.textContent=entity.sample?'◇':'';button.append(number,body,badge);button.addEventListener('click',()=>selectEntity(entity.id));$('mission-stations').append(button);});
  dataset.events.forEach(event=>{const button=document.createElement('button');button.type='button';button.className='event-row';button.dataset.event=event.id;const time=document.createElement('time');time.textContent=clock(event.time);const title=document.createElement('span');title.textContent=event.title;button.append(time,title);button.addEventListener('click',()=>act({type:'SELECT_EVENT',id:event.id},{pause:true}));$('mission-events').append(button);});
  dataset.phases.forEach(phase=>{const button=document.createElement('button');button.type='button';button.textContent=phase.label;button.style.flex=phase.to-phase.from;button.dataset.phase=phase.id;button.title=`${clock(phase.from)} · ${phase.label}`;button.addEventListener('click',()=>act({type:'SET_TIME',time:phase.from},{pause:true}));$('phase-track').append(button);});
  buildMiniMap();buildDepthProfile();
}
function buildDepthProfile(){
  const chart=$('depth-profile');chart.replaceChildren();const depths=dataset.frames.map(frame=>frame.depth),low=Math.min(...depths)-8,high=Math.max(...depths)+8;
  chart.dataset.low=low;chart.dataset.high=high;
  for(const fraction of [0,.5,1]){const y=12+fraction*62;chart.append(svg('path',{d:`M35,${y}H210`,class:'profile-grid'}));chart.append(svg('text',{x:1,y:y+3,class:'profile-label'},Math.round(low+fraction*(high-low))));}
  const xy=frame=>[35+(frame.time-dataset.min)/(dataset.max-dataset.min)*175,12+(frame.depth-low)/(high-low)*62];
  chart.append(svg('path',{d:dataset.frames.map((frame,i)=>`${i?'L':'M'}${xy(frame).join(',')}`).join(' '),class:'profile-line'}));
  dataset.events.forEach(event=>{const frame=dataset.frames.find(item=>item.time===event.time),[x,y]=xy(frame),button=svg('g',{role:'button',tabindex:'0','aria-label':`剖面选择${event.title}`,class:'profile-event'});button.append(svg('circle',{cx:x,cy:y,r:3}));const choose=()=>act({type:'SELECT_EVENT',id:event.id},{pause:true});button.addEventListener('click',choose);button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});chart.append(button);});
  chart.append(svg('path',{id:'profile-cursor',class:'profile-cursor'}));chart.append(svg('circle',{id:'profile-position',r:4,class:'profile-position'}));
  chart.append(svg('text',{x:35,y:92,class:'profile-label'},'00:00'));chart.append(svg('text',{x:177,y:92,class:'profile-label'},clock(dataset.max)));
}
function buildMiniMap(){
  const map=$('route-map');map.replaceChildren();
  for(let x=20;x<220;x+=30)map.append(svg('path',{d:`M${x},0V135`,stroke:'#133747','stroke-width':'.5'}));
  for(let y=15;y<135;y+=30)map.append(svg('path',{d:`M0,${y}H220`,stroke:'#133747','stroke-width':'.5'}));
  const point=p=>[p[0]*192+14,p[1]*103+12];const path=frames=>frames.map((f,i)=>`${i?'L':'M'}${point(f.position).join(',')}`).join(' ');
  map.append(svg('path',{d:path(dataset.frames),class:'map-route'}));map.append(svg('path',{id:'map-progress',class:'map-progress'}));
  dataset.entities.forEach((entity,i)=>{const [x,y]=point(entity.position);const node=svg('g',{transform:`translate(${x},${y})`,role:'button',tabindex:'0','aria-label':`平面图选择${entity.label}`,'aria-pressed':'false','data-map-entity':entity.id});node.append(svg('circle',{r:5}),svg('text',{y:2},i+1));node.addEventListener('click',()=>selectEntity(entity.id));node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEntity(entity.id);}});map.append(node);});
  map.append(svg('circle',{id:'map-rov',r:2.4,class:'rov-dot'}));
}
function updateStationStates(entityId){
  document.querySelectorAll('[data-entity]').forEach(button=>{button.setAttribute('aria-pressed',button.dataset.entity===entityId);const entity=dataset.entities.find(e=>e.id===button.dataset.entity);button.querySelector('.sample-mark').textContent=entity.sample?(collected()[entity.sample.id]?'◆':'◇'):'';});
  document.querySelectorAll('[data-map-entity]').forEach(node=>node.setAttribute('aria-pressed',node.dataset.mapEntity===entityId));
}
function renderObservation(view,entity){
  if(!entity)return;activeEntity=entity;
  $('station-kind').textContent=entityType(entity);$('station-code').textContent=`STATION / ${String(dataset.entities.findIndex(e=>e.id===entity.id)+1).padStart(2,'0')}`;
  $('station-title').textContent=entity.label;$('station-depth').textContent=`水深 ${entity.depth.toLocaleString()} m`;$('station-phase').textContent=view.phase.label;
  $('station-description').textContent=entity.description;$('station-observation').textContent=entity.observation;
  const currentEvent=view.selectedEvent||view.visitedEvents.at(-1)||dataset.events[0];$('event-title').textContent=currentEvent.title;$('event-detail').textContent=currentEvent.detail;
  $('station-event-time').textContent=`本站事件：航次第 ${currentEvent.time} 分钟`;
  const entityIndex=dataset.entities.findIndex(item=>item.id===entity.id);$('scene-station-code').textContent=`STATION ${String(entityIndex+1).padStart(2,'0')} / ${String(dataset.entities.length).padStart(2,'0')} · ${clock(currentEvent.time)}`;$('scene-station-name').textContent=entity.label;$('scene-event-summary').textContent=currentEvent.detail;$('scene-previous-station').disabled=entityIndex===0;$('scene-next-station').disabled=entityIndex===dataset.entities.length-1;
  const note=observationNotes[`${dataset.id}.${entity.id}`]||{focus:kindNames[entity.kind],method:entity.sample?'虚拟观察记录':'沿站点巡视',compare:'对照前后站点的地形与环境'};
  $('observation-focus').textContent=note.focus;$('observation-method').textContent=note.method;$('observation-compare').textContent=note.compare;
  const recorded=entity.sample&&collected()[entity.sample.id];$('collect-sample').disabled=!entity.sample||Boolean(recorded);$('collect-sample').textContent=recorded?'✓ 已加入报告':entity.sample?'＋ 记录样本':'此站无采样记录';
  $('sample-hint').textContent=entity.sample?`${entity.sample.category} · ${entity.sample.name}`:'沿着航线继续探索，寻找带 ◇ 标记的采样站。';
  $('station-sources').replaceChildren();for(const id of entity.sourceIds||[]){const link=document.createElement('a');link.href=sources.get(id)?.url||`method.html#sources`;link.textContent=sourceNames[id]||'科普来源';link.target='_blank';link.rel='noopener noreferrer';$('station-sources').append(link);}
}
function render(view){
  const time=view.state.time,reading=interpolateTrack(dataset.frames,time),contextEvent=view.selectedEvent||view.visitedEvents.at(-1)||dataset.events[0],entity=dataset.entities.find(item=>item.id===contextEvent.entityId);
  ocean.update({...view,activeEntity:entity,selectedEvent:contextEvent},reading);
  $('time-slider').value=time;$('mission-clock').textContent=clock(time);$('mission-clock').title=`航次已进行 ${time.toFixed(1)} 分钟`;$('current-phase').textContent=view.phase.label;$('current-event').textContent=contextEvent.title;$('visited-count').textContent=`${view.visitedEvents.length} / ${dataset.events.length}`;
  const upcoming=dataset.events.find(event=>event.time>time);
  $('telemetry-context').textContent=Math.abs(time-contextEvent.time)<.05?`本站模拟读数 · 第 ${contextEvent.time} 分钟`:upcoming?`途中模拟读数 · 前往${dataset.entities.find(e=>e.id===upcoming.entityId).label}`:'航次末段模拟读数';
  $('telemetry-depth').replaceChildren(document.createTextNode(Math.round(reading.depth).toLocaleString()),Object.assign(document.createElement('small'),{textContent:'m'}));
  $('telemetry-temperature').replaceChildren(document.createTextNode(reading.temperature.toFixed(1)),Object.assign(document.createElement('small'),{textContent:'°C'}));
  $('telemetry-battery').replaceChildren(document.createTextNode(Math.round(reading.battery)),Object.assign(document.createElement('small'),{textContent:'%'}));
  $('play-button').textContent=view.state.playing?'Ⅱ':'▶';$('play-button').setAttribute('aria-pressed',view.state.playing);$('play-button').setAttribute('aria-label',view.state.playing?'暂停航次回放':'开始航次回放');
  const selectedIndex=dataset.events.findIndex(e=>e.id===view.state.selectedEventId);$('previous-event').disabled=time<=dataset.min&&selectedIndex<=0;$('next-event').disabled=time>=dataset.max;
  document.querySelectorAll('[data-phase]').forEach(button=>button.setAttribute('aria-current',button.dataset.phase===view.phase.id));
  document.querySelectorAll('[data-event]').forEach(button=>button.setAttribute('aria-current',button.dataset.event===contextEvent.id));
  for(const layer of ['route','labels']){document.querySelector(`[data-layer="${layer}"]`).checked=view.state.visibleLayers[layer];ocean.setLayer(layer,view.state.visibleLayers[layer]);}
  const currentKey=`${dataset.id}/${contextEvent.id}/${view.phase.id}`;if(currentKey!==lastContext){renderObservation(view,entity);updateStationStates(entity.id);lastContext=currentKey;}
  const points=dataset.frames.filter(frame=>frame.time<=time).concat([reading]);$('map-progress')?.setAttribute('d',points.map((f,i)=>`${i?'L':'M'}${f.position[0]*192+14},${f.position[1]*103+12}`).join(' '));$('map-rov')?.setAttribute('cx',reading.position[0]*192+14);$('map-rov')?.setAttribute('cy',reading.position[1]*103+12);
  const profile=$('depth-profile'),profileX=35+(time-dataset.min)/(dataset.max-dataset.min)*175,profileY=12+(reading.depth-Number(profile.dataset.low))/(Number(profile.dataset.high)-Number(profile.dataset.low))*62;$('profile-cursor').setAttribute('d',`M${profileX},10V76`);$('profile-position').setAttribute('cx',profileX);$('profile-position').setAttribute('cy',profileY);
  updateUrl();managePlayback(view.state.playing);
}
function managePlayback(playing){
  if(playing&&!playingTimer){playStamp=performance.now();playingTimer=setInterval(()=>{if(document.hidden){playStamp=performance.now();return;}const now=performance.now(),elapsed=Math.min((now-playStamp)/1000,.4);playStamp=now;const next=Math.min(dataset.max,Math.round((store.getState().time+elapsed*3*speed)*100)/100);store.dispatch({type:'SET_TIME',time:next});if(next>=dataset.max){store.dispatch({type:'SET_PLAYING',playing:false});showNotice('本次航次回放完成。打开航次报告，整理你的发现。');}},90);}
  if(!playing&&playingTimer){clearInterval(playingTimer);playingTimer=null;}
}
function updateUrl(force=false){
  if(!store||!missionReady)return;const now=performance.now();if(!force&&store.getState().playing&&now-lastUrlWrite<500)return;
  const query=new URLSearchParams(store.encode());query.set('view',cameraMode);query.set('look',presentationMode);
  query.set('fx',['terrain','plumes'].filter(layer=>document.querySelector(`[data-layer="${layer}"]`).checked).join(','));
  query.set('context',$('context-labels').checked?'1':'0');
  if(pilot?.active){const state=pilot.getState();query.set('pilot',state.camera);try{query.set('pose',encodePilotPose({position:state.position,heading:state.heading}));if(state.camera!=='cockpit')query.set('cam',encodeCameraState(ocean.getCameraState()));}catch{}}
  else if(film?.active)query.set('film',film.getView().shot.id);
  else try{const pose=ocean.getCameraState?.();if(pose)query.set('cam',encodeCameraState(pose));}catch{/* Keep a valid mission link when a camera is outside its sharing bounds. */}
  const next=`${location.pathname}?${query}${location.hash}`;if(next!==`${location.pathname}${location.search}${location.hash}`)history.replaceState(null,'',next);lastUrlWrite=now;
}
function setPresentation(mode,{write=true}={}){
  presentationMode=mode==='dive'?'dive':'survey';ocean.setPresentation?.(presentationMode);
  if(dataset)$('scene-caption').textContent=presentationMode==='survey'?`水下测绘总览 · 约 ${dataset.baseDepth.toLocaleString()} m 的模拟海床`:`深海海床 · ${dataset.baseDepth.toLocaleString()} m 附近 / 潜器灯光观察`;
  document.querySelectorAll('[data-presentation]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.presentation===presentationMode));
  if(write)updateUrl(true);
}
function setCamera(mode,{presentation=null}={}){cameraMode=['overview','follow','top'].includes(mode)?mode:'overview';ocean.setCamera(cameraMode);document.querySelectorAll('[data-camera]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.camera===cameraMode));setPresentation(presentation||(cameraMode==='follow'?'dive':'survey'),{write:false});updateUrl(true);}
function navigateEvent(direction){if(!store)return;const state=store.getState();if(state.selectedEventId===null){const event=direction>0?dataset.events.find(e=>e.time>state.time):dataset.events.findLast(e=>e.time<state.time);if(event)act({type:'SELECT_EVENT',id:event.id},{pause:true});else act({type:'SET_PLAYING',playing:false});}else act({type:direction>0?'NEXT':'PREVIOUS'},{pause:true});}
async function getMission(meta){if(dataCache.has(meta.id))return dataCache.get(meta.id);const response=await fetch(meta.url,{cache:'no-cache'});if(!response.ok)throw new Error(`航次资料加载失败 (${response.status})`);const data=await response.json();dataCache.set(meta.id,data);return data;}
function loadMission(id,query=null){
  pilot?.stop();film?.stop({focus:false});const meta=missions.find(mission=>mission.id===id)||missions[0];if(store)act({type:'SET_PLAYING',playing:false});missionReady=false;showLoading();$('mission-select').value=meta.id;
  return loadGate.run(()=>getMission(meta),data=>{
    const nextStore=createExplorer(data);let desiredCamera='overview',desiredPresentation='survey',cameraPose=null,desiredEffects=null,desiredFilm=null,desiredContext=true,desiredPilot=null,pilotPose=null,warning='';
    if(query){
      const parameters=new URLSearchParams(query);desiredCamera=parameters.get('view')||'overview';desiredPresentation=parameters.get('look')==='dive'?'dive':'survey';
      if(parameters.has('cam'))try{if(parameters.getAll('cam').length!==1)throw new TypeError('重复镜头参数');cameraPose=decodeCameraState(parameters.get('cam'));desiredCamera=cameraPose.mode;}catch{warning='镜头参数未通过校验，已使用默认观察角度。';}
      if(parameters.has('fx')){const value=parameters.get('fx'),effects=value?value.split(','):[];if(parameters.getAll('fx').length===1&&new Set(effects).size===effects.length&&effects.every(layer=>['terrain','plumes'].includes(layer)))desiredEffects=effects;else warning='部分图层参数无效，已保留默认显示。';}
      if(parameters.has('film')){if(parameters.getAll('film').length===1&&parameters.get('film'))desiredFilm=parameters.get('film');else warning='导演章节参数无效，已保留自由探索。';}
      if(parameters.has('pilot')){if(parameters.getAll('pilot').length===1&&['chase','cockpit','orbit'].includes(parameters.get('pilot')))desiredPilot=parameters.get('pilot');else warning='驾驶参数无效，已保留站点探索。';}
      if(parameters.has('pose'))try{if(parameters.getAll('pose').length!==1||!desiredPilot)throw new TypeError('驾驶位置参数无效');pilotPose=decodePilotPose(parameters.get('pose'));}catch{warning='驾驶位置参数无效，将从当前站位接管。';}
      if(parameters.has('context')){if(parameters.getAll('context').length===1&&['0','1'].includes(parameters.get('context')))desiredContext=parameters.get('context')==='1';else warning='物体标注参数无效，已恢复默认显示。';}
      for(const key of ['view','look','cam','fx','film','context','pilot','pose'])parameters.delete(key);
      try{if([...parameters.keys()].every(key=>key==='dataset'))nextStore.dispatch({type:'SELECT_EVENT',id:desiredFilm?data.events[0].id:meta.entryEventId||data.events[0].id});else nextStore.restore(parameters.toString());}catch{nextStore.dispatch({type:'SELECT_EVENT',id:data.events[0].id});cameraPose=null;warning='链接参数无效，已回到本航次起点。';}
    }
    else {nextStore.dispatch({type:'SELECT_EVENT',id:data.events[0].id});desiredPresentation='dive';desiredFilm=`${meta.id}-establish`;}
    unsubscribe?.();store?.destroy();dataset=data;store=nextStore;index=createEntityIndex(dataset.entities);lastContext='';activeEntity=null;tourIndex=-1;
    $('mission-title').textContent=dataset.title;$('mission-description').textContent=dataset.description;$('mission-kicker').textContent=`EXPEDITION / ${dataset.id==='vents'?'01':'02'}`;$('mission-length').textContent=`${dataset.max} 分钟 · ${dataset.entities.length} 个站点`;$('scene-caption').textContent=`深海海床 · ${dataset.baseDepth.toLocaleString()} m 附近 / 潜器灯光观察`;
    $('time-slider').min=dataset.min;$('time-slider').max=dataset.max;$('mission-end').textContent=clock(dataset.max);$('station-search').value='';$('search-results').hidden=true;
    buildLists();document.querySelector('.expedition-panel').scrollTop=0;ocean.setMission(dataset);for(const layer of ['terrain','plumes']){const input=document.querySelector(`[data-layer="${layer}"]`);if(desiredEffects)input.checked=desiredEffects.includes(layer);ocean.setLayer(layer,input.checked);}
    $('context-labels').checked=desiredContext;ocean.setContextLabels?.(desiredContext);
    unsubscribe=store.subscribe(render);render(store.getView());setCamera(desiredCamera,{presentation:desiredPresentation});
    if(cameraPose)try{ocean.restoreCameraState?.(cameraPose);const restored=ocean.getCameraState?.();if(restored&&!isSameCameraState(cameraPose,restored))warning='已把贴地或遮挡的镜头调整为可见观察角度。';}catch{setCamera(desiredCamera,{presentation:desiredPresentation});warning='该镜头不适用于当前场景，已恢复默认观察角度。';}
    else if(!query&&activeEntity)ocean.focusEntity(activeEntity.id,true);
    renderSamples();film.configure(dataset.id,dataset);pilot.configure(dataset);environmentGuide.configure(dataset);missionReady=true;reveal();if(desiredPilot){pilot.start({pose:pilotPose,camera:desiredPilot});if(cameraPose)ocean.restorePilotCameraState(cameraPose);if(pilot.getState().recovery?.adjusted)warning='原位置靠近岩壁或超出安全范围，已移到附近安全位置，可继续驾驶。';}else if(desiredFilm){const shotIndex=film.getView().shots.findIndex(shot=>shot.id===desiredFilm);if(shotIndex>=0)film.start({index:shotIndex,playing:false});else warning='该导演章节不存在，已保留自由探索。';}updateUrl(true);if(warning)showNotice(warning);
    document.title=`${dataset.title} · 深蓝航迹`;
  },error=>{showLoading(`${error.message}。可以重试，或切换另一条航次。`,true);});
}

function renderSamples(){
  if(!dataset)return;const count=validSampleCount();$('sample-count').textContent=count;renderGoal();
  $('report-intro').textContent=`${dataset.title} / ${dataset.subtitle}。从 ${sampleEntities().length} 项可记录的发现中收集至少 3 项，形成自己的观察档案。`;
  $('report-status').textContent=count>=3?`✓ 已完成发现目标 · ${count} 项记录`:`已记录 ${count} 项 / 目标 3 项`;$('sample-progress').value=Math.min(count,3);$('clear-samples').disabled=!count;
  $('sample-catalog').replaceChildren();sampleEntities().forEach(entity=>{
    const record=collected()[entity.sample.id],event=dataset.events.find(e=>e.id===record?.eventId)||dataset.events.find(e=>e.entityId===entity.id),card=document.createElement('article');card.className=`specimen${record?' recorded':''}`;
    const type=document.createElement('span');type.textContent=entity.sample.category;const title=document.createElement('h3');title.textContent=entity.sample.name;
    const meta=document.createElement('p');meta.className='specimen-meta';meta.textContent=`${entity.label} · 站点事件 ${clock(event.time)}（时:分）`;
    const desc=document.createElement('p');desc.textContent=entity.sample.description;const button=document.createElement('button');button.textContent=record?'✓ 已记录 · 返回站点':'前往观察站 ↗';button.addEventListener('click',()=>{$('report-dialog').close();selectEntity(entity.id);});
    card.append(type,title,meta,desc,button);$('sample-catalog').append(card);
  });
  const recorded=sampleEntities().filter(entity=>collected()[entity.sample.id]);$('report-comparison').hidden=recorded.length<2;
  const previousA=$('compare-a').value,previousB=$('compare-b').value;
  for(const id of ['compare-a','compare-b']){$(id).replaceChildren();for(const entity of recorded){const option=document.createElement('option');option.value=entity.id;option.textContent=entity.label;$(id).append(option);}}
  if(recorded.length>=2){$('compare-a').value=recorded.some(e=>e.id===previousA)?previousA:recorded[0].id;$('compare-b').value=recorded.some(e=>e.id===previousB)&&previousB!==$('compare-a').value?previousB:recorded.find(e=>e.id!==$('compare-a').value).id;renderComparison();}
}
function renderComparison(){
  const a=dataset.entities.find(e=>e.id===$('compare-a').value),b=dataset.entities.find(e=>e.id===$('compare-b').value),body=$('comparison-body');body.replaceChildren();
  if(!a||!b||a.id===b.id){$('comparison-feedback').textContent='请选择两项不同站点的记录。';return;}
  $('comparison-feedback').textContent='比较位置、观测对象和记录方式；数值来自教学航次。';
  const eventFor=entity=>dataset.events.find(e=>e.id===collected()[entity.sample.id]?.eventId)||dataset.events.find(e=>e.entityId===entity.id);
  const noteFor=entity=>observationNotes[`${dataset.id}.${entity.id}`]||{};
  for(const [label,left,right] of [['站点',a.label,b.label],['事件时刻',clock(eventFor(a).time)+'（时:分）',clock(eventFor(b).time)+'（时:分）'],['站点水深',a.depth+' m',b.depth+' m'],['观察对象',noteFor(a).focus||kindNames[a.kind],noteFor(b).focus||kindNames[b.kind]],['记录方式',noteFor(a).method||a.sample.category,noteFor(b).method||b.sample.category],['对比线索',noteFor(a).compare||'—',noteFor(b).compare||'—']]){
    const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';heading.textContent=label;row.append(heading);for(const value of [left,right]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);
  }
}
function exportReport(){if(!dataset)return;const entries=sampleEntities().filter(entity=>collected()[entity.sample.id]).map(entity=>({sample:entity.sample,station:{id:entity.id,name:entity.label,depth:entity.depth,position:entity.position},sourceIds:entity.sourceIds,event:dataset.events.find(e=>e.id===collected()[entity.sample.id]?.eventId)||dataset.events.find(e=>e.entityId===entity.id),observation:observationNotes[`${dataset.id}.${entity.id}`]||null,...collected()[entity.sample.id]}));const report={format:'abyss-field-report/v1',mission:{id:dataset.id,title:dataset.title,subtitle:dataset.subtitle},teachingSimulation:true,dataNotice:dataset.dataNotice,createdAt:new Date().toISOString(),currentTime:store.getState().time,goal:{required:3,recorded:entries.length,complete:entries.length>=3},samples:entries,shareUrl:location.href,sources:[...new Set(entries.flatMap(entry=>entry.sourceIds))].map(id=>sources.get(id)||{id})};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`abyss-${dataset.id}-report.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showNotice('航次报告已生成，包含你的记录与资料来源。');}

$('tour-button').addEventListener('click',advanceTour);
$('compare-a').addEventListener('change',renderComparison);$('compare-b').addEventListener('change',renderComparison);
document.querySelectorAll('[data-presentation]').forEach(button=>button.addEventListener('click',()=>{setPresentation(button.dataset.presentation);$('layer-menu').hidden=true;$('layers-button').setAttribute('aria-expanded','false');}));
$('pilot-button').addEventListener('click',()=>pilot.start());
$('director-pilot').addEventListener('click',()=>pilot.start());
$('environment-button').addEventListener('click',()=>{if(!pilot.active&&!pilot.start())return;environmentGuide.open({playing:true,fromStart:true});});
$('mission-select').addEventListener('change',event=>{const id=event.target.value,query=pilot.active?new URLSearchParams({dataset:id,pilot:pilot.getState().camera,look:'dive'}).toString():null;loadMission(id,query);});
$('retry-button').addEventListener('click',()=>{if(sceneFailed)location.reload();else loadMission($('mission-select').value);});
$('play-button').addEventListener('click',()=>{if(!store)return;if(store.getState().time>=dataset.max)store.dispatch({type:'SELECT_EVENT',id:dataset.events[0].id});const playing=!store.getState().playing;if(playing&&cameraMode!=='top')setCamera('follow');act({type:'SET_PLAYING',playing});});
$('play-speed').addEventListener('change',event=>speed=Number(event.target.value));
$('time-slider').addEventListener('input',event=>act({type:'SET_TIME',time:Number(event.target.value)},{pause:true,focus:false}));
$('time-slider').addEventListener('change',()=>focusCurrentStation());
$('previous-event').addEventListener('click',()=>navigateEvent(-1));$('next-event').addEventListener('click',()=>navigateEvent(1));
document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>setCamera(button.dataset.camera)));
$('reset-camera').addEventListener('click',()=>{setCamera('overview');ocean.resetCamera();});
$('focus-station').addEventListener('click',()=>focusCurrentStation({force:true}));
$('scene-return-station').addEventListener('click',()=>focusCurrentStation({force:true}));
$('scene-previous-station').addEventListener('click',()=>navigateStation(-1));$('scene-next-station').addEventListener('click',()=>navigateStation(1));
$('catalog-button').addEventListener('click',()=>setCatalog($('mission-catalog').hidden));$('close-catalog').addEventListener('click',()=>setCatalog(false));$('catalog-backdrop').addEventListener('click',()=>setCatalog(false));
document.querySelector('.skip').addEventListener('click',()=>{setCatalog(true);$('station-search').focus();});
$('immersive-button').addEventListener('click',()=>setImmersive(!document.body.classList.contains('immersive')));
$('collect-sample').addEventListener('click',collectSample);
$('layers-button').addEventListener('click',()=>{const open=$('layer-menu').hidden;$('layer-menu').hidden=!open;$('layers-button').setAttribute('aria-expanded',open);});
$('context-labels').addEventListener('change',event=>{ocean.setContextLabels?.(event.target.checked);updateUrl(true);});
document.querySelectorAll('[data-layer]').forEach(input=>input.addEventListener('change',()=>{const layer=input.dataset.layer;if(['route','labels'].includes(layer))act({type:'SET_LAYER',layer,visible:input.checked});else{ocean.setLayer(layer,input.checked);updateUrl(true);}}));
$('collapse-card').addEventListener('click',()=>setImmersive(true));
for(const name of ['stations','events'])$(name+'-tab').addEventListener('click',()=>{for(const other of ['stations','events']){$(other+'-tab').setAttribute('aria-pressed',name===other);$('mission-'+other).hidden=name!==other;}});
$('station-search').addEventListener('input',()=>{const query=$('station-search').value.trim(),results=$('search-results');results.replaceChildren();results.hidden=!query;if(!query||!index)return;const matches=index.search(query,6);if(!matches.length){const p=document.createElement('p');p.textContent='没有匹配的站点。试试“热液”“珊瑚”，或切换航次。';results.append(p);}for(const entity of matches){const button=document.createElement('button');button.type='button';button.textContent=entity.label;const small=document.createElement('small');small.textContent=`${entityType(entity)} · ${entity.depth.toLocaleString()} m`;button.append(small);button.addEventListener('click',()=>selectEntity(entity.id));results.append(button);}});
$('station-search').addEventListener('keydown',event=>{if(event.key==='Escape')$('search-results').hidden=true;if(event.key==='Enter')$('search-results').querySelector('button')?.click();});
$('report-button').addEventListener('click',()=>{if(pilot.active)ocean.stopPilot();else if(film.active)film.pause();else act({type:'SET_PLAYING',playing:false},{fromTour:true});renderSamples();$('report-dialog').showModal();});
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
$('clear-samples').addEventListener('click',()=>{samples[dataset.id]={};const persisted=saveSamples();if(!persisted)showNotice('本次会话的记录已清空；浏览器未允许保存该变化。');renderSamples();if(activeEntity){renderObservation(store.getView(),activeEntity);updateStationStates(activeEntity.id);}});
$('download-report').addEventListener('click',exportReport);
$('share-button').addEventListener('click',async()=>{try{updateUrl(true);await navigator.clipboard.writeText(location.href);showNotice(pilot.active?'驾驶位置链接已复制；打开后停在同一位置，可继续自由驾驶。':film.active?'导演章节链接已复制；打开后停在本章，可继续播放。':'视角链接已复制，可恢复航次、站点、图层与当前镜头。');}catch{showNotice('自动复制未成功，请复制浏览器地址栏中的链接。');}});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{showNotice('当前窗口不支持全屏，可扩大浏览器查看。');}});
document.addEventListener('keydown',event=>{if(film?.active||pilot?.active)return;if(event.key==='Escape'){setCatalog(false);$('layer-menu').hidden=true;$('search-results').hidden=true;$('layers-button').setAttribute('aria-expanded','false');}if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName)||event.target.isContentEditable||document.querySelector('dialog[open]'))return;if(event.code==='Space'){event.preventDefault();$('play-button').click();}if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();navigateEvent(event.key==='ArrowRight'?1:-1);}});
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);loadMission(params.get('dataset')||'vents',params.has('dataset')?location.search:null);});
window.addEventListener('pagehide',()=>{ocean.stopPilot?.();film?.pause();clearTimeout(cameraUrlTimer);if(playingTimer)clearInterval(playingTimer);playingTimer=null;});
window.addEventListener('pageshow',event=>{if(event.persisted&&store)act({type:'SET_PLAYING',playing:false});});
fetch('./sources.json').then(response=>response.ok?response.json():[]).then(items=>{for(const source of Array.isArray(items)?items:items.sources||[])sources.set(source.id,source);if(activeEntity)renderObservation(store.getView(),activeEntity);}).catch(()=>{});
fetch('./data/observation-notes.json?v=2').then(response=>response.ok?response.json():{}).then(notes=>{observationNotes=notes;if(activeEntity&&store){renderObservation(store.getView(),activeEntity);renderSamples();}}).catch(()=>{});
const initial=new URLSearchParams(location.search);loadMission(initial.get('dataset')||'vents',initial.has('dataset')?location.search:null);
