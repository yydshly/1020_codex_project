'use strict';

// Only this task's hidden localhost client receives DOM/input events. No
// system mouse/keyboard, visible window, or user browser is controlled.
const fs=require('node:fs'),path=require('node:path');
const {nativeImage}=require('electron');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function invariant(value,message){if(!value)throw new Error(message);}
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),ms);})]);}finally{clearTimeout(timer);}}
function statistics(image){const size=image.getSize(),pixels=image.toBitmap();let sum=0,square=0,n=0;for(let y=0;y<48;y++)for(let x=0;x<48;x++){const px=Math.floor(size.width*(.08+.84*(x+.5)/48)),py=Math.floor(size.height*(.08+.72*(y+.5)/48)),i=(py*size.width+px)*4,l=.2126*pixels[i+2]+.7152*pixels[i+1]+.0722*pixels[i];sum+=l;square+=l*l;n++;}const mean=sum/n;return {...size,meanLuminance:mean,luminanceStdDev:Math.sqrt(Math.max(0,square/n-mean*mean))};}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const BASE='http://127.0.0.1:8796/projects/014-programmable-worlds/web/';
const OLD_MODEL='819b849b252ff22970c66e6349cf9eb4f470ad1ec775260e355ab2480c7da227';
const WINDOW_LIGHTING='80836c3f6f8529ef088136e9628e75e100a820760c3c27c148ade87356a01b34';
const STATION_LIGHTING='62d64e53da7ccf5775e19ee4c704a2c3c105a7dafa9bae52fbc8cce8d889610c';
const STATION_MANIFEST='97eb5a39b308d200f0011f9732725a812b7794cca48553178a11e4841b0f882e';
function assertEntryMap(entries){
 invariant(Array.isArray(entries)&&entries.length===3,'Exactly source, window and independent station entries are required');
 const urls=entries.map(entry=>new URL(entry,BASE)),paths=urls.map(url=>url.pathname);
 invariant(urls.every(url=>url.origin===new URL(BASE).origin),'A hub entry left the task origin');
 invariant(paths[0]===new URL('runtime/source-live.html',BASE).pathname&&paths[1]===new URL('canal-real/index.html',BASE).pathname&&paths[2]===new URL('shipyard-station/index.html',BASE).pathname,'Third entry must be the independent station, not a second canal mode');
 invariant(urls[1].searchParams.get('experience')==='window'&&!urls[2].searchParams.has('experience')&&urls.slice(1).every(url=>url.searchParams.get('gi')!=='0'),'Wrong public world mode or unbaked export entry');
 return urls.map(url=>url.href);
}
function worldIdentity(preview){
 const s=preview.state||{},lighting=s.lighting||{},station=preview.index===2,sceneId=station?'shipyard-station':'canal-street',entry=new URL(preview.href);
 invariant(preview.kind===(station?'shipyard-station':'canal-real')&&s.sceneId===sceneId,'World API kind and authored sceneId disagree');
 invariant(entry.pathname===new URL(station?'shipyard-station/index.html':'canal-real/index.html',BASE).pathname,'The actual world document path is wrong');
 invariant(lighting.mode==='full-diffuse'&&/^[a-f0-9]{64}$/.test(lighting.modelSha256||''),'World has no verified complete diffuse model');
 invariant(lighting.lightingFingerprint===(station?STATION_LIGHTING:WINDOW_LIGHTING)&&s.runtimeLighting?.lightingFingerprint===lighting.lightingFingerprint,'World GI and runtime lighting identity disagree');
 invariant(station?lighting.modelSha256!==OLD_MODEL:lighting.modelSha256===OLD_MODEL&&s.experience==='window','The old city model or story mode cannot stand in for a second world');
 if(station){
  invariant(s.runtimeLighting.sceneId==='shipyard-station'&&lighting.model==='shipyard-lightmapped.glb','Station does not expose its own model and light rig');
  invariant(s.inputRevision==='station-manual-input-2','Station has not loaded the single-owner manual input handlers');
  invariant(s.runtimeRevision==='shipyard-oak2048-aftdeck-2'&&lighting.manifestSha256===STATION_MANIFEST&&String(lighting.manifestURL||'').endsWith('/shipyard-station/baked-r1/manifest-oak2048.json')&&lighting.sampling?.some(g=>g.key==='ShipyardGI_Station_oiled_oak'&&g.samples===2048),'Station is not running the actual final oak2048 package and aft-deck revision');
 }
 const suffix=station?'/shipyard-station/baked-r1/shipyard-lightmapped.glb':'/canal-real/baked-r4/canal-lightmapped.glb';
 const modelUrl=(preview.resources||[]).find(url=>new URL(url).pathname.endsWith(suffix));
 invariant(modelUrl,'The independently verified world model was not observed in actual resource requests');
 return {sceneId,kind:preview.kind,entryUrl:entry.href,modelUrl,modelSha256:lighting.modelSha256,lightingFingerprint:lighting.lightingFingerprint,...(station?{manifestSha256:lighting.manifestSha256,manifestURL:lighting.manifestURL,runtimeRevision:s.runtimeRevision,inputRevision:s.inputRevision}:{})};
}
function assertDistinctWorlds(windowWorld,stationWorld){
 invariant(windowWorld&&stationWorld&&windowWorld.sceneId!==stationWorld.sceneId&&windowWorld.kind!==stationWorld.kind&&new URL(windowWorld.entryUrl).pathname!==new URL(stationWorld.entryUrl).pathname&&windowWorld.modelUrl!==stationWorld.modelUrl&&windowWorld.modelSha256!==stationWorld.modelSha256&&windowWorld.lightingFingerprint!==stationWorld.lightingFingerprint,'Two independent authored worlds have not been established');
 return {window:windowWorld,station:stationWorld,scope:'Identity and real model-request checks; actual rendered images require separate visual review.'};
}

