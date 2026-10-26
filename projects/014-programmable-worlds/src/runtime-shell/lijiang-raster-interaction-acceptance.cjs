'use strict';
// Actual functional acceptance for the caller's OWN hidden Electron/OSR page.
// No server/GPU/window launch, cache mutation, OS input, iframe traversal or
// download. Full WebM writing is opt-in and goes only to this run's C: folder.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {nativeImage}=require('electron');
const ROOT='C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-raster-interaction-qa';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(value,message)=>{if(!value)throw new Error(message);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const qdistance=(a,b)=>Math.min(distance(a,b),distance(a,b.map(v=>-v)));
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,
  new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label+' timed out')),ms))]);}
  finally{clearTimeout(timer);}}
function posePreserved(a,b,{dimensions=true,ui=true}={}){
  assert(a.world.mode===b.world.mode&&a.world.paused===b.world.paused
    &&!!a.world.suspended===!!b.world.suspended
    &&Math.abs(a.world.time-b.world.time)<1e-6,'Time/mode/pause/suspend changed unexpectedly');
  assert(distance(a.world.camera.position,b.world.camera.position)<1e-5
    &&qdistance(a.world.camera.quaternion,b.world.camera.quaternion)<1e-6,'Saved free camera pose changed');
  if(dimensions)assert(a.world.width===b.world.width&&a.world.height===b.world.height
    &&a.view.pixelRatio===b.view.pixelRatio,'Original render dimensions were not restored');
  if(ui)assert(a.world.uiHidden===b.world.uiHidden&&a.view.settingsOpen===b.view.settingsOpen,
    'Saved clean/settings UI state changed');
}
function difference(a,b){assert(a.length===b.length,'Compared canvas dimensions differ');let total=0;
  for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)total+=Math.abs(a[i+c]-b[i+c]);
  return{identical:a.equals(b),meanAbsoluteRGBDifference:total/(a.length/4*3)};}

