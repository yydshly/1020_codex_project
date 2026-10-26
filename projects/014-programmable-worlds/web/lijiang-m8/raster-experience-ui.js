/**
 * Persistent navigation and capture controls. No renderer/service is created.
 *
 * Integration notes (raster-main.js owns the actual scene):
 * - Add importmap entry "mediabunny":
 *   "../lijiang-flythrough/node_modules/mediabunny/dist/bundles/mediabunny.min.mjs".
 * - captureSnapshot(): deep-copy time, paused/suspended/mode, free camera pose,
 *   yaw/pitch, renderer size/pixel ratio, camera aspect/FOV, clean/settings UI.
 * - pause(true), suspend(true): stop the live scheduler; onCaptureLock(true)
 *   should also gate the application's own input/resize paths. This module
 *   waits for getState().rendering === false before resizing the live canvas.
 * - resizeForCapture(w,h): pixelRatio=1, exact w*h drawing buffer, aspect 16/9;
 *   resize the reflection target if needed. Do not resize the CSS viewport.
 * - prepareFrame(t,info): flight camera at EXACT t, finish all LOD prewarming,
 *   update sky/water/shadows at t, render, then await the real GPU fence.
 * - restoreSnapshot(saved): restore dimensions/settings/camera/UI and render
 *   that exact saved pose while live scheduling remains locked. Do not use
 *   renderAt(saved.time) for a saved free pose if renderAt forces flight mode.
 * - resume(saved): restore the saved pause/suspend state and scheduler clocks.
 *   onCaptureLock(false) runs after this, including cancellation/failure paths.
 * - move({forward,right,up,yaw,pitch}): metre deltas and radian look deltas;
 *   keep the existing world bounds/terrain clearance in the application.
 * - setViewPreset('river'|'bay'|'mountains'|'reflection'),
 *   setQualityPreset('smooth'|'clear'): scene-owned view/quality changes.
 *   getState().viewPreset / qualityPreset supply their current selection.
 *
 * The controls/CSS are mounted here. No HTML nodes are required. V starts the
 * fixed 45s/1080p/60fps job. Completion never triggers a download automatically.
 */

