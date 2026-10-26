'use strict';
// The caller owns the already-created hidden parent window. No launch,
// foreground input, bridge mutation, source/A/B playback or cache writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT='C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-raster-hub-qa';
const BASE='http://127.0.0.1:8796/projects/014-programmable-worlds/web/';
const ORIGINAL_ENTRIES=['runtime/source-live.html?embed=1','canal-real/index.html?experience=window&giSet=r5&probes=1&streetProbes=1&embed=1','shipyard-station/index.html?embed=1'];
const PROTECTED_FILES=['upstream/index.html','runtime/index.html','runtime/source-live.html','runtime/source-live.js','runtime/source-live.css','runtime/controller.js','canal-real/index.html','canal-real/main.js','shipyard-station/index.html','shipyard-station/main.js'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const invariant=(value,message)=>{if(!value)throw new Error(message);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));
const qdistance=(a,b)=>Math.min(distance(a,b),distance(a,b.map(value=>-value)));
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label+' timed out')),ms))]);}finally{clearTimeout(timer);}}
async function health(port){const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(6000),cache:'no-store'});invariant(response.ok,'Bridge health unavailable: '+port);return response.json();}
async function probeLijiangRasterHubIsolation(){const [native,source]=await Promise.all([health(8798),health(8797)]);return{native,source};}
const bridgeIdentity=value=>({service:value?.service,pid:value?.pid,sessionActive:value?.sessionActive});
function assertBridgeUnchanged(before,after){for(const name of ['native','source']){
 invariant(before?.[name]?.pid!==undefined&&typeof before[name].sessionActive==='boolean','Initial '+name+' bridge identity/session evidence missing');
 invariant(JSON.stringify(bridgeIdentity(before[name]))===JSON.stringify(bridgeIdentity(after?.[name])),'Unrelated '+name+' bridge PID/sessionActive changed');
}}
function protectedHashes(projectDirectory){return Object.fromEntries(PROTECTED_FILES.map(file=>[file,sha(fs.readFileSync(path.join(projectDirectory,'web',file)))]));}

const READ_HUB=`(()=>{
 const qa=window.__rasterHubQA,frames=[...document.querySelectorAll('iframe.world-frame')],f=document.querySelector('#lijiang iframe.world-frame');
 const previews=frames.map(frame=>({source:frame.dataset.src,src:frame.getAttribute('src'),href:frame.contentWindow.location.href,active:frame.dataset.active==='true'}));
 if(!f)return{url:location.href,hub:window.worldHub?.getState(),previews};
 const w=f.contentWindow,api=w.lijiangRaster,s=api?.getState()||null,gen=w.document.getElementById('generator'),gw=gen?.contentWindow;
 if(qa&&api){const ref=qa.refs[qa.capture]||(qa.refs[qa.capture]={});
  if(!ref.main){ref.main=api.renderer.getContext();ref.document=f.contentDocument;ref.timeOrigin=w.performance.timeOrigin;ref.capturedAt=performance.now();}
  if(!ref.generator&&typeof gw?.lijiangNativeReleaseFields==='function'){
   const c=gw.document.getElementById('c');if(c){ref.generator=c.getContext('webgl2');ref.generatorDocument=gw.document;ref.generatorCapturedAt=performance.now();}
  }
 }
 const ref=qa?.refs[qa.capture],box=f.getBoundingClientRect();
 return{url:location.href,hub:window.worldHub?.getState(),previews,world:s,
  child:{href:w.location.href,width:w.innerWidth,height:w.innerHeight,box:box.toJSON(),
   sameDocument:!!ref&&f.contentDocument===ref.document,timeOrigin:w.performance.timeOrigin,
   generator:gen?{href:gw.location.href,ready:!!gw.lijiangGeneratedFields,releaseHook:typeof gw.lijiangNativeReleaseFields==='function',
    phase:gw.lijiangNativeSDFStatus?.phase||gw.document.getElementById('loadtxt')?.textContent}:null,
   load:w.document.getElementById('load-detail')?.textContent,
   qaCache:!!w.lijiangRasterFields?.provenance?.qaGeneratedFieldCache},
  parent:{width:innerWidth,height:innerHeight},contexts:ref?{mainCaptured:!!ref.main,generatorCaptured:!!ref.generator,
   mainLost:ref.main?.isContextLost()??null,generatorLost:ref.generator?.isContextLost()??null}:null};
})()`;
const SCROLL_GUIDE=`(()=>{const guide=document.getElementById('guide');if(!guide)throw new Error('Actual production #guide is missing');guide.scrollIntoView({behavior:'instant',block:'start'});return true;})()`;
const SCROLL_LI=`(()=>{document.querySelector('#lijiang iframe.world-frame').scrollIntoView({behavior:'instant',block:'center'});return true;})()`;
const CHILD=`document.querySelector('#lijiang iframe.world-frame').contentWindow`;

