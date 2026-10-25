// SPDX-License-Identifier: GPL-3.0-only
// Browser input and a compact driving desk. No route clock or sample storage.
import {describeEnvironmentPosition} from './core/environment-location.mjs';

const CAMERA_MODES=['chase','cockpit','orbit'];
const KEY_ACTIONS={KeyW:'forward',KeyS:'backward',KeyA:'left',KeyD:'right',KeyQ:'strafeLeft',KeyE:'strafeRight',KeyR:'rise',KeyF:'sink',Space:'emergency'};
const MOTIONS={forward:{forward:1},backward:{forward:-1},left:{turn:-1},right:{turn:1},strafeLeft:{strafe:-1},strafeRight:{strafe:1},rise:{lift:1},sink:{lift:-1}};
const ZERO={forward:0,strafe:0,lift:0,turn:0};
const finite=value=>Number.isFinite(value)?value:0;
const fixed=(value,digits=0)=>finite(value).toFixed(digits);

function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function button(text,className){const node=element('button',text,className);node.type='button';return node;}
function editable(target){return target instanceof Element&&(target.matches('input,select,textarea')||target.isContentEditable||Boolean(target.closest('[contenteditable="true"]')));}

export function createPilotExperience({scene,onEnter=()=>{},onExit=()=>{},onChange=()=>{},onInspect=()=>{}}={}){
  if(!scene)throw new TypeError('自由驾驶需要场景适配器');
  const stage=document.querySelector('.scene-stage');
  if(!stage)throw new TypeError('自由驾驶找不到三维场景容器');
  let active=false,destroyed=false,mission=null,frame=0,lastHud=0,lastNotify=0,lastSignature='',inputSignature='';
  const keys=new Set(),pointers=new Map(),motionButtons=new Map(),cameraButtons=new Map(),listeners=[];
  const listen=(node,type,handler,options)=>{node.addEventListener(type,handler,options);listeners.push(()=>node.removeEventListener(type,handler,options));};
  const desk=element('section',undefined,'pilot-console');desk.id='pilot-console';desk.hidden=true;desk.setAttribute('aria-label','潜器自由驾驶台');
  const heading=element('div',undefined,'pilot-heading'),title=element('div');
  title.append(element('span','你在控制潜器','pilot-kicker'),element('h2','自由驾驶'));
  const exit=button('结束驾驶','pilot-exit');heading.append(title,exit);
  const status=element('p','航次回放已暂停。','pilot-status');status.setAttribute('role','status');
  const instruments=element('dl',undefined,'pilot-instruments');
  const readouts={};
  for(const [id,label]of [['clearance','模型地形余量'],['speed','模型航速'],['heading','机头朝向']]){
    const item=element('div'),value=element('dd','—');item.append(element('dt',label),value);if(id==='clearance')item.title='整机包络相对地形安全约束的剩余垂直空间，使用模型单位；这不是海水水深。';instruments.append(item);readouts[id]=value;
  }
  const coordinates=element('p','模型位置 X — · Y — · Z —','pilot-coordinates');
  const cameras=element('div',undefined,'pilot-cameras');cameras.setAttribute('role','group');cameras.setAttribute('aria-label','驾驶观察视角');
  for(const [mode,label]of [['chase','1 跟随潜器'],['cockpit','2 前向视角'],['orbit','3 自由镜头']]){
    const control=button(label);control.setAttribute('aria-pressed','false');cameraButtons.set(mode,control);cameras.append(control);
    listen(control,'click',()=>changeCamera(mode));
  }
  const cameraHint=element('p','拖动绕潜器观察，滚轮调整距离。','pilot-camera-hint');
  const controls=element('div',undefined,'pilot-pad');controls.setAttribute('role','group');controls.setAttribute('aria-label','按住方向操纵潜器，松开停止输入');
  for(const [action,symbol,label,key]of [
    ['left','↶','左转','A'],['forward','▲','前进','W'],['right','↷','右转','D'],['rise','↑','上升','R'],
    ['strafeLeft','◀','左移','Q'],['backward','▼','后退','S'],['strafeRight','▶','右移','E'],['sink','↓','下潜','F']
  ]){
    const control=button(undefined,'pilot-motion');control.dataset.action=action;control.setAttribute('aria-label','按住'+label+'，键盘'+key);control.setAttribute('aria-pressed','false');
    control.append(element('span',symbol,'pilot-direction'),element('span',label),element('kbd',key));controls.append(control);bindHold(control,action);
  }
  const actions=element('div',undefined,'pilot-actions'),emergency=button('空格 · 急停','pilot-emergency'),reset=button('回到驾驶起点','pilot-reset');
  emergency.setAttribute('aria-label','按住急停，键盘空格');emergency.setAttribute('aria-pressed','false');bindHold(emergency,'emergency');
  // A keyboard-activated button has no pointerdown. Preserve its expected click.
  listen(emergency,'click',event=>{if(event.detail===0)releaseAll();});actions.append(emergency,reset);
  const nearest=element('div',undefined,'pilot-nearest'),nearestText=element('p','最近站：—'),inspect=button('查看站点介绍');nearest.append(nearestText,inspect);
  const help=element('details',undefined,'pilot-help'),helpBody=element('div');
  help.append(element('summary','操纵说明与范围'));
  helpBody.append(element('p','W/S 前后 · A/D 转向 · Q/E 左右横移 · R/F 升降。按住移动，空格按住急停；1/2/3 切换视角。屏幕方向按钮也可长按。'),element('p','跟随视角围绕潜器观察；自由镜头可独立拖动、平移和缩放，方向按钮与驾驶键仍操纵潜器。打开菜单、弹窗或离开页面会停止操纵。'),element('p','防撞覆盖机身、机械臂和转向范围；受阻后可后退、横移或上升。模型地形余量为整机相对地形约束剩余的垂直空间，接近0时应避让；设备碰撞另行检查。探索区为 ±580 模型单位，边缘会预留整机尺寸。仪表不是实测深度或真实航速，驾驶不写入采样报告。'));
  help.append(helpBody);desk.append(heading,status,instruments,coordinates,cameras,cameraHint,controls,actions,nearest,help);stage.append(desk);

  function getState(){return scene.getPilotState?.()||{enabled:false,camera:'chase'};}
  function blocked(allowFocusTransfer=false){return document.hidden||Boolean(document.querySelector('dialog[open],#mission-catalog:not([hidden]),#layer-menu:not([hidden])'))||(!allowFocusTransfer&&editable(document.activeElement));}
  function currentActions(){const actions=new Set([...keys].map(code=>KEY_ACTIONS[code]));for(const action of pointers.values())actions.add(action);return actions;}
  function applyInput(){
    if(!active)return;
    const actions=currentActions(),next={...ZERO},halt=actions.has('emergency')||blocked();
    if(!halt)for(const action of actions){const motion=MOTIONS[action];if(motion)for(const [axis,value]of Object.entries(motion))next[axis]=Math.max(-1,Math.min(1,next[axis]+value));}
    const signature=JSON.stringify(next);
    if(signature!==inputSignature){scene.setPilotInput?.(next);inputSignature=signature;}
    for(const [action,controls]of motionButtons)for(const control of controls)control.setAttribute('aria-pressed',String(actions.has(action)&&!blocked()));
  }
  function releaseAll(){
    keys.clear();pointers.clear();
    for(const controls of motionButtons.values())for(const control of controls)control.setAttribute('aria-pressed','false');
    if(active){scene.setPilotInput?.({...ZERO});scene.stopPilot?.();inputSignature=JSON.stringify(ZERO);}
  }
  function bindHold(control,action){
    if(!motionButtons.has(action))motionButtons.set(action,[]);motionButtons.get(action).push(control);
    listen(control,'pointerdown',event=>{
      if(!active||event.button!==0||blocked(true))return;
      // A direction press is an explicit focus transfer from a chapter/range
      // control. Do not discard the first hold merely because that input had
      // focus; keyboard typing and open menus remain blocked as before.
      control.focus({preventScroll:true});event.preventDefault();
      pointers.set(event.pointerId,action);try{control.setPointerCapture(event.pointerId);}catch{/* A detached pointer is cleared globally. */}
      if(action==='emergency')scene.stopPilot?.();applyInput();
    });
    listen(control,'contextmenu',event=>event.preventDefault());
    listen(control,'lostpointercapture',()=>{if(pointers.size)releaseAll();});
  }
  function focusCanvas(){stage.querySelector('canvas')?.focus({preventScroll:true});}
  function changeCamera(mode){
    if(!active||!CAMERA_MODES.includes(mode))return;releaseAll();scene.setPilotCamera?.(mode);renderHud(true);
  }
  function notifyState(state,force=false){
    const now=performance.now(),p=state.position||{},viewpoint=state.viewpoint||{},signature=[fixed(p.x,1),fixed(p.y,1),fixed(p.z,1),fixed(state.heading,2),state.camera,state.enabled,state.nearest?.id,viewpoint.mode,viewpoint.subjectLabel,viewpoint.vehicleRegion].join('/');
    if(force||(now-lastNotify>=500&&signature!==lastSignature)){lastNotify=now;lastSignature=signature;onChange(state);}
  }
  function renderHud(force=false){
    const state=getState(),camera=CAMERA_MODES.includes(state.camera)?state.camera:'chase',near=state.nearest,viewpoint=state.viewpoint||{},remote=viewpoint.mode==='remote';
    readouts.clearance.textContent=fixed(state.bodyClearance??state.clearance,1)+' 单位';readouts.speed.textContent=fixed(state.speed,1)+' 单位/秒';
    readouts.heading.textContent=fixed(((finite(state.heading)*180/Math.PI)%360+360)%360)+'°';
    for(const [mode,control]of cameraButtons){control.setAttribute('aria-pressed',String(camera===mode));if(mode==='chase'){control.textContent=remote?'1 返回潜器':'1 跟随潜器';control.setAttribute('aria-label',remote?'返回潜器，恢复跟随镜头':'1 跟随潜器');}}
    const subject=(typeof viewpoint.subjectLabel==='string'?viewpoint.subjectLabel.split(' · ')[0].trim().slice(0,20):'')||'自由观察点';
    cameraHint.textContent=remote?`镜头在看${subject}${Number.isFinite(viewpoint.cameraDistance)?`，距潜器约${fixed(viewpoint.cameraDistance)}模型单位`:''}。${viewpoint.returnsOnDrive?'操纵可回到原镜头，':'点“返回潜器”恢复跟随，'}仍可自由拖动。`:camera==='orbit'?'镜头独立观察；方向按钮仍控制潜器。':camera==='cockpit'?'从机头向前观察；拖动调整视线。':'拖动绕潜器观察，滚轮调整距离。';
    cameraHint.dataset.remote=String(remote);desk.dataset.viewpoint=remote?'remote':'vehicle';
    const region=typeof viewpoint.vehicleRegion==='string'?viewpoint.vehicleRegion:describeEnvironmentPosition(mission?.id,state).label,phase={surface:'水面附近',descent:'水层中',seabed:'海床附近'}[viewpoint.vehiclePhase]||'';
    const kicker=title.querySelector('.pilot-kicker'),place=region?['潜器',phase,region].filter(Boolean).join(' · '):(mission?.title?mission.title+' · ':'')+'你在控制无人潜器';
    if(kicker.textContent!==place)kicker.textContent=place;kicker.title=place;
    nearestText.textContent=near?.id?'最近站：'+near.label+' · '+fixed(near.distance)+' 模型单位':'最近站：—';inspect.disabled=!near?.id;
    const p=state.position||{},edge=Math.max(Math.abs(finite(p.x)),Math.abs(finite(p.z)))>560-finite(state.bodyRadius);
    coordinates.textContent='模型位置 X '+fixed(p.x,1)+' · Y '+fixed(p.y,1)+' · Z '+fixed(p.z,1);
    status.textContent=blocked()?'已暂停操纵 · 关闭菜单或弹窗后继续':currentActions().has('emergency')?'急停中 · 松开空格或急停按钮后继续':state.blocked?.rotation?'转向受阻 · 按R上升，或反向转动脱离':state.blocked?.obstacle?'实体阻挡 · 后退、横移或按R上升':state.blocked?.terrain?'岩壁或海床阻挡 · 后退、横移或按R上升':state.blocked?.ceiling?'已到模拟上限 · 按F下降或转向':edge?'接近模拟探索边界 · 可转向继续观察':remote?`镜头看${subject} · 潜器仍由你驾驶`:'自由驾驶中 · 航次回放已暂停';
    notifyState(state,force);
  }
  function loop(stamp){
    if(!active||destroyed)return;
    if(blocked()&&(keys.size||pointers.size))releaseAll();
    if(stamp-lastHud>=100){lastHud=stamp;renderHud();}
    frame=requestAnimationFrame(loop);
  }
  function start({pose,camera='chase'}={}){
    if(destroyed)throw new Error('驾驶界面已经销毁');
    if(!CAMERA_MODES.includes(camera))throw new TypeError('驾驶视角需要 chase、cockpit 或 orbit');
    if(active){if(pose)scene.setPilotEnabled?.(true,{pose,camera});else scene.setPilotCamera?.(camera);releaseAll();renderHud(true);focusCanvas();return getState();}
    if(onEnter()===false)return false;
    try{if(scene.setPilotEnabled?.(true,{pose,camera})===false){onExit();return false;}}catch(error){onExit();throw error;}
    active=true;desk.hidden=false;document.body.classList.add('pilot-mode');releaseAll();lastHud=0;lastSignature='';
    title.querySelector('.pilot-kicker').textContent=(mission?.title?mission.title+' · ':'')+'你在控制无人潜器';
    renderHud(true);focusCanvas();frame=requestAnimationFrame(loop);return getState();
  }
  function stop({notify=true}={}){
    if(!active)return getState();releaseAll();active=false;if(frame)cancelAnimationFrame(frame);frame=0;
    scene.setPilotEnabled?.(false);desk.hidden=true;document.body.classList.remove('pilot-mode');
    if(notify){onExit();notifyState(getState(),true);}return getState();
  }
  listen(exit,'click',()=>stop());
  listen(reset,'click',()=>{if(!active)return;releaseAll();scene.resetPilot?.();renderHud(true);focusCanvas();});
  listen(inspect,'click',()=>{if(!active)return;releaseAll();const near=getState().nearest;if(near?.id)onInspect(near.id);});
  listen(window,'keydown',event=>{
    if(!active||event.ctrlKey||event.altKey||event.metaKey)return;
    if(blocked()||editable(event.target)){releaseAll();return;}
    const code=event.code,action=KEY_ACTIONS[code],cameraIndex=['Digit1','Digit2','Digit3'].indexOf(code);
    if(!action&&cameraIndex<0)return;event.preventDefault();event.stopPropagation();
    if(cameraIndex>=0){if(!event.repeat)changeCamera(CAMERA_MODES[cameraIndex]);return;}
    // Focus/visibility resets require a fresh press, not a held-key repeat.
    if(event.repeat&&!keys.has(code))return;keys.add(code);if(action==='emergency')scene.stopPilot?.();applyInput();
  },true);
  listen(window,'keyup',event=>{
    if(!KEY_ACTIONS[event.code])return;const wasHeld=keys.delete(event.code);if(active&&wasHeld){event.preventDefault();event.stopPropagation();applyInput();}
  },true);
  listen(window,'pointerup',()=>{if(active)releaseAll();});listen(window,'pointercancel',()=>{if(active)releaseAll();});
  listen(window,'blur',()=>{if(active)releaseAll();});listen(window,'pagehide',()=>{if(active)releaseAll();});
  listen(document,'visibilitychange',()=>{if(active&&document.hidden)releaseAll();});
  listen(document,'focusin',event=>{if(active&&editable(event.target))releaseAll();});
  const observer=new MutationObserver(()=>{if(active&&blocked())releaseAll();});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  for(const node of document.querySelectorAll('dialog,#mission-catalog,#layer-menu'))observer.observe(node,{attributes:true,attributeFilter:['open','hidden']});
  return {start,stop,get active(){return active;},configure(data){if(active)stop();mission=data||null;},getState,destroy(){if(destroyed)return;stop({notify:false});destroyed=true;observer.disconnect();listeners.forEach(remove=>remove());desk.remove();}};
}