const FORMAT=Object.freeze({width:1920,height:1080,fps:60,duration:45,bitrate:24000000});
const FILENAME='lijiang-1920x1080-60fps-2700frames.webm';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cancelled=()=>new DOMException('已取消航拍导出。','AbortError');
const CSS=`
.rf-exp-panel{position:absolute;z-index:35;top:96px;left:50%;transform:translateX(-50%);width:min(420px,calc(100vw - 32px));padding:15px 17px;border:1px solid #ffffff32;border-radius:13px;background:#142e2beF;box-shadow:0 10px 34px #0003;color:#e4e9dd;font:13px/1.55 system-ui}
.rf-exp-panel[hidden],.rf-exp-reveal[hidden],.rf-exp-pads[hidden],.rf-nav[hidden],.rf-nav-body[hidden]{display:none!important}.rf-exp-panel progress{display:block;width:100%;height:7px;margin:10px 0;accent-color:#c6c9a5}.rf-exp-actions{display:flex;gap:9px;align-items:center;margin-top:11px}.rf-exp-detail{opacity:.7;font-size:12px;margin-top:4px}.rf-exp-reveal{position:absolute;z-index:45;right:max(18px,env(safe-area-inset-right));top:max(18px,env(safe-area-inset-top));border:1px solid #ffffff40;background:#17352bc9;color:#edf2e9;border-radius:22px;padding:8px 13px;font:13px system-ui}
body.clean .rf-exp-panel[data-active="true"]{display:block!important}
.rf-exp-pads{position:absolute;inset:0;pointer-events:none;z-index:25}.rf-exp-pad{position:absolute;bottom:calc(98px + env(safe-area-inset-bottom));width:108px;height:108px;border:1px solid #ffffff38;border-radius:50%;background:radial-gradient(circle,#24423866,#142c2855);touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:auto;color:#edf2e9a8;display:grid;place-items:center;font:12px system-ui}.rf-exp-move{left:max(18px,env(safe-area-inset-left))}.rf-exp-look{right:max(18px,env(safe-area-inset-right))}.rf-exp-thumb{position:absolute;left:37px;top:37px;width:32px;height:32px;border-radius:50%;border:1px solid #ffffff55;background:#d2dac733;pointer-events:none}.rf-exp-rise{position:absolute;left:50%;bottom:calc(121px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;pointer-events:auto}.rf-exp-rise button{min-width:47px;min-height:41px;touch-action:none}.rf-exp-start{white-space:nowrap}.rf-exp-pads button{color:inherit}body.clean .rf-exp-pads{display:none!important}
.rf-nav{position:absolute;z-index:32;right:max(14px,env(safe-area-inset-right));bottom:calc(90px + env(safe-area-inset-bottom));width:264px;max-width:calc(100vw - 28px);box-sizing:border-box;border:1px solid #ffffff35;border-radius:12px;background:#152f2deF;color:#edf2e9;box-shadow:0 6px 24px #0003;font:12px/1.4 system-ui;user-select:none;-webkit-user-select:none}
.rf-nav-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px}.rf-nav-head strong{font-size:13px;font-weight:600}.rf-nav button{box-sizing:border-box;min-height:32px;padding:6px 8px;border:1px solid #ffffff30;border-radius:7px;background:#ffffff0b;color:inherit;font:inherit;cursor:pointer;touch-action:none}.rf-nav button:hover:not(:disabled){background:#ffffff1f}.rf-nav button:focus-visible{outline:2px solid #d3e2b2;outline-offset:2px}.rf-nav button:disabled{opacity:.45;cursor:default}.rf-nav button[aria-pressed="true"],.rf-nav button[data-held="true"]{background:#b7d19c30;border-color:#b7d19c9c}.rf-nav-body{padding:0 10px 10px;max-height:calc(100dvh - 204px);overflow:auto;overscroll-behavior:contain}.rf-nav-label{margin:6px 0 5px;color:#c3d3cb;font-size:11px}.rf-nav-grid{display:grid;gap:5px}.rf-nav-presets,.rf-nav-quality{grid-template-columns:repeat(2,minmax(0,1fr))}.rf-nav-moves{grid-template-columns:repeat(3,minmax(0,1fr))}.rf-nav-look{grid-template-columns:repeat(4,minmax(0,1fr))}.rf-nav-look button{padding:6px 2px}.rf-nav-foot{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:8px;color:#bacdc3;font-size:10px}.rf-nav-foot button{font-size:11px;min-height:29px;padding:4px 7px}.rf-nav[data-collapsed="true"]{width:166px}.rf-nav[data-pads="true"]{bottom:auto;top:96px}.rf-nav[data-pads="true"] .rf-nav-body{max-height:calc(100dvh - 370px)}body.clean .rf-nav{display:none!important}
@media(max-width:600px){.rf-nav{right:max(10px,env(safe-area-inset-right));bottom:calc(108px + env(safe-area-inset-bottom));width:252px}.rf-nav button{min-height:38px}.rf-nav-body{max-height:calc(100dvh - 300px)}.rf-exp-pad{bottom:calc(98px + env(safe-area-inset-bottom));width:92px;height:92px}.rf-exp-thumb{left:29px;top:29px}.rf-exp-rise{bottom:calc(108px + env(safe-area-inset-bottom))}.rf-exp-panel{top:114px}.rf-nav[data-pads="true"]{bottom:auto;top:146px}.rf-nav[data-pads="true"] .rf-nav-body{max-height:calc(100dvh - 400px)}}
`;