async function runLijiangRasterHubAcceptance({window,getFatal=()=>null,getPresentation=()=>null,record=()=>{},projectDirectory,backend,initialBridgeHealth}){
 const began=Date.now(),runId=new Date(began).toISOString().replace(/[:.]/g,'-'),output=path.join(ROOT,runId);
 fs.mkdirSync(output,{recursive:true});
 const report={runId,output,backend,status:'running',artAccepted:false,scope:'PARENT FUNCTIONAL ONLY: actual production raster iframe, control/resize continuity, ready-view host suspension/pose retention, explicit production teardown and loading cancellation; no visual acceptance, source/A/B playback or bridge session ownership.',tests:[],errors:[],samples:[]};
 const originalSize=window.getContentSize();let beforeHashes=null,beforeBridges=null,lastProgress=0,baselineEntries=null;
 function policy(){invariant(window&&!window.isDestroyed()&&!window.isVisible()&&!window.isFocused(),'Own parent acceptance window must stay hidden and unfocused');}
 async function call(code,label='Own hidden raster parent',ms=30000){policy();if(getFatal())throw new Error(getFatal());const result=await bounded(window.webContents.executeJavaScript(code,false),ms,label);policy();return result;}
 function progress(phase,state){report.phase=phase;report.elapsedSeconds=(Date.now()-began)/1000;fs.writeFileSync(path.join(output,'status.json'),JSON.stringify({...report,state},null,2));record('raster-hub-progress',{phase,elapsedSeconds:report.elapsedSeconds,output});}
 function pass(name,evidence){report.tests.push({name,passed:true,evidence});}
 function checkEntries(sample){
  invariant(sample.previews.length===4,'Production parent must contain original/A/B/Li iframe entries');
  invariant(JSON.stringify(sample.previews.slice(0,3).map(item=>item.source))===JSON.stringify(ORIGINAL_ENTRIES),'Original/A/B data-src map changed');
  invariant(sample.previews.slice(0,3).every(item=>(!item.src||item.src==='about:blank')&&item.href==='about:blank'),'Source/A/B were loaded; this runner never plays or borrows them');
  invariant(sample.previews.filter(item=>item.src&&item.src!=='about:blank').length<=1,'More than one owned heavy iframe is loaded');
  const source=sample.previews[3].source,u=new URL(source,BASE);
  invariant(u.pathname===new URL('lijiang-native/raster.html',BASE).pathname&&u.searchParams.get('surface')==='1'&&u.searchParams.get('material')==='1'&&!/qafields/i.test(source),'Production Li iframe is not the live material raster entry, or uses a QA cache');
  if(sample.child?.href&&sample.child.href!=='about:blank'){
   const active=new URL(sample.child.href);invariant(active.pathname===u.pathname&&active.searchParams.get('surface')==='1'&&active.searchParams.get('material')==='1'&&!/qafields/i.test(active.href),'Actual iframe URL differs from production material entry');
   invariant(!sample.child.qaCache,'Production iframe reused QA field cache');
  }
 }
 async function read(){const sample=await call(READ_HUB);checkEntries(sample);return sample;}
 async function wait(phase,predicate,ms=120000,{retiring=false,interval=150}={}){
  const end=Date.now()+ms;let sample;
  while(Date.now()<end){sample=await read();if(sample.world?.error&&!retiring)throw new Error(sample.world.error);if(predicate(sample))return sample;
   if(Date.now()-lastProgress>2500){progress(phase,sample);lastProgress=Date.now();}await sleep(interval);}
  throw new Error(phase+' timed out: '+JSON.stringify(sample));
 }
 const idle=sample=>sample.world?.ready&&sample.world.paused&&sample.world.idle&&!sample.world.rendering&&!(sample.world.forest?.pending>0);
 async function control(id,js){return call(`(()=>{const w=${CHILD},e=w.document.getElementById(${JSON.stringify(id)});if(!e||e.disabled)throw new Error('Actual child control missing/disabled: '+${JSON.stringify(id)});${js};return w.lijiangRaster.getState();})()`,'Actual iframe '+id+' control');}
 function samePose(saved,actual){invariant(actual.child.sameDocument&&actual.world.mode==='free'&&actual.world.paused&&Math.abs(saved.time-actual.world.time)<1e-6&&distance(saved.camera.position,actual.world.camera.position)<1e-5&&qdistance(saved.camera.quaternion,actual.world.camera.quaternion)<1e-6,'Parent navigation/resize replaced document or changed paused free-camera time/pose');}
 async function retire(label,{productionDispose=false}={}){
  await call(SCROLL_GUIDE,'Scroll actual parent to bottom guide text');
  if(productionDispose){
   await wait('ready-view-host-suspended-before-explicit-disposal',s=>s.world?.hostSuspended===true&&!s.world.rendering);
   await call(`(async()=>{if(typeof window.worldHub?.disposeAll!=='function')throw new Error('Production worldHub.disposeAll is missing');await window.worldHub.disposeAll();return true;})()`,'Production parent disposeAll',60000);
  }
  const blank=await wait(label,s=>s.previews.every(p=>(!p.src||p.src==='about:blank')&&p.href==='about:blank'),60000,{retiring:true});
  const contexts=await call(`(()=>{const r=__rasterHubQA.refs[${JSON.stringify(label)}];return{mainCaptured:!!r?.main,generatorCaptured:!!r?.generator,mainLost:r?.main?.isContextLost()??null,generatorLost:r?.generator?.isContextLost()??null};})()`);
  invariant(contexts.mainCaptured&&contexts.mainLost,'Unloaded raster did not lose its original actual GL context');
  invariant(!contexts.generatorCaptured||contexts.generatorLost,'Unloaded generator retained its original actual GL context');
  return{contexts,previews:blank.previews};
 }
 try{
  policy();const entry=new URL(await call('location.href'));
  invariant(entry.origin===new URL(BASE).origin&&entry.pathname===new URL('index.html',BASE).pathname&&entry.hash==='#lijiang','Runner must enter actual production index.html#lijiang');
  beforeHashes=protectedHashes(projectDirectory);beforeBridges=await probeLijiangRasterHubIsolation();
  assertBridgeUnchanged(beforeBridges,beforeBridges);
  if(initialBridgeHealth)assertBridgeUnchanged(initialBridgeHealth,beforeBridges);
  report.initialBridgeHealth=beforeBridges;report.initialProtectedByteSHA256=beforeHashes;
  await call('window.__rasterHubQA={capture:"first",refs:{}};true');
  const loaded=await wait('actual-production-material-raster-ready',s=>idle(s)&&s.world.frames>=2,1200000);
  invariant(loaded.world.sceneId==='lijiang-raster'&&loaded.world.materialOnly===true,'Production Li did not load actual materialOnly raster mode');
  baselineEntries=loaded.previews.slice(0,3).map(p=>p.source);report.initial=loaded;
  pass('actual-production-live-material-raster-without-QA-cache',{href:loaded.child.href,materialOnly:loaded.world.materialOnly,frames:loaded.world.frames,contexts:loaded.contexts});
  await control('seek',`e.value='12.5';e.dispatchEvent(new w.Event('input',{bubbles:true}))`);
  const sought=await wait('actual-seek-control',s=>idle(s)&&Math.abs(s.world.time-12.5)<1e-6);
  invariant(distance(loaded.world.camera.position,sought.world.camera.position)>1,'Actual seek did not move the camera');
  await control('play','e.click()');const playing=await wait('actual-play-control',s=>s.world?.time>12.8&&!s.world.paused&&s.world.frames>sought.world.frames);
  await control('play','e.click()');const paused=await wait('actual-pause-control',idle);
  pass('actual-seek-play-pause-controls',{seekTime:sought.world.time,playingTime:playing.world.time,pausedTime:paused.world.time});
  await control('mode','e.click()');const free=await wait('actual-free-camera-control',s=>idle(s)&&s.world.mode==='free');
  try{await call(`(()=>{const w=${CHILD};w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true}));return true;})()`);await sleep(400);}
  finally{await call(`(()=>{const w=${CHILD};w.dispatchEvent(new w.KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));return true;})()`);}
  const moved=await wait('actual-own-frame-W-movement',s=>idle(s)&&s.world.mode==='free'&&distance(free.world.camera.position,s.world.camera.position)>.01);
  pass('scoped-iframe-W-input-moves-real-free-camera',{distance:distance(free.world.camera.position,moved.world.camera.position),time:moved.world.time});
  const saved=moved.world;
  for(const size of [[390,844],originalSize]){
   policy();window.setContentSize(...size);policy();
   const portrait=size[0]<size[1],resized=await wait(portrait?'parent-portrait-resize':'parent-landscape-restore',s=>idle(s)&&Math.abs(s.parent.width-size[0])<=1&&Math.abs(s.parent.height-size[1])<=1&&s.child.sameDocument&&s.world.width===s.child.width&&s.world.height===s.child.height&&(!portrait||s.child.height>s.child.width));
   samePose(saved,resized);report.samples.push({resize:size,world:resized.world,parent:resized.parent,child:resized.child});
  }
  pass('parent-landscape-portrait-resize-preserves-document-time-and-free-pose',{time:saved.time,camera:saved.camera});
  await call(SCROLL_GUIDE,'Read actual guide text while retaining the prepared free view');
  const suspended=await wait('ready-guide-host-suspension',s=>s.world?.ready&&s.world.hostSuspended===true&&!s.world.rendering);
  samePose(saved,suspended);invariant(suspended.contexts?.mainLost===false,'Ready guide suspension lost the retained raster GL context');
  const heldBegan=Date.now();await sleep(1500);const held=await read();
  samePose(saved,held);
  invariant(held.world.hostSuspended===true&&!held.world.rendering&&held.world.frames===suspended.world.frames,'Reading guide text still submitted GPU frames or lost host suspension');
  invariant(JSON.stringify(held.contexts)===JSON.stringify(suspended.contexts)&&held.contexts.mainLost===false,'Reading guide text changed the retained context lifecycle');
  report.readyGuideHold={milliseconds:Date.now()-heldBegan,before:suspended,after:held};
  pass('ready-guide-holds-frame-time-free-pose-and-live-main-context-without-redraw',{milliseconds:report.readyGuideHold.milliseconds,frames:held.world.frames,time:held.world.time,contexts:held.contexts});
  await call(SCROLL_LI,'Return to the same retained Li free view');
  const resumed=await wait('same-ready-document-resumes-after-guide',s=>idle(s)&&s.world.hostSuspended===false);
  samePose(saved,resumed);invariant(resumed.contexts?.mainLost===false,'Returning from guide replaced/lost the ready raster context');
  pass('return-from-guide-preserves-ready-document-time-and-free-pose',{time:resumed.world.time,camera:resumed.world.camera,contexts:resumed.contexts});
  const firstRetired=await retire('first',{productionDispose:true});report.firstRetirement=firstRetired;
  pass('production-disposeAll-unloads-completed-raster-and-loses-owned-contexts',firstRetired);
  await call('__rasterHubQA.capture="second";true');await call(SCROLL_LI,'Return only to actual Li production iframe');
  const early=await wait('second-generator-context-before-ready',s=>!s.world?.ready&&s.world?.phase==='generating'&&s.contexts?.mainCaptured&&s.contexts?.generatorCaptured&&!s.contexts.mainLost&&!s.contexts.generatorLost&&s.child.generator?.ready===false,90000,{interval:50});
  report.earlyGeneration=early;const secondRetired=await retire('second');report.secondRetirement=secondRetired;
  invariant(secondRetired.contexts.mainCaptured&&secondRetired.contexts.generatorCaptured&&secondRetired.contexts.mainLost&&secondRetired.contexts.generatorLost,'Loading cancellation did not lose both owned GL contexts');
  pass('guide-text-cancels-loading-before-ready-and-loses-both-contexts',{earlyPhase:early.world.phase,generator:early.child.generator,...secondRetired});
  const final=await read();invariant(JSON.stringify(final.previews.slice(0,3).map(p=>p.source))===JSON.stringify(baselineEntries),'Original/A/B data-src changed during parent QA');
  report.dataSrcSHA256={initial:sha(Buffer.from(JSON.stringify(baselineEntries))),final:sha(Buffer.from(JSON.stringify(final.previews.slice(0,3).map(p=>p.source))))};
  pass('other-source-and-independent-A-B-remained-blank-with-identical-data-src',report.dataSrcSHA256);
  report.preFinalUnload=final;
  await bounded(window.loadURL('about:blank'),30000,'Final own parent unload');policy();
  invariant(window.webContents.getURL()==='about:blank','Own parent final URL is not blank');
  invariant(await call('document.querySelectorAll("iframe").length')===0,'Own final parent retained child frames');
  pass('final-own-parent-and-all-child-documents-blank',{url:window.webContents.getURL(),frames:0});
  report.status='passed';
 }catch(error){report.status='failed';report.errors.push(String(error.stack||error));}
 finally{
  if(window&&!window.isDestroyed()){
   try{await call(`(async()=>{if(typeof window.worldHub?.disposeAll==='function')await window.worldHub.disposeAll();else{const w=document.querySelector('#lijiang iframe.world-frame')?.contentWindow;if(w?.lijiangRaster)await w.lijiangRaster.dispose();}return true;})()`,'Dispose only own production parent on final cleanup',60000);}catch(error){report.cleanupDisposeError=String(error.message||error);}
   try{policy();await bounded(window.loadURL('about:blank'),30000,'Always unload own parent');policy();window.setContentSize(...originalSize);}catch(error){report.cleanupError=String(error.message||error);report.status='failed';}
  }
  try{report.finalBridgeHealth=await probeLijiangRasterHubIsolation();if(beforeBridges){assertBridgeUnchanged(beforeBridges,report.finalBridgeHealth);pass('unrelated-bridge-PID-and-sessionActive-unchanged',{initial:Object.fromEntries(Object.entries(beforeBridges).map(([key,value])=>[key,bridgeIdentity(value)])),final:Object.fromEntries(Object.entries(report.finalBridgeHealth).map(([key,value])=>[key,bridgeIdentity(value)]))});}}
  catch(error){report.errors.push(String(error.message||error));report.status='failed';}
  try{report.finalProtectedByteSHA256=protectedHashes(projectDirectory);if(beforeHashes){invariant(JSON.stringify(beforeHashes)===JSON.stringify(report.finalProtectedByteSHA256),'Original/A/B protected entry/source bytes changed');pass('original-A-B-entry-and-runtime-source-byte-hashes-unchanged',{files:PROTECTED_FILES,sha256:report.finalProtectedByteSHA256});}}
  catch(error){report.errors.push(String(error.message||error));report.status='failed';}
  report.presentation=getPresentation();report.elapsedSeconds=(Date.now()-began)/1000;progress('finished');
  fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));record('lijiang-raster-hub-finished',{status:report.status,tests:report.tests.length,output,errors:report.errors});
 }
 return report;
}
module.exports={runLijiangRasterHubAcceptance,probeLijiangRasterHubIsolation,assertBridgeUnchanged,READ_HUB,SCROLL_GUIDE,SCROLL_LI};
