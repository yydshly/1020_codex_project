'use strict';
// Standalone, task-owned hidden Electron QA. It never uses OS input, attaches
// to another browser, starts a server, or borrows an existing rendering window.
// Run via `node launch-lijiang-quality-m2-qa.cjs`. The pinned Electron is
// packaged: a loose .cjs argument is not an application entry. The launcher
// verifies resources/app/entry.cjs and uses its explicit --lijiang-quality-m2-qa
// dispatch; it refuses to fall through to the regular research hub.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, nativeImage } = require('electron');

const PROJECT = path.resolve(__dirname, '../..');
const ROOT = 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-m2';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(ROOT, runId);
const backend = process.env.LIJIANG_M2_BACKEND || 'd3d11';
const useCache = process.env.LIJIANG_M2_CACHE === '1';
const short = process.env.LIJIANG_M2_SHORT === '1';
const parentMode = process.env.LIJIANG_M2_PARENT === '1';
const fullExport = process.env.LIJIANG_M2_EXPORT === '1';
const fps = Math.max(10, Math.min(30, Number(process.env.LIJIANG_M2_FPS) || 20));
const width = Math.max(640, Math.min(1920, Number(process.env.LIJIANG_M2_WIDTH) || 1440));
const height = Math.max(400, Math.min(1080, Number(process.env.LIJIANG_M2_HEIGHT) || 900));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
const files = ['raster.html', 'raster-main.js', 'raster-terrain.js', 'raster-forest.js',
  'raster-riparian.js', 'raster-sdf-mesh.js', 'raster-water-sky.js', 'raster-air.js',
  'raster-color-grade.js', 'raster-ground-detail.js', 'raster-rock-material.js',
  'raster-rock-cull.js', 'raster-cliff-gardens.js', 'raster-experience-ui.js',
  'offline-export.js', 'native-material-shader.js', 'native-field-material.js',
  'native-pilot-builder.js', 'native-pilot-batch.js', 'native-radiance-field.js', 'engine.html'];
for(const name of fs.readdirSync(path.join(PROJECT,'web/lijiang-native'))){
  if(name.endsWith('.js')&&!files.includes(name))files.push(name);
}
const protectedFiles = ['upstream/index.html', 'runtime/index.html', 'runtime/source-live.html',
  'runtime/source-live.js', 'runtime/source-live.css', 'runtime/controller.js',
  'canal-real/index.html', 'canal-real/main.js', 'shipyard-station/index.html', 'shipyard-station/main.js'];
const report = { runId, output, status: 'running', artAccepted: false, backend,
  scope: 'Actual generated scene/canvas evidence and functional measurements. Visual quality requires independent image and motion review.',
  cache: useCache, short, parentMode, targetFrameRate: fps, tests: [], captures: [], errors: [], console: [], flightSamples: [],
  downloadAttempts:0,fullExport:{enabled:fullExport,ffprobePending:fullExport}};
let window, fatal = null, paints = 0, began = Date.now();
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'profile-' + backend), { recursive: true });
app.setName('Li River M2 Hidden Visual QA');
app.setPath('userData', path.join(ROOT, 'profile-' + backend));
app.setPath('sessionData', path.join(ROOT, 'profile-' + backend));
assert(['d3d11', 'gl', 'vulkan'].includes(backend), 'Unsupported explicit QA backend');
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', backend);
for (const flag of ['disable-http-cache', 'disable-renderer-backgrounding',
  'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows']) app.commandLine.appendSwitch(flag);
try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}

