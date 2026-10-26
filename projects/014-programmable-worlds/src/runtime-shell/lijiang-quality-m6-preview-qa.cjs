'use strict';
// Actual limited-peak renderer, in one task-owned hidden window. No browser
// attachment, OS input, server launch, field-cache substitution or film export.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow,nativeImage}=require('electron');
const C=require('./lijiang-m6-qa-contracts.cjs'),{assert,sha}=C;
const ROOT='C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-m6-preview';
const runId=new Date().toISOString().replace(/[:.]/g,'-'),output=path.join(ROOT,runId),started=Date.now();
const backend=process.env.LIJIANG_M6_BACKEND||'d3d11',fps=Math.max(10,Math.min(30,Number(process.env.LIJIANG_M6_FPS)||20));
const width=Math.max(640,Math.min(1920,Number(process.env.LIJIANG_M6_WIDTH)||1174)),height=Math.max(400,Math.min(1080,Number(process.env.LIJIANG_M6_HEIGHT)||682));
assert(['d3d11','gl','vulkan'].includes(backend),'Unsupported QA backend');assert(process.env.LIJIANG_M6_CACHE!=='1','M6 preview requires actual generation');
const report={runId,output,status:'running',mode:'actual-five-peak-preview',artAccepted:false,backend,targetPresentationRate:fps,tests:[],captures:[],console:[],errors:[],downloadAttempts:0,
  scope:'Fast development evidence only: actual limited-peak generation, six fixed views and short page driving. No claim of complete 76-peak, formal parent, continuous-flight or film acceptance.'};