/** All capture callbacks are awaited. No simulated frame/encoder is supplied. */
export function createRasterExperienceUI({renderer,canvas=renderer?.domElement,
  getState,captureSnapshot,pause,suspend,resizeForCapture,prepareFrame,restoreSnapshot,resume,
  onCaptureLock=()=>{},setMode,move,setClean,setViewPreset,setQualityPreset,onState=()=>{},
  toolbar=document.querySelector('#toolbar'),mount=document.body,
  recorderFactory=async options=>{const {createRecorder}=await import('../lijiang-flythrough/src/recorder.js');return createRecorder(options);},
  movementSpeed=28,lookSpeed=.8,showTouchPads='auto'}={}) {
  if (!canvas||!mount) throw new Error('Raster experience controls require the actual canvas and a DOM mount.');
  for (const [name,callback] of Object.entries({getState,captureSnapshot,pause,suspend,
    resizeForCapture,prepareFrame,restoreSnapshot,resume}))
    if(typeof callback!=='function')throw new Error('Missing raster capture callback: '+name);
  const events=new AbortController(),signal=events.signal;
  const style=document.createElement('style');style.dataset.rasterExperience='1';style.textContent=CSS;
  document.head.append(style);
  const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
  const button=(text,label)=>{const b=node('button','',text);b.type='button';if(label)b.setAttribute('aria-label',label);return b;};
  const startButton=button('导出航拍 V','导出45秒1080p60帧航拍');startButton.className='rf-exp-start';
  const downloadButton=button('下载航拍');downloadButton.hidden=true;
  const toolbarHost=toolbar??node('div','rf-exp-actions ui');
  if(!toolbar){toolbarHost.style.cssText='position:absolute;top:22px;right:24px;z-index:30';mount.append(toolbarHost);}
  toolbarHost.append(startButton,downloadButton);
  const panel=node('section','rf-exp-panel ui');panel.hidden=true;panel.setAttribute('aria-label','航拍导出');
  const label=node('div','','准备航拍'),detail=node('div','rf-exp-detail','1920 × 1080 · 60 帧/秒 · 45 秒');
  const progress=document.createElement('progress');progress.max=1;progress.value=0;
  const actions=node('div','rf-exp-actions'),cancelButton=button('取消导出'),panelDownload=button('下载 WebM'),closeButton=button('收起');
  actions.append(cancelButton,panelDownload,closeButton);panel.append(label,detail,progress,actions);mount.append(panel);
  const reveal=button('显示控件');reveal.className='rf-exp-reveal';reveal.hidden=true;mount.append(reveal);
  const pads=node('div','rf-exp-pads ui'),left=node('div','rf-exp-pad rf-exp-move','移动'),right=node('div','rf-exp-pad rf-exp-look','视角');
  left.setAttribute('role','group');left.setAttribute('aria-label','拖动前后左右移动');
  right.setAttribute('role','group');right.setAttribute('aria-label','拖动左右转向和俯仰');
  const thumb=node('span','rf-exp-thumb');left.append(thumb);
  if(showTouchPads===true)pads.style.display='block';
  const vertical=node('div','rf-exp-rise'),upButton=button('↑','升高'),downButton=button('↓','降低');
  vertical.append(upButton,downButton);pads.append(left,right,vertical);mount.append(pads);
  const navigation=node('section','rf-nav ui');navigation.id='rf-navigation';navigation.setAttribute('aria-label','视角与移动控制');
  const navHead=node('div','rf-nav-head'),navTitle=node('strong','','探索漓江'),collapseButton=button('收起','收起导航面板');collapseButton.dataset.navAction='collapse';collapseButton.setAttribute('aria-controls','rf-navigation-body');
  navHead.append(navTitle,collapseButton);
  const navBody=node('div','rf-nav-body');navBody.id='rf-navigation-body';
  const presetGrid=node('div','rf-nav-grid rf-nav-presets'),qualityGrid=node('div','rf-nav-grid rf-nav-quality'),moveGrid=node('div','rf-nav-grid rf-nav-moves'),lookGrid=node('div','rf-nav-grid rf-nav-look');
  const presetButtons=[],qualityButtons=[],motionButtons=[];
  for(const [value,text]of [['river','沿江'],['bay','开阔水湾'],['mountains','群山'],['reflection','低位倒影']]){const b=button(text,'切换到'+text+'视角');b.dataset.viewPreset=value;presetButtons.push(b);presetGrid.append(b);}
  for(const [value,text]of [['smooth','流畅'],['clear','清晰']]){const b=button(text,text+'画质');b.dataset.qualityPreset=value;qualityButtons.push(b);qualityGrid.append(b);}
  for(const [value,text]of [['left','← 左移'],['forward','↑ 前进'],['right','右移 →'],['up','↟ 升高'],['backward','↓ 后退'],['down','↡ 降低']]){const b=button(text,text.replace(/[←↑→↟↓↡]/g,'').trim()+'，按住连续移动');b.dataset.move=value;motionButtons.push(b);moveGrid.append(b);}
  for(const [value,text]of [['yaw-left','转左'],['yaw-right','转右'],['pitch-up','抬头'],['pitch-down','低头']]){const b=button(text,'按住'+text);b.dataset.move=value;motionButtons.push(b);lookGrid.append(b);}
  const navFoot=node('div','rf-nav-foot'),navHint=node('span','','按住移动 · 松开即停'),padsButton=button('开启拖盘');padsButton.dataset.navAction='pads';navFoot.append(navHint,padsButton);
  navBody.append(presetGrid,node('div','rf-nav-label','画质'),qualityGrid,node('div','rf-nav-label','移动'),moveGrid,node('div','rf-nav-label','视角'),lookGrid,navFoot);navigation.append(navHead,navBody);mount.append(navigation);
  const locks=new Map(),originalCanvasPointerEvents=canvas.style.pointerEvents;
  let disposed=false,hidden=document.body.classList.contains('clean'),job=null,recorder=null,lastResult=null;
  let state={phase:'idle',active:false,progress:0,frameCount:0,totalFrames:2700,error:null,metadata:null};
  let movePointer=null,lookPointer=null,risePointer=null,axes={x:0,y:0,z:0,yaw:0,pitch:0};
  let motionRAF=0,motionAt=0,motionBusy=false,modePromise=null,inputGeneration=0;
  let collapsed=false,touchPadsEnabled=showTouchPads===true,navigationBusy=false;
  const heldControls=new Map();
  const supportsExport=()=>typeof globalThis.VideoEncoder==='function'&&typeof globalThis.VideoFrame==='function';
  const sceneState=()=>{try{return getState()??{};}catch{return{};}};
  function publish(patch={}) {state={...state,...patch};renderUI();try{onState({...state});}catch{}return {...state};}
  function lockControls(value) {
    if(value){for(const root of document.querySelectorAll('#toolbar,#bottom,#settings,#rf-navigation'))
      for(const control of root.querySelectorAll('button,input,select,textarea')){
        if(!locks.has(control))locks.set(control,control.disabled);control.disabled=true;
      }canvas.style.pointerEvents='none';}
    else {for(const [control,disabled]of locks)if(control.isConnected)control.disabled=disabled;
      locks.clear();canvas.style.pointerEvents=originalCanvasPointerEvents;}
  }
  function renderUI() {
    const scene=sceneState(),active=!!job,completed=!!lastResult;
    panel.dataset.active=String(active);
    startButton.disabled=active||navigationBusy||scene.qualityBusy||!scene.ready||disposed;
    startButton.textContent=active?'正在制作航拍…':'导出航拍 V';
    downloadButton.hidden=!completed;downloadButton.disabled=active||disposed;
    const previous=completed&&state.phase!=='complete';
    downloadButton.textContent=previous?'下载上一份航拍':'下载航拍';
    panelDownload.textContent=previous?'下载上一份 WebM':'下载 WebM';
    cancelButton.hidden=!active;cancelButton.disabled=state.phase==='cancelling';
    panelDownload.hidden=!completed||active;closeButton.hidden=active;
    progress.value=clamp(state.progress||0,0,1);
    const names={preparing:'正在准备高质量航拍…',encoding:`正在制作 ${state.frameCount} / 2700 帧`,
      finalizing:'正在封装 WebM…',restoring:'正在恢复观察视角…',cancelling:'正在取消并恢复视角…',
      complete:'航拍已完成，可下载 WebM。',cancelled:'导出已取消，观察视角已恢复。',error:state.error||'导出未完成。',idle:'准备航拍'};
    label.textContent=names[state.phase]??state.phase;
    detail.textContent=state.phase==='complete'?`1920 × 1080 · 60 帧/秒 · ${state.metadata?.frameCount??2700} 帧`
      :'1920 × 1080 · 60 帧/秒 · 45 秒';
    reveal.hidden=!hidden;reveal.textContent=active?'显示导出控制':'显示控件';
    const blocked=active||navigationBusy||disposed||!scene.ready||!!scene.capturing||!!scene.qualityBusy||!!scene.hostSuspended||!!scene.documentSuspended;
    navHint.textContent=scene.qualityBusy?'正在切换画质…':'按住移动 · 松开即停';
    navigation.hidden=hidden;navigation.dataset.collapsed=String(collapsed);navigation.dataset.pads=String(touchPadsEnabled);navBody.hidden=collapsed;
    collapseButton.textContent=collapsed?'展开':'收起';collapseButton.setAttribute('aria-expanded',String(!collapsed));collapseButton.setAttribute('aria-label',collapsed?'展开导航面板':'收起导航面板');collapseButton.disabled=active||disposed;
    for(const b of presetButtons){b.disabled=blocked||typeof setViewPreset!=='function';b.setAttribute('aria-pressed',String(scene.viewPreset===b.dataset.viewPreset));}
    for(const b of qualityButtons){b.disabled=blocked||typeof setQualityPreset!=='function';b.setAttribute('aria-pressed',String((scene.qualityPreset||'smooth')===b.dataset.qualityPreset));}
    for(const b of motionButtons)b.disabled=blocked||typeof move!=='function';
    padsButton.disabled=blocked||showTouchPads===false||typeof move!=='function';padsButton.textContent=touchPadsEnabled?'关闭拖盘':'开启拖盘';padsButton.setAttribute('aria-pressed',String(touchPadsEnabled));
    pads.hidden=hidden||blocked||!touchPadsEnabled||showTouchPads===false||typeof move!=='function';
    if(blocked&&(heldControls.size||movePointer!==null||lookPointer||risePointer||axes.yaw||axes.pitch))resetInput();
  }
  function setHidden(value) {
    hidden=!!value;resetInput();
    if(typeof setClean==='function')setClean(hidden);else document.body.classList.toggle('clean',hidden);
    renderUI();return hidden;
  }
  function resetInput() {
    inputGeneration++;
    for(const [key,held]of [...heldControls]){heldControls.delete(key);held.element.dataset.held='false';if(held.pointerId!==undefined)try{if(held.element.hasPointerCapture(held.pointerId))held.element.releasePointerCapture(held.pointerId);}catch{}}
    for(const [element,id] of [[left,movePointer],[right,lookPointer?.id],
      [risePointer?.element,risePointer?.id]])if(element&&id!==null&&id!==undefined)
      try{if(element.hasPointerCapture(id))element.releasePointerCapture(id);}catch{}
    movePointer=null;lookPointer=null;risePointer=null;axes={x:0,y:0,z:0,yaw:0,pitch:0};
    thumb.style.transform='translate(0,0)';if(motionRAF)cancelAnimationFrame(motionRAF);motionRAF=0;motionAt=0;
  }
  async function ensureFree() {
    if(sceneState().mode==='free'||typeof setMode!=='function')return;
    if(!modePromise)modePromise=Promise.resolve(setMode('free')).finally(()=>modePromise=null);
    await modePromise;
  }
  function motion(now) {
    motionRAF=0;if(disposed||job||hidden||navigationBusy)return;
    const dt=Math.min(.05,Math.max(0,(now-(motionAt||now))/1000));motionAt=now;
    const held={x:0,y:0,z:0,yaw:0,pitch:0};for(const control of heldControls.values())held[control.axis]+=control.direction;
    if(!motionBusy&&(axes.x||axes.y||axes.z||axes.yaw||axes.pitch||Object.values(held).some(Boolean))){
      const generation=inputGeneration;
      const x=clamp(axes.x+held.x,-1,1),y=clamp(axes.y+held.y,-1,1),length=Math.max(1,Math.hypot(x,y));
      const delta={forward:-y/length*movementSpeed*dt,right:x/length*movementSpeed*dt,
        up:clamp(axes.z+held.z,-1,1)*movementSpeed*dt,yaw:axes.yaw+clamp(held.yaw,-1,1)*lookSpeed*dt,pitch:axes.pitch+clamp(held.pitch,-1,1)*lookSpeed*dt};axes.yaw=axes.pitch=0;motionBusy=true;
      const valid=()=>{const s=sceneState();return !job&&!hidden&&!disposed&&!navigationBusy&&!s.hostSuspended&&!s.documentSuspended&&!s.qualityBusy&&!s.capturing&&generation===inputGeneration;};
      Promise.resolve().then(()=>{if(valid())return ensureFree();}).then(()=>{if(valid())return move(delta);})
        .catch(error=>{panel.hidden=false;publish({phase:'error',error:error.message});})
        .finally(()=>{motionBusy=false;});
    }
    if(movePointer!==null||lookPointer||risePointer||heldControls.size||axes.yaw||axes.pitch)
      motionRAF=requestAnimationFrame(motion);else motionAt=0;
  }
  function requestMotion(){if(!motionRAF)motionRAF=requestAnimationFrame(motion);}
  function leftPosition(event) {
    const r=left.getBoundingClientRect(),radius=r.width*.35;
    const x=(event.clientX-r.left-r.width*.5)/radius,y=(event.clientY-r.top-r.height*.5)/radius;
    const length=Math.max(1,Math.hypot(x,y));axes.x=x/length;axes.y=y/length;
    thumb.style.transform=`translate(${axes.x*radius}px,${axes.y*radius}px)`;requestMotion();
  }
  left.addEventListener('pointerdown',e=>{if(!inputAllowed())return;e.preventDefault();movePointer=e.pointerId;try{left.setPointerCapture(e.pointerId);}catch{}leftPosition(e);},{signal});
  left.addEventListener('pointermove',e=>{if(e.pointerId===movePointer){e.preventDefault();leftPosition(e);}},{signal});
  const leftEnd=e=>{if(e.pointerId!==movePointer)return;movePointer=null;axes.x=axes.y=0;thumb.style.transform='translate(0,0)';};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])left.addEventListener(name,leftEnd,{signal});
  right.addEventListener('pointerdown',e=>{if(!inputAllowed())return;e.preventDefault();lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};try{right.setPointerCapture(e.pointerId);}catch{}requestMotion();},{signal});
  right.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer?.id)return;e.preventDefault();
    axes.yaw-=clamp((e.clientX-lookPointer.x)*.004,-.2,.2);axes.pitch-=clamp((e.clientY-lookPointer.y)*.004,-.2,.2);
    lookPointer.x=e.clientX;lookPointer.y=e.clientY;requestMotion();},{signal});
  const rightEnd=e=>{if(e.pointerId===lookPointer?.id)lookPointer=null;};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])right.addEventListener(name,rightEnd,{signal});
  const commands={forward:['y',-1],backward:['y',1],left:['x',-1],right:['x',1],up:['z',1],down:['z',-1],'yaw-left':['yaw',1],'yaw-right':['yaw',-1],'pitch-up':['pitch',1],'pitch-down':['pitch',-1]};
  const inputAllowed=()=>{const s=sceneState();return !job&&!hidden&&!disposed&&!navigationBusy&&s.ready&&!s.capturing&&!s.qualityBusy&&!s.hostSuspended&&!s.documentSuspended&&typeof move==='function';};
  function endHeld(key){const held=heldControls.get(key);if(!held)return;heldControls.delete(key);inputGeneration++;held.element.dataset.held=String([...heldControls.values()].some(v=>v.element===held.element));if(held.pointerId!==undefined)try{if(held.element.hasPointerCapture(held.pointerId))held.element.releasePointerCapture(held.pointerId);}catch{}}
  function bindHold(element,command){
    const [axis,direction]=commands[command];
    element.addEventListener('pointerdown',e=>{if(!inputAllowed()||element.disabled||e.button!==0)return;e.preventDefault();e.stopPropagation();const key='p:'+e.pointerId;endHeld(key);heldControls.set(key,{element,axis,direction,pointerId:e.pointerId});element.dataset.held='true';try{element.setPointerCapture(e.pointerId);}catch{}requestMotion();},{signal});
    element.addEventListener('pointermove',e=>{const key='p:'+e.pointerId;if(heldControls.get(key)?.element!==element)return;const r=element.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)endHeld(key);},{signal});
    for(const name of ['pointerup','pointercancel','lostpointercapture','pointerleave'])element.addEventListener(name,e=>{const key='p:'+e.pointerId;if(heldControls.get(key)?.element===element)endHeld(key);},{signal});
    const keyboardKey=e=>'k:'+(e.code||e.key)+':'+command;
    element.addEventListener('keydown',e=>{if(![' ','Enter'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(!inputAllowed()||element.disabled||e.repeat)return;heldControls.set(keyboardKey(e),{element,axis,direction});element.dataset.held='true';requestMotion();},{signal});
    element.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();endHeld(keyboardKey(e));}},{signal});
    element.addEventListener('blur',()=>{for(const [key,value]of heldControls)if(value.element===element&&value.pointerId===undefined)endHeld(key);},{signal});
    element.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
  }
  for(const b of motionButtons)bindHold(b,b.dataset.move);bindHold(upButton,'up');bindHold(downButton,'down');
  for(const name of ['pointerup','pointercancel'])window.addEventListener(name,e=>endHeld('p:'+e.pointerId),{capture:true,signal});
  collapseButton.addEventListener('click',()=>{if(job||disposed)return;resetInput();collapsed=!collapsed;renderUI();},{signal});
  padsButton.addEventListener('click',()=>{if(!inputAllowed()||showTouchPads===false)return;resetInput();touchPadsEnabled=!touchPadsEnabled;renderUI();},{signal});
  async function navigate(callback,value){
    if(navigationBusy||job||disposed||hidden||!sceneState().ready||typeof callback!=='function')return;
    resetInput();navigationBusy=true;renderUI();
    try{while(motionBusy)await sleep(5);if(!job&&!disposed)await callback(value);}
    catch(error){panel.hidden=false;publish({phase:'error',error:error.message});}
    finally{navigationBusy=false;renderUI();}
  }
  for(const b of presetButtons)b.addEventListener('click',()=>navigate(setViewPreset,b.dataset.viewPreset),{signal});
  for(const b of qualityButtons)b.addEventListener('click',()=>navigate(setQualityPreset,b.dataset.qualityPreset),{signal});
  async function restoreSession(session) {
    if(session.restoring)return session.restoring;
    session.restoring=(async()=>{
      const errors=[];publish({phase:session.cancelled?'cancelling':'restoring'});
      if(session.snapshotCaptured){
        try{await restoreSnapshot(session.snapshot);}catch(e){errors.push(e);}
        try{await resume(session.snapshot);}catch(e){errors.push(e);}
      }
      try{if(session.locked)await onCaptureLock(false);}catch(e){errors.push(e);}
      hidden=session.hidden;
      try{if(typeof setClean==='function')await setClean(hidden);else document.body.classList.toggle('clean',hidden);}catch(e){errors.push(e);}
      lockControls(false);
      if(errors.length)throw new AggregateError(errors,'观察视角恢复失败：'+errors.map(e=>e.message).join('；'));
    })();return session.restoring;
  }
  async function waitQuiescent(session) {
    const until=performance.now()+60000;
    while(sceneState().rendering){if(session.cancelled)throw cancelled();
      if(performance.now()>until)throw new Error('上一帧未完成，无法开始固定帧导出。');await sleep(10);}
  }
  function check(session){if(session.cancelled||disposed)throw cancelled();}
  async function run(session) {
    let result=null,error=null;
    try {
      const movementDeadline=performance.now()+10000;
      while(motionBusy||navigationBusy){check(session);if(performance.now()>movementDeadline)throw new Error('相机输入尚未完成。');await sleep(10);}
      session.snapshot=await captureSnapshot();session.snapshotCaptured=true;check(session);
      session.locked=true;await onCaptureLock(true);await pause(true);await suspend(true);
      await waitQuiescent(session);check(session);
      recorder=await recorderFactory({renderer,canvas,getDuration:()=>45,
        resizeForCapture:async(w,h,info)=>{check(session);await resizeForCapture(w,h,info);check(session);return session;},
        renderAt:async(t,info)=>{check(session);await prepareFrame(t,info);check(session);},
        restoreAfterCapture:()=>restoreSession(session),
        onProgress:next=>publish({...next,active:true})});
      check(session);
      result=await recorder.start({...FORMAT,download:false});
      if(result?.blob){
        const m=result.metadata;
        if(!m?.timestampGridVerified||!m.fixedFrameRate||m.frameCount!==2700||m.width!==1920||m.height!==1080||m.fps!==60||Math.abs(m.duration-45)>1/60+.00001)
          throw new Error('航拍编码帧数、尺寸或45秒时间线不完整。');
        if(!session.cancelled)lastResult=result;
      }
    } catch(e) {if(e?.name!=='AbortError'&&!session.cancelled)error=e;}
    finally {
      try{await restoreSession(session);}catch(e){error=e;}
      if(job===session)job=null;
      publish(error?{phase:'error',active:false,error:error.message}
        :session.cancelled||result?.cancelled?{phase:'cancelled',active:false,error:null}
        :result?.blob?{phase:'complete',active:false,progress:1,frameCount:2700,metadata:result.metadata,error:null}
        :{phase:'error',active:false,error:'航拍没有生成可用文件。'});
    }
    if(error)throw error;
    return session.cancelled?{cancelled:true}:result;
  }
  function start() {
    if(disposed)return Promise.reject(new Error('航拍控制已释放。'));
    if(job)return Promise.reject(new Error('请先完成或取消当前航拍。'));
    if(!sceneState().ready)return Promise.reject(new Error('场景尚未生成完成。'));
    if(!supportsExport()){panel.hidden=false;publish({phase:'error',error:'当前浏览器不支持WebCodecs固定帧导出。'});
      return Promise.reject(new Error(state.error));}
    resetInput();hidden=document.body.classList.contains('clean');
    const session={cancelled:false,snapshotCaptured:false,locked:false,hidden,restoring:null,done:null};
    job=session;panel.hidden=false;lockControls(true);
    publish({phase:'preparing',active:true,progress:0,frameCount:0,totalFrames:2700,error:null,metadata:null});
    session.done=Promise.resolve().then(()=>run(session));return session.done;
  }
  async function cancel() {
    const session=job;if(!session)return false;session.cancelled=true;resetInput();publish({phase:'cancelling'});
    if(recorder)await recorder.cancel();
    await session.done.catch(()=>{});return true;
  }
  function download() {
    if(job||!lastResult?.blob)throw new Error('还没有可下载的已完成航拍。');
    // Deliberately called only by an explicit Download control/API action.
    const url=URL.createObjectURL(lastResult.blob),a=document.createElement('a');
    a.href=url;a.download=FILENAME;a.hidden=true;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);return {filename:FILENAME,metadata:lastResult.metadata};
  }
  const fire=promise=>Promise.resolve(promise).catch(error=>{panel.hidden=false;publish({phase:'error',error:error.message});});
  startButton.addEventListener('click',()=>fire(start()),{signal});cancelButton.addEventListener('click',()=>fire(cancel()),{signal});
  for(const control of [downloadButton,panelDownload])control.addEventListener('click',()=>{try{download();}catch(e){fire(Promise.reject(e));}},{signal});
  closeButton.addEventListener('click',()=>panel.hidden=true,{signal});reveal.addEventListener('click',()=>setHidden(false),{signal});
  window.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName||''))return;
    const key=(event.key||'').toLowerCase();
    if(key==='h'||key==='v'||(job&&key==='escape')){
      event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
      if(key==='h')setHidden(!document.body.classList.contains('clean'));else if(key==='v'){if(!job)fire(start());}
      else fire(cancel());
    }else if(job){event.preventDefault();event.stopImmediatePropagation();}
  },{capture:true,signal});
  window.addEventListener('resize',event=>{if(job){event.stopImmediatePropagation();return;}renderUI();},{capture:true,signal});
  window.addEventListener('blur',resetInput,{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();},{signal});
  window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='worlds-visibility'&&event.data.visible!==true)resetInput();},{signal});
  canvas.addEventListener('pointerdown',event=>{if((hidden||document.body.classList.contains('clean'))&&!job){setHidden(false);event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal});
  const refreshTimer=setInterval(()=>{const scene=sceneState();if(!job){const nextHidden=typeof scene.uiHidden==='boolean'?scene.uiHidden:document.body.classList.contains('clean');if(nextHidden!==hidden)resetInput();hidden=nextHidden;}renderUI();},300);
  renderUI();
  return {start,cancel,download,setHidden,
    getResult:()=>lastResult?Object.freeze({blob:lastResult.blob,metadata:Object.freeze({...lastResult.metadata})}):null,
    getState:()=>({...state,active:!!job,supported:supportsExport(),
    hidden,hasDownload:!!lastResult,format:{...FORMAT,totalFrames:2700},restorationPending:!!job?.restoring,navigation:{collapsed,touchPadsEnabled,busy:navigationBusy,heldControls:heldControls.size}}),
    async dispose(){if(disposed)return;disposed=true;resetInput();try{await cancel();}
      finally{clearInterval(refreshTimer);events.abort();lockControls(false);for(const n of [startButton,downloadButton,panel,reveal,pads,navigation,style])n.remove();
        if(!toolbar)toolbarHost.remove();lastResult=null;await recorder?.dispose();}}};
}

export const RASTER_EXPORT_FORMAT=FORMAT;
