'use strict';

// Decode and inspect the actual MediaStream in an ordinary D3D11 client. The
// source generator runs separately in the bridge's invisible OpenGL renderer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {nativeImage} = require('electron');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function invariant(condition,message){if(!condition)throw new Error(message);}
async function bounded(promise,milliseconds,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),milliseconds);})]);}finally{clearTimeout(timer);}}
function pixels(image){
  const size=image.getSize(),data=image.toBitmap(),sample=[];let sum=0,square=0;
  for(let y=0;y<48;y++)for(let x=0;x<64;x++){
    const px=Math.floor(size.width*(.06+.88*(x+.5)/64)),py=Math.floor(size.height*(.06+.84*(y+.5)/48)),i=(py*size.width+px)*4;
    const r=data[i+2],g=data[i+1],b=data[i];sample.push(r,g,b);const l=.2126*r+.7152*g+.0722*b;sum+=l;square+=l*l;
  }
  const count=48*64,mean=sum/count;return {sample,statistics:{...size,meanLuminance:mean,luminanceStdDev:Math.sqrt(Math.max(0,square/count-mean*mean))}};
}
function difference(a,b){invariant(a.length===b.length,'Decoded-video sample dimensions changed');let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);return total/a.length;}

async function runSourceLiveAcceptance({window,projectDirectory,workspaceDirectory,backend,record,getFatal}){
  const started=Date.now(),runId=new Date(started).toISOString().replace(/[:.]/g,'-');
  const output=path.join(projectDirectory,'assets','source-live-qa',runId),notes=path.join(projectDirectory,'notes');
  const canonical=path.join(notes,'source-live-acceptance.'+backend+'.json'),latest=path.join(notes,'source-live-acceptance.'+backend+'.latest.json');
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(notes,{recursive:true});
  const progressPath=path.join(workspaceDirectory,'.cache','napali-source-live-qa-status-'+backend+'.json');
  let scope='window',priorPassed=false;
  if(fs.existsSync(canonical)){try{priorPassed=JSON.parse(fs.readFileSync(canonical,'utf8')).status==='passed';if(priorPassed&&!fs.existsSync(canonical.replace('.json','.baseline.json')))fs.copyFileSync(canonical,canonical.replace('.json','.baseline.json'));}catch{/* Invalid history is not a baseline. */}}
  const result={runId,scene:'source-live',backend,engineBackend:'gl',status:'running',mode:'hidden-ordinary-browser-client',startedAt:new Date(started).toISOString(),tests:[],captures:[],errors:[],windowPolicy:{show:false,focusable:false,skipTaskbar:true},scope:'Actual WebRTC video decoding and original-renderer control. Source shader fidelity is checked separately; no artwork-quality claim.'};
  function progress(phase,state=null){fs.writeFileSync(progressPath,JSON.stringify({...result,phase,elapsedSeconds:(Date.now()-started)/1000,application:state},null,2)+'\n');record('source-live-qa-progress',{phase,elapsedSeconds:(Date.now()-started)/1000,application:state});}
  function check(name,evidence){result.tests.push({name,passed:true,evidence});}
  async function evaluate(code,label='Own source video call',milliseconds=30000){
    const fatal=getFatal();if(fatal)throw new Error(fatal);
    invariant(!window.isDestroyed()&&!window.isVisible()&&!window.isFocused(),'Source-live client became visible, focused, or destroyed');
    return bounded(window.webContents.executeJavaScript(code,false),milliseconds,label);
  }
  async function readState(){return evaluate(`(() => {
    const child=${scope},video=child?.document.querySelector('#source-video');
    return {url:location.href,state:child?.sourceLive?.getState()||null,api:!!child?.napaliControl&&!!child?.napaliDrive,
      host:window.worldsHost||null,documentCanvases:child?.document.querySelectorAll('canvas').length??null,
      qualitySelect:child?.document.querySelector('#source-quality')?{value:child.document.querySelector('#source-quality').value,options:[...child.document.querySelector('#source-quality').options].map(option=>option.value)}:null,
      media:video?{width:video.videoWidth,height:video.videoHeight,readyState:video.readyState,paused:video.paused,
        mediaStream:video.srcObject instanceof child.MediaStream,
        tracks:video.srcObject?.getTracks().map(t=>({kind:t.kind,readyState:t.readyState,enabled:t.enabled})),
        decodedFrames:video.getVideoPlaybackQuality?.().totalVideoFrames??null}:null};
  })()`,'Read actual source video state');}
  async function waitFor(predicate,label,milliseconds=90000){
    const deadline=Date.now()+milliseconds;let state,lastProgress=0;
    while(Date.now()<deadline){state=await readState();if(predicate(state))return state;if(state.state?.error)throw new Error(state.state.error);if(Date.now()-lastProgress>=2000){progress(label,state);lastProgress=Date.now();}await pause(350);}
    throw new Error(label+' timed out: '+JSON.stringify(state));
  }
  async function health(){return evaluate(`fetch('http://127.0.0.1:8797/health',{cache:'no-store'}).then(r=>r.json())`,'Read bridge lifecycle');}
  async function capture(name){
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,'Wait own video/page presentation');
    const data=await evaluate(`(() => {const v=${scope}.document.querySelector('#source-video');if(!v?.videoWidth)throw new Error('No decoded video frame');const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png');})()`,'Read decoded MediaStream frame');
    const image=nativeImage.createFromDataURL(data);invariant(!image.isEmpty(),'Decoded video PNG was empty');
    const sample=pixels(image);invariant(sample.statistics.width>=500&&sample.statistics.height>=300&&sample.statistics.meanLuminance>3&&sample.statistics.luminanceStdDev>4,'Decoded video frame is blank or flat');
    const png=image.toPNG(),canvasFile=path.join(output,name+'-decoded-video.png');fs.writeFileSync(canvasFile,png);
    const page=await bounded(window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}),30000,'Capture own hidden video client');
    const pageFile=path.join(output,name+'-page.png');fs.writeFileSync(pageFile,page.toPNG());
    invariant(!window.isVisible()&&!window.isFocused(),'Video capture changed hidden policy');
    const entry={name,video:path.relative(projectDirectory,canvasFile).replaceAll('\\','/'),page:path.relative(projectDirectory,pageFile).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(png).digest('hex'),...sample.statistics,state:await readState()};result.captures.push(entry);return {...entry,samples:sample.sample};
  }
  async function act(code,label,predicate=()=>true,needNewVideo=true){
    const before=(await readState()).state;await evaluate(code,label);const submitted=(await readState()).state;
    const after=(await waitFor(s=>s.state?.ready&&s.state.frames>=submitted.frames+2&&(!needNewVideo||s.state.video.decodedFrames>=submitted.video.decodedFrames+3)&&predicate(s.state),label+' actually presented')).state;
    return {before,after};
  }
  async function stopAndVerify(label){
    await evaluate(`${scope}.sourceLive.stop()`,'Stop original source session through page API');
    const deadline=Date.now()+15000;let value;
    while(Date.now()<deadline){value=await health();if(!value.sessionActive)break;await pause(250);}
    invariant(value?.service==='napali-source-bridge'&&value.sessionActive===false,'Source engine remained active after page stop');
    check(label,{bridge:value,stoppedState:await readState()});
  }
  const initializationTimeout=Math.max(180000,Math.min(1200000,Number(process.env.NAPALI_QA_TIMEOUT_MS)||600000));
  try{
    invariant(backend==='d3d11','Use an ordinary D3D11 client while the source engine remains OpenGL');
    const initialHealth=await health();invariant(initialHealth.backend==='gl'&&initialHealth.service==='napali-source-bridge','Expected original OpenGL source bridge is not available');
    check('ordinary-d3d11-client-and-separate-gl-engine',{client:backend,bridge:initialHealth});
    const ready=await waitFor(s=>s.state?.ready&&s.state.video.decodedFrames>=3&&s.media?.mediaStream&&s.media.width>=1000&&s.media.height>=600,'Full original scene reaches the in-page live video',initializationTimeout);
    invariant(!ready.host?.localRenderer&&ready.api&&ready.documentCanvases===0,'Client should receive a MediaStream without a local source canvas or privileged host marker');
    invariant(ready.media.tracks?.length===1&&ready.media.tracks[0].kind==='video'&&ready.media.tracks[0].readyState==='live','In-page source is not a live video-only track');
    invariant(ready.state.scale===1&&!ready.state.autoQuality,'Original full-quality render was silently reduced');
    check('original-renderer-live-track-decoded-in-ordinary-page',ready);
    const liveStart=await capture('01-source-live-start'),motionInitial=await readState(),motionBefore=motionInitial.state,motionStarted=Date.now();
    const movingEvidence=await waitFor(s=>Date.now()-motionStarted>=8000&&s.state.frames>=motionBefore.frames+6&&s.state.video.decodedFrames>=motionBefore.video.decodedFrames+3&&s.state.time>motionBefore.time,'Actual source time and decoded video advance'),moving=movingEvidence.state;
    const motionObservedMilliseconds=Date.now()-motionStarted,liveMotion=await capture('02-source-live-motion');const motionDifference=difference(liveStart.samples,liveMotion.samples);invariant(motionDifference>.01,'Original live video did not visibly move');
    check('source-time-and-received-video-pixels-advance',{before:motionBefore,after:moving,meanAbsoluteDifference:motionDifference,observedSeconds:motionObservedMilliseconds/1000,sourceCompletedFramesPerSecond:(moving.frames-motionBefore.frames)*1000/motionObservedMilliseconds,presentedVideoCallbacksPerSecond:(moving.video.decodedFrames-motionBefore.video.decodedFrames)*1000/motionObservedMilliseconds,decodedFramesPerSecond:(movingEvidence.media.decodedFrames-motionInitial.media.decodedFrames)*1000/motionObservedMilliseconds});
    await act(`${scope}.document.getElementById('source-pause').click()`,'Pause source through visible-page control',s=>s.paused,false);
    const pausedBefore=(await readState()).state,pausedA=await capture('03-paused-a');await pause(1400);const pausedAfter=(await readState()).state,pausedB=await capture('03-paused-b');
    invariant(pausedAfter.paused&&Math.abs(pausedAfter.time-pausedBefore.time)<.0001,'Pause did not hold original simulation time');
    invariant(difference(pausedA.samples,pausedB.samples)<8,'Paused video changed beyond source grain/codec noise');check('in-page-pause-holds-original-source-time',{before:pausedBefore,after:pausedAfter,meanAbsoluteDifference:difference(pausedA.samples,pausedB.samples)});
    let previous=pausedB;
    for(const [time,label]of [[35,'headland'],[75,'valley'],[128,'aerial']]){
      const evidence=await act(`${scope}.document.getElementById('source-shot').value='${time}';${scope}.document.getElementById('source-shot').dispatchEvent(new ${scope}.Event('change',{bubbles:true}))`,'Seek original source through in-page select '+time,s=>s.paused&&Math.abs(s.time-time)<.001);
      const shot=await capture('04-'+label+'-'+time);const delta=difference(previous.samples,shot.samples);invariant(delta>1,'Source seek changed state without changing decoded video');check('in-page-seek-'+time+'-drives-original-pixels',{...evidence,meanAbsoluteDifference:delta});previous=shot;
    }
    await act(`${scope}.document.getElementById('source-free').click()`,'Enable original free driving through page button',s=>s.drive?.mode==='free',false);
    const driveBefore=(await readState()).state;
    const driveEvidence=await act(`${scope}.napaliDrive.move({forward:25,right:10,up:12}).then(()=>${scope}.napaliDrive.look({yawDelta:.08,pitchDelta:.02}))`,'Move and turn the real source camera',s=>s.drive?.mode==='free');
    const driven=await capture('05-original-free-driving');invariant(JSON.stringify(driveBefore.drive)!==JSON.stringify(driveEvidence.after.drive)&&difference(previous.samples,driven.samples)>.1,'Free driving did not change camera and actual video');check('page-drives-real-original-camera',{...driveEvidence,meanAbsoluteDifference:difference(previous.samples,driven.samples)});
    const fullWidth=driven.width,fullHeight=driven.height;
    for(const [scale,name]of [[.5,'06-quality-50'],[1,'07-quality-100']]){
      const evidence=await act(`${scope}.document.getElementById('source-quality').value='${scale}';if(Number(${scope}.document.getElementById('source-quality').value)!==${scale})throw new Error('Quality select value was not retained');${scope}.document.getElementById('source-quality').dispatchEvent(new ${scope}.Event('change',{bubbles:true}))`,'Change real source quality '+scale,s=>s.scale===scale&&s.renderSize?.width===Math.round(fullWidth*scale)&&s.renderSize?.height===Math.round(fullHeight*scale));
      const shot=await capture(name);invariant(shot.width===fullWidth&&shot.height===fullHeight,'Original presentation canvas and received track should retain their full dimensions');check('source-quality-'+scale+'-changes-real-internal-framebuffer',{...evidence,receivedWidth:shot.width,receivedHeight:shot.height,note:'Original quality controls change the internal render framebuffer, then present into a fixed-size canvas/video track.'});
    }
    const restarted=await act(`${scope}.document.getElementById('source-restart').click()`,'Restart through in-page button',s=>s.drive?.mode==='flight'&&s.time<2);check('page-restart-restores-original-flight',restarted);await capture('08-restarted-flight');
    await stopAndVerify('page-stop-retires-original-renderer');
    progress('checking-front-door-inline-presentation');
    scope="document.querySelector('iframe.world-frame[data-src*=\"source-live\"]')?.contentWindow";
    await window.loadURL('http://127.0.0.1:8796/projects/014-programmable-worlds/web/index.html?qa=1#source');
    await evaluate(`document.querySelector('iframe.world-frame[data-src*="source-live"]').scrollIntoView({block:'center',behavior:'instant'})`,'Bring only own source panel into its own viewport');
    const inlineInitializing=await waitFor(s=>s.api&&s.state&&!s.state.sourceReady&&!['idle','connecting'].includes(s.state.phase),'Homepage source session exists before the original controls are ready',30000);
    await evaluate(`${scope}.sourceLive.setVisible(false)`,'Pause own inline source during original generation');
    await pause(700);
    const heldInitialization=await readState();invariant(!heldInitialization.state?.error,'Visibility during generation incorrectly submitted a pre-ready control');
    await evaluate(`${scope}.sourceLive.setVisible(true)`,'Resume own inline source before original generation completes');
    check('inline-visibility-during-generation-does-not-submit-premature-controls',{before:inlineInitializing,held:heldInitialization});
    const inline=await waitFor(s=>s.state?.ready&&s.state.video.decodedFrames>=3&&s.media?.mediaStream&&s.media.width>=1000,'Homepage displays actual original live video inline',initializationTimeout);
    invariant(!inline.host?.localRenderer,'Ordinary homepage test unexpectedly received privileged renderer marker');check('ordinary-homepage-source-panel-contains-live-original-track',inline);await capture('09-source-inside-research-page');
    await evaluate(`document.querySelectorAll('iframe.world-frame')[1].scrollIntoView({block:'center',behavior:'instant'})`,'Switch own homepage from source to next work');
    const deadline=Date.now()+20000;let retired;
    while(Date.now()<deadline){retired=await evaluate(`(() => {const frames=[...document.querySelectorAll('iframe.world-frame')];return {source:frames[0].getAttribute('src'),sourceHref:frames[0].contentWindow.location.href,sourceAPI:!!frames[0].contentWindow.sourceLive,next:frames[1].getAttribute('src'),nextActive:frames[1].dataset.active};})()`,'Inspect actual source retirement before next preview');if(retired.sourceHref==='about:blank'&&!retired.sourceAPI&&retired.nextActive==='true')break;await pause(300);}
    const retiredHealth=await health();invariant(retired.sourceHref==='about:blank'&&!retired.sourceAPI&&retired.nextActive==='true'&&retired.next!=='about:blank'&&!retiredHealth.sessionActive,'Homepage failed to retire GL source before activating next work');check('homepage-awaits-source-stop-before-next-preview',{retired,bridge:retiredHealth,nextSceneScope:'Navigation has started; this test does not establish the next artwork GPU/quality acceptance.'});
    result.status='passed';
  }catch(error){result.status='failed';result.errors.push(error.stack||String(error));try{await evaluate(`${scope}?.sourceLive?.stop()`,'Retire source after failed acceptance');}catch{/* Preserve the original failure; bridge lease also expires. */}}
  result.finishedAt=new Date().toISOString();result.elapsedSeconds=(Date.now()-started)/1000;
  const serialized=JSON.stringify(result,null,2)+'\n';fs.writeFileSync(latest,serialized);fs.writeFileSync(path.join(output,'acceptance.json'),serialized);if(!priorPassed||result.status==='passed')fs.writeFileSync(canonical,serialized);progress(result.status);return result;
}

module.exports={runSourceLiveAcceptance};