let window,fatal=null,paints=0;const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(path.join(ROOT,'profile-'+backend),{recursive:true});
report.protectedM5=C.verifyM5();report.sourceFreeze=C.freezeM6(output);
const previewManifestPath=path.join(C.project,'web/lijiang-m6/engine-preview.manifest.json');
const manifestBytes=fs.readFileSync(previewManifestPath),manifest=JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/,''));
assert(manifest.landscape?.previewViews?.length===6,'Actual preview generator manifest must provide six fixed views');
report.previewManifest={path:previewManifestPath,sha256:sha(manifestBytes),previewPeakIds:manifest.previewPeakIds,landscape:manifest.landscape};
for(const pose of manifest.landscape.previewViews)assert(typeof pose.name==='string'&&pose.position?.length===3&&pose.target?.length===3&&[...pose.position,...pose.target].every(Number.isFinite),'Invalid fixed preview camera');
app.setName('Li River M6 Hidden Preview QA');app.setPath('userData',path.join(ROOT,'profile-'+backend));app.setPath('sessionData',path.join(ROOT,'profile-'+backend));
app.commandLine.appendSwitch('use-gl','angle');app.commandLine.appendSwitch('use-angle',backend);
for(const flag of ['disable-http-cache','disable-renderer-backgrounding','disable-background-timer-throttling','disable-backgrounding-occluded-windows'])app.commandLine.appendSwitch(flag);
try{os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
function progress(phase,state){report.phase=phase;report.elapsedSeconds=(Date.now()-started)/1000;fs.writeFileSync(path.join(output,'status.json'),JSON.stringify({...report,state},null,2));process.stdout.write(JSON.stringify({phase,seconds:report.elapsedSeconds,output})+'\n');}
function pass(name,evidence){report.tests.push({name,passed:true,evidence});}
function policy(){assert(window&&!window.isDestroyed()&&!window.isVisible()&&!window.isFocused(),'Own hidden QA window became visible/focused/destroyed');}
async function call(code,timeout=60000){policy();assert(!fatal,fatal);let timer;try{const result=await Promise.race([window.webContents.executeJavaScript(code,false),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Own M6 page call timed out')),timeout))]);policy();assert(!fatal,fatal);return result;}finally{clearTimeout(timer);}}
async function read(){const s=await call(`(()=>{const a=window.lijiangRaster,gl=a?.renderer.getContext();return{url:location.href,world:a?.getState(),load:document.getElementById('load-detail')?.textContent,
  generatorPresent:!!document.getElementById('generator'),cache:!!window.lijiangRasterFields?.provenance?.qaGeneratedFieldCache,peakCount:window.lijiangRasterFields?.peakSpec?.length,
  gpu:{contextLost:gl?.isContextLost(),render:a?.renderer.info.render,memory:a?.renderer.info.memory}};})()`);
  if(s.world?.error)throw new Error(s.world.error);if(s.world)assert(s.world.iteration==='m6','Fast M6 QA loaded another iteration');return s;}
const idle=s=>s.world?.ready&&s.world.paused&&s.world.idle&&!s.world.rendering&&!s.world.suspended&&!(s.world.forest?.pending>0);
async function wait(phase,predicate,timeout=600000){const until=Date.now()+timeout;let last=0,s;while(Date.now()<until){s=await read();if(predicate(s))return s;if(Date.now()-last>5000){progress(phase,s);last=Date.now();}await sleep(120);}throw new Error(phase+' timed out');}
async function capture(name,pose){const data=await call(`document.getElementById('scene').toDataURL('image/png')`),im=nativeImage.createFromDataURL(data),size=im.getSize(),pixels=im.toBitmap(),bytes=im.toPNG(),file=path.join(output,name+'.png');
  fs.writeFileSync(file,bytes);let lit=0,nonOpaque=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]+pixels[i+1]+pixels[i+2]>18)lit++;if(pixels[i+3]!==255)nonOpaque++;}
  const state=await read();report.captures.push({name,path:file,pose,sha256:sha(bytes),pixelSHA256:sha(pixels),...size,nonOpaquePixels:nonOpaque,state});progress('capture-'+name);
  assert(!im.isEmpty()&&lit>size.width*size.height*.15&&nonOpaque<=size.width*size.height*.0001,'Actual preview canvas is empty/black/transparent');return data;}
async function setPose(pose){await call(`(()=>{const a=lijiangRaster;a.pause(true);if(a.getState().mode!=='free')a.toggleMode();a.suspend(false);a.setClean(true);
  a.camera.position.fromArray(${JSON.stringify(pose.position)});a.camera.fov=${Number(pose.fov)||58};a.camera.updateProjectionMatrix();a.camera.lookAt(...${JSON.stringify(pose.target)});a.camera.updateMatrixWorld(true);return true;})()`);
  const s=await wait('fixed-view-'+pose.name,idle);assert(Math.hypot(...pose.position.map((v,i)=>v-s.world.camera.position[i]))<1e-5,'Fixed preview pose teleported');return s;}
async function sheet(items){const png=await call(`(async()=>{const items=${JSON.stringify(items)},c=document.createElement('canvas');c.width=1200;c.height=Math.ceil(items.length/2)*370;const x=c.getContext('2d');x.fillStyle='#e9eee8';x.fillRect(0,0,c.width,c.height);for(let i=0;i<items.length;i++){const im=new Image();im.src=items[i].data;await im.decode();const px=i%2*600,py=Math.floor(i/2)*370;x.fillStyle='#17312c';x.font='16px sans-serif';x.fillText(items[i].name,px+12,py+23);x.drawImage(im,px,py+32,600,338);}return c.toDataURL('image/png');})()`);const file=path.join(output,'preview-contact-sheet.png');fs.writeFileSync(file,nativeImage.createFromDataURL(png).toPNG());report.contactSheet=file;}
async function bridges(){return Object.fromEntries(await Promise.all([8797,8798].map(async port=>{const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(6000)});assert(r.ok,'Existing bridge health unavailable');const s=await r.json();assert(s.pid>0&&s.service,'Existing bridge identity absent');return[port,{pid:s.pid,service:s.service}];})));}
async function navigationAndInput(){
  report.navigation=await call(`(()=>{const a=lijiangRaster,V=a.camera.position.constructor,nav=a.getNavigation(),anchors=lijiangMountainEcology.getAnchors({limit:Infinity});let chosen=null;
    for(const p of anchors.filter(p=>p.anchorMode==='sdf-surface'&&p.normal&&p.position).slice(0,300)){
      const root=new V(...p.position),n=new V(...p.normal).normalize(),eye=root.clone().addScaledVector(n,6),inside=root.clone().addScaledVector(n,-2),t=performance.now(),blocked=nav.resolve(eye,inside),cost=performance.now()-t;
      const clearance=blocked.clone().sub(root).dot(n);if(clearance<.70||clearance>.80)continue;const idle=nav.resolve(eye,eye);chosen={anchor:p,eye:eye.toArray(),blocked:blocked.toArray(),clearance,costMilliseconds:cost,idleDrift:idle.distanceTo(eye)};break;}
    return{chosen,stats:nav.getStats()};})()`);
  assert(report.navigation.chosen&&report.navigation.chosen.idleDrift<1e-8,'Actual preview rock navigation fixture/check failed');pass('actual-preview-rock-crossing-and-stationary-resolve',report.navigation);
  const pose=manifest.landscape.previewViews[0];await setPose(pose);
  report.input=await call(`(async()=>{const a=lijiangRaster,wait=ms=>new Promise(r=>setTimeout(r,ms)),event=(t,key)=>dispatchEvent(new KeyboardEvent(t,{key,code:'Key'+key.toUpperCase(),bubbles:true,cancelable:true})),evidence=[];
    const copy=()=>{const s=a.getState();return{camera:s.camera,frames:s.frames,navigation:s.navigation,frameMilliseconds:s.frameMs};};
    try{for(const key of ['w','s']){const before=copy();event('keydown',key);try{await wait(240);}finally{event('keyup',key);}while(a.getState().rendering)await wait(2);const released=copy();await wait(400);while(a.getState().rendering)await wait(2);const after=copy();
      const moved=Math.hypot(...released.camera.position.map((v,i)=>v-before.camera.position[i])),drift=Math.hypot(...released.camera.position.map((v,i)=>v-after.camera.position[i]));evidence.push({key,before,released,after,moved,drift,passed:moved>.05&&moved<20&&drift<1e-6&&released.frames>before.frames});}return evidence;}
    finally{for(const key of ['w','s'])event('keyup',key);}})()`);
  await capture('short-page-driving',{kind:'synthetic-own-page-W-S-input',scope:'Actual page listeners/freeMove; no OS input or user window'});
  assert(report.input.every(s=>s.passed),'Actual preview page input/release failed');pass('actual-page-short-W-S-driving-and-key-release',report.input);
}
async function waterAndSun(){
  const river=manifest.landscape.previewViews[0];await setPose(river);const before=await read();await capture('sun-before',river);
  const settings=before.world.environment.settings;await call(`lijiangRaster.setEnvironment({sunElevation:${Math.min(60,settings.sunElevation+8)}})`);await wait('preview-live-sun-change',idle);await capture('sun-changed',river);
  try{assert(report.captures.at(-1).pixelSHA256!==report.captures.at(-2).pixelSHA256,'Live sun did not change actual pixels');}
  finally{await call(`lijiangRaster.setEnvironment(${JSON.stringify(settings)})`);await wait('preview-sun-restores',idle);}
  await capture('sun-restored',river);pass('preview-live-sun-changes-and-restores',{before:settings,after:(await read()).world.environment.settings});
  report.water={riverBefore:before.world.environment,riverAfter:(await read()).world.environment,scope:'Actual reflection counters; water-outside-frustum diagnostic follows with a skyward view, not an occlusion claim.'};
  const p=report.navigation.chosen.anchor,root=p.position,n=p.normal,eye=root.map((v,i)=>v+n[i]*20),out={name:'water-outside-frustum',position:eye,target:[root[0],Math.max(root[1],eye[1])+100,root[2]],fov:42};
  const baseline=await read();await setPose(out);await capture(out.name,out);const after=await read();report.water.outsideBefore=baseline.world.environment;report.water.outsideAfter=after.world.environment;
  if(Number.isFinite(after.world.environment.reflectionSkippedOutsideFrustum)){
    assert(after.world.environment.reflectionSkippedOutsideFrustum>baseline.world.environment.reflectionSkippedOutsideFrustum,'Skyward outside-water view did not skip reflection work');
    assert(report.water.riverAfter.reflectionFrames>0,'River views never rendered actual reflection');pass('actual-water-visible-reflection-and-outside-frustum-skip',report.water);
  }else report.water.counterVerification='pending-runtime-interface';
}
async function run(){
  const initialBridges=await bridges();report.initialBridges=initialBridges;
  window=new BrowserWindow({width,height,useContentSize:true,show:false,focusable:false,skipTaskbar:true,paintWhenInitiallyHidden:true,backgroundColor:'#071b1b',webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,devTools:false,backgroundThrottling:false,partition:'persist:lijiang-m6-preview-hidden-qa'}});
  window.on('focus',()=>fatal='Own QA unexpectedly focused');window.webContents.setFrameRate(fps);window.webContents.on('paint',()=>paints++);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.session.setPermissionRequestHandler((_c,_p,cb)=>cb(false));window.webContents.session.on('will-download',e=>{e.preventDefault();report.downloadAttempts++;});
  window.webContents.on('console-message',d=>{const v={level:d.level,message:String(d.message||'').slice(0,4000),source:d.sourceId,line:d.lineNumber};report.console.push(v);if(/Raster shader failed|THREE.WebGLProgram: Shader Error|VALIDATE_STATUS.*false|ERROR: 0:\d+:/.test(v.message))fatal=v.message;});
  window.webContents.on('render-process-gone',(_e,d)=>fatal='Own renderer exited: '+d.reason);
  const entry=new URL('http://127.0.0.1:8796/projects/014-programmable-worlds/web/lijiang-m6/raster.html');for(const key of ['preview','surface','material','qa'])entry.searchParams.set(key,'1');entry.searchParams.set('revision',process.env.LIJIANG_M6_REVISION||'20261026-m6');report.entry=entry.href;
  const loadStart=Date.now();await window.loadURL(entry.href);policy();const ready=await wait('actual-limited-peak-generation',idle);report.loadSeconds=(Date.now()-loadStart)/1000;report.initial=ready;
  assert(ready.world.preview===true&&!ready.cache&&!ready.generatorPresent&&ready.peakCount>=3&&ready.peakCount<=5&&ready.peakCount===ready.world.previewScope.peakCount,'Preview did not use the real limited-peak generator');
  report.generation=ready.world.generation;report.loadTimings=ready.world.loadTimings;pass('actual-three-to-five-peak-generated-preview',{seconds:report.loadSeconds,scope:ready.world.previewScope,generation:report.generation});
  await call('window.__m6OriginalGL=lijiangRaster.renderer.getContext();true');
  const images=[];for(const [i,pose]of manifest.landscape.previewViews.entries()){await setPose(pose);images.push({name:pose.name,data:await capture('view-'+String(i+1).padStart(2,'0')+'-'+pose.name.replace(/[^a-z0-9_-]/gi,'-'),pose)});}await sheet(images);
  pass('six-actual-manifest-fixed-view-captures',{views:report.captures.slice(0,6).map(c=>({name:c.name,position:c.state.world.camera.position,frameMilliseconds:c.state.world.frameMs,triangles:c.state.gpu.render.triangles})),artAccepted:false});
  await navigationAndInput();await waterAndSun();
  await call('lijiangRaster.dispose()');report.disposed=await call('({state:lijiangRaster.getState(),contextLost:__m6OriginalGL.isContextLost()})');assert(report.disposed.contextLost&&report.disposed.state.phase==='disposed','Actual preview context was not released');
  await window.loadURL('about:blank');policy();pass('own-preview-context-disposes-and-unloads',report.disposed);
  report.finalBridges=await bridges();assert(JSON.stringify(initialBridges)===JSON.stringify(report.finalBridges),'Existing unrelated bridge identities changed');pass('existing-bridge-process-identities-preserved',report.finalBridges);report.status='passed';
}
app.whenReady().then(async()=>{try{await run();}catch(error){report.status='failed';report.errors.push(String(error.stack||error));}
  finally{if(window&&!window.isDestroyed()){try{await window.webContents.executeJavaScript('window.lijiangRaster?.dispose?.()',false);}catch{}window.destroy();}
    try{report.protectedM5=C.verifyM5();C.verifyM6(report.sourceFreeze);pass('pinned-M5-and-M6-source-freeze-preserved',{m5:report.protectedM5,m6:report.sourceFreeze});}catch(error){report.status='failed';report.errors.push(String(error.stack||error));}
    report.paints=paints;progress('finished');fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));app.exit(report.status==='passed'?0:1);}});
app.on('window-all-closed',()=>{});app.on('child-process-gone',(_e,d)=>{if(d.type==='GPU'&&['crashed','killed','abnormal-exit'].includes(d.reason))fatal='Own GPU exited: '+d.reason;});