function progress(phase, state) {
  report.phase = phase;
  report.elapsedSeconds = (Date.now() - began) / 1000;
  fs.writeFileSync(path.join(output, 'status.json'), JSON.stringify({ ...report, state }, null, 2));
  process.stdout.write(JSON.stringify({ phase, seconds: report.elapsedSeconds, output }) + '\n');
}
function policy() {
  assert(window && !window.isDestroyed() && !window.isVisible() && !window.isFocused(),
    'Own QA window became visible, focused, or destroyed');
}
async function evaluate(target,code, timeout = 60000) {
  policy(); assert(!fatal, fatal);
  let timer;
  try {
    const value = await Promise.race([target.executeJavaScript(code, false),
      new Promise((_, reject) => timer = setTimeout(() => reject(new Error('Own page evaluation timed out')), timeout))]);
    policy(); assert(!fatal, fatal); return value;
  } finally { clearTimeout(timer); }
}
async function parentCall(code,timeout=60000){return evaluate(window.webContents,code,timeout);}
function sceneTarget(){
  if(!parentMode)return window.webContents;
  // Only frames owned by this newly-created hidden window are traversed.
  return window.webContents.mainFrame.framesInSubtree.find(frame=>{
    if(frame.isDestroyed())return false;
    try{const u=new URL(frame.url);return u.origin==='http://127.0.0.1:8796'
      &&u.pathname==='/projects/014-programmable-worlds/web/lijiang-native/raster.html';}catch{return false;}
  });
}
async function call(code,timeout=60000){
  const target=sceneTarget();assert(target,'Own production Li iframe realm is not loaded');
  return evaluate(target,code,timeout);
}
async function readParent(){
  if(!parentMode)return null;
  return parentCall(`(()=>{const f=document.querySelector('#lijiang iframe.world-frame'),w=f?.contentWindow,api=w?.lijiangRaster;
    const ref=window.__m2ParentQA||(window.__m2ParentQA={});
    if(api&&!ref.context){ref.context=api.renderer.getContext();ref.document=f.contentDocument;ref.timeOrigin=w.performance.timeOrigin;ref.api=api;}
    return {url:location.href,hub:window.worldHub?.getState(),
      previews:[...document.querySelectorAll('iframe.world-frame')].map(frame=>({lijiang:frame===f,
        source:frame.dataset.src,src:frame.getAttribute('src'),href:frame.contentWindow.location.href})),
      child:f?{href:w.location.href,sameDocument:!!ref.document&&f.contentDocument===ref.document,
        timeOrigin:w.performance.timeOrigin,box:f.getBoundingClientRect().toJSON()}:null,
      contextCaptured:!!ref.context,contextLost:ref.context?.isContextLost()??null,
      retiredWorld:ref.api?.getState()||null};})()`);
}
function checkParent(parent){
  assert(parent.previews.length===4&&parent.previews.filter(f=>f.lijiang).length===1,
    'Production parent must retain original, A, B and Li iframe entries');
  assert(parent.previews.filter(f=>!f.lijiang).every(f=>(!f.src||f.src==='about:blank')&&f.href==='about:blank'),
    'An unrelated original/A/B heavy iframe was loaded in the own QA parent');
  const li=parent.previews.find(f=>f.lijiang),source=new URL(li.source,parent.url);
  assert(source.origin==='http://127.0.0.1:8796'
    &&source.pathname==='/projects/014-programmable-worlds/web/lijiang-native/raster.html'
    &&source.searchParams.get('surface')==='1'&&source.searchParams.get('material')==='1'
    &&!source.searchParams.has('qaFields'),'Production parent does not embed the full live material renderer');
  assert(parent.previews.filter(f=>f.src&&f.src!=='about:blank').length<=1,
    'More than the own Li heavy iframe was loaded');
}
async function read() {
  const parent=await readParent();if(parent)checkParent(parent);
  if(parentMode&&!sceneTarget())return {url:null,world:null,parent,load:'Waiting for the actual production iframe'};
  const value = await call(`({url:location.href,world:window.lijiangRaster?.getState(),
    load:document.querySelector('#load-detail')?.textContent,
    generatorPresent:!!document.getElementById('generator'),
    cache:!!window.lijiangRasterFields?.provenance?.qaGeneratedFieldCache,
    sceneFogDensity:window.lijiangRaster?.scene?.fog?.density,
    controls:{sun:Number(document.getElementById('sun')?.value),fog:Number(document.getElementById('fog')?.value)},
    now:performance.now()})`);
  if (value.world?.error) throw new Error(value.world.error);
  if(parent)value.parent=parent;
  return value;
}
async function wait(phase, predicate, timeout = 180000) {
  const deadline = Date.now() + timeout; let sample, logged = 0;
  while (Date.now() < deadline) {
    sample = await read(); if (predicate(sample)) return sample;
    if (Date.now() - logged > 5000) { progress(phase, sample); logged = Date.now(); }
    await sleep(150);
  }
  throw new Error(phase + ' timed out: ' + JSON.stringify(sample));
}
const isIdle = s => s.world?.ready && s.world.paused && s.world.idle
  && !s.world.rendering && !s.world.suspended && !(s.world.forest?.pending > 0);
