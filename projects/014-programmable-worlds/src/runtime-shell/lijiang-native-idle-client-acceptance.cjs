'use strict';
// Functional idle-client regression only. The caller supplies its own hidden
// Electron window. This runner launches no service/GPU/window and never uses
// OS input, an existing browser, source-bridge controls or another session.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { nativeImage } = require('electron');
const ROOT = 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-idle-client-qa';
const ENTRY = 'http://127.0.0.1:8796/projects/014-programmable-worlds/web/lijiang-native/index.html';
const BRIDGE = 'http://127.0.0.1:8798', SOURCE = 'http://127.0.0.1:8797';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (value, message) => { if (!value) throw new Error(message); };
async function bounded(promise, milliseconds, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
function assertEntry(url) {
  const actual = new URL(url), expected = new URL(ENTRY);
  assert(actual.origin === expected.origin && actual.pathname === expected.pathname
    && actual.searchParams.get('qa') === '1' && actual.searchParams.get('embed') === '1'
    && !actual.searchParams.has('qualityview'), 'Use the deferred production client entry with qa=1&embed=1');
  return actual.href;
}
function sourceIdentity(health) {
  return { service: health.service, version: health.version, backend: health.backend,
    pid: health.pid, sessionActive: health.sessionActive, offscreen: health.offscreen,
    offscreenFrameRate: health.offscreenFrameRate };
}
function isIdle(sample) {
  const s = sample.client, p = s?.presentation, engine = sample.bridge?.state;
  return !!(s?.ready && s.paused && s.idle && !s.rendering && !s.suspended
    && !s.viewportTransition && p?.ready && p.pixelsVerified && p.sessionMatches
    && p.viewportMatches && s.video?.decodedFrames > 0 && engine?.ready
    && engine.paused && engine.idle && !engine.rendering && !engine.suspended
    && engine.frames === s.frames && p.actualFrame === engine.frames);
}
function difference(a,b) {
  assert(a.length === b.length, 'Compared lossless canvases changed size');
  let total=0,changed=0;
  for (let i=0;i<a.length;i+=4) {
    let delta=0;
    for (let c=0;c<3;c++) {const d=Math.abs(a[i+c]-b[i+c]);total+=d;delta=Math.max(delta,d);}
    if (delta) changed++;
  }
  return {identical:a.equals(b),meanAbsoluteRGBDifference:total/(a.length/4*3),
    changedPixelFraction:changed/(a.length/4)};
}

async function runLijiangNativeIdleClientAcceptance({window,backend,record=()=>{},
  getFatal=()=>null,getPresentation=()=>null}) {
  const began=Date.now(),runId=new Date(began).toISOString().replace(/[:.]/g,'-');
  const output=path.join(ROOT,runId);fs.mkdirSync(output,{recursive:true});
  const report={runId,scene:'lijiang-native-idle-client',backend,output,status:'running',
    artAccepted:false,scope:'FUNCTIONAL ONLY: owned public native client, verified lossless PNG, independent decoded video, idle hold and one-frame invalidation. No artwork or continuous real-time acceptance.',
    tests:[],captures:[],errors:[],gpuUtilizationMeasured:false};
  const timeout=Math.max(180000,Math.min(1800000,Number(process.env.LIJIANG_NATIVE_IDLE_CLIENT_TIMEOUT_MS)||1200000));
  let ownRequested=false,sourceBefore=null,lastProgress=0;
  const pass=(name,evidence)=>report.tests.push({name,passed:true,evidence});
  function policy() {assert(window&&!window.isDestroyed()&&!window.isVisible()&&!window.isFocused(),
    'Idle-client acceptance must retain its own hidden, unfocused window');}
  async function call(code,label='Own hidden idle client',milliseconds=60000,allowFatal=false) {
    policy();if (!allowFatal&&getFatal()) throw new Error(getFatal());
    const value=await bounded(window.webContents.executeJavaScript(code,false),milliseconds,label);
    policy();return value;
  }
  function progress(phase,sample=null) {
    fs.writeFileSync(path.join(output,'status.json'),JSON.stringify({runId,output,status:report.status,
      phase,elapsedSeconds:(Date.now()-began)/1000,tests:report.tests.length,sample,errors:report.errors},null,2));
    record('lijiang-native-idle-client-progress',{phase,output,tests:report.tests.length});
  }
  const get = url => `fetch(${JSON.stringify(url)},{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw new Error('Bridge read failed: '+r.status);return r.json();})`;
  async function health(base,allowFatal=false) {return call(get(base+'/health'),'Read bridge health',15000,allowFatal);}
  async function read() {
    const sample=await call(`(async()=>({client:window.lijiangWorld?.getState()||null,
      bridge:await ${get(BRIDGE+'/status')},url:location.href}))()`,'Read actual client and GPU-completed engine status');
    assertEntry(sample.url);
    if (sample.client?.error||sample.bridge?.error) throw new Error(sample.client?.error||sample.bridge.error);
    return sample;
  }
  async function wait(phase,predicate,milliseconds=240000) {
    const deadline=Date.now()+milliseconds;let sample;
    while (Date.now()<deadline) {
      sample=await read();if (predicate(sample)) return sample;
      if (Date.now()-lastProgress>2500) {progress(phase,sample);lastProgress=Date.now();}
      await sleep(200);
    }
    throw new Error(phase+' timed out: '+JSON.stringify(sample));
  }
  async function capture(name) {
    const value=await call(`(()=>{const c=document.getElementById('lossless-frame'),s=lijiangWorld.getState(),p=s.presentation;
      if(!p?.ready||!p.pixelsVerified||c?.hidden||Number(c.dataset.frame)!==p.actualFrame)throw new Error('No verified lossless canvas');
      return {png:c.toDataURL('image/png'),presentation:p,clientFrames:s.frames};})()`,'Capture actual verified client pixels');
    const image=nativeImage.createFromDataURL(value.png),size=image.getSize(),pixels=image.toBitmap();
    assert(!image.isEmpty()&&size.width>=640&&size.height>=360
      && pixels.length===size.width*size.height*4,'Actual decoded canvas size is invalid');
    assert(sha(pixels)===value.presentation.pixelSha256,'Actual canvas pixels disagree with the producer PNG pixel hash');
    const png=image.toPNG(),file=path.join(output,name+'.png');fs.writeFileSync(file,png);
    const item={name,path:file,...size,canvasPNG_SHA256:sha(png),pixelSHA256:sha(pixels),
      transportPNG_SHA256:value.presentation.pngSha256,presentation:value.presentation,clientFrames:value.clientFrames};
    report.captures.push(item);return {item,pixels};
  }
  async function hold(name,before,pixels,milliseconds=2000) {
    await sleep(milliseconds);const after=await read(),held=await capture(name);
    const comparison=difference(pixels,held.pixels);
    assert(isIdle(after)&&after.bridge.state.frames===before.bridge.state.frames
      && after.client.presentation.actualFrame===before.client.presentation.actualFrame
      && after.client.presentation.receivedFrames===before.client.presentation.receivedFrames
      && comparison.identical,'Unchanged idle client pumped a scene/PNG frame or changed its held pixels');
    return {after,comparison,heldMilliseconds:milliseconds};
  }
  async function fresh(name,mutation,expectedTime) {
    const before=await read();assert(isIdle(before),name+' must begin from actual engine/client idle');
    const began=Date.now();await call(mutation,'Own public client invalidation');
    const after=await wait(name,s=>isIdle(s)&&s.bridge.state.frames>before.bridge.state.frames
      && (expectedTime===undefined||Math.abs(s.client.presentation.actualTime-expectedTime)<1e-6));
    assert(after.bridge.state.frames===before.bridge.state.frames+1
      && after.client.presentation.receivedFrames===before.client.presentation.receivedFrames+1,
    name+' must complete and present exactly one new scene/PNG frame');
    const pixels=await capture(name),held=await hold(name+'-held',after,pixels.pixels,700);
    return {before,after,held,millisecondsToFreshIdle:Date.now()-began,capture:pixels};
  }
  try {
    report.entry=assertEntry(await call('location.href'));
    const initial=await health(BRIDGE);sourceBefore=sourceIdentity(await health(SOURCE));
    report.initialNativeHealth=initial;report.initialSourceHealth=sourceBefore;
    assert(initial.service==='lijiang-native-bridge'&&initial.version>=6
      &&initial.capabilities?.includes('native-paused-dirty-render'),'Transport-aware native idle bridge is unavailable');
    assert(!initial.sessionActive,'Native bridge already has an external session; no start/stop/control was sent');
    assert(sourceBefore.service==='napali-source-bridge','Original source health identity is missing');
    pass('preprobe-native-idle-and-preserve-original-source-service',{native:initial,source:sourceBefore});

    ownRequested=true;await call('window.lijiangWorld.setVisible(true)','Start only own deferred public client');
    const ready=await wait('Ready, decoded video and actual lossless frame settle to idle',isIdle,timeout);
    const s=ready.client,p=s.presentation;
    assert(s.sceneId==='lijiang-native'&&s.scale===1&&!s.autoQuality&&s.duration===45
      &&s.connected&&s.video.decodedFrames>0,'Original-quality native client/video evidence is missing');
    assert(p.kind==='lossless-live-renderer-frames'&&/^[a-f0-9]{64}$/.test(p.pngSha256||'')
      &&s.engineProvenance?.renderer==='source-derived-full-glsl','Actual producer PNG/provenance evidence is missing');
    const baseline=await capture('initial-ready-idle');
    pass('public-client-has-decoded-video-and-verified-producer-PNG-then-engine-idles',ready);
    const held=await hold('initial-held-two-seconds',ready,baseline.pixels);
    pass('two-second-held-pixels-and-completed-frame-counter-are-identical',held);

    const sought=await fresh('seek-12-one-new-PNG','window.lijiangWorld.seek(12)',12);
    assert(Math.abs(sought.after.client.time-12)<1e-6,'Actual engine time did not reach the requested 12-second pose');
    pass('public-seek-12-presents-exactly-one-new-PNG-then-idles',
      {before:sought.before,after:sought.after,held:sought.held,milliseconds:sought.millisecondsToFreshIdle});

    const expo=sought.after.client.settings?.expo;assert(Number.isFinite(expo),'Public exposure setting is unavailable');
    const changed=expo<1.7?expo+.1:expo-.1;
    const exposed=await fresh('exposure-one-new-PNG',`window.lijiangWorld.setSettings({expo:${JSON.stringify(changed)}})`,12);
    const exposureDifference=difference(sought.capture.pixels,exposed.capture.pixels);
    assert(exposed.after.client.settings.expo===changed&&exposureDifference.meanAbsoluteRGBDifference>.1
      &&exposureDifference.changedPixelFraction>.02,'Public exposure did not change actual lossless pixels');
    pass('public-exposure-change-presents-one-visibly-changed-PNG-then-idles',
      {expo,changed,after:exposed.after,held:exposed.held,comparison:exposureDifference});
    const restored=await fresh('exposure-restored-one-new-PNG',`window.lijiangWorld.setSettings({expo:${JSON.stringify(expo)}})`,12);
    const restoration=difference(sought.capture.pixels,restored.capture.pixels);
    assert(restored.after.client.settings.expo===expo&&restoration.meanAbsoluteRGBDifference<5,
      'Exposure restore failed or changed pixels beyond the existing frame-seeded film-grain allowance');
    pass('public-exposure-restore-presents-exactly-one-new-PNG-then-idles',
      {after:restored.after,held:restored.held,comparison:restoration,
        caveat:'Byte identity applies to held pixels; restored fixed-time renders may retain source frame-seeded grain.'});
  } catch (error) {
    report.status='failed';report.errors.push(String(error.stack||error));
  } finally {
    if (ownRequested) try {
      await call('window.lijiangWorld.dispose()','Dispose only own public client/session',240000,true);
      const deadline=Date.now()+30000;let native;
      do {native=await health(BRIDGE,true);if(!native.sessionActive)break;await sleep(250);} while(Date.now()<deadline);
      const disposed=await call(`(()=>{const c=document.getElementById('lossless-frame'),v=document.getElementById('live-video');
        return {state:lijiangWorld.getState(),mediaPresent:!!v?.srcObject,
          canvas:{hidden:c.hidden,width:c.width,height:c.height,frame:c.dataset.frame}};})()`,'Verify own client retirement',30000,true);
      const sourceAfter=sourceIdentity(await health(SOURCE,true));
      assert(!native.sessionActive&&disposed.state.disposed&&!disposed.state.ready&&!disposed.mediaPresent
        &&disposed.canvas.hidden&&disposed.canvas.width===1&&disposed.canvas.height===1&&!disposed.canvas.frame,
      'Awaited public dispose retained own renderer, media or old-session canvas');
      assert(JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter),'Original source health changed during own-client QA');
      report.retirement={native,disposed,sourceBefore,sourceAfter};
      pass('public-dispose-retires-own-session-and-leaves-original-source-health-unchanged',report.retirement);
    } catch(error) {report.status='failed';report.errors.push('Retirement: '+String(error.stack||error));}
  }
  if (report.status==='running') {
    if (report.tests.length===7) report.status='passed';
    else {report.status='failed';report.errors.push('Idle-client acceptance expected seven functional checks');}
  }
  report.elapsedSeconds=(Date.now()-began)/1000;report.presentation=getPresentation();
  report.reportPath=path.join(output,'result.json');
  fs.writeFileSync(report.reportPath,JSON.stringify(report,null,2));progress('finished');
  record('lijiang-native-idle-client-result',{status:report.status,output,tests:report.tests.length,errors:report.errors});
  return report;
}
module.exports={runLijiangNativeIdleClientAcceptance,contracts:{ROOT,ENTRY,BRIDGE,SOURCE,assertEntry,isIdle,sourceIdentity,difference}};