async function runHubAcceptance({window,projectDirectory,workspaceDirectory,backend,record,getFatal,getPresentation=()=>null}){
 const started=Date.now(),runId=new Date(started).toISOString().replace(/[:.]/g,'-'),candidate=process.env.NAPALI_HUB_STATION_CANDIDATE==='1';
 const mobileOnly=process.env.NAPALI_HUB_MOBILE_ONLY==='1',mobile=mobileOnly||process.env.NAPALI_HUB_MOBILE==='1';
 invariant(!process.env.NAPALI_HUB_CANAL_GI,'The former one-world/two-modes hub candidate is not a two-world acceptance');
 const category='hub-two-worlds'+(candidate?'-candidate':'')+(mobileOnly?'-mobile':''),notes=path.join(projectDirectory,'notes'),output=path.join(projectDirectory,'assets','hub-qa',backend,runId);
 const canonical=path.join(notes,category+'-acceptance.'+backend+'.json'),latest=path.join(notes,category+'-acceptance.'+backend+'.latest.json');
 fs.mkdirSync(output,{recursive:true});fs.mkdirSync(notes,{recursive:true});let previousPassed=false;
 if(fs.existsSync(canonical)){try{previousPassed=JSON.parse(fs.readFileSync(canonical,'utf8')).status==='passed';if(previousPassed&&!fs.existsSync(canonical.replace('.json','.baseline.json')))fs.copyFileSync(canonical,canonical.replace('.json','.baseline.json'));}catch{}}
 const report={runId,scene:'hub-two-worlds',backend,status:'running',candidateOverride:candidate,mobileOnly,tests:[],captures:[],timingSamples:[],activations:[],worldIdentities:{},errors:[],peakObservedLiveSceneDocuments:0,peakObservedHeavyScenes:0,windowPolicy:{show:false,focusable:false,skipTaskbar:true,...getPresentation()},scope:mobileOnly?'Focused actual mobile independent-station call/shot/docked-choice supplement; no old letter or complete departure replay.':'Actual sourceLive / canalReal window / independent stationWorld entries, model identities, native input and serialized release. No artwork-quality claim.'};
 const progressPath=path.join(workspaceDirectory,'.cache','napali-hub-qa-status-'+backend+'.json');
 const activatedIndices=new Set();
 function progress(phase,state=null){fs.writeFileSync(progressPath,JSON.stringify({...report,phase,elapsedSeconds:(Date.now()-started)/1000,application:state},null,2));record('hub-qa-progress',{phase,elapsedSeconds:(Date.now()-started)/1000});}
 async function evaluate(code,label='Own hidden hub call',ms=30000){if(getFatal())throw new Error(getFatal());invariant(!window.isDestroyed()&&!window.isVisible()&&!window.isFocused(),'Own hub QA window became visible, focused or destroyed');return bounded(window.webContents.executeJavaScript(code,false),ms,label);}
 async function readState(ms=150000){
  const state=await evaluate(`(async()=>({url:location.href,host:window.worldsHost||null,hub:window.worldHub?.getState()||null,bridge:await fetch('http://127.0.0.1:8797/health',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Source bridge unavailable');return r.json();}),previews:[...document.querySelectorAll('iframe.world-frame')].map((frame,index)=>{try{const child=frame.contentWindow;child.performance.setResourceTimingBufferSize?.(2000);const doc=frame.contentDocument,api=child.sourceLive||child.stationWorld||child.canalReal,video=doc?.querySelector('#source-video'),canvas=doc?.querySelector('#world canvas'),apiKinds=[child.sourceLive&&'source-live',child.canalReal&&'canal-real',child.stationWorld&&'shipyard-station'].filter(Boolean);return {index,source:frame.dataset.src,sourceAttribute:frame.getAttribute('src'),href:child.location.href,active:frame.dataset.active==='true',kind:apiKinds[0]||null,apiKinds,apiExposed:!!api,state:api?.getState()||null,resources:child.performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname.endsWith('.glb')).map(r=>r.name),canvas:canvas?{width:canvas.width,height:canvas.height}:null,media:video?{width:video.videoWidth,height:video.videoHeight,readyState:video.readyState,mediaStream:video.srcObject instanceof child.MediaStream,liveTracks:video.srcObject?.getTracks().filter(t=>t.readyState==='live').length||0}:null};}catch(error){return {index,source:frame.dataset.src,error:error.message};}})}))()`, 'Read original video / two independent worlds / bridge lifecycle',ms);
  const url=new URL(state.url);invariant(url.origin==='http://127.0.0.1:8796'&&url.pathname==='/projects/014-programmable-worlds/web/index.html','Hub left its own fixed page');
  const live=state.previews.filter(p=>p.href&&p.href!=='about:blank'),worlds=live.filter(p=>['canal-real','shipyard-station'].includes(p.kind)||/\/(canal-real|shipyard-station)\//.test(p.href)).length,heavy=worlds+Number(state.bridge.sessionActive);
  for(const preview of live)activatedIndices.add(preview.index);
  report.peakObservedLiveSceneDocuments=Math.max(report.peakObservedLiveSceneDocuments,live.length);report.peakObservedHeavyScenes=Math.max(report.peakObservedHeavyScenes,heavy);
  invariant(live.length<=1,'Hub retained more than one live scene document');invariant(heavy<=1,'An authored world started before the original GL source was retired');invariant(live.every(p=>!p.apiKinds||p.apiKinds.length<=1),'A preview exposed multiple world APIs');
  report.timingSamples.push({monotonicMs:performance.now(),active:state.hub?.active||null,bridgeActive:state.bridge.sessionActive,previews:state.previews.map(p=>({index:p.index,kind:p.kind,sceneId:p.state?.sceneId??null,frames:p.state?.frames??null,decodedFrames:p.state?.video?.decodedFrames??null,time:p.state?.time??null,journeyPhase:p.state?.journey?.phase??null})),presentation:getPresentation()});return state;
 }
 async function wait(predicate,label,ms=90000){const deadline=Date.now()+ms;let state,last=0;while(Date.now()<deadline){state=await readState(Math.max(1,Math.min(150000,deadline-Date.now())));if(predicate(state))return state;const active=state.previews.find(p=>p.active);if(active?.error||active?.state?.error||active?.state?.errors?.length)throw new Error(active.error||active.state.error||active.state.errors.join('\n'));if(Date.now()-last>2000){progress(label,state);last=Date.now();}await pause(300);}throw new Error(label+' timed out: '+JSON.stringify(state));}
 function pass(name,evidence){report.tests.push({name,passed:true,evidence});}
 const child=index=>`document.querySelectorAll('iframe.world-frame')[${index}].contentWindow`;
 async function capture(index,name){
  await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');await pause(250);
  const data=await evaluate(`(()=>{const w=${child(index)};if(w.sourceLive){const v=w.document.querySelector('#source-video');if(!v?.videoWidth)throw new Error('No actual source video frame');const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png');}return w.document.querySelector('#world canvas').toDataURL('image/png');})()`, 'Read actual original video or independent authored-world framebuffer');
  const image=nativeImage.createFromDataURL(data),stats=statistics(image);invariant(!image.isEmpty()&&stats.width>=300&&stats.height>=250&&stats.meanLuminance>3&&stats.luminanceStdDev>4,'Active realtime preview is blank or too small');
  const imageFile=path.join(output,name+'-live-frame.png'),pageFile=path.join(output,name+'-page.png');fs.writeFileSync(imageFile,image.toPNG());fs.writeFileSync(pageFile,(await bounded(window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}),30000,'Hidden hub capture')).toPNG());
  invariant(!window.isVisible()&&!window.isFocused(),'Capture changed hidden policy');report.captures.push({name,frame:path.relative(projectDirectory,imageFile).replaceAll('\\','/'),page:path.relative(projectDirectory,pageFile).replaceAll('\\','/'),...stats,monotonicMs:performance.now(),state:await readState()});
 }
 async function sourceControls(){
  const before=(await readState()).previews[0].state;
  await evaluate(`${child(0)}.document.getElementById('source-free').click()`,'Enable free drive through source DOM button');
  await wait(s=>s.previews[0].state?.drive?.mode==='free','Actual source free drive mode');
  const initial=(await readState()).previews[0].state;
  await evaluate(`${child(0)}.napaliDrive.move({forward:12,right:4,up:3})`,'Drive actual original camera through existing page control API');
  const moved=await wait(s=>s.previews[0].state?.frames>=initial.frames+2&&s.previews[0].state.video.decodedFrames>=initial.video.decodedFrames+2&&distance(s.previews[0].state.drive.position,initial.drive.position)>1,'Actual moved source camera and decoded pixels');
  const point=await evaluate(`(()=>{const f=document.querySelectorAll('iframe.world-frame')[0],a=f.getBoundingClientRect(),b=f.contentDocument.querySelector('#source-viewport').getBoundingClientRect();return {x:Math.round(a.left+b.left+b.width*.5),y:Math.round(a.top+b.top+b.height*.5)};})()`);
  // Electron input goes directly to this hidden webContents. Pointer capture
  // delivers a huge drag without moving the user's system cursor or focus.
  window.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseMove',x:point.x+200000,y:point.y-100000,button:'left',buttons:['left']});
  window.webContents.sendInputEvent({type:'mouseUp',x:point.x+200000,y:point.y-100000,button:'left',clickCount:1});
  const dragged=await wait(s=>{const a=s.previews[0].state,b=moved.previews[0].state;return a?.ready&&!a.error&&a.video.decodedFrames>b.video.decodedFrames+1&&Number.isFinite(a.drive?.yaw)&&Number.isFinite(a.drive?.pitch)&&Math.abs(a.drive.pitch)<=1.400001&&(Math.abs(a.drive.yaw-b.drive.yaw)>.001||Math.abs(a.drive.pitch-b.drive.pitch)>.001);},'Huge own-window source drag remains finite and drives video');
  invariant(Math.abs(dragged.previews[0].state.drive.yaw-moved.previews[0].state.drive.yaw)<=Math.PI+.00001,'Source DOM drag was not normalized before the bridge request');
  pass('source-live-track-and-real-free-drive-with-bounded-huge-dom-drag',{before,after:dragged.previews[0],inputPolicy:'Only the own hidden webContents; no show/focus or system input.'});
 }
 async function canalDOMControls(){
  await evaluate(`${child(1)}.canalReal.setShot('window',true)`);const before=(await readState()).previews[1].state;
  await evaluate(`(()=>{const w=${child(1)},c=w.document.querySelector('#world canvas'),r=c.getBoundingClientRect(),x=r.left+r.width*.5,y=r.top+r.height*.45,base={bubbles:true,cancelable:true,pointerId:73,pointerType:'mouse',isPrimary:true,button:0};c.dispatchEvent(new w.PointerEvent('pointerdown',{...base,buttons:1,clientX:x,clientY:y}));c.dispatchEvent(new w.PointerEvent('pointermove',{...base,buttons:1,clientX:x+140,clientY:y-35}));c.dispatchEvent(new w.PointerEvent('pointerup',{...base,buttons:0,clientX:x+140,clientY:y-35}));})()`,'Drag own canal canvas through real pointer listeners');
  const turned=(await readState()).previews[1].state;invariant(distance(turned.camera.position,before.camera.position)<.015&&distance(turned.camera.target,before.camera.target)>.1,'Actual canvas drag failed to look from a fixed room camera');
  await evaluate(`(()=>{const w=${child(1)};w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}));})()`,'Own canal KeyW down');
  try{await pause(450);}finally{await evaluate(`(()=>{const w=${child(1)};w.dispatchEvent(new w.KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));})()`,'Own canal KeyW up');}
  const moved=(await wait(s=>s.previews[1].state?.frames>turned.frames,'Own WASD renders actual movement')).previews[1].state,p=moved.camera.position;
  invariant(distance(p,turned.camera.position)>.01,'A held DOM KeyW did not move the actual camera');invariant(p[0]>=-14.100001&&p[0]<=-9.649999&&p[1]>=1.649999&&p[1]<=4.350001&&p[2]>=7.899999&&p[2]<=15.100001,'DOM controls escaped the room bounds');
  pass('actual-canal-pointer-and-held-dom-WASD-input',{before:before.camera,turned:turned.camera,moved:moved.camera,navigation:moved.navigation,heldMilliseconds:450});
 }
 async function stationControls(){
  await evaluate(`${child(2)}.document.querySelector('#reset').click()`,'Reset independent station through its own UI');
  await wait(s=>s.previews[2].state?.journey?.phase==='idle','Independent station idle');
  const views=[];
  for(const shot of ['shipyard','hall','platform']){
   const before=(await readState()).previews[2].state;
   await evaluate(`(()=>{const w=${child(2)};w.document.querySelector('[data-shot=${shot}]').click();})()`,'Select actual station '+shot+' button');
   const after=(await wait(s=>s.previews[2].state?.view===shot&&s.previews[2].state.frames>=before.frames+2,'Actual station '+shot+' view')).previews[2].state;
   views.push({view:shot,camera:after.camera});
  }
  pass('independent-station-three-actual-view-buttons',views);
  const initial=(await readState()).previews[2].state;
  invariant(initial.inputRevision==='station-manual-input-2','Station pointer check requires the current manual input revision');
  const point=await evaluate(`(()=>{const f=document.querySelectorAll('iframe.world-frame')[2],a=f.getBoundingClientRect(),b=f.contentDocument.querySelector('#world canvas').getBoundingClientRect();return {x:Math.round(a.left+b.left+b.width*.5),y:Math.round(a.top+b.top+b.height*.4)};})()`,'Locate station canvas inside the own hidden hub webContents');
  // Native Chromium input establishes an active pointer for capture. It goes
  // only to this hidden webContents; it never moves the system mouse or focus.
  window.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseMove',x:point.x+80,y:point.y-20,button:'left',buttons:['left']});
  window.webContents.sendInputEvent({type:'mouseUp',x:point.x+80,y:point.y-20,button:'left',clickCount:1});
  const turned=(await wait(s=>s.previews[2].state?.frames>initial.frames&&distance(s.previews[2].state.camera.target,initial.camera.target)>.1,'Native own-window station pointer changes the actual camera')).previews[2].state;
  invariant(distance(initial.camera.position,turned.camera.position)<.015,'Station native pointer moved the camera rather than looking from its actual position');
  await evaluate(`(()=>{const w=${child(2)};w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}));})()`,'Own station KeyW down');
  try{await pause(450);}finally{await evaluate(`(()=>{const w=${child(2)};w.dispatchEvent(new w.KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));})()`,'Own station KeyW up');}
  const walked=(await readState()).previews[2].state;invariant(distance(walked.camera.position,turned.camera.position)>.005,'Station DOM KeyW did not move its independent camera');
  for(const [axis,range]of Object.entries(walked.navigation.bounds)){const v=walked.camera.position[['x','y','z'].indexOf(axis)];invariant(v>=range[0]-1e-6&&v<=range[1]+1e-6,'Station DOM movement escaped its own navigation bounds');}
  pass('independent-station-pointer-and-held-dom-WASD',{before:initial.camera,turned:turned.camera,walked:walked.camera,navigation:walked.navigation,heldMilliseconds:450,inputRevision:walked.inputRevision,pointerInput:'native mouse events to own hidden webContents only',pointerStart:point});
  await evaluate(`${child(2)}.document.querySelector('#reset').click();${child(2)}.document.querySelector('#callBoat').click()`,'Call actual station passenger boat');
  const underway=(await wait(s=>s.previews[2].state?.journey?.phase==='approaching'&&s.previews[2].state.journey.elapsed>=2,'Independent boat really approaches for two seconds',12000)).previews[2].state;
  await evaluate(`${child(2)}.document.querySelector('#pause').click()`,'Pause actual station approach');
  const held=(await wait(s=>s.previews[2].state?.journey?.paused,'Station approach actually paused')).previews[2].state;
  const pauseStart=performance.now();await evaluate(`${child(2)}.postMessage({type:'worlds-visibility',visible:true},location.origin)`,'Redundant parent visibility notification preserves manual pause');await pause(700);
  const after=(await readState()).previews[2].state;
  invariant(after.journey.paused&&Math.abs(after.journey.elapsed-held.journey.elapsed)<.025&&distance(after.journey.boatPosition,held.journey.boatPosition)<.005,'Station pause was lost or vessel advanced while paused');
  pass('independent-station-call-pause-and-redundant-visible-message',{underway:underway.journey,held:held.journey,after:after.journey,pausedMonotonicSeconds:(performance.now()-pauseStart)/1000});
  await capture(2,'station-paused-approach');
  await evaluate(`${child(2)}.document.querySelector('#reset').click()`,'Return actual station journey to idle');
  const reset=(await wait(s=>s.previews[2].state?.journey?.phase==='idle'&&!s.previews[2].state.journey.paused,'Station resets without replaying an entire branch')).previews[2].state;
  pass('independent-station-reset-restores-idle',reset.journey);
 }
 async function stationLayout(stage,width){
  const layout=await evaluate(`(()=>{const f=document.querySelectorAll('iframe.world-frame')[2],w=f.contentWindow,r=f.getBoundingClientRect(),a=f.parentElement.querySelector('.preview-open'),open=a?.getClientRects().length?a.getBoundingClientRect():null;const buttons=[...w.document.querySelectorAll('#view-controls button,#journey-controls button,#decision button')].filter(b=>b.getClientRects().length&&!b.hidden).map(b=>{const q=b.getBoundingClientRect(),world={left:r.left+q.left,right:r.left+q.right,top:r.top+q.top,bottom:r.top+q.bottom};return {id:b.id,shot:b.dataset.shot||null,text:b.textContent,disabled:b.disabled,rect:q.toJSON(),worldRect:world,parentOverlap:open?Math.max(0,Math.min(world.right,open.right)-Math.max(world.left,open.left))*Math.max(0,Math.min(world.bottom,open.bottom)-Math.max(world.top,open.top)):0};});const pairs=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].rect,b=buttons[j].rect,area=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));if(area>.5)pairs.push({a:buttons[i].id||buttons[i].shot,b:buttons[j].id||buttons[j].shot,area});}return {stage:${JSON.stringify(stage)},requestedViewport:{width:${width},height:844},actualViewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,frame:r.toJSON(),preview:{width:w.innerWidth,height:w.innerHeight,scrollWidth:w.document.documentElement.scrollWidth},parentOverflow:document.documentElement.scrollWidth>innerWidth+1,previewOverflow:w.document.documentElement.scrollWidth>w.innerWidth+1,overflowElements:[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&(e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left< -1)).slice(0,20).map(e=>({tag:e.tagName,id:e.id,className:String(e.className),rect:e.getBoundingClientRect().toJSON()})),previewOpen:open?.toJSON()||null,buttons,buttonIntersections:pairs,notice:w.document.querySelector('#notice')?.hidden===false?w.document.querySelector('#notice').textContent:null,journey:w.stationWorld.getState().journey};})()`,'Measure real independent station mobile controls');
  (report.mobileLayoutSamples??=[]).push({monotonicMs:performance.now(),...layout});
  await capture(2,'mobile-'+layout.actualViewport.width+'-'+layout.actualViewport.height+'-station-'+stage);
  invariant(Math.abs(layout.actualViewport.width-width)<=1&&Math.abs(layout.actualViewport.height-844)<=1&&!layout.parentOverflow&&!layout.previewOverflow,'Actual station mobile viewport has overflow or exceeds one pixel of OSR rounding');
  invariant(layout.frame.height>=519&&layout.preview.height>=519,'Independent station preview is shorter than the approved 520px');
  invariant(!layout.notice&&layout.buttons.length>0&&layout.buttons.every(b=>b.rect.left>=-1&&b.rect.right<=layout.preview.width+1&&b.rect.top>=-1&&b.rect.bottom<=layout.preview.height+1&&b.parentOverlap<.5)&&layout.buttonIntersections.length===0,'Station controls are clipped, overlap each other/parent entry, or show an action failure');
  const visible=id=>layout.buttons.some(b=>b.id===id&&!b.disabled);
  invariant(visible('pause')&&visible('reset'),'Station pause/reset controls are not usable');
  if(stage==='idle')invariant(visible('callBoat')&&['shipyard','platform','hall'].every(shot=>layout.buttons.some(b=>b.shot===shot&&!b.disabled)),'Station call or three shot controls are missing');
  if(stage==='docked')invariant(layout.journey.phase==='docked'&&layout.journey.canChoose&&visible('board')&&visible('stay'),'Actual docked board/stay choices are missing or disabled');
  pass('actual-'+layout.actualViewport.width+'-'+layout.actualViewport.height+'-independent-station-'+stage+'-controls-fit',layout);return layout;
 }
 async function mobilePreviews(){
  for(const width of [375,390]){
   window.setContentSize(width,844);await evaluate(`document.querySelectorAll('iframe.world-frame')[2].scrollIntoView({behavior:'instant',block:'center'})`,'Show independent station mobile preview');
   await wait(s=>s.previews[2]?.active&&s.previews[2].kind==='shipyard-station'&&s.previews[2].state?.ready&&s.previews[2].state.frames>=3,'Independent mobile station ready');
   await evaluate(`${child(2)}.document.querySelector('#reset').click()`,'Reset actual mobile station controls');
   const idle=await wait(s=>s.previews[2].state?.journey?.phase==='idle','Mobile station idle');await wait(s=>s.previews[2].state.frames>=idle.previews[2].state.frames+3,'Present mobile idle controls');
   await stationLayout('idle',width);
  }
  await evaluate(`${child(2)}.document.querySelector('#callBoat').click()`,'Call one actual passenger boat for both mobile docked layouts');
  const calledAt=performance.now();const docked=await wait(s=>s.previews[2].state?.journey?.phase==='docked'&&s.previews[2].state.journey.canChoose,'Actual 22-second station approach and gangway reaches docked choices',45000);
  pass('mobile-station-actual-approach-reaches-docked-choices',{monotonicSeconds:(performance.now()-calledAt)/1000,journey:docked.previews[2].state.journey,scope:'One real approach only; neither departure branch is replayed by this hub check.'});
  await evaluate(`${child(2)}.document.querySelector('#pause').click()`,'Hold actual docked station for responsive checks');
  for(const width of [375,390]){
   window.setContentSize(width,844);await evaluate(`document.querySelectorAll('iframe.world-frame')[2].scrollIntoView({behavior:'instant',block:'center'})`,'Keep actual docked station visible after resize');
   const before=await readState();await wait(s=>s.previews[2].state?.journey?.phase==='docked'&&s.previews[2].state.frames>=before.previews[2].state.frames+4,'Present actual mobile docked controls');await stationLayout('docked',width);
  }
  await evaluate(`${child(2)}.document.querySelector('#reset').click()`,'Retire mobile station call without choosing a departure branch');
 }
 try{
  const initial=await wait(s=>s.hub&&s.previews.length===3,'Hub lifecycle exists',30000);invariant(initial.bridge.service==='napali-source-bridge'&&initial.bridge.backend==='gl','Expected separate source GL bridge is absent');
  if(candidate)await evaluate(`document.querySelectorAll('iframe.world-frame')[2].dataset.src='shipyard-station/index.html?embed=1'`,'Set only the fixed QA station candidate; do not publish primary content');
  const entries=await evaluate(`[...document.querySelectorAll('iframe.world-frame')].map(f=>f.dataset.src)`);const validatedEntries=assertEntryMap(entries);pass('original-window-and-independent-station-entry-map',{entries:validatedEntries,candidateOverride:candidate});
  const timeout=Math.max(180000,Math.min(1800000,Number(process.env.NAPALI_QA_TIMEOUT_MS)||600000)),labels=['source','window','station'];
  for(const [leg,index]of (mobileOnly?[2]:[0,1,2,1]).entries()){
   const startedAt=performance.now(),label=labels[index];progress('activate-'+leg+'-'+label);
   await evaluate(`document.querySelectorAll('iframe.world-frame')[${index}].scrollIntoView({behavior:'instant',block:'center'})`,'Select own '+label+' preview');
   const ready=await wait(s=>{const p=s.previews[index];return p?.active&&p.state?.ready&&(index===0?p.kind==='source-live'&&p.state.video?.decodedFrames>=3&&p.media?.mediaStream&&p.media.liveTracks===1:p.state.frames>=3);},label+' actual realtime first frames',index===0?timeout:300000);
   report.activations.push({leg,label,monotonicStartMs:startedAt,monotonicReadyMs:performance.now(),seconds:(performance.now()-startedAt)/1000,sourceFrames:ready.previews[index].state.frames,decodedFrames:ready.previews[index].state.video?.decodedFrames??null});
   for(const p of ready.previews)if(p.index!==index){const blankAttribute=p.sourceAttribute==='about:blank'||!activatedIndices.has(p.index)&&(p.sourceAttribute===null||p.sourceAttribute==='');invariant(p.href==='about:blank'&&blankAttribute&&!p.apiExposed&&!p.canvas&&!p.media,'Previous or unstarted scene retained its document or rendering surface');}
   if(index===0){invariant(ready.previews[0].state.scale===1&&!ready.previews[0].state.autoQuality,'Source entry silently reduced original quality');const before=ready.previews[0].state;await wait(s=>s.previews[0].state?.frames>=before.frames+2&&s.previews[0].state.video.decodedFrames>=before.video.decodedFrames+2,'Source received real subsequent video');if(leg===0)await sourceControls();}
   else{
    const state=ready.previews[index].state,identity=worldIdentity(ready.previews[index]),prior=report.worldIdentities[label];
    invariant(!ready.bridge.sessionActive&&state.reflections?.ready&&state.reflections.enabled,'Authored world lacks complete reflections or original-source release');
    if(index===2&&!candidate)invariant(state.lighting.accepted===true,'Official station entry has not received its separate final visual acceptance');
    if(prior)invariant(prior.sceneId===identity.sceneId&&prior.modelSha256===identity.modelSha256&&prior.modelUrl===identity.modelUrl&&prior.lightingFingerprint===identity.lightingFingerprint,'A returned world changed authored identity');
    report.worldIdentities[label]=identity;
    if(index===1&&leg===1)await canalDOMControls();if(index===2&&!mobileOnly)await stationControls();
   }
   await capture(index,String(leg+1).padStart(2,'0')+'-'+label);pass('leg-'+leg+'-'+label+'-starts-after-previous-scene-unloads',ready);
  }
  if(!mobileOnly)pass('two-actual-authored-worlds-have-independent-models-and-lighting',assertDistinctWorlds(report.worldIdentities.window,report.worldIdentities.station));
  if(mobile)await mobilePreviews();
  invariant(report.peakObservedLiveSceneDocuments===1&&report.peakObservedHeavyScenes===1,'Lifecycle did not exercise exactly one heavy scene');pass(mobileOnly?'single-live-independent-station-during-mobile-supplement':'single-live-world-through-source-window-independent-station-window',{peakDocuments:report.peakObservedLiveSceneDocuments,peakHeavyScenes:report.peakObservedHeavyScenes,activations:report.activations});report.status='passed';
 }catch(error){report.status='failed';report.errors.push(String(error.stack||error));try{const file=path.join(output,'failure-page.png');fs.writeFileSync(file,(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());report.failurePage=path.relative(projectDirectory,file).replaceAll('\\','/');}catch(captureError){report.errors.push('Failure page capture: '+captureError.message);}}
 finally{try{await evaluate(`(async()=>{for(const f of document.querySelectorAll('iframe.world-frame')){if(f.contentWindow.sourceLive)await f.contentWindow.sourceLive.stop();await f.contentWindow.stationWorld?.dispose();f.contentWindow.canalReal?.dispose();f.src='about:blank';}})()`,'Retire all own QA previews');}catch(error){report.status='failed';report.errors.push('QA retirement: '+error.message);}}
 report.elapsedSeconds=(Date.now()-started)/1000;report.presentation=getPresentation();report.activatedIndices=[...activatedIndices];const serialized=JSON.stringify(report,null,2)+'\n';fs.writeFileSync(latest,serialized);fs.writeFileSync(path.join(output,'acceptance.json'),serialized);if(!previousPassed||report.status==='passed')fs.writeFileSync(canonical,serialized);progress(report.status);return report;
}

module.exports={runHubAcceptance,contracts:{assertEntryMap,worldIdentity,assertDistinctWorlds}};