function pass(name, evidence) { report.tests.push({ name, passed: true, evidence }); }
function hashProtected() {
  return Object.fromEntries(protectedFiles.map(file => [file, sha(fs.readFileSync(path.join(PROJECT, 'web', file)))]));
}
async function bridgeHealth() {
  const values = await Promise.all([8797, 8798].map(async port => {
    const response = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(6000) });
    assert(response.ok, 'Existing bridge health unavailable: ' + port);
    const data = await response.json();
    assert(Number.isInteger(data.pid)&&data.pid>0&&typeof data.service==='string'&&data.service.length>0,
      'Existing bridge process identity unavailable: '+port);
    return [port, { pid: data.pid, service: data.service, sessionActive: data.sessionActive }];
  }));
  return Object.fromEntries(values);
}
async function capture(name, pose) {
  const data = await call(`document.querySelector('#scene').toDataURL('image/png')`);
  const image = nativeImage.createFromDataURL(data), size = image.getSize(), pixels = image.toBitmap();
  const bytes = image.toPNG(), file = path.join(output, name + '.png'); fs.writeFileSync(file, bytes);
  const pixelCount=size.width*size.height;
  let lit=0,minAlpha=255,partialAlphaPixels=0,transparentPixels=0;
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i]+pixels[i+1]+pixels[i+2]>18)lit++;
    const alpha=pixels[i+3];minAlpha=Math.min(minAlpha,alpha);
    if(alpha===0)transparentPixels++;else if(alpha<255)partialAlphaPixels++;
  }
  const nonOpaquePixels=partialAlphaPixels+transparentPixels;
  const alpha={minAlpha:pixelCount?minAlpha:null,partialAlphaPixels,transparentPixels,nonOpaquePixels,
    pixelCount,nonOpaqueRatio:pixelCount?nonOpaquePixels/pixelCount:1,
    maximumNonOpaqueRatio:.0001,expected:'Fully opaque sky, water, terrain and alpha-tested foliage'};
  const state = await read();
  report.captures.push({ name, path: file, sha256: sha(bytes), pixelSHA256: sha(pixels), ...size, alpha, pose, state });
  progress('capture-' + name, state);
  // Keep failure evidence even when the same alpha/readback check caused the
  // original exception. A diagnostic capture must not throw that check again.
  if(name!=='failure'){
    assert(!image.isEmpty()&&pixels.length===pixelCount*4,'Actual canvas readback is empty');
    assert(lit>pixelCount*.15,'Actual canvas is substantially black');
    assert(alpha.nonOpaqueRatio<=alpha.maximumNonOpaqueRatio,
      'Actual scene canvas contains unintended transparency: '+JSON.stringify(alpha));
  }
  return data;
}
async function flightShot(time) {
  await call(`lijiangRaster.prepareView(${time});lijiangRaster.setClean(true);lijiangRaster.suspend(false);true`);
  await wait('LOD settles at flight ' + time, isIdle);
  return capture('flight-' + String(time).padStart(2, '0'), { kind: 'production-flight', time });
}
// Stable poses are derived from actual generated plant records and rock bounds.
// No authored-camera alternative scene is substituted for production terrain.
async function freePoses() {
  return call(`(()=>{
    const f=lijiangRasterFields,rect=f.rect,h=f.height,w=h.width||f.resolution,n=h.height||w,a=h.data;
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    const sample=(x,z)=>{const u=clamp((x-rect[0])/rect[2]*w-.5,0,w-1),v=clamp((z-rect[1])/(rect[3]>1?rect[3]:rect[2])*n-.5,0,n-1),ix=Math.floor(u),iz=Math.floor(v),tx=u-ix,tz=v-iz,c=h.channels||1;
      const at=(x,z)=>a[(z*w+x)*c];return (at(ix,iz)*(1-tx)+at(Math.min(ix+1,w-1),iz)*tx)*(1-tz)+(at(ix,Math.min(iz+1,n-1))*(1-tx)+at(Math.min(ix+1,w-1),Math.min(iz+1,n-1))*tx)*tz;};
    const centre=z=>46*Math.sin((z+140)*.00168)+28*Math.sin((z-70)*.0031)-430*(1-smooth(-1350,-350,z));
    const half=z=>170*(1+.11*Math.sin(z*.0013-.4)+.055*Math.cos(z*.0037));
    const trees=f.trees.filter(p=>p.y<35&&p.radius>1&&p.z>-100&&p.z<850&&p.x>centre(p.z)+half(p.z)+15&&p.x<centre(p.z)+half(p.z)+180)
      .sort((a,b)=>Math.hypot(a.x-260,a.z-410)-Math.hypot(b.x-260,b.z-410));
    if(!trees.length)throw new Error('No actual lowland tree available for near-field QA');
    const tree=trees[0],x=tree.x-13,z=tree.z+20,y=Math.max(6,sample(x,z)+6);
    const rocks=(f.rocks||[]).filter(r=>r.metadata.centre[0]>300&&r.metadata.centre[0]<1000&&r.metadata.centre[1]>-500&&r.metadata.centre[1]<550)
      .sort((a,b)=>Math.hypot(a.metadata.centre[0]-600,a.metadata.centre[1]-100)-Math.hypot(b.metadata.centre[0]-600,b.metadata.centre[1]-100));
    if(!rocks.length)throw new Error('No actual front rock available for close QA');
    const rock=rocks[0].metadata,c=rock.centre,e=rock.clipEllipse,rx=c[0]-e[0]-42,rz=c[1]+e[1]*.42,ry=Math.max(12,sample(rx,rz)+8);
    const bz=485,bx=centre(bz)+half(bz)-22,by=Math.max(8,sample(bx,bz)+6);
    return [{name:'near-rock',position:[rx,ry,rz],target:[c[0],Math.max(ry+28,72),c[1]],source:{centre:c,ellipse:e}},
      {name:'forest-floor',position:[x,y,z],target:[tree.x+23,Math.max(y+1,tree.y+9),tree.z-16],source:{tree:{x:tree.x,y:tree.y,z:tree.z,radius:tree.radius,seed:tree.seed}}},
      {name:'wet-bank',position:[bx,by,bz],target:[bx+73,5,bz-135],source:{riverCentre:centre(bz),riverHalfWidth:half(bz)}}];
  })()`);
}
async function freeShot(pose) {
  await call(`(()=>{const a=lijiangRaster;a.prepareView(38);if(a.getState().mode!=='free')a.toggleMode();
    a.pause(true);a.suspend(false);a.setClean(true);a.camera.position.set(...${JSON.stringify(pose.position)});
    a.camera.fov=58;a.camera.updateProjectionMatrix();a.camera.lookAt(...${JSON.stringify(pose.target)});a.camera.updateMatrixWorld(true);return true;})()`);
  const ready = await wait('Near-field LOD settles: ' + pose.name, isIdle);
  assert(ready.world.mode === 'free', 'Near-field shot reverted to the production flight camera');
  return capture(pose.name, pose);
}
async function contactSheet(images,{filename='contact-sheet.png',columns=2,tileHeight=400}={}) {
  const bytes = await call(`(async()=>{const items=${JSON.stringify(images)},columns=${columns},height=${tileHeight},rowHeight=height+32,
    c=document.createElement('canvas'),ctx=c.getContext('2d');
    c.width=columns*640;c.height=Math.ceil(items.length/columns)*rowHeight;ctx.fillStyle='#eff0eb';ctx.fillRect(0,0,c.width,c.height);
    for(let i=0;i<items.length;i++){const img=new Image();img.src=items[i].data;await img.decode();const x=(i%columns)*640,y=Math.floor(i/columns)*rowHeight;
      ctx.fillStyle='#172923';ctx.font='18px sans-serif';ctx.fillText(items[i].name,x+12,y+25);
      const scale=Math.min(640/img.width,height/img.height),dw=img.width*scale,dh=img.height*scale;
      ctx.drawImage(img,x+(640-dw)/2,y+32+(height-dh)/2,dw,dh);}
    return c.toDataURL('image/png');})()`);
  const file = path.join(output, filename); fs.writeFileSync(file, nativeImage.createFromDataURL(bytes).toPNG());
  if(filename==='contact-sheet.png')report.contactSheet = file;
  return file;
}
function pixelDifference(first,second){
  const a=nativeImage.createFromDataURL(first).toBitmap(),b=nativeImage.createFromDataURL(second).toBitmap();
  assert(a.length===b.length&&a.length>0,'Relighting canvas dimensions differ');
  let total=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)total+=Math.abs(a[i+c]-b[i+c]);
  return {identical:a.equals(b),meanAbsoluteRGBDifference:total/(a.length/4*3)};
}
async function sunRoundtrip(){
  await call('lijiangRaster.prepareView(25);lijiangRaster.suspend(false);lijiangRaster.setClean(true);true');
  const baseline=await wait('Default 14-degree sun view settles',isIdle);
  const originalSettings=baseline.world.environment.settings;
  assert(typeof originalSettings.sunElevation==='number'&&originalSettings.sunElevation===14,
    'Sun roundtrip must start at the actual default 14 degrees');
  assert(baseline.world.materialOnly&&!baseline.generatorPresent,
    'Material-only sun roundtrip requires the producer to have been released');
  const baselinePixels=await capture('sun-14-baseline',{kind:'production-flight',time:25,sunElevation:14});
  report.sunRoundtrip={baseline,scope:'setEnvironment drives only this owned hidden scene; no user page or bridge-session endpoint is touched.'};
  function preserved(before,after){
    assert(JSON.stringify(before.world.camera)===JSON.stringify(after.world.camera)
      &&before.world.time===after.world.time&&before.world.mode===after.world.mode&&after.world.paused,
      'Relighting changed the saved camera/time/mode');
    assert(before.sceneFogDensity===after.sceneFogDensity&&before.controls.fog===after.controls.fog
      &&before.world.air.density===after.world.air.density,
      'Sun relighting changed the original fog settings');
    assert(before.world.environment.settings.sunAzimuth===after.world.environment.settings.sunAzimuth,
      'Sun elevation relighting changed the original azimuth');
    assert(!after.generatorPresent,'Live sun relighting recreated a field producer');
  }
  async function apply(settings,before,label){
    const revision=Number(before.world.lightingRevision)||0;
    const event=await call(`(async()=>{const began=performance.now();await lijiangRaster.setEnvironment(${JSON.stringify(settings)});return{began,completed:performance.now()};})()`);
    const after=await wait(label,s=>isIdle(s)&&s.world.frames>before.world.frames
      &&(Number(s.world.lightingRevision)||0)>revision
      &&Math.abs(s.world.environment.settings.sunElevation-settings.sunElevation)<1e-6);
    preserved(baseline,after);
    assert(after.controls.sun===settings.sunElevation,'Actual sun control did not track setEnvironment');
    return {state:after,event,eventToObservedIdleMilliseconds:after.now-event.began,observationPollingMilliseconds:150};
  }
  let elevated;
  try{
    elevated=await apply({sunElevation:35},baseline,'Actual sun 14 to 35 completes');
    report.sunRoundtrip.elevated=elevated;
    const elevatedPixels=await capture('sun-35',{kind:'production-flight',time:25,sunElevation:35});
    report.sunRoundtrip.changed=pixelDifference(baselinePixels,elevatedPixels);
    assert(report.sunRoundtrip.changed.meanAbsoluteRGBDifference>.1,'setEnvironment sun 14 to 35 did not change real pixels');
  }finally{
    // Restore all environment settings captured from this own scene, including
    // the original azimuth. Fog was not changed and is checked independently.
    const current=await read();
    report.sunRoundtrip.restored=await apply(originalSettings,current,'Actual original 14-degree sun restores');
  }
  const restored=report.sunRoundtrip.restored.state;
  assert(JSON.stringify(originalSettings)===JSON.stringify(restored.world.environment.settings),
    'Environment settings did not restore exactly');
  const restoredPixels=await capture('sun-14-restored',{kind:'production-flight',time:25,sunElevation:14});
  report.sunRoundtrip.restoredDifference=pixelDifference(baselinePixels,restoredPixels);
  assert(report.sunRoundtrip.restoredDifference.meanAbsoluteRGBDifference<2,
    'Restored 14-degree completed pixels differ materially from the saved baseline');
  pass('setEnvironment-live-sun-14-35-14-changes-and-restores-real-pixels',report.sunRoundtrip);
}
async function continuousFlight() {
  await call(`lijiangRaster.prepareView(0);lijiangRaster.suspend(false);lijiangRaster.pause(false);true`);
  const initial = await read(), wall = Date.now(); let sample = initial, logged = 0;
  while (Date.now() - wall < 90000) {
    sample = await read(); report.flightSamples.push({ seconds: (Date.now() - wall) / 1000,
      time: sample.world.time, frames: sample.world.frames, frameMs: sample.world.frameMs,
      camera: sample.world.camera, forest: sample.world.forest, paints });
    if (sample.world.time >= 45 && sample.world.paused) break;
    if (Date.now() - logged > 5000) { progress('actual-45-second-flight', sample); logged = Date.now(); }
    await sleep(500);
  }
  await wait('Flight ends paused and settled', isIdle);
  assert(sample.world.time === 45 && sample.world.frames > initial.world.frames + 90,
    'Actual wall-clock flight did not finish with continuously completed frames');
  const elapsed = (Date.now() - wall) / 1000;
  report.actualFlight = { seconds: elapsed, completedFrames: sample.world.frames - initial.world.frames,
    completedFramesPerSecond: (sample.world.frames - initial.world.frames) / elapsed,
    note: 'Observed hidden-window cadence at the stated presentation target, not universal device FPS.' };
  for (let i = 1; i < report.flightSamples.length; i++) assert(report.flightSamples[i].time >= report.flightSamples[i-1].time,
    'Production flight time moved backwards');
  pass('actual-continuous-45-second-flight', report.actualFlight);
}
async function mediaProcess(binary,args,label,timeout=180000){
  return new Promise((resolve,reject)=>{
    let stdout='',stderr='',settled=false;
    const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(heartbeat);
      if(error)reject(error);else resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(new Error(label+' timed out'));},timeout);
    const heartbeat=setInterval(()=>progress(label,{mediaPid:child.pid,export:report.fullExport}),10000);
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>8*1024*1024){child.kill();finish(new Error(label+' produced excessive output'));}});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-32768);});
    child.once('error',error=>finish(error));
    child.once('exit',(code,signal)=>finish(code===0?null:new Error(label+' failed: '+(signal||code)+' '+stderr),{stdout,stderr}));
  });
}
async function verifyAndSampleFilm(file){
  const probeArgs=['-v','error','-threads','2','-select_streams','v:0','-count_frames',
    '-show_entries','stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration:format=duration,size',
    '-of','json',file];
  progress('ffprobe-independent-full-WebM-decode');
  try{
    const result=await mediaProcess(process.env.LIJIANG_M2_FFPROBE||'ffprobe',probeArgs,'ffprobe-full-2700-frame-decode');
    const probe=JSON.parse(result.stdout),stream=probe.streams?.[0],ratio=value=>{
      const [a,b]=String(value).split('/').map(Number);return b?a/b:a;};
    assert(stream?.width===1920&&stream.height===1080&&Number(stream.nb_read_frames)===2700,
      'Actual WebM decode did not contain 2700 frames at 1920x1080');
    assert(Math.abs(ratio(stream.avg_frame_rate||stream.r_frame_rate)-60)<1e-6
      &&Math.abs(Number(probe.format?.duration||stream.duration)-45)<.02,
      'Actual WebM frame rate or duration differs from 60fps/45s');
    const verified={...probe,path:file,sha256:report.fullExport.sha256,
      scope:'Independent ffprobe actual video decode and counted frames; not only encoder metadata.'};
    const artifact=path.join(output,'ffprobe-verified.json');fs.writeFileSync(artifact,JSON.stringify(verified,null,2));
    report.fullExport.ffprobePending=false;report.fullExport.ffprobe={path:artifact,data:verified};
    pass('independent-ffprobe-decodes-1920x1080-60fps-45s-2700-frames',verified);
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    report.fullExport.ffprobePending=true;report.fullExport.ffprobeUnavailable=String(error.message);
    report.tests.push({name:'independent-ffprobe-full-file-verification',passed:null,pending:true,
      reason:'ffprobe is unavailable; actual file is saved for root to decode independently.'});
  }
  const indices=Array.from({length:9},(_,i)=>Math.round(i*2699/8));
  const frameOutput=path.join(output,'film-frame-%02d.png');
  const filter='select='+indices.map(n=>'eq(n\\,'+n+')').join('+');
  try{
    progress('extract-nine-actual-decoded-film-frames');
    await mediaProcess(process.env.LIJIANG_M2_FFMPEG||'ffmpeg',[
      '-nostdin','-v','error','-threads','2','-i',file,'-vf',filter,'-vsync','0',
      '-frames:v','9','-threads','1',frameOutput],'ffmpeg-nine-actual-film-frames');
    const images=[];
    report.fullExport.samples=indices.map((frame,i)=>{
      const sample=path.join(output,'film-frame-'+String(i+1).padStart(2,'0')+'.png');
      assert(fs.existsSync(sample),'Decoded film sample is missing: '+sample);
      const bytes=fs.readFileSync(sample),image=nativeImage.createFromBuffer(bytes);
      assert(!image.isEmpty()&&image.getSize().width===1920&&image.getSize().height===1080,
        'Decoded film sample has incorrect actual dimensions');
      images.push({name:'Frame '+frame+' | '+(frame/60).toFixed(3)+'s',data:'data:image/png;base64,'+bytes.toString('base64')});
      return {frame,time:frame/60,path:sample,sha256:sha(bytes)};
    });
    report.fullExport.contactSheet=await contactSheet(images,{filename:'film-contact-sheet.png',columns:3,tileHeight:360});
    pass('nine-actual-WebM-decoded-frame-samples-saved',{samples:report.fullExport.samples,
      contactSheet:report.fullExport.contactSheet,scope:'Static motion samples for review; the actual video remains the continuous-motion evidence.'});
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    report.fullExport.samplesPending=true;report.fullExport.ffmpegUnavailable=String(error.message);
  }
}
async function recordFullFilm(){
  assert(!parentMode,'Full film export is restricted to the independent own hidden scene');
  const before=await wait('Before actual full-film export',isIdle),baseline=await capture('before-full-export');
  const timeout=Math.max(180000,Number(process.env.LIJIANG_M2_EXPORT_TIMEOUT_MS)||1200000);
  let done=false,result,error;
  report.fullExport.phase='encoding';progress('actual-full-1080p60-2700-frame-export',before);
  const completion=call(`(async()=>{const r=await lijiangRaster.export.start();return{
    cancelled:!!r?.cancelled,metadata:r?.metadata||null,blobBytes:r?.blob?.size||0};})()`,timeout)
    .then(value=>{result=value;done=true;},failure=>{error=failure;done=true;});
  const deadline=Date.now()+timeout;let logged=0;
  while(!done&&Date.now()<deadline){
    const current=await read();
    if(current.world.export?.phase==='error')throw new Error(current.world.export.error||'Actual full-film export failed');
    if(Date.now()-logged>5000){progress('actual-full-1080p60-2700-frame-export',current);logged=Date.now();}
    await sleep(500);
  }
  await completion;if(error)throw error;
  assert(result&&!result.cancelled&&result.blobBytes>0&&result.metadata?.frameCount===2700
    &&result.metadata.encodedFrameCount===2700&&result.metadata.submittedFrameCount===2700
    &&result.metadata.width===1920&&result.metadata.height===1080&&result.metadata.fps===60
    &&result.metadata.fixedFrameRate&&result.metadata.timestampGridVerified&&Math.abs(result.metadata.duration-45)<.02,
    'Actual full-film encoder/muxer metadata is incomplete');
  const restored=await wait('Completed full-film restores original live view',isIdle);
  assert(!restored.world.capturing&&!restored.world.export.active
    &&before.world.mode===restored.world.mode&&before.world.time===restored.world.time
    &&before.world.paused===restored.world.paused&&!!before.world.suspended===!!restored.world.suspended
    &&before.world.width===restored.world.width&&before.world.height===restored.world.height
    &&before.world.uiHidden===restored.world.uiHidden
    &&JSON.stringify(before.world.camera)===JSON.stringify(restored.world.camera),
    'Full-film job failed to restore the original camera/time/size/UI');
  const restorationPixels=pixelDifference(baseline,await capture('after-full-export'));
  assert(restorationPixels.meanAbsoluteRGBDifference<2,'Full-film job did not restore the original completed pixels');
  const info=await call(`(()=>{const r=lijiangRaster.export.getResult();if(!r?.blob)throw new Error('Actual completed film Blob unavailable');
    return{size:r.blob.size,type:r.blob.type,metadata:r.metadata};})()`);
  assert(info.size===result.blobBytes&&info.type==='video/webm','Completed immutable WebM Blob identity/size mismatch');
  const file=path.join(output,'lijiang-m2-1920x1080-60fps-2700frames.webm'),fd=fs.openSync(file,'wx'),hash=crypto.createHash('sha256');
  let written=0;
  try{
    for(let offset=0;offset<info.size;offset+=524288){
      const end=Math.min(info.size,offset+524288);
      const base64=await call(`(async()=>{const r=lijiangRaster.export.getResult();
        const a=new Uint8Array(await r.blob.slice(${offset},${end}).arrayBuffer());let s='';
        for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);})()`);
      const bytes=Buffer.from(base64,'base64');assert(bytes.length===end-offset,'Actual film Blob chunk is truncated');
      fs.writeSync(fd,bytes);hash.update(bytes);written+=bytes.length;
    }
  }finally{fs.closeSync(fd);}
  assert(written===info.size&&fs.statSync(file).size===info.size,'Saved actual full-film bytes are truncated');
  assert(report.downloadAttempts===0,'Full-film job attempted a user download; the attempt was blocked');
  report.fullExport={enabled:true,phase:'saved',...info,path:file,sha256:hash.digest('hex'),bytesWritten:written,
    ffprobePending:true,restoration:{state:restored,pixelDifference:restorationPixels},
    scope:'Actual fixed-frame encoder Blob copied in 512KiB chunks without clicking Download or a save dialog.'};
  fs.writeFileSync(path.join(output,'full-export-metadata.json'),JSON.stringify(report.fullExport,null,2));
  pass('actual-full-1080p60-45s-2700-frame-WebM-saved-without-download',{
    path:file,sha256:report.fullExport.sha256,size:info.size,metadata:info.metadata,downloadAttempts:report.downloadAttempts});
  await verifyAndSampleFilm(file);report.fullExport.phase='complete';
  fs.writeFileSync(path.join(output,'full-export-metadata.json'),JSON.stringify(report.fullExport,null,2));
}
async function parentLifecycle(){
  await call(`(()=>{const a=lijiangRaster;a.prepareView(38);if(a.getState().mode!=='free')a.toggleMode();
    a.pause(true);a.suspend(false);return true;})()`);
  const saved=await wait('Own production parent free view settles',isIdle);
  assert(saved.parent.child.sameDocument&&saved.parent.contextCaptured&&!saved.parent.contextLost,
    'Production parent did not retain its original actual child document/context');
  const samePose=sample=>{
    assert(sample.parent.child.sameDocument&&sample.world.mode==='free'&&sample.world.paused
      &&sample.world.time===saved.world.time
      &&JSON.stringify(sample.world.camera)===JSON.stringify(saved.world.camera),
      'Parent text navigation changed the saved free view or child document');
    assert(sample.parent.contextLost===false,'Parent text navigation lost its retained child context');
  };
  await parentCall(`(()=>{const guide=document.getElementById('guide');if(!guide)throw new Error('Production guide section missing');
    guide.scrollIntoView({behavior:'instant',block:'start'});return true;})()`);
  const suspended=await wait('Guide text suspends the actual child',s=>s.world?.ready&&s.world.hostSuspended===true&&!s.world.rendering);
  samePose(suspended);await sleep(1500);const held=await read();samePose(held);
  assert(held.world.hostSuspended===true&&!held.world.rendering&&held.world.frames===suspended.world.frames,
    'Reading parent guide text still rendered new child frames');
  report.parentGuideHold={before:suspended,after:held,milliseconds:1500};
  pass('production-parent-guide-text-holds-pose-and-stops-child-draws',report.parentGuideHold);
  await parentCall(`document.querySelector('#lijiang iframe.world-frame').scrollIntoView({behavior:'instant',block:'center'});true`);
  const resumed=await wait('Same production child resumes from guide',s=>isIdle(s)&&s.world.hostSuspended===false);
  samePose(resumed);report.parentResumed=resumed;
  pass('production-parent-return-preserves-original-document-and-free-pose',{
    camera:resumed.world.camera,time:resumed.world.time,sameDocument:resumed.parent.child.sameDocument});
  await parentCall(`(async()=>{if(typeof window.worldHub?.disposeAll!=='function')throw new Error('Production disposeAll unavailable');
    await window.worldHub.disposeAll();return true;})()`);
  const retired=await wait('Production parent releases original child context',s=>s.parent?.contextLost===true
    &&s.parent.previews.every(f=>(!f.src||f.src==='about:blank')&&f.href==='about:blank'),60000);
  report.disposed={state:retired.parent.retiredWorld,contextLost:retired.parent.contextLost,parent:retired.parent};
  assert(report.disposed.state?.phase==='disposed','Production parent did not finish the actual child dispose path');
  pass('production-parent-disposeAll-unloads-child-and-loses-original-context',report.disposed);
}
async function run() {
  assert(!parentMode||!useCache,'Production parent acceptance cannot use QA field caches');
  assert(!parentMode||!fullExport,'Production parent mode cannot run full-film export');
  const originalHashes = hashProtected(), originalHealth = await bridgeHealth();
  const sourceOutput=path.join(output,'source');fs.mkdirSync(sourceOutput,{recursive:true});
  report.moduleArtifacts={};
  report.modules = Object.fromEntries(files.map(name => {
    const bytes=fs.readFileSync(path.join(PROJECT,'web/lijiang-native',name));
    const destination=path.join(sourceOutput,name);fs.writeFileSync(destination,bytes);
    report.moduleArtifacts[name]=destination;return[name,sha(bytes)];
  }));
  if(fullExport){
    const bytes=fs.readFileSync(path.join(PROJECT,'web/lijiang-flythrough/src/recorder.js'));
    const destination=path.join(sourceOutput,'flythrough-recorder.js');fs.writeFileSync(destination,bytes);
    report.modules['flythrough-recorder.js']=sha(bytes);report.moduleArtifacts['flythrough-recorder.js']=destination;
  }
  if(parentMode){
    const parentSource=path.join(sourceOutput,'parent');fs.mkdirSync(parentSource,{recursive:true});
    report.parentModuleArtifacts={};report.parentModules=Object.fromEntries(['index.html','app.js','style.css'].map(name=>{
      const bytes=fs.readFileSync(path.join(PROJECT,'web',name)),destination=path.join(parentSource,name);
      fs.writeFileSync(destination,bytes);report.parentModuleArtifacts[name]=destination;return[name,sha(bytes)];
    }));
  }
  const entry = new URL('http://127.0.0.1:8796/projects/014-programmable-worlds/web/'+(parentMode?'index.html':'lijiang-native/raster.html'));
  if(!parentMode){entry.searchParams.set('surface', '1'); entry.searchParams.set('material', '1'); entry.searchParams.set('qa', '1');}
  else entry.hash='lijiang';
  entry.searchParams.set('revision', process.env.LIJIANG_M2_REVISION || '20261026-m2');
  if (useCache) entry.searchParams.set('qaFields', '1');
  report.entry = entry.href; report.initialBridgeHealth = originalHealth;
  window = new BrowserWindow({ width, height, useContentSize: true, show: false, focusable: false,
    skipTaskbar: true, paintWhenInitiallyHidden: true, backgroundColor: '#071b1b',
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, devTools: false, backgroundThrottling: false,
      partition: 'persist:lijiang-m2-hidden-qa' } });
  window.on('focus', () => { fatal = 'Own QA window unexpectedly acquired focus'; });
  window.webContents.setFrameRate(fps); window.webContents.on('paint', () => paints++);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.session.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  window.webContents.session.on('will-download',event=>{event.preventDefault();report.downloadAttempts++;});
  window.webContents.on('console-message', details => {
    const item = { level: details.level, message: String(details.message || '').slice(0, 4000),
      source: details.sourceId, line: details.lineNumber }; report.console.push(item);
    if (/Raster shader failed|THREE.WebGLProgram: Shader Error|VALIDATE_STATUS.*false|ERROR: 0:\d+:/.test(item.message)) fatal = item.message;
  });
  window.webContents.on('render-process-gone', (_e, details) => { fatal = 'Own renderer exited: ' + details.reason; });
  const loadBegan = Date.now(); await window.loadURL(entry.href); policy();
  if(parentMode)await parentCall(`(()=>{const f=document.querySelector('#lijiang iframe.world-frame');
    if(!f)throw new Error('Actual production Li iframe is missing');f.scrollIntoView({behavior:'instant',block:'center'});return true;})()`);
  const ready = await wait('production-generated-scene-ready', isIdle, 1200000);
  report.loadSeconds = (Date.now() - loadBegan) / 1000; report.initial = ready;
  assert(ready.cache === useCache && ready.world.materialOnly, 'Unexpected field provenance or shading mode');
  assert(!ready.generatorPresent, 'Material-only scene retained its producer context');
  if(parentMode){assert(ready.parent.child.sameDocument&&!ready.parent.contextLost,'Production child document/context evidence missing');
    pass('actual-production-parent-loads-only-Li-live-iframe',{entry:entry.href,child:ready.url,previews:ready.parent.previews});}
  pass(useCache ? 'iteration-cache-explicitly-labelled' : 'actual-production-generation-without-QA-cache',
    { seconds: report.loadSeconds, entry: entry.href, generatorAbsent: true });
  report.adapter = await call(`(()=>{const gl=lijiangRaster.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');
    window.__m2OriginalGL=gl;return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
  const images = [];
  for (const t of [0, 10, 25, 38, 45]) images.push({ name: 'flight-' + t, data: await flightShot(t) });
  report.derivedPoses = await freePoses();
  for (const pose of report.derivedPoses) images.push({ name: pose.name, data: await freeShot(pose) });
  await contactSheet(images);
  pass('five-flight-and-three-actual-free-camera-canvas-captures', { captures: report.captures.map(c => c.name),
    scope: 'Evidence produced for independent visual review; not an automatic art-quality pass.' });
  await sunRoundtrip();
  if (!short) await continuousFlight();
  if(fullExport)await recordFullFilm();
  await call('lijiangRaster.prepareView(45);lijiangRaster.suspend(false);true');
  const idleA = await wait('Paused scene idle', isIdle); await sleep(1500); const idleB = await read();
  assert(idleA.world.frames === idleB.world.frames && idleB.world.idle, 'Paused unchanged scene continued GPU rendering');
  pass('paused-scene-stops-redundant-draws', { beforeFrames: idleA.world.frames, afterFrames: idleB.world.frames });
  report.frameTiming = await call(`(async()=>{const a=lijiangRaster;a.suspend(true);while(a.getState().rendering)await new Promise(r=>setTimeout(r,10));
    const samples=[];for(let i=0;i<8;i++){const t=performance.now();await a.renderAt(45);samples.push(performance.now()-t);await new Promise(r=>setTimeout(r,20));}
    return {samples,meanMilliseconds:samples.slice(2).reduce((a,b)=>a+b,0)/6,state:a.getState()};})()`);
  pass('actual-GPU-completed-frame-timing-recorded', { milliseconds: report.frameTiming.meanMilliseconds });
  if(parentMode)await parentLifecycle();
  else{
    await call('lijiangRaster.dispose()'); report.disposed = await call('({state:lijiangRaster.getState(),contextLost:__m2OriginalGL.isContextLost()})');
    assert(report.disposed.contextLost && report.disposed.state.phase === 'disposed', 'Actual main GL context was not released');
  }
  await window.loadURL('about:blank'); policy();
  assert(window.webContents.getURL() === 'about:blank', 'Own QA page did not unload');
  pass('own-scene-disposes-context-and-unloads', report.disposed);
  report.finalBridgeHealth = await bridgeHealth();
  report.bridgeSessionObservations={
    scope:'QA reads only each bridge health endpoint and never calls session endpoints. Session activity is externally controlled; a before/after change cannot be attributed to this QA and does not establish whether the user used a page.',
    ports:Object.keys(originalHealth).map(port=>({port:Number(port),before:originalHealth[port].sessionActive,
      after:report.finalBridgeHealth[port]?.sessionActive,
      changed:originalHealth[port].sessionActive!==report.finalBridgeHealth[port]?.sessionActive}))
  };
  for(const port of Object.keys(originalHealth)){
    const before=originalHealth[port],after=report.finalBridgeHealth[port];
    assert(before.pid===after?.pid&&before.service===after?.service,'Unrelated bridge PID/service changed: '+port);
  }
  assert(JSON.stringify(originalHashes) === JSON.stringify(hashProtected()), 'Original source/A/B entry bytes changed during QA');
  pass('original-source-A-B-bytes-and-bridge-process-identities-preserved',
    {hashes:originalHashes,initialBridges:originalHealth,finalBridges:report.finalBridgeHealth,
      sessionActivity:report.bridgeSessionObservations});
  report.status = 'passed';
}
app.whenReady().then(async () => {
  try { await run(); }
  catch (error) {
    report.status = 'failed'; report.errors.push(String(error.stack || error));
    if (window && !window.isDestroyed()) try { await capture('failure'); } catch {}
  } finally {
    if (window && !window.isDestroyed()) {
      try { await window.webContents.executeJavaScript(`(async()=>{if(typeof window.worldHub?.disposeAll==='function')await window.worldHub.disposeAll();
        else await window.lijiangRaster?.dispose?.();return true;})()`, false); }
      catch (error) { report.cleanupError = String(error.message || error); }
      window.destroy();
    }
    report.paints = paints; progress('finished');
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
    app.exit(report.status === 'passed' ? 0 : 1);
  }
});
app.on('window-all-closed', () => {});
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && ['crashed', 'killed', 'abnormal-exit'].includes(details.reason)) fatal = 'Own GPU process exited: ' + details.reason;
});