async function runLijiangRasterInteractionAcceptance({window,getFatal=()=>null,
  getPresentation=()=>null,record=()=>{},projectDirectory,backend}){
  const began=Date.now(),runId=new Date(began).toISOString().replace(/[:.]/g,'-'),output=path.join(ROOT,runId);
  fs.mkdirSync(output,{recursive:true});
  const fullExport=process.env.LIJIANG_RASTER_FULL_EXPORT==='1'||process.env.LIJIANG_RASTER_FULL_EXPORT1==='1';
  const report={runId,output,backend,status:'running',artAccepted:false,
    scope:'FUNCTIONAL ONLY: actual wall-clock flight, own OSR controls, settings, viewport preservation, real fixed-frame export/cancellation. No artwork-quality acceptance.',
    presentationEvidence:{canvasPNG:'Actual WebGL canvas pixels; not a substitute for separate displayed-page artwork review.',
      osrPage:'UI/layout reference only. Hidden OSR capture may omit the WebGL compositor layer; it cannot establish displayed-canvas visual success.'},
    tests:[],captures:[],flightSamples:[],errors:[],fullExport:{enabled:fullExport,ffprobePending:fullExport}};
  const originalContent=window.getContentSize();let originalView=null,ownReady=false,lastProgress=0;
  function policy(){assert(window&&!window.isDestroyed()&&!window.isVisible()&&!window.isFocused(),
    'Interaction acceptance window must remain hidden and unfocused');}
  async function call(js,label='Own hidden raster page',ms=60000,allowFatal=false){
    policy();if(!allowFatal&&getFatal())throw new Error(getFatal());
    const result=await bounded(window.webContents.executeJavaScript(js,false),ms,label);policy();return result;
  }
  function progress(phase,sample=null){report.phase=phase;report.elapsedSeconds=(Date.now()-began)/1000;
    fs.writeFileSync(path.join(output,'status.json'),JSON.stringify({...report,state:sample},null,2));
    record('raster-interaction-progress',{phase,seconds:report.elapsedSeconds,tests:report.tests.length,output});}
  function pass(name,evidence){report.tests.push({name,passed:true,evidence});}
  async function read(){
    const value=await call(`(()=>{const a=window.lijiangRaster;return {url:location.href,world:a?.getState()||null,
      view:{innerWidth,innerHeight,now:performance.now(),generatorPresent:!!document.getElementById('generator'),
      pixelRatio:a?.renderer?.getPixelRatio(),aspect:a?.camera?.aspect,fov:a?.camera?.fov,
      settingsOpen:!document.querySelector('#settings')?.hidden,sceneFog:a?.scene?.fog?.density},
      load:document.querySelector('#load-detail')?.textContent};})()`);
    const u=new URL(value.url);assert(u.origin==='http://127.0.0.1:8796'
      &&u.pathname.endsWith('/web/lijiang-native/raster.html'),'Runner left its own raster candidate entry');
    if(value.world?.error)throw new Error(value.world.error);
    return value;
  }
  async function wait(phase,predicate,ms=180000,{exportError=false}={}){
    const deadline=Date.now()+ms;let value;
    while(Date.now()<deadline){value=await read();if(exportError&&value.world?.export?.phase==='error')
      throw new Error(value.world.export.error||'Actual export failed');
      if(predicate(value))return value;
      if(Date.now()-lastProgress>2500){progress(phase,value);lastProgress=Date.now();}await sleep(150);}
    throw new Error(phase+' timeout: '+JSON.stringify(value));
  }
  const idle=s=>s.world?.ready&&s.world.paused&&s.world.idle&&!s.world.rendering&&!s.world.suspended
    &&!s.world.lightingBusy&&!s.world.export?.active&&!(s.world.forest?.pending>0);
  async function idleNow(phase){return wait(phase,idle,180000,{exportError:true});}
  async function capture(name,{page=false}={}){
    const png=await call(`document.querySelector('#scene').toDataURL('image/png')`,'Read actual GPU-completed canvas');
    const image=nativeImage.createFromDataURL(png),size=image.getSize(),pixels=image.toBitmap();
    assert(!image.isEmpty()&&pixels.length===size.width*size.height*4,'Actual canvas is empty');
    let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>18)lit++;
    assert(lit>pixels.length/4*.15,'Actual rendered canvas is substantially black');
    const bytes=image.toPNG(),file=path.join(output,name+'-canvas.png');fs.writeFileSync(file,bytes);
    const item={name,path:file,sha256:sha(bytes),pixelSHA256:sha(pixels),...size,state:await read()};
    if(page){policy();const shot=await bounded(window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}),30000,'Own hidden page capture');policy();
      const file=path.join(output,name+'-page.png'),bytes=shot.toPNG();fs.writeFileSync(file,bytes);item.page={path:file,sha256:sha(bytes),
        role:'UI/layout reference; hidden OSR may omit WebGL composition',webGLVisualEvidence:false};}
    report.captures.push(item);return{item,pixels};
  }
  async function click(selector){await call(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
    if(!e||e.disabled)throw new Error('Control unavailable: '+${JSON.stringify(selector)});e.click();return true;})()`,'Click actual scene control');}
  function input(event){policy();window.webContents.sendInputEvent(event);policy();}
  async function key(code,hold=55){
    // DOM keyboard events exercise the real registered key bindings without
    // requiring OS focus. Mouse acceptance remains native OSR input below.
    const key=code.toLowerCase(),eventCode='Key'+code.toUpperCase();
    await call(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(eventCode)},bubbles:true,cancelable:true}));true`,'Own page key binding down');
    try{await sleep(hold);}finally{await call(`window.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(key)},code:${JSON.stringify(eventCode)},bubbles:true}));true`,'Own page key binding up');}
  }
  async function rect(selector){return call(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e?.getBoundingClientRect();
    if(!r||!r.width||!r.height||getComputedStyle(e).display==='none')throw new Error('Hidden pointer target');
    return {x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.5),width:r.width,height:r.height};})()`);}
  async function pointerClick(selector){const point=await rect(selector);input({type:'mouseMove',x:point.x,y:point.y});
    input({type:'mouseDown',x:point.x,y:point.y,button:'left',clickCount:1});await sleep(40);
    input({type:'mouseUp',x:point.x,y:point.y,button:'left',clickCount:1});return point;}
  async function dragCanvas(){const c=await rect('#scene'),start={x:Math.round(c.x-c.width*.1),y:Math.round(c.y-c.height*.05)},
    end={x:start.x+64,y:start.y-24};
    input({type:'mouseDown',...start,button:'left',clickCount:1});
    try{await sleep(40);input({type:'mouseMove',...end,button:'left',buttons:['left']});await sleep(60);}
    finally{input({type:'mouseUp',...end,button:'left',clickCount:1});}
    return{start,end,scope:'webContents.sendInputEvent to own hidden OSR only'};
  }
  async function resizeView(width,height){
    const attempts=[];
    for(let i=0;i<4;i++){
      const before=await read(),content=window.getContentSize();
      const requested=[Math.max(320,Math.round(content[0]+width-before.view.innerWidth)),
        Math.max(400,Math.round(content[1]+height-before.view.innerHeight))];
      policy();window.setContentSize(...requested);policy();await sleep(180);
      const actual=await read();attempts.push({requested,actual:actual.view,render:[actual.world.width,actual.world.height]});
      if(Math.abs(actual.view.innerWidth-width)<=1&&Math.abs(actual.view.innerHeight-height)<=1)break;
    }
    const after=await wait('Resized actual viewport completes and idles',s=>idle(s)
      &&Math.abs(s.world.width-s.view.innerWidth)<=1&&Math.abs(s.world.height-s.view.innerHeight)<=1);
    assert(Math.abs(after.view.innerWidth-width)<=1&&Math.abs(after.view.innerHeight-height)<=1,
      'OSR content/frame correction could not reach requested viewport');
    return{after,attempts};
  }
  async function changeSettings(values){await call(`(()=>{for(const [id,value] of Object.entries(${JSON.stringify(values)})){
    const e=document.getElementById(id);if(!e||e.disabled)throw new Error('Setting control unavailable: '+id);
    e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}return true;})()`,'Actual range-input setting events');}
  async function materialSunRoundtrip(baseline,baselinePixels){
    const name='material-only-sun-18-35-18-updates-real-lighting-without-producer';
    if(!baseline.world.materialOnly){report.tests.push({name,passed:null,skipped:true,
      reason:'Loaded scene is HDR/baked-lighting mode; immediate material-only sun path is outside this run.'});return;}
    assert(!baseline.view.generatorPresent,'Material-only sun must not retain a producer iframe');
    assert(Math.abs(baseline.world.environment.settings.sunElevation-18)<1e-6,
      'Sun roundtrip must begin at the default 18-degree elevation');
    async function apply(value,before){
      const revision=Number(before.world.lightingRevision)||0;
      const event=await call(`(()=>{const e=document.getElementById('sun');
        if(!e||e.disabled)throw new Error('Actual sun control is unavailable');
        const eventAt=performance.now();e.value=${value};
        e.dispatchEvent(new Event('input',{bubbles:true}));
        e.dispatchEvent(new Event('change',{bubbles:true}));
        return {eventAt,value:Number(e.value),generatorPresent:!!document.getElementById('generator')};})()`,'Actual sun range input and change');
      assert(!event.generatorPresent,'Sun control unexpectedly retained/created a producer iframe');
      const after=await wait('Sun '+value+' reaches a completed idle frame',s=>{
        assert(!s.view.generatorPresent,'Material-only relighting created a producer iframe');
        return idle(s)&&!s.world.lightingBusy&&(Number(s.world.lightingRevision)||0)>revision
          &&s.world.frames>before.world.frames
          &&Math.abs(s.world.environment.settings.sunElevation-value)<1e-6;
      });
      posePreserved(before,after);
      return {after,event,revisionBefore:revision,revisionAfter:Number(after.world.lightingRevision),
        lightingBusy:!!after.world.lightingBusy,producerAbsent:true,
        eventToObservedIdleMilliseconds:after.view.now-event.eventAt,
        observationPollingMilliseconds:150};
    }
    const elevated=await apply(35,baseline),elevatedPixels=await capture('sun-35');
    const changed=difference(baselinePixels,elevatedPixels.pixels);
    assert(changed.meanAbsoluteRGBDifference>.1,'18-to-35 sun event did not change actual rendered pixels');
    const restored=await apply(18,elevated.after),restoredPixels=await capture('sun-18-restored');
    const roundtrip=difference(baselinePixels,restoredPixels.pixels);
    assert(await call('Number(document.getElementById("sun").value)===18&&!document.getElementById("generator")'),
      'Sun UI did not return to the default 18 degrees without a producer');
    pass(name,{baseline,elevated,restored,changed,restoredPixelDifference:roundtrip,
      scope:'Actual sun input/change events, real completed pixels and idle timing. Restoration difference is recorded, not forced to byte identity.'});
  }
  async function portraitControlLayout(){
    const layout=await call(`(()=>{const read=id=>{const e=document.getElementById(id);if(!e)throw new Error('Missing mobile control '+id);
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {id,rect:r.toJSON(),whiteSpace:s.whiteSpace,
        visible:!!e.getClientRects().length&&s.display!=='none'&&s.visibility!=='hidden'};};
      const bottom=getComputedStyle(document.getElementById('bottom'));
      return {width:innerWidth,height:innerHeight,controls:['play','replay','seek','time'].map(read),
        bottom:{display:bottom.display,gridTemplateColumns:bottom.gridTemplateColumns,gridTemplateRows:bottom.gridTemplateRows}};})()`,'Measure actual portrait bottom controls');
    for(const control of layout.controls){const r=control.rect;
      assert(control.visible&&r.width>0&&r.height>0,'Portrait bottom control is hidden or empty: '+control.id);
      assert(r.left>=-1&&r.top>=-1&&r.right<=layout.width+1&&r.bottom<=layout.height+1,
        'Portrait bottom control exceeds the viewport: '+control.id);
      if(control.id==='play'||control.id==='replay')assert(control.whiteSpace==='nowrap'&&r.height<=54&&r.width>=55,
        'Portrait play/replay button wrapped or lost its usable size: '+control.id);
    }
    return layout;
  }
  async function assertExportRestored(before,name,pixels){const after=await idleNow(name+' restored idle');
    assert(!after.world.capturing&&!after.world.export.active,'Capture lock remained after export');
    posePreserved(before,after);const restored=await capture(name),comparison=difference(pixels,restored.pixels);
    assert(comparison.meanAbsoluteRGBDifference<2,'Restored fixed-time free-view pixels changed unexpectedly');
    return{after,comparison};
  }
  async function fullRecording(){
    const before=await idleNow('Before full export'),original=await capture('before-full-export');
    let done=false,result,error;
    const timeout=Math.max(180000,Number(process.env.LIJIANG_RASTER_EXPORT_TIMEOUT_MS)||900000);
    const completion=call(`(async()=>{const r=await lijiangRaster.export.start();return {
      cancelled:!!r?.cancelled,metadata:r?.metadata||null,blobBytes:r?.blob?.size||0};})()`,'Actual complete 2700-frame WebM export',timeout)
      .then(value=>{result=value;done=true;},e=>{error=e;done=true;});
    const deadline=Date.now()+timeout;
    while(!done&&Date.now()<deadline){const current=await read();
      if(current.world.export?.phase==='error')throw new Error(current.world.export.error);
      progress('Actual full 2700-frame encoding',current);await sleep(1000);}
    await completion;if(error)throw error;
    assert(result&&!result.cancelled&&result.blobBytes>0&&result.metadata?.frameCount===2700
      &&result.metadata.width===1920&&result.metadata.height===1080&&result.metadata.fps===60
      &&result.metadata.timestampGridVerified&&Math.abs(result.metadata.duration-45)<.02,
      'Actual complete export metadata is incomplete');
    const restored=await assertExportRestored(before,'after-full-export',original.pixels);
    const info=await call(`(()=>{const r=lijiangRaster.export.getResult();if(!r?.blob)throw new Error('Completed WebM unavailable');
      return {size:r.blob.size,type:r.blob.type,metadata:r.metadata};})()`,'Read actual immutable completed Blob');
    assert(info.size===result.blobBytes&&info.type==='video/webm','Completed WebM Blob identity/size mismatch');
    const file=path.join(output,'lijiang-1920x1080-60fps-2700frames.webm'),fd=fs.openSync(file,'wx'),hash=crypto.createHash('sha256');
    let written=0;
    try{for(let offset=0;offset<info.size;offset+=524288){const end=Math.min(info.size,offset+524288);
      const b64=await call(`(async()=>{const r=lijiangRaster.export.getResult(),a=new Uint8Array(await r.blob.slice(${offset},${end}).arrayBuffer());
        let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);})()`,'Read own completed WebM chunk');
      const bytes=Buffer.from(b64,'base64');assert(bytes.length===end-offset,'WebM chunk byte count mismatch');
      fs.writeSync(fd,bytes);hash.update(bytes);written+=bytes.length;
    }}finally{fs.closeSync(fd);}
    assert(written===info.size&&fs.statSync(file).size===info.size,'Written WebM is truncated');
    const evidence={...info,path:file,sha256:hash.digest('hex'),bytesWritten:written,restoration:restored,
      ffprobePending:true,scope:'Actual encoder/muxer metadata and saved Blob bytes; independent ffprobe/decode is still required.'};
    fs.writeFileSync(path.join(output,'full-export-metadata.json'),JSON.stringify(evidence,null,2));
    report.fullExport={enabled:true,...evidence};pass('actual-full-2700-frame-WebM-saved-without-download',evidence);
  }
  try{
    if(projectDirectory){report.modules={};for(const name of ['raster-main.js','raster-experience-ui.js']){
      const file=path.join(projectDirectory,'web/lijiang-native',name);report.modules[name]=sha(fs.readFileSync(file));}}
    const ready=await wait('Actual complete raster scene readiness',s=>s.world?.ready&&!s.world.rendering,1200000);
    ownReady=true;originalView=ready.view;report.entry=ready.url;report.initial=ready;
    assert(ready.world.sceneId==='lijiang-raster'&&ready.world.duration===45
      &&ready.world.export?.format?.totalFrames===2700,'Actual experience/export API is missing');
    await idleNow('Initial paused scene settles');await capture('initial',{page:true});
    pass('actual-raster-experience-ready-with-standard-export-controls',ready);

    // This is a real uninterrupted wall-clock flight. No seek/renderAt/prepare
    // call is made between Replay and the actual terminal automatic pause.
    const flightStarted=Date.now();await click('#replay');let terminal,lastTime=-1,lastFrames=-1;
    const flightDeadline=flightStarted+90000;
    while(Date.now()<flightDeadline){const current=await read(),s=current.world;
      assert(s.time>=lastTime-1e-6&&s.frames>=lastFrames,'Actual wall-clock flight moved backwards');
      report.flightSamples.push({wallMilliseconds:Date.now()-flightStarted,time:s.time,frames:s.frames,
        paused:s.paused,rendering:s.rendering,position:s.camera.position,quaternion:s.camera.quaternion,error:s.error});
      lastTime=s.time;lastFrames=s.frames;progress('Uninterrupted actual 45-second wall-clock flight',current);
      if(s.time>=45&&s.paused&&!s.rendering){terminal=current;break;}await sleep(1000);
    }
    assert(terminal,'Actual full flight did not reach its own automatic 45-second pause');
    const elapsed=Date.now()-flightStarted,first=report.flightSamples[0],last=report.flightSamples.at(-1);
    assert(elapsed>=43000&&elapsed<=65000&&report.flightSamples.length>=35
      &&last.frames-first.frames>=45&&distance(first.position,last.position)>100,
      'Full flight did not supply real wall-clock samples/completed frames across the 45-second path');
    pass('actual-45-second-wall-clock-flight-no-seek-substitution',{elapsedMilliseconds:elapsed,
      samples:report.flightSamples.length,completedFrameDelta:last.frames-first.frames,
      measuredCompletedFPS:(last.frames-first.frames)/(elapsed/1000),terminal});
    const paused=await idleNow('Terminal pause becomes idle'),heldA=await capture('flight-45');await sleep(2000);
    const held=await read(),heldB=await capture('flight-45-held');
    assert(idle(held)&&held.world.frames===paused.world.frames&&difference(heldA.pixels,heldB.pixels).identical,
      'Paused terminal scene did not hold actual pixels and completed-frame counter');
    pass('paused-terminal-idle-holds-exact-canvas-and-completed-frames',{before:paused,after:held,heldMilliseconds:2000});

    await click('#mode');await wait('Actual mode button enters free camera',s=>s.world.mode==='free');
    await key('C');await wait('Actual C returns flight',s=>s.world.mode==='flight');
    await key('C');const free=await wait('Actual C enters free camera',s=>s.world.mode==='free');
    await key('W',500);const moved=await wait('Actual held W moves free camera',s=>distance(s.world.camera.position,free.world.camera.position)>.2);
    await key('Q',300);const lowered=await wait('Actual Q lowers free camera',s=>s.world.camera.position[1]<moved.world.camera.position[1]-.1);
    const pointer=await dragCanvas(),turned=await wait('Own OSR pointer drives camera',s=>qdistance(s.world.camera.quaternion,lowered.world.camera.quaternion)>.01);
    await idleNow('Driven free camera holds');
    pass('actual-mode-button-C-W-Q-and-own-OSR-drag-drive-camera',{free,moved,lowered,turned,pointer,
      keyboardScope:'DOM keydown/keyup on own window, invoking actual production bindings; no OS focus/input'});

    const beforeClean=await read();await key('H');const clean=await wait('H hides scene controls',s=>s.world.uiHidden===true);
    const reveal=await pointerClick('.rf-exp-reveal');const shown=await wait('Own OSR reveal restores controls',s=>s.world.uiHidden===false);
    posePreserved(beforeClean,shown);pass('H-clean-view-has-working-own-pointer-restore',{clean,shown,reveal});

    await click('#settings-button');const settingsBefore=await idleNow('Settings baseline idle'),settingsPixels=await capture('settings-before');
    const originalSettings=await call(`Object.fromEntries(['fog','reflection','mist-height','mist-density'].map(id=>[id,Number(document.getElementById(id).value)]))`);
    const changed={fog:.00041,reflection:.58,'mist-height':103,'mist-density':3.3};
    await changeSettings(changed);
    const settingsAfter=await wait('Actual fog/reflection/mist uniforms update',s=>idle(s)
      &&Math.abs(s.view.sceneFog-changed.fog)<1e-10&&Math.abs(s.world.air.density-changed.fog)<1e-10
      &&Math.abs(s.world.environment.settings.reflectionStrength-changed.reflection)<1e-6
      &&s.world.air.mistHeight===changed['mist-height']&&Math.abs(s.world.air.mistDensity-changed['mist-density'])<1e-6
      &&s.world.frames>settingsBefore.world.frames);
    const changedPixels=await capture('settings-changed'),change=difference(settingsPixels.pixels,changedPixels.pixels);
    assert(change.meanAbsoluteRGBDifference>.1,'Actual settings did not change rendered pixels');
    await changeSettings(originalSettings);
    const settingsRestored=await wait('Actual settings restored in completed pixels',s=>idle(s)&&s.world.frames>settingsAfter.world.frames
      &&Math.abs(s.view.sceneFog-originalSettings.fog)<1e-10
      &&Math.abs(s.world.environment.settings.reflectionStrength-originalSettings.reflection)<1e-6
      &&s.world.air.mistHeight===originalSettings['mist-height']
      &&Math.abs(s.world.air.mistDensity-originalSettings['mist-density'])<1e-6);
    const restoredSettingsPixels=await capture('settings-restored'),settingsRoundtrip=difference(settingsPixels.pixels,restoredSettingsPixels.pixels);
    assert(settingsRoundtrip.meanAbsoluteRGBDifference<2,'Settings roundtrip did not restore the fixed free-view canvas');
    pass('real-fog-reflection-mist-controls-update-world-and-pixels',{originalSettings,changed,settingsAfter,settingsRestored,
      comparison:change,roundtrip:settingsRoundtrip});
    await materialSunRoundtrip(settingsRestored,restoredSettingsPixels.pixels);

    const beforePortrait=await idleNow('Before portrait rotation'),portrait=await resizeView(390,844);
    posePreserved(beforePortrait,portrait.after,{dimensions:false});
    assert(portrait.after.world.height>portrait.after.world.width,'Portrait still renders a landscape canvas');
    portrait.layout=await portraitControlLayout();
    await capture('portrait',{page:true});
    const beforeLandscape=await read(),landscape=await resizeView(originalView.innerWidth,originalView.innerHeight);
    posePreserved(beforeLandscape,landscape.after,{dimensions:false});
    await capture('landscape-restored',{page:true});
    pass('actual-portrait-and-landscape-resize-preserve-free-pose-and-time',{portrait,landscape,
      note:'Requested content size is corrected using actual inner viewport dimensions; OSR frame insets are not assumed.'});

    const beforeExport=await idleNow('Before real export cancel'),beforePixels=await capture('before-export-cancel');
    assert(beforeExport.world.mode==='free'&&beforeExport.view.settingsOpen&&!beforeExport.world.uiHidden,
      'Cancellation precondition must have a distinct free pose and open visible settings');
    await key('V');const encoding=await wait('Actual standard export submits real encoded frames',s=>s.world.export?.active
      &&s.world.export.phase==='encoding'&&s.world.export.frameCount>=2&&s.world.export.encodedFrameCount>=1
      &&s.world.width===1920&&s.world.height===1080,300000,{exportError:true});
    assert(encoding.world.capturing&&encoding.world.export.totalFrames===2700
      &&encoding.world.export.fps===60,'V key did not launch the full standard capture job');
    const controlsLocked=await call(`[...document.querySelectorAll('#settings input,#bottom input,#bottom button')].every(e=>e.disabled)`);
    assert(controlsLocked,'Live camera/settings controls remained enabled during export');
    const cancelTarget=await call(`(()=>{const b=[...document.querySelectorAll('.rf-exp-panel button')].find(x=>x.textContent==='取消导出'),r=b?.getBoundingClientRect();
      if(!r||b.hidden||b.disabled)throw new Error('Actual Cancel unavailable');return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
    input({type:'mouseDown',...cancelTarget,button:'left',clickCount:1});await sleep(40);input({type:'mouseUp',...cancelTarget,button:'left',clickCount:1});
    const cancelled=await wait('Actual cancel waits for capture restoration',s=>!s.world.export.active&&s.world.export.phase==='cancelled',240000,{exportError:true});
    const restored=await assertExportRestored(beforeExport,'after-export-cancel',beforePixels.pixels);
    assert(await call('lijiangRaster.export.getResult()===null'),'Cancelled first capture exposed a partial WebM as a completed result');
    pass('V-starts-real-standard-export-and-own-Cancel-restores-free-pose-size-UI',
      {before:beforeExport,encoding,controlsLocked,cancelTarget,cancelled,restoration:restored});
    if(fullExport)await fullRecording();
    report.status='passed';
  }catch(error){report.status='failed';report.errors.push(String(error.stack||error));
    try{if(ownReady)await capture('failure',{page:true});}catch(e){report.errors.push('Failure capture: '+e.message);}
  }finally{
    try{if(ownReady){await call(`(async()=>{await lijiangRaster.export?.cancel();lijiangRaster.pause(true);lijiangRaster.suspend(true);
      while(lijiangRaster.getState().rendering)await new Promise(r=>setTimeout(r,10));return lijiangRaster.getState();})()`,'Quiesce only own scene',240000,true);
      report.beforeDispose=await call('lijiangRaster.getState()','Read own final state',30000,true);
      await call('lijiangRaster.dispose()','Dispose only own candidate page',240000,true);
      report.afterDispose=await call('lijiangRaster.getState()','Read own disposed state',30000,true);}
    }catch(error){report.status='failed';report.errors.push('Own cleanup: '+String(error.stack||error));}
    try{policy();window.setContentSize(...originalContent);policy();}catch{}
  }
  report.testCounts={passed:report.tests.filter(t=>t.passed===true).length,
    skipped:report.tests.filter(t=>t.skipped===true).length};
  report.elapsedSeconds=(Date.now()-began)/1000;report.presentation=getPresentation();report.reportPath=path.join(output,'result.json');
  progress('finished');fs.writeFileSync(report.reportPath,JSON.stringify(report,null,2));
  record('raster-interaction-result',{status:report.status,output,tests:report.tests.length,errors:report.errors});return report;
}
module.exports={runLijiangRasterInteractionAcceptance,contracts:{ROOT,posePreserved,difference,qdistance}};
