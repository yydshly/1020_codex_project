'use strict';
// Complete M6 acceptance. Only selected explicitly with LIJIANG_M6_FULL=1.
// Export remains opt-in through LIJIANG_M6_EXPORT=1; preview never uses this path.
// Standalone, task-owned hidden Electron QA. It never uses OS input, attaches
// to another browser, starts a server, or borrows an existing rendering window.
// Run via `node launch-lijiang-quality-m6-qa.cjs`. The pinned Electron is
// packaged: a loose .cjs argument is not an application entry. The launcher
// verifies resources/app/entry.cjs and uses its explicit --lijiang-quality-m6-qa
// dispatch; it refuses to fall through to the regular research hub.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, nativeImage } = require('electron');
const m6Contracts=require('./lijiang-m6-qa-contracts.cjs');
const protectedM5Pinned=m6Contracts.verifyM5();

const PROJECT = path.resolve(__dirname, '../..');
const ROOT = 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-m6-full';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(ROOT, runId);
const backend = process.env.LIJIANG_M6_BACKEND || 'd3d11';
const useCache = process.env.LIJIANG_M6_CACHE === '1';
const short = process.env.LIJIANG_M6_SHORT === '1';
const parentMode = process.env.LIJIANG_M6_PARENT === '1';
const fullExport = process.env.LIJIANG_M6_EXPORT === '1';
const volumeDiagnostic = process.env.LIJIANG_M6_VOLUME_DIAG === '1';
const focusMode = process.env.LIJIANG_M6_FOCUS === '1';
const profileComponents = focusMode || process.env.LIJIANG_M6_COMPONENT_TIMING === '1';
const perfOnly = process.env.LIJIANG_M6_PERF_ONLY === '1';
const foliageDiagnostic = process.env.LIJIANG_M6_FOLIAGE_DIAG === '1';
const fps = Math.max(10, Math.min(30, Number(process.env.LIJIANG_M6_FPS) || 20));
const width = Math.max(640, Math.min(1920, Number(process.env.LIJIANG_M6_WIDTH) || 1440));
const height = Math.max(400, Math.min(1080, Number(process.env.LIJIANG_M6_HEIGHT) || 900));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
// Reject an unpromoted M2/M3 home before app readiness/window creation. The actual
// loaded DOM and live child iteration are checked again by checkParent/read.
function assertM6ParentEntry(html){
  const section=html.match(/<section\b[^>]*\bid=["']lijiang["'][^>]*>[\s\S]*?<\/section>/i)?.[0];
  const frames=section?.match(/<iframe\b[^>]*>/gi)||[];
  assert(frames.length===1,'Formal #lijiang section must contain exactly one iframe');
  const source=frames[0].match(/\bdata-src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g,'&');
  const entry=new URL(source||'about:blank','http://127.0.0.1:8796/projects/014-programmable-worlds/web/index.html');
  assert(entry.origin==='http://127.0.0.1:8796'&&entry.pathname==='/projects/014-programmable-worlds/web/lijiang-m6/raster.html'
    &&entry.searchParams.get('surface')==='1'&&entry.searchParams.get('material')==='1'&&!entry.searchParams.has('qaFields'),
    'M6 PARENT refuses the formal home unless its actual #lijiang data-src points to uncached M6');
  return entry.href;
}
if(parentMode)assertM6ParentEntry(fs.readFileSync(path.join(PROJECT,'web/index.html'),'utf8'));
assert(!useCache, 'M6 QA requires actual generation and refuses QA field caches');
assert(!parentMode||(!volumeDiagnostic&&!perfOnly),'M6 PARENT cannot use the independent volume/performance-only routes');
assert(!volumeDiagnostic||!fullExport, 'M6 volume diagnostic mode cannot run the full-scene film export');
assert(!perfOnly||(!volumeDiagnostic&&!fullExport&&!profileComponents), 'M6 PERF_ONLY requires its independent timing route without volume diagnosis, export or component profile');
assert(!foliageDiagnostic||(!parentMode&&!volumeDiagnostic&&!perfOnly&&!fullExport&&!profileComponents),
  'M6 FOLIAGE_DIAG requires the direct generated scene without other diagnostic/export routes');
assert(!focusMode||(!parentMode&&!fullExport&&!volumeDiagnostic&&!perfOnly&&!foliageDiagnostic),
  'M6 FOCUS requires the standalone full generated scene and refuses parent, export and other diagnostic routes');
const sourceFiles = directory => fs.readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => entry.name).sort();
const m6Directory = path.join(PROJECT, 'web/lijiang-m6');
// Include newly-added modules, styles and generator manifests automatically.
const files = sourceFiles(m6Directory);
const m2Directory = path.join(PROJECT, 'web/lijiang-native');
const m2Files = sourceFiles(m2Directory);
assert(m2Files.length === 34, 'The protected M2 baseline must contain its 34 original files');
const m3BaselineDirectory=path.join(PROJECT,'web/lijiang-m3');
const m3BaselineFiles=sourceFiles(m3BaselineDirectory);
assert(m3BaselineFiles.length===40,'The protected M3 baseline must contain its 40 frozen files');
const m4BaselineDirectory=path.join(PROJECT,'web/lijiang-m4');
const m4BaselineFiles=sourceFiles(m4BaselineDirectory);
const m4BaselineManifestPath=path.join(PROJECT,'notes/lijiang-m5-m4-baseline.json');
const m4BaselineHashes=JSON.parse(fs.readFileSync(m4BaselineManifestPath,'utf8').replace(/^\uFEFF/,''));
assert(m4BaselineFiles.length===43,'The protected M4 baseline must contain its 43 frozen files');
assert(JSON.stringify(m4BaselineFiles)===JSON.stringify(Object.keys(m4BaselineHashes).sort()),'M4 baseline manifest does not match the retained inventory');
function verifyM4Baseline(){
  assert(JSON.stringify(m4BaselineFiles)===JSON.stringify(sourceFiles(m4BaselineDirectory)),'Protected M4 inventory changed');
  for(const name of m4BaselineFiles)assert(sha(fs.readFileSync(path.join(m4BaselineDirectory,name)))===m4BaselineHashes[name],'Protected M4 differs from the frozen baseline: '+name);
}
verifyM4Baseline();

const protectedFiles = ['upstream/index.html', 'runtime/index.html', 'runtime/source-live.html',
  'runtime/source-live.js', 'runtime/source-live.css', 'runtime/controller.js',
  'canal-real/index.html', 'canal-real/main.js', 'shipyard-station/index.html', 'shipyard-station/main.js'];
for(const name of m2Files)protectedFiles.push('lijiang-native/'+name);
for(const name of m3BaselineFiles)protectedFiles.push('lijiang-m3/'+name);
for(const name of m4BaselineFiles)protectedFiles.push('lijiang-m4/'+name);
const m5ProtectedDirectory=path.join(PROJECT,'web/lijiang-m5');
const m5ProtectedFiles=sourceFiles(m5ProtectedDirectory);
for(const name of m5ProtectedFiles)protectedFiles.push('lijiang-m5/'+name);
const m5ComparisonRun="C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-m5\\2026-10-26T09-19-36-835Z";
const comparisonBaseline={iteration:'m5',run:m5ComparisonRun,result:path.join(m5ComparisonRun,'result.json'),
  scope:'Frozen actual accepted M5 evidence for independent same-view review; camera/aspect differences must be accounted for. No green-pixel ratio constitutes art acceptance.',
  artifacts:['flight-00','flight-10','flight-25','flight-38','flight-45','near-rock','wet-bank','forest-floor',
    'primary-front','primary-back','primary-left','primary-right','film-contact-sheet'].map(name=>({name,path:path.join(m5ComparisonRun,name+'.png')}))};
const fixedM5MountainPoses=(()=>{
  const previous=JSON.parse(fs.readFileSync(comparisonBaseline.result,'utf8'));
  return previous.derivedPoses.filter(p=>p.source?.kind==='actual-M5-SDF-mountain-anchor').map(p=>({
  name:'m5-reference-'+p.name,position:p.position.slice(),target:p.target.slice(),fov:p.fov,
  source:{kind:'fixed-prior-actual-pose',iteration:'m5',issue:'Exact previous mountain viewpoint retained for visual comparison',
    priorImage:path.join(m5ComparisonRun,p.name+'.png'),originalAnchor:p.source.anchor}
}));})();
assert(fixedM5MountainPoses.length===7,'M6 comparison requires all seven frozen M5 mountain cameras');
const rejectedFirstM5RightPose={name:'m5-first-right-occlusion-regression',
  position:[537.4283316524234,197.86905304064743,-168.53735016409553],
  target:[551.9273742086029,170.20585753189766,-184.312236343315],fov:42,
  source:{kind:'fixed-prior-actual-pose',iteration:'m5-first-rejected',accepted:false,
    issue:'First M5 angular-right eye entered foreground foliage after H clearance; SDF-only root ray did not exclude leaf/branch obstruction',
    priorImage:'C:/Users/yun68/CodexTaskArtifacts/014-lijiang-m5/2026-10-26T06-47-37-169Z/mountain-same-cliff-right.png',
    scope:'Retained failed viewpoint, not an accepted framing example; new three-angle evidence is separate.'}};

const vegetationReviewCriteria=[
  'Inspect 76 authored mountains separately from the additional SDF connection domains. Runtime ecology peakCount/perPeak currently enumerate SDF domains, including connecting ground; panoramic and four-side views must show terrain-driven foothill, slope, shoulder and crevice cohorts.',
  'Inspect actual SDF-surface root anchors, shoulder ledges and steep-wall boundaries at close range: roots must meet the rock surface with no floating trunks, buried whole crowns or trees growing horizontally from sheer walls.',
  'Preserve geological shape and readable exposed rock between vegetation patches. Avoid a uniform green shell, repeated stamped clusters and uniformly bare lower/mid slopes.',
  'Review short-branch silhouettes, age/size variation, canopy spacing and sun/shadow sides against the actual M4 evidence; no cardboard sheets, regular alpha grids or rectangular missing sectors.',
  'Review motion and reflections across LOD transitions for sudden whole-cohort disappearance, patch holes, shimmer or lost reflected vegetation. Sparse static captures cannot alone certify every intermediate frame.',
  'Keep source/context/export checks separate from artistic judgement; compare load and frame timing at the same view, resolution and device period before attributing performance changes.'
];
const priorArtRun='C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-m3\\2026-10-26T00-39-27-846Z';
const priorArtEvidence={run:priorArtRun,status:'Observed in actual prior images; pending independent review after fixes',
  scope:'Fair tree-family camera changes do not resolve these defects. Prior images remain intact; the original forest-floor and two defect poses are captured again.',
  images:['tree-family-0-crown','tree-family-0-root','tree-family-2-root','tree-family-2-crown','forest-floor']
    .map(name=>({name,path:path.join(priorArtRun,name+'.png')})),
  forestFloor:{name:'forest-floor',position:[235.99997073411942,6,422.66746044158936],
    target:[271.9999707341194,13.086883544921875,386.66746044158936],
    source:{kind:'fixed-prior-actual-pose',issue:'Prior bright ground seam near bottom centre',priorImage:path.join(priorArtRun,'forest-floor.png')}},
  regressionPoses:[
    {name:'family0-occlusion-regression',position:[367.37133182557926,11.039315096955264,386.3093509708761],
      target:[353.3277340622544,11.039315096955264,377.69914796886],
      source:{kind:'fixed-prior-actual-pose',issue:'Prior camera obstructed by near foliage',priorImage:path.join(priorArtRun,'tree-family-0-crown.png')}},
    {name:'seam-regression',position:[238.84579812611602,6.540451095039192,413.5511920476112],
      target:[245.5,4.354731750488281,417.63091790676117],
      source:{kind:'fixed-prior-actual-pose',issue:'Prior bright triangular ground seam',priorImage:path.join(priorArtRun,'tree-family-2-root.png'),
        priorPixelBounds:{width:1440,height:902,x:[470,780],y:[842,901]}}}
  ]};
const report = { runId, output, status: 'running', artAccepted: false, backend,
  mode:focusMode?'focused-full-scene-regression':foliageDiagnostic?'foliage-isolation-diagnostic':volumeDiagnostic?'volume-diagnostic-data':perfOnly?'performance-only':'full-scene-QA',perfOnly,foliageDiagnostic,focusMode,
  scope: focusMode
    ? 'Actual complete 76 authored peaks plus all connection domains. Focused panorama, seam and same-plant evidence, navigation and short component timing only; no LOD route, continuous flight, film export or parent lifecycle acceptance.'
    : foliageDiagnostic
    ? 'ONLY DIAGNOSTIC: actual full-scene generation followed by paired same-camera canopy/forest visibility isolation renders. This route does not perform full functional, art, motion, sun or export acceptance.'
    : volumeDiagnostic
    ? 'Actual native volume diagnostic data only. Reference, packed and pruned comparisons require independent interpretation; no scene or art acceptance is performed.'
    : perfOnly?'Actual generation then the original flight view at 45 seconds and eight isolated completed frames. Timing data only; the full functional/art/motion suite is not run.'
    : 'Actual generated scene/canvas evidence and functional measurements. Visual quality requires independent image and motion review.',
  cache: useCache, short, parentMode, targetFrameRate: fps, tests: [], captures: [], errors: [], console: [], flightSamples: [],
  downloadAttempts:0,fullExport:{enabled:fullExport,ffprobePending:fullExport},
  volumeDiagnostic:{enabled:volumeDiagnostic,comparisonVerdict:'not-evaluated',sceneAcceptancePerformed:false},
  componentTiming:{enabled:profileComponents,status:profileComponents?'pending':'disabled',requiredForFunctionalQA:false,
    scope:'Optional diagnostic; enabled by FOCUS or LIJIANG_M6_COMPONENT_TIMING=1. Diagnostic failure is reported separately from production-scene functional checks.'},
  comparisonBaseline,vegetationReviewCriteria,
  mountainVegetationEvidence:{status:perfOnly||volumeDiagnostic||foliageDiagnostic?'not-run-in-diagnostic-route':'pending-coverage-captures',artAccepted:false,automaticGreenPixelAcceptance:false,
    anchorCloseups:{pending:true,reason:'Awaiting the ecology getAnchors/stats interface; actual SDF root/shoulder/wall-edge views will be added after its contract is available.'}},
  priorArtEvidence:volumeDiagnostic?null:priorArtEvidence};
let window, fatal = null, paints = 0, began = Date.now();
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'profile-' + backend), { recursive: true });
app.setName('Li River M6 Hidden Visual QA');
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
      &&u.pathname==='/projects/014-programmable-worlds/web/lijiang-m6/raster.html';}catch{return false;}
  });
}
async function call(code,timeout=60000){
  const target=sceneTarget();assert(target,'Own production Li iframe realm is not loaded');
  return evaluate(target,code,timeout);
}
async function readParent(){
  if(!parentMode)return null;
  return parentCall(`(()=>{const f=document.querySelector('#lijiang iframe.world-frame'),w=f?.contentWindow,api=w?.lijiangRaster;
    const ref=window.__m6ParentQA||(window.__m6ParentQA={}),reload=window.__m6ReloadQA;
    if(api&&!ref.context){ref.context=api.renderer.getContext();ref.document=f.contentDocument;ref.timeOrigin=w.performance.timeOrigin;ref.api=api;}
    const currentGL=api?.renderer.getContext(),currentWorld=api?.getState();
    return {url:location.href,hub:window.worldHub?.getState(),directLink:document.querySelector('#lijiang .live-caption a')?.href,
      previews:[...document.querySelectorAll('iframe.world-frame')].map(frame=>({lijiang:frame===f,
        source:frame.dataset.src,src:frame.getAttribute('src'),href:frame.contentWindow.location.href})),
      child:f?{href:w.location.href,sameDocument:!!ref.document&&f.contentDocument===ref.document,iteration:currentWorld?.iteration,
        currentContextLost:currentGL?.isContextLost()??null,currentContextMatchesOriginal:!!currentGL&&currentGL===ref.context,
        timeOrigin:w.performance.timeOrigin,box:f.getBoundingClientRect().toJSON()}:null,
      contextCaptured:!!ref.context,contextLost:ref.context?.isContextLost()??null,
      retiredWorld:ref.api?.getState()||null,reloadContextLost:reload?.context?.isContextLost()??null,
      reloadRetiredWorld:reload?.api?.getState()||null};})()`);
}
function checkParent(parent){
  assert(parent.previews.length===4&&parent.previews.filter(f=>f.lijiang).length===1,
    'Production parent must retain original, A, B and Li iframe entries');
  assert(parent.previews.filter(f=>!f.lijiang).every(f=>(!f.src||f.src==='about:blank')&&f.href==='about:blank'),
    'An unrelated original/A/B heavy iframe was loaded in the own QA parent');
  const li=parent.previews.find(f=>f.lijiang),source=new URL(li.source,parent.url);
  assert(source.origin==='http://127.0.0.1:8796'
    &&source.pathname==='/projects/014-programmable-worlds/web/lijiang-m6/raster.html'
    &&source.searchParams.get('surface')==='1'&&source.searchParams.get('material')==='1'
    &&!source.searchParams.has('qaFields'),'Production parent does not embed the full live material renderer');
  const direct=new URL(parent.directLink||'about:blank',parent.url);
  assert(direct.origin===source.origin&&direct.pathname===source.pathname&&direct.searchParams.get('surface')==='1'
    &&direct.searchParams.get('material')==='1'&&!direct.searchParams.has('qaFields'),'Formal independent Li link does not point to uncached M6');
  if(li.href&&li.href!=='about:blank'){
    const childURL=new URL(li.href);assert(childURL.origin===source.origin&&childURL.pathname===source.pathname,
      'Formal parent loaded a different child path instead of M6');
  }
  if(parent.child?.iteration)assert(parent.child.iteration==='m6','Formal parent live child is M2 or another non-M6 iteration');
  assert(parent.previews.filter(f=>f.src&&f.src!=='about:blank').length<=1,
    'More than the own Li heavy iframe was loaded');
}
async function read() {
  const parent=await readParent();if(parent)checkParent(parent);
  if(parentMode&&!sceneTarget())return {url:null,world:null,parent,load:'Waiting for the actual production iframe'};
  const value = await call(`(()=>{if(!window.__m6QAContextEvents){window.__m6QAContextEvents=[];
    for(const type of ['webglcontextlost','webglcontextrestored'])addEventListener(type,event=>{
      const state=window.lijiangRaster?.getState();window.__m6QAContextEvents.push({type,at:performance.now(),
        canvasId:event.target?.id||null,statusMessage:String(event.statusMessage||''),phase:state?.phase,
        camera:state?.camera,frame:state?.frames,rendering:state?.rendering});},true);}
    const a=window.lijiangRaster,gl=a?.renderer?.getContext(),info=a?.renderer?.info;
    return {url:location.href,world:a?.getState(),
    load:document.querySelector('#load-detail')?.textContent,
    generatorPresent:!!document.getElementById('generator'),
    cache:!!window.lijiangRasterFields?.provenance?.qaGeneratedFieldCache,
    sceneFogDensity:window.lijiangRaster?.scene?.fog?.density,
    controls:{sun:Number(document.getElementById('sun')?.value),fog:Number(document.getElementById('fog')?.value)},
    gpu:{contextLost:gl?.isContextLost(),events:window.__m6QAContextEvents,
      memory:info?{...info.memory}:null,programs:info?.programs?.length,render:info?{...info.render}:null},
    now:performance.now()};})()`);
  if(value.gpu)report.lastGpuEvidence={...value.gpu,now:value.now,url:value.url};
  if (value.world?.error) throw new Error(value.world.error);
  if(value.world)assert(value.world.iteration==='m6','QA encountered a non-M6 live world');
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
    const prior=${JSON.stringify(priorArtEvidence)};
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    const sample=(x,z)=>{const u=clamp((x-rect[0])/rect[2]*w-.5,0,w-1),v=clamp((z-rect[1])/(rect[3]>1?rect[3]:rect[2])*n-.5,0,n-1),ix=Math.floor(u),iz=Math.floor(v),tx=u-ix,tz=v-iz,c=h.channels||1;
      const at=(x,z)=>a[(z*w+x)*c];return (at(ix,iz)*(1-tx)+at(Math.min(ix+1,w-1),iz)*tx)*(1-tz)+(at(ix,Math.min(iz+1,n-1))*(1-tx)+at(Math.min(ix+1,w-1),Math.min(iz+1,n-1))*tx)*tz;};
    const centre=z=>46*Math.sin((z+140)*.00168)+28*Math.sin((z-70)*.0031)-430*(1-smooth(-1350,-350,z));
    const half=z=>170*(1+.11*Math.sin(z*.0013-.4)+.055*Math.cos(z*.0037));
    const population=f.composedTrees||f.trees;
    if(!Array.isArray(population))throw new Error('Actual composed forest population is unavailable');
    const treeSource=p=>({x:p.x,y:p.y,z:p.z,radius:p.radius,seed:p.seed,height:p.height,
      architecture:p.architecture,architectureName:p.architectureName,maturity:p.maturity,
      canopyX:p.canopyX,canopyZ:p.canopyZ,canopyRadius:p.canopyRadius,rootExposure:p.rootExposure});
    const lowland=population.filter(p=>!p.bush&&p.y<35&&p.radius>1);
    const rocks=(f.rocks||[]).filter(r=>r.metadata.centre[0]>300&&r.metadata.centre[0]<1000&&r.metadata.centre[1]>-500&&r.metadata.centre[1]<550)
      .sort((a,b)=>Math.hypot(a.metadata.centre[0]-600,a.metadata.centre[1]-100)-Math.hypot(b.metadata.centre[0]-600,b.metadata.centre[1]-100));
    if(!rocks.length)throw new Error('No actual front rock available for close QA');
    const rock=rocks[0].metadata,c=rock.centre,e=rock.clipEllipse,rx=c[0]-e[0]-42,rz=c[1]+e[1]*.42,ry=Math.max(12,sample(rx,rz)+8);
    const bz=485,bx=centre(bz)+half(bz)-22,by=Math.max(8,sample(bx,bz)+6);
    const poses=[{name:'near-rock',position:[rx,ry,rz],target:[c[0],Math.max(ry+28,72),c[1]],source:{centre:c,ellipse:e}},
      prior.forestFloor,
      {name:'wet-bank',position:[bx,by,bz],target:[bx+73,5,bz-135],source:{riverCentre:centre(bz),riverHalfWidth:half(bz)}}];
    const primary=(f.rocks||[]).find(r=>Math.hypot(r.metadata?.centre?.[0]-575,r.metadata?.centre?.[1]+170)<.01)?.metadata;
    if(!primary)throw new Error('Actual primary rock metadata at [575,-170] is unavailable');
    const pc=primary.centre,pe=primary.clipEllipse;
    if(!Array.isArray(pe)||pe.length<2||!pe.every(v=>Number.isFinite(v)&&v>0))throw new Error('Primary rock clipEllipse is invalid');
    for(const [side,dx,dz]of [['front',0,pe[1]+42],['back',0,-pe[1]-42],['left',-pe[0]-42,0],['right',pe[0]+42,0]]){
      const px=pc[0]+dx,pz=pc[1]+dz,H=sample(px,pz),outsideEllipse=dx*dx/(pe[0]*pe[0])+dz*dz/(pe[1]*pe[1]);
      if(!(outsideEllipse>1))throw new Error('Primary '+side+' QA camera is inside its actual clipEllipse');
      poses.push({name:'primary-'+side,position:[px,Math.max(H+8,20),pz],target:[pc[0],110,pc[1]],
        source:{kind:'actual-primary-rock-cardinal',side,centre:pc,clipEllipse:pe,terrainHeight:H,outsideEllipse}});
    }
    const treeHeight=p=>p.height??p.radius*([1.55+.45*(p.maturity??.45),2.30+.70*(p.maturity??.45),1.60+.40*(p.maturity??.45),1.55+.25*(p.maturity??.45)][p.architecture??0]);
    const envelope=p=>({tree:p,x:p.canopyX??p.x,z:p.canopyZ??p.z,y:p.y+treeHeight(p)*.65,
      rx:Math.max(p.canopyRadius??p.radius,p.radius*1.25)+1.5,ry:Math.max(p.radius*.85,treeHeight(p)*.45)});
    const envelopes=population.filter(p=>!p.bush&&Number.isFinite(p.x+p.y+p.z+p.radius)).map(envelope);
    const sunAzimuth=(globalThis.lijiangRaster?.getState?.()?.environment?.settings?.sunAzimuth??-55)*Math.PI/180;
    const sunX=Math.sin(sunAzimuth),sunZ=Math.cos(sunAzimuth),sunAngle=Math.atan2(sunZ,sunX);
    const normalizedDistance=(point,b)=>((point[0]-b.x)/b.rx)**2+((point[1]-b.y)/b.ry)**2+((point[2]-b.z)/b.rx)**2;
    const obstruction=(eye,target,blockers,spread)=>{
      let score=0,eyeInsideNeighborCount=0,centralRayIntersections=0;
      const vx=target[0]-eye[0],vz=target[2]-eye[2],length=Math.hypot(vx,vz)||1,sideX=-vz/length,sideZ=vx/length;
      for(const b of blockers){
        const eyeQ=normalizedDistance(eye,b);
        if(eyeQ<1){eyeInsideNeighborCount++;score+=180+180*(1-eyeQ);}
        for(const offset of [0,-spread,spread]){
          const tx=target[0]+sideX*offset,tz=target[2]+sideZ*offset;
          const ox=(eye[0]-b.x)/b.rx,oy=(eye[1]-b.y)/b.ry,oz=(eye[2]-b.z)/b.rx;
          const dx=(tx-eye[0])/b.rx,dy=(target[1]-eye[1])/b.ry,dz=(tz-eye[2])/b.rx;
          const t=clamp(-(ox*dx+oy*dy+oz*dz)/(dx*dx+dy*dy+dz*dz||1),0,.94);
          const q=(ox+dx*t)**2+(oy+dy*t)**2+(oz+dz*t)**2;
          if(q<1){score+=(offset===0?48:22)*(1-q);if(offset===0)centralRayIntersections++;}
        }
      }
      for(const t of [.2,.4,.6,.8]){
        const H=sample(eye[0]+(target[0]-eye[0])*t,eye[2]+(target[2]-eye[2])*t);
        if(H+.3>eye[1]+(target[1]-eye[1])*t)score+=120;
      }
      return {score,eyeInsideNeighborCount,centralRayIntersections};
    };
    for(let family=0;family<4;family++){
      const selected=lowland.filter(p=>p.architecture===family&&typeof p.architectureName==='string')
        .sort((a,b)=>Math.hypot(a.x-260,a.z-410)-Math.hypot(b.x-260,b.z-410))[0];
      if(!selected)throw new Error('No actual lowland tree for architecture '+family);
      const R=selected.radius,nominalHeight=treeHeight(selected),bound=envelope(selected);
      const cx=selected.canopyX??selected.x,cz=selected.canopyZ??selected.z;
      const blockers=envelopes.filter(b=>b.tree!==selected&&Math.hypot(b.x-cx,b.z-cz)<120+b.rx);
      const crownTarget=[cx,selected.y+nominalHeight*.63,cz],rootTarget=[selected.x,selected.y+1.2,selected.z];
      const aspect=globalThis.lijiangRaster?.camera?.aspect||1.6;
      const crownDistance=Math.max(bound.rx+8,Math.max(nominalHeight*.52,bound.rx/aspect)/Math.tan(29*Math.PI/180)*1.28);
      const rootDistance=Math.max(14,bound.rx*1.3+4);let best=null;
      // All four families use the same framing rule and prefer the actual sun
      // side. Conservative neighbour envelopes score eye and sightline safety;
      // this estimate is recorded for review, never labelled visual acceptance.
      for(let i=0;i<16;i++)for(const retreat of [1,1.25]){
        const angle=sunAngle+i*Math.PI*2/16,dx=Math.cos(angle),dz=Math.sin(angle),sunFacingCosine=dx*sunX+dz*sunZ;
        const crownX=cx+dx*crownDistance*retreat,crownZ=cz+dz*crownDistance*retreat;
        const rootX=selected.x+dx*rootDistance*retreat,rootZ=selected.z+dz*rootDistance*retreat;
        const crownEye=[crownX,Math.max(6,sample(crownX,crownZ)+6,crownTarget[1]+nominalHeight*.08),crownZ];
        const rootEye=[rootX,Math.max(6,sample(rootX,rootZ)+6),rootZ];
        const crownObstruction=obstruction(crownEye,crownTarget,blockers,bound.rx*.45),rootObstruction=obstruction(rootEye,rootTarget,blockers,Math.max(.8,R*.12));
        const score=crownObstruction.score+rootObstruction.score*.8+(1-sunFacingCosine)*12+(retreat-1)*3;
        if(!best||score<best.score)best={score,crownEye,rootEye,sunFacingCosine,retreat,crownObstruction,rootObstruction};
      }
      const framing={candidateCount:32,sunAzimuth: sunAzimuth*180/Math.PI,sunFacingCosine:best.sunFacingCosine,
        score:best.score,retreat:best.retreat,nearbyTreeCount:blockers.length,
        crownObstruction:best.crownObstruction,rootObstruction:best.rootObstruction,
        scope:'CPU envelope estimate only; actual images still require independent review. No plants or lighting are changed.'};
      poses.push({name:'tree-family-'+family+'-crown',position:best.crownEye,target:crownTarget,
        source:{kind:'actual-lowland-tree-crown',tree:treeSource(selected),nominalHeight,framing}});
      poses.push({name:'tree-family-'+family+'-root',position:best.rootEye,target:rootTarget,
        source:{kind:'actual-lowland-tree-root',tree:treeSource(selected),framing,
          eyeRule:'Production free-camera terrain clearance: max(6,H+6)'}});
    }
    poses.push(...prior.regressionPoses);
    return poses;
  })()`);
}
async function freeShot(pose) {
  await call(`(()=>{const a=lijiangRaster;a.seek(38);if(a.getState().mode!=='free')a.toggleMode();
    a.pause(true);a.suspend(false);a.setClean(true);a.camera.position.set(...${JSON.stringify(pose.position)});
    a.camera.fov=${JSON.stringify(pose.fov??58)};a.camera.updateProjectionMatrix();a.camera.lookAt(...${JSON.stringify(pose.target)});a.camera.updateMatrixWorld(true);return true;})()`);
  const ready = await wait('Near-field LOD settles: ' + pose.name, isIdle);
  assert(ready.world.mode === 'free', 'Near-field shot reverted to the production flight camera');
  if(['fixed-prior-actual-pose','actual-M6-same-plant-angular-view'].includes(pose.source?.kind))assert(pose.position.every((v,i)=>Math.abs(v-ready.world.camera.position[i])<1e-5),
    'A fixed regression or actual-SDF angular camera moved from its validated pose: '+pose.name);
  return capture(pose.name, pose);
}
async function mountainPoses(){
  return call(`(async()=>{
    const {Raycaster,Vector3,Matrix3}=await import('three');
    const api=window.lijiangMountainEcology;if(typeof api?.getAnchors!=='function')throw new Error('M6 actual SDF mountain anchor interface is unavailable');
    const stats=api.getStats?.()||api.stats||lijiangRaster.getState().mountainEcology;
    const anchors=api.getAnchors({limit:Infinity}).filter(p=>p.anchorMode==='sdf-surface'
      &&p.position?.length===3&&p.normal?.length===3&&p.position.every(Number.isFinite)&&p.normal.every(Number.isFinite)&&p.radius>0&&p.sdfAnchor);
    if(anchors.length<7)throw new Error('M6 needs at least seven actual supported mountain anchors for close-range evidence');
    const f=lijiangRasterFields,rect=f.rect,h=f.height,w=h.width||f.resolution,n=h.height||w,data=h.data;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const H=(x,z)=>{const u=clamp((x-rect[0])/rect[2]*w-.5,0,w-1),v=clamp((z-rect[1])/(rect[3]>1?rect[3]:rect[2])*n-.5,0,n-1),ix=Math.floor(u),iz=Math.floor(v),tx=u-ix,tz=v-iz,c=h.channels||1;
      const at=(x,z)=>data[(z*w+x)*c];return(at(ix,iz)*(1-tx)+at(Math.min(ix+1,w-1),iz)*tx)*(1-tz)+(at(ix,Math.min(iz+1,n-1))*(1-tx)+at(Math.min(ix+1,w-1),Math.min(iz+1,n-1))*tx)*tz;};
    const fraction=p=>{const range=stats?.perPeak?.[p.peakIndex]?.heightRange;return range&&range[1]>range[0]?clamp((p.position[1]-range[0])/(range[1]-range[0]),0,1):.5;};
    const primary=anchors.filter(p=>p.peakIndex===0),trees=primary.filter(p=>p.kind==='mountain-tree'),shrubs=primary.filter(p=>p.kind==='mountain-shrub');
    const used=new Set(),poses=[];
    const key=p=>p.peakIndex+':'+p.triangle+':'+p.position.join(',');
    const sun=(lijiangRaster.getState().environment?.settings?.sunAzimuth??-55)*Math.PI/180;
    const elevation=(lijiangRaster.getState().environment?.settings?.sunElevation??14)*Math.PI/180;
    const sunVector=new Vector3(Math.sin(sun)*Math.cos(elevation),Math.sin(elevation),Math.cos(sun)*Math.cos(elevation));
    lijiangRaster.scene.updateMatrixWorld(true);
    const rockGroups=lijiangRaster.scene.children.filter(o=>o.isGroup&&['Native SDF surface with generated vertex lighting','Independent runtime-generated rock SDF pilot'].includes(o.name));
    const authoredPeakCount=f.peakSpec?.length||0;
    const rockRecords=rockGroups.map((group,peakIndex)=>{const mesh=group.children.find(o=>o.isMesh);
      if(!mesh?.geometry)throw new Error('Actual SDF mesh missing for peak '+peakIndex);
      if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
      const metadata=f.rocks?.[peakIndex]?.metadata,clip=metadata?{centre:metadata.centre,ellipse:metadata.clipEllipse}:peakIndex===0?lijiangRaster.getState().sdfPilot?.clipping:null;
      if(!clip?.centre||!clip?.ellipse)throw new Error('Actual SDF clip metadata missing for peak '+peakIndex);
      return{mesh,peakIndex,domainIndex:peakIndex,authoredPeakIndex:peakIndex<authoredPeakCount?peakIndex:null,connectionPatch:!!f.rocks?.[peakIndex]?.metadata?.connectionPatch,
        clip,bounds:mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),normalMatrix:new Matrix3().getNormalMatrix(mesh.matrixWorld)};});
    for(let i=0;i<rockRecords.length;i++){
      const r=rockRecords[i],c=r.clip;
      r.exclusions=rockRecords.slice(0,i).filter(p=>Math.hypot(p.clip.centre[0]-c.centre[0],p.clip.centre[1]-c.centre[1])<Math.max(...p.clip.ellipse)+Math.max(...c.ellipse)).map(p=>p.clip);
    }
    const rockByMesh=new Map(rockRecords.map(r=>[r.mesh,r]));
    const insideEllipse=(x,z,c)=>((x-c.centre[0])/c.ellipse[0])**2+((z-c.centre[1])/c.ellipse[1])**2<=1;
    function inVisibleRockDomain(r,x,z){return insideEllipse(x,z,r.clip)&&!r.exclusions.some(c=>insideEllipse(x,z,c));}
    function actualRockDomain(x,z){return rockRecords.find(r=>inVisibleRockDomain(r,x,z))||null;}
    if(rockRecords.length!==f.rocks?.length||rockRecords.length!==stats?.perPeak?.length)throw new Error('Cannot map actual rendered SDF domains to native rock records and per-domain ecology rows');
    const raycaster=new Raycaster(),boxHit=new Vector3(),direction=new Vector3();let rayTests=0;
    function rootVisibility(eye,anchor){
      const origin=new Vector3(...eye),root=new Vector3(...anchor.position),distance=origin.distanceTo(root);
      direction.copy(root).sub(origin).normalize();raycaster.set(origin,direction);raycaster.near=.05;raycaster.far=distance+1;
      const candidates=rockRecords.filter(r=>r.bounds.containsPoint(origin)||
        (raycaster.ray.intersectBox(r.bounds,boxHit)&&boxHit.distanceTo(origin)<=distance+1)).map(r=>r.mesh);
      rayTests++;
      // Match the actual fragment-domain clipping before choosing the first
      // rock hit; kept boundary triangles may cross a discarded ellipse.
      const first=raycaster.intersectObjects(candidates,false).find(hit=>{const r=rockByMesh.get(hit.object);return r&&inVisibleRockDomain(r,hit.point.x,hit.point.z);});
      const error=first?first.point.distanceTo(root):Infinity;
      let enteringSurfaceDot=null;
      if(first?.face){const n=first.object.geometry.getAttribute('normal'),q=new Vector3(),face=first.face;
        const outward=new Vector3().fromBufferAttribute(n,face.a).add(q.fromBufferAttribute(n,face.b)).add(q.fromBufferAttribute(n,face.c)).applyNormalMatrix(rockByMesh.get(first.object).normalMatrix);
        enteringSurfaceDot=outward.dot(direction);
      }
      const outwardEyeSide=new Vector3(...anchor.normal).dot(origin.clone().sub(root));
      return{visible:!!first&&first.object===rockRecords[anchor.peakIndex]?.mesh&&error<=Math.max(.7,anchor.radius*.18),
        targetDistance:distance,outwardEyeSide,enteringSurfaceDot,enteringSurface:enteringSurfaceDot!==null&&enteringSurfaceDot<-.00001,
        firstHitDistance:first?.distance??null,firstHitPoint:first?.point.toArray()??null,
        firstHitMesh:first?.object.uuid??null,firstHitFace:first?.faceIndex??null,rootHitError:Number.isFinite(error)?error:null,candidateMeshCount:candidates.length};
    }
    function choose(name,preferred,fallback,score,intent,rootDetail=false,maxCandidates=8){
      const frontLit=p=>new Vector3(...p.normal).normalize().dot(sunVector)>.08;
      let pool=preferred.filter(p=>!used.has(key(p))&&frontLit(p)),selectionFallback=false;
      if(!pool.length){pool=fallback.filter(p=>!used.has(key(p))&&frontLit(p));selectionFallback=true;}
      pool.sort((a,b)=>score(a)-score(b));let rejected=0;
      for(const selected of pool.slice(0,maxCandidates)){
        const p=selected.position,R=selected.radius,normal=new Vector3(...selected.normal).normalize(),root=new Vector3(...p);
        const tangent=sunVector.clone().addScaledVector(normal,-sunVector.dot(normal));
        if(tangent.length()<.01)tangent.set(normal.z,0,-normal.x);tangent.normalize();
        const distance=Math.max(25,R*5+20),lateral=Math.max(30,R*7+12);
        const neighbours=anchors.filter(q=>q!==selected&&Math.hypot(q.position[0]-p[0],q.position[2]-p[2])<65+q.radius);
        for(const retreat of [1,1.5]){
          const eye=root.clone().addScaledVector(normal,distance).add(new Vector3(0,12,0)).addScaledVector(tangent,lateral*retreat);
          eye.y=Math.max(eye.y,H(eye.x,eye.z)+12);const point=eye.toArray();
          const sunFacingCosine=eye.clone().sub(root).normalize().dot(sunVector);if(sunFacingCosine<.15){rejected++;continue;}
          let eyeInsideNeighbourCount=0,ownCrownObstruction=false;
          for(const q of [selected,...neighbours]){
            const r=q.radius*1.5+.6,cy=q.position[1]+q.radius*(q.kind==='mountain-tree'?1.25:.55),ry=q.radius*(q.kind==='mountain-tree'?1.3:.8)+.5;
            const ax=(eye.x-q.position[0])/r,ay=(eye.y-cy)/ry,az=(eye.z-q.position[2])/r,bx=(p[0]-eye.x)/r,by=(p[1]-eye.y)/ry,bz=(p[2]-eye.z)/r;
            if(ax*ax+ay*ay+az*az<1)eyeInsideNeighbourCount++;
            if(q===selected){const t=clamp(-(ax*bx+ay*by+az*bz)/(bx*bx+by*by+bz*bz||1),0,.90);
              ownCrownObstruction=(ax+bx*t)**2+(ay+by*t)**2+(az+bz*t)**2<.80;}
          }
          if(eyeInsideNeighbourCount||ownCrownObstruction){rejected++;continue;}
          const visibility=rootVisibility(point,selected);if(!visibility.visible){rejected++;continue;}
          const target=root.clone().addScaledVector(normal,.25).add(new Vector3(0,rootDetail?.35:Math.min(2,R*.55),0)).toArray();
          used.add(key(selected));poses.push({name,position:point,target,fov:rootDetail?34:44,
            source:{kind:'actual-M6-SDF-mountain-anchor',intent,selectionFallback,anchor:selected,
              peakIndex:selected.peakIndex,triangle:selected.triangle,cliffScrub:!!selected.cliffScrub,rootSupport:selected.sdfAnchor.rootSupport,
              rootHeightSpan:selected.sdfAnchor.rootHeightSpan,perPeak:stats?.perPeak?.[selected.peakIndex]||null,
              plantedHeightFraction:fraction(selected),framing:{normalExtrusionMetres:distance,upMetres:12,lateralMetres:lateral*retreat,
                HAtEye:H(eye.x,eye.z),sunFacingCosine,surfaceNormalSunCosine:normal.dot(sunVector),eyeInsideNeighbourCount,
                ownCrownObstruction,rootVisibility:visibility,rejectedCandidates:rejected,
                scope:'Actual first SDF hit must reach the selected root; real normal extrusion >=25m plus UP12 and H(eye)+12. Geometry visibility and crown envelopes do not constitute artistic acceptance.'}}});return;
        }
      }
      throw new Error('No front-lit, unobstructed actual SDF root view for '+name+' after '+rejected+' rejected camera candidates');
    }
    choose('mountain-primary-slope-root',trees,primary,p=>Math.abs(fraction(p)-.25)+(1-p.normal[1])*.25,'Supported lower/mid slope tree root on the primary peak',true);
    choose('mountain-primary-shoulder',primary.filter(p=>p.normal[1]>.70),primary,p=>Math.abs(fraction(p)-.55)+(1-p.normal[1])*.3,'Upward-facing supported shoulder pocket and surrounding exposed rock');
    choose('mountain-primary-upper-root',trees,primary,p=>Math.abs(fraction(p)-.80)+(1-p.normal[1])*.1,'Supported upper planted-band root; height fraction refers to actual planted range',true);
    choose('mountain-highest-supported-pocket',shrubs,primary,p=>-p.position[1],'Highest available supported primary-peak shrub pocket; not a claim that the geometric summit is planted');
    choose('mountain-steep-bare-boundary',shrubs,primary,p=>p.normal[1]+Math.abs(fraction(p)-.55)*.12,'Lowest-upward-normal supported shrub; planted/bare-wall adjacency requires actual image review');
    const other=anchors.filter(p=>p.peakIndex!==0);
    choose('mountain-secondary-peak-root',other.filter(p=>p.kind==='mountain-tree'),other,p=>Math.hypot(p.position[0]-575,p.position[2]+170)*.001+Math.abs(fraction(p)-.45),'Supported root on a different actual peak',true);
    const cliffScrub=anchors.filter(p=>p.cliffScrub===true&&p.normal[1]>=.075&&p.normal[1]<.305);
    if(!cliffScrub.length)throw new Error('Actual M6 surface-tangent cliff scrub anchors are unavailable');
    choose('mountain-cliff-scrub-root',cliffScrub,cliffScrub,
      p=>Math.hypot(p.position[0]-575,p.position[2]+170)*.001+(p.peakIndex===0?0:.1)+Math.abs(fraction(p)-.5)*.2,
      'Actual cliff-fissure shrub root on a supported steep face (normalY 0.08–0.30), with surface-tangent root footprint; no woodland or summit substitution',true,32);
    const samePlant=poses.find(p=>p.name==='mountain-cliff-scrub-root')?.source.anchor;
    if(!samePlant)throw new Error('Same-plant angular review needs the selected actual cliff root');
    const sameRoot=new Vector3(...samePlant.position),sameNormal=new Vector3(...samePlant.normal).normalize();
    const along=sunVector.clone().addScaledVector(sameNormal,-sunVector.dot(sameNormal));
    if(along.length()<.01)along.set(sameNormal.z,0,-sameNormal.x);along.normalize();
    const across=new Vector3().crossVectors(sameNormal,along).normalize();
    const angularTarget=sameRoot.clone().addScaledVector(sameNormal,.25).add(new Vector3(0,-Math.min(1.2,samePlant.radius*.3),0));
    const neighbours=anchors.filter(p=>key(p)!==key(samePlant)&&new Vector3(...p.position).distanceTo(sameRoot)<150+p.radius*2)
      .map(p=>{const r=p.radius,n=p.normal,cliff=!!p.cliffScrub,tree=p.kind==='mountain-tree';
        return{position:[p.position[0]+(cliff?n[0]*r*.30:0),p.position[1]+r*(cliff?-.70:tree?1.10:.60),p.position[2]+(cliff?n[2]*r*.30:0)],
          radius:r*(tree?1.55:1.35)+.3,height:r*(cliff?.85:tree?1.35:.85)+.3,key:key(p)};});
    function angularObstruction(eye){
      let eyeInside=0,foregroundCore=0,sightlineCrowns=0,tinyCoreEye=0;let clearance=Infinity;
      for(const q of neighbours){
        const ax=(eye.x-q.position[0])/q.radius,ay=(eye.y-q.position[1])/q.height,az=(eye.z-q.position[2])/q.radius;
        const bx=(angularTarget.x-eye.x)/q.radius,by=(angularTarget.y-eye.y)/q.height,bz=(angularTarget.z-eye.z)/q.radius;
        const eyeDistance=ax*ax+ay*ay+az*az;if(eyeDistance<1.08)eyeInside++;
        // A crown is porous. Only a very small central eye core receives a
        // severe score; neither it nor an approximate foliage envelope can
        // veto an actual SDF-visible diagnostic picture.
        if(ax*ax+az*az<.0025&&Math.abs(ay)<.65)tinyCoreEye++;
        const t=clamp(-(ax*bx+ay*by+az*bz)/(bx*bx+by*by+bz*bz||1),0,.94);
        const d=(ax+bx*t)**2+(ay+by*t)**2+(az+bz*t)**2;clearance=Math.min(clearance,d);
        if(d<.80)sightlineCrowns++;
        if(t<.70&&d<.20)foregroundCore++;
      }
      return{eyeInside,foregroundCore,sightlineCrowns,tinyCoreEye,minimumNormalizedClearance:Number.isFinite(clearance)?clearance:null};
    }
    for(const [label,angle]of [['left',-.55],['front',0],['right',.55]]){
      let selectedView=null,bestScore=Infinity,attempts=0;
      const angles=label==='front'?[angle,.12,-.12]:[angle,angle*1.35,angle*1.70];
      for(const distance of [Math.max(14,samePlant.radius*4),Math.max(20,samePlant.radius*6),28,38,52,65]){
        for(const actualAngle of angles)for(const tangentScale of [.22,0,-.22,.45]){
          attempts++;
          const eye=sameRoot.clone().addScaledVector(sameNormal,distance)
            .addScaledVector(along,distance*tangentScale).addScaledVector(across,Math.sin(actualAngle)*distance*.8);
          const originalY=eye.y,eyeDomain=actualRockDomain(eye.x,eye.z),coarseHeight=H(eye.x,eye.z);
          // The H mesh is discarded inside the visible signed-field domains.
          // A valid outside-wall eye may therefore be below H. Only apply H
          // clearance where that height-field ground is actually rendered.
          if(!eyeDomain)eye.y=Math.max(eye.y,coarseHeight+8);
          const outwardEyeSide=sameNormal.dot(eye.clone().sub(sameRoot));if(outwardEyeSide<=.05)continue;
          const obstruction=angularObstruction(eye);
          const score=obstruction.tinyCoreEye*10000+obstruction.eyeInside*450+obstruction.foregroundCore*350+obstruction.sightlineCrowns*65+distance+(eye.y-originalY)*.25+Math.abs(actualAngle-angle)*3+Math.abs(tangentScale-.22);
          if(score>=bestScore)continue;
          const visibility=rootVisibility(eye.toArray(),samePlant);if(!visibility.visible||!visibility.enteringSurface)continue;
          bestScore=score;
          selectedView={name:'mountain-same-cliff-'+label,position:eye.toArray(),target:angularTarget.toArray(),fov:42,
            source:{kind:'actual-M6-same-plant-angular-view',intent:'Three close angular views of the identical cliff plant to inspect leaf volume and rock contact',
              anchor:samePlant,angleRadians:actualAngle,requestedAngleRadians:angle,normalDistanceMetres:distance,tangentScale,rootVisibility:visibility,
              plantEnvelopeFraming:{...obstruction,score,neighbours:neighbours.length,HClearanceRaise:eye.y-originalY,
                eyeSurfaceDomain:eyeDomain?'visible-SDF-rock-domain':'rendered-heightfield',eyeDomainPeakIndex:eyeDomain?.peakIndex??null,coarseHAtEye:coarseHeight,outwardEyeSide,
                fallbackUsed:!!(obstruction.eyeInside||obstruction.foregroundCore||obstruction.sightlineCrowns),
                scope:'Actual root records form approximate POROUS crown envelopes. All plant overlap is scored, never treated as an opaque veto; a tiny central eye core receives a severe penalty. Actual clipped SDF first-hit root visibility, positive root-normal eye side and entering outward-gradient surface are mandatory. Any fallback risk is recorded and must be judged in the captured image.'},
              scope:'Same root identity; actual first SDF hit checked. No static angle or count constitutes automatic art acceptance.'}};
        }
        if(selectedView&&!selectedView.source.plantEnvelopeFraming.fallbackUsed)break;
      }
      if(!selectedView)throw new Error('No actual SDF-visible same-plant angular view for '+label);
      selectedView.source.plantEnvelopeFraming.attemptedCandidates=attempts;
      poses.push(selectedView);
    }
    // Collect actual geometric fixtures here, but evaluate navigation only
    // AFTER all art captures. Missing fixture coverage must never erase the
    // visual evidence needed to assess the current renderer.
    const navigationProbeCandidates={idle:[],crossings:[],selection:'Actual angular eyes and actual supported roots with0.8/1/2/6m outward offsets'};
    for(const p of poses.filter(p=>p.source?.kind==='actual-M6-same-plant-angular-view')){
      const eye=p.position,h=H(eye[0],eye[2]);
      if(actualRockDomain(eye[0],eye[2])&&eye[1]<h+6)navigationProbeCandidates.idle.push({position:eye.slice(),coarseH:h,kind:'validated-actual-angular-eye',visibility:p.source.rootVisibility});
    }
    const navigationAnchors=[samePlant,...poses.filter(p=>p.source?.kind==='actual-M6-SDF-mountain-anchor').map(p=>p.source.anchor)];
    for(const anchor of navigationAnchors){
      const root=new Vector3(...anchor.position),normal=new Vector3(...anchor.normal).normalize();
      for(const distance of [.8,1,2,6]){
        const eye=root.clone().addScaledVector(normal,distance),h=H(eye.x,eye.z);
        if(!actualRockDomain(eye.x,eye.z))continue;
        const visibility=rootVisibility(eye.toArray(),anchor);if(!visibility.visible||!visibility.enteringSurface||visibility.rootHitError>.02)continue;
        const candidate={anchor,position:eye.toArray(),normal:normal.toArray(),coarseH:h,distance,visibility};
        navigationProbeCandidates.crossings.push(candidate);
        if(eye.y<h+6)navigationProbeCandidates.idle.push({...candidate,kind:'validated-outward-root-offset'});
        if(navigationProbeCandidates.idle.length&&navigationProbeCandidates.crossings.length)break;
      }
      if(navigationProbeCandidates.idle.length&&navigationProbeCandidates.crossings.length)break;
    }
    return{poses,anchorCount:anchors.length,stats,rayTests,navigationProbeCandidates,
      domainCounts:{authoredPeaks:authoredPeakCount,sdfDomains:rockRecords.length,connectionPatches:rockRecords.filter(r=>r.connectionPatch).length,
        ecologyRows:stats.perPeak.length,scope:'anchor.peakIndex and ecology perPeak are SDF domain indices; added connection domains are not authored mountains.'},
      rejectedPriorPoseEvidence:{accepted:false,reason:'Actual first M4 shoulder image is a near-black occluding rock triangle; it does not verify the root.',
        path:'C:/Users/yun68/CodexTaskArtifacts/014-lijiang-m4/2026-10-26T03-40-58-099Z/mountain-primary-shoulder.png',
        position:[704.7679956246981,221.1182607014974,-181.88205319301804],target:[687.2360229492188,217.03310883107432,-180.2767588297526],
        scope:'Original evidence remains untouched. Changing the diagnostic camera does not turn the old image or the first M4 artwork into a pass.'}};
  })()`);
}
async function actualNavigationCheck(){
  const candidates=report.mountainAnchorEvidence?.navigationProbeCandidates;
  report.navigationEvidence=await call(`(()=>{
    const candidates=${JSON.stringify(candidates)},navigation=lijiangRaster.getNavigation?.();
    if(!navigation)return{status:'failed',reason:'Actual rock navigation unavailable'};
    const idle=candidates?.idle?.[0],crossing=candidates?.crossings?.[0];
    if(!idle||!crossing)return{status:'coverage-missing',reason:'No validated actual geometry fixture for '+(!idle?'below-H idle':'rock crossing'),candidates};
    const vector=a=>lijiangRaster.camera.position.clone().fromArray(a),cameraBefore=JSON.stringify(lijiangRaster.getState().camera);
    const eye=vector(idle.position),idleStarted=performance.now(),idleResolved=navigation.resolve(eye,eye),idleMilliseconds=performance.now()-idleStarted;
    const root=vector(crossing.anchor.position),normal=vector(crossing.normal),outside=vector(crossing.position),inside=root.clone().addScaledVector(normal,-6);
    const crossingStarted=performance.now(),blocked=navigation.resolve(outside,inside),crossingMilliseconds=performance.now()-crossingStarted;
    const clearance=blocked.clone().sub(root).dot(normal),cameraUnchanged=JSON.stringify(lijiangRaster.getState().camera)===cameraBefore;
    const idlePassed=idleResolved.distanceTo(eye)<1e-8,crossingPassed=clearance>=.70&&clearance<=.80&&blocked.distanceTo(inside)>6;
    return{status:idlePassed&&crossingPassed&&cameraUnchanged?'passed':'failed',checks:2,pureResolveOnly:true,cameraUnchanged,
      idle:{passed:idlePassed,fixture:idle,result:idleResolved.toArray(),milliseconds:idleMilliseconds},
      crossing:{passed:crossingPassed,fixture:crossing,desiredInside:inside.toArray(),result:blocked.toArray(),surfaceClearance:clearance,milliseconds:crossingMilliseconds},
      scope:'Actual scene geometry fixtures. Timings include CPU triangle ray work and are recorded without a fixed performance threshold. This check runs after every requested art capture.'};
  })()`);
  if(report.navigationEvidence.status==='passed')pass('actual-SDF-navigation-idle-below-H-and-rock-crossing-resolve',report.navigationEvidence);
  else{
    report.tests.push({name:'actual-SDF-navigation-idle-below-H-and-rock-crossing-resolve',passed:false,evidence:report.navigationEvidence});
    progress('actual-navigation-check-failed-after-art-captures');
    throw new Error('Actual navigation verification failed after art captures: '+JSON.stringify(report.navigationEvidence));
  }
}
// These helpers run only in this QA window's own scene realm. Motion uses the
// production tick/fence path; it never calls renderAt(), which resets flight.
async function motionFixtureInPage(poses,maxDistance=280){
  const a=lijiangRaster,navigation=a.getNavigation(),V=a.camera.position.constructor;
  const vector=p=>new V(...p),attempts=[];
  for(const pose of poses){
    const anchor=pose.source.anchor,root=vector(anchor.position),direction=vector(pose.position).sub(root).normalize();
    if(direction.dot(vector(anchor.normal))<=0){attempts.push({name:pose.name,reason:'Eye is not outside the root support plane'});continue;}
    const near=root.clone().addScaledVector(direction,35),far=root.clone().addScaledVector(direction,maxDistance);
    const began=performance.now(),wall=navigation.resolve(far,root.clone().addScaledVector(direction,-2));
    const wallError=wall.distanceTo(root.clone().addScaledVector(direction,.75));
    if(wallError>.05){attempts.push({name:pose.name,reason:'Another actual clipped rock occludes the radial root ray',wallError,milliseconds:performance.now()-began});continue;}
    // Validate both directions against the real movement resolver. This tests
    // lowland H only where it is rendered and keeps all actual SDF exclusions.
    const outward=Array.from({length:Math.round((maxDistance-35)/5)+1},(_,i)=>35+i*5);
    let previous=near.clone().addScaledVector(direction,-.01),invalid=null;
    for(const distance of [...outward,...outward.slice(0,-1).reverse()]){
      const desired=root.clone().addScaledVector(direction,distance);
      const resolved=navigation.resolve(previous,desired);
      if(resolved.distanceTo(desired)>.02){invalid={distance,desired:desired.toArray(),resolved:resolved.toArray()};break;}
      previous.copy(desired);
    }
    if(invalid){attempts.push({name:pose.name,reason:'Actual navigation obstructs the radial route',invalid,milliseconds:performance.now()-began});continue;}
    return{pose,root:root.toArray(),direction:direction.toArray(),near:near.toArray(),far:far.toArray(),endDistance:maxDistance,wallError,
      validationMilliseconds:performance.now()-began,attempts,scope:'Actual existing root/eye ray extended from 35 m through both real LOD thresholds (at least 280 m); real clipped-triangle movement validates every 5 m endpoint in both directions.'};
  }
  return{error:'No existing tree-root eye ray permits the complete actual 35–280–35 m route',attempts};
}
function motionClusterInPage(anchor){
  const group=lijiangRaster.scene.getObjectByName('Rooted mountain thickets / distant branch mantles');
  const expected=anchor.embeddedPosition||anchor.position;let closest=null;
  for(const mesh of group?.children||[]){
    if(!mesh.isInstancedMesh||mesh.name.startsWith('Mountain botanical'))continue;
    const attrs=mesh.geometry.attributes,lod=attrs.liCanopyLod;
    if(!attrs.liCanopyCenter||!lod&&!(attrs.liCanopyRadius&&attrs.liCanopyDetailCutoff&&attrs.liCanopyFarCutoff))continue;
    for(let i=0;i<mesh.count;i++){
      const m=mesh.instanceMatrix.array,offset=i*16,root=[m[offset+12],m[offset+13],m[offset+14]];
      const error=Math.hypot(...root.map((v,j)=>v-expected[j]));if(error>.3||closest&&error>=closest.rootError)continue;
      closest={mesh:mesh.name,instance:i,root,rootError:error,center:[attrs.liCanopyCenter.getX(i),attrs.liCanopyCenter.getY(i),attrs.liCanopyCenter.getZ(i)],
        boundRadius:lod?lod.getX(i):attrs.liCanopyRadius.getX(i),detailCutoff:lod?lod.getY(i):attrs.liCanopyDetailCutoff.getX(i),
        farCutoff:lod?lod.getZ(i):attrs.liCanopyFarCutoff.getX(i),attributeLayout:lod?'liCanopyLod: radius/detail/far/blade':'separate legacy scalar attributes',
        horizonCutoff:attrs.liCanopyTransition?.getX(i)??null,detailBlendHalfWidth:attrs.liCanopyTransition?.getY(i)??0,
        farBlendHalfWidth:attrs.liCanopyTransition?.getZ(i)??0,horizonBlendHalfWidth:attrs.liCanopyTransition?.getW(i)??0};
    }
  }
  return closest;
}
function rootInstancesInPage(anchor){
  const group=lijiangRaster.scene.getObjectByName('Rooted mountain thickets / distant branch mantles'),expected=anchor.embeddedPosition||anchor.position,instances=[];
  for(const mesh of group?.children||[]){
    if(!mesh.isInstancedMesh||!mesh.visible)continue;
    for(let i=0;i<mesh.count;i++){
      const m=mesh.instanceMatrix.array,o=i*16,error=Math.hypot(m[o+12]-expected[0],m[o+13]-expected[1],m[o+14]-expected[2]);
      if(error<.3)instances.push({mesh:mesh.name,instance:i,rootError:error,submittedMeshInstances:mesh.count,castShadow:mesh.castShadow});
    }
  }
  return instances;
}
function declaredLodBlend(cluster,distance){
  const smooth=(lo,hi,d)=>{if(hi<=lo)return d<lo?0:1;const t=Math.max(0,Math.min(1,(d-lo)/(hi-lo)));return t*t*(3-2*t);};
  const middle=smooth(cluster.detailCutoff-cluster.detailBlendHalfWidth,cluster.detailCutoff+cluster.detailBlendHalfWidth,distance);
  const horizon=Number.isFinite(cluster.horizonCutoff)?smooth(cluster.horizonCutoff-cluster.horizonBlendHalfWidth,cluster.horizonCutoff+cluster.horizonBlendHalfWidth,distance):0;
  return{individualLeaves:1-middle,middle:distance<cluster.farCutoff?middle:0,distant:distance>=cluster.farCutoff?1-horizon:0,horizon,
    scope:'Declared production shader weight formula evaluated from actual instance attributes. These are nominal alpha-hash proportions, not measured pixel coverage or proof of visual continuity.'};
}
async function completedMotionFrameInPage(spec){
  const a=lijiangRaster,wait=ms=>new Promise(r=>setTimeout(r,ms));a.suspend(true);
  while(a.getState().rendering)await wait(2);
  a.camera.position.fromArray(spec.position);a.camera.fov=42;a.camera.updateProjectionMatrix();a.camera.lookAt(...spec.target);a.camera.updateMatrixWorld(true);
  const before=a.getState().frames,began=performance.now();a.suspend(false);
  while(a.getState().frames<=before||a.getState().rendering){
    if(a.getState().error)throw new Error(a.getState().error);
    if(performance.now()-began>20000)throw new Error('Actual free-camera motion frame did not complete');
    await wait(2);
  }
  a.suspend(true);
  const s=a.getState(),c=s.mountainCanopy,gl=a.renderer.getContext();
  if(gl.isContextLost())throw new Error('Motion frame lost its actual WebGL context');
  const compact={camera:s.camera,frame:s.frames,completedFrames:s.frames-before,completedWaitMilliseconds:performance.now()-began,
    frameMilliseconds:s.frameMs,mode:s.mode,paused:s.paused,rendering:s.rendering,forest:{pending:s.forest?.pending,submittedTriangles:s.forest?.submittedTriangles},
    // Keep the actual renderer's scalar counters/configuration, including new
    // tiers, without assuming their names or replacing them with QA estimates.
    canopy:Object.fromEntries(Object.entries(c||{}).filter(([,v])=>v===null||['number','string','boolean'].includes(typeof v))),
    actualRender:{...a.renderer.info.render},contextLost:gl.isContextLost()};
  return{state:compact,data:document.querySelector('#scene').toDataURL('image/png')};
}
async function actualPageDriveInPage(spec){
  const a=lijiangRaster,wait=ms=>new Promise(r=>setTimeout(r,ms)),keys=['w','a','s','d'];
  const keyEvent=(type,key)=>window.dispatchEvent(new KeyboardEvent(type,{key,code:'Key'+key.toUpperCase(),bubbles:true,cancelable:true}));
  const copy=()=>{const s=a.getState();return{camera:s.camera,frames:s.frames,frameMilliseconds:s.frameMs,mode:s.mode,navigation:s.navigation};};
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  async function settled(){const start=performance.now();while(a.getState().rendering){if(performance.now()-start>20000)throw new Error('Input frame did not finish');await wait(2);}}
  const evidence={scope:'Synthetic KeyboardEvents in the task-owned hidden scene page exercise its existing key listeners and production freeMove. No OS keyboard, user tab, focus request or isTrusted claim.',keys:[]};
  try{
    a.suspend(true);await settled();a.seek(38);a.camera.position.fromArray(spec.position);a.camera.lookAt(...spec.target);a.camera.updateMatrixWorld(true);
    // The existing button sets yaw/pitch from the actual current quaternion.
    document.getElementById('mode').click();a.pause(true);a.suspend(false);
    if(a.getState().mode!=='free')throw new Error('Actual mode button did not enter free driving');
    evidence.button={id:'mode',mode:a.getState().mode};
    await wait(120);await settled();
    for(const key of keys){
      const before=copy(),forward=a.camera.getWorldDirection(a.camera.position.clone()).normalize(),right=a.camera.position.clone().set(1,0,0).applyQuaternion(a.camera.quaternion).normalize();
      const expected=key==='w'?forward:key==='s'?forward.negate():key==='d'?right:right.negate();
      const began=performance.now();keyEvent('keydown',key);
      try{await wait(180);}finally{keyEvent('keyup',key);}
      await settled();const released=copy();await wait(400);await settled();const stopped=copy();
      const delta=a.camera.position.clone().fromArray(released.camera.position).sub(a.camera.position.clone().fromArray(before.camera.position));
      const moved=delta.length(),directionDot=delta.dot(expected),offAxisDrift=delta.clone().addScaledVector(expected,-directionDot).length(),stableDrift=distance(released.camera.position,stopped.camera.position);
      const moves=(released.navigation?.moves??0)-(before.navigation?.moves??0);
      const passed=moved>.03&&moved<15&&directionDot>.02&&offAxisDrift<.02&&moves>0&&released.frames>before.frames&&stableDrift<1e-6;
      evidence.keys.push({key,before,released,stopped,moved,directionDot,verticalDelta:delta.y,offAxisDrift,navigationMoves:moves,stableDrift,milliseconds:performance.now()-began,passed});
    }
    // Run production freeMove with no keys at a validated point BELOW the
    // obsolete coarse-H floor, not only the pure resolver's stationary branch.
    a.suspend(true);await settled();a.camera.position.fromArray(spec.belowH.position);a.camera.updateMatrixWorld(true);a.suspend(false);
    const before=copy();await wait(500);await settled();const after=copy(),drift=distance(before.camera.position,after.camera.position);
    evidence.idleBelowH={before,after,coarseH:spec.belowH.coarseH,drift,passed:drift<1e-6};
    evidence.passed=evidence.keys.every(k=>k.passed)&&evidence.idleBelowH.passed;
    return evidence;
  }finally{for(const key of keys)keyEvent('keyup',key);a.suspend(true);}
}
async function actualFreeMotion(){
  const directory=path.join(output,'motion');fs.mkdirSync(directory,{recursive:true});
  const evidence={status:'running',artAccepted:false,path:path.join(directory,'motion.json'),frames:[],input:null,
    scope:'Actual production free-camera tick and GPU-completed canvas frames, along one fixed real root ray. Coverage counts are functional evidence only; silhouettes, LOD and shadow continuity require independent sequence review.'};
  report.freeMotion=evidence;
  const persist=()=>fs.writeFileSync(evidence.path,JSON.stringify(evidence,null,2));
  const priority=['mountain-primary-shoulder','mountain-primary-slope-root','mountain-primary-upper-root','mountain-secondary-peak-root'];
  const candidates=report.mountainAnchorEvidence.poses.filter(p=>p.source?.anchor?.kind==='mountain-tree').sort((a,b)=>priority.indexOf(a.name)-priority.indexOf(b.name));
  try{
    progress('actual-free-motion-fixture');
    const rejected=[];let fixture=null,cluster=null;
    for(const candidate of candidates){
      let trial=await call(`(${motionFixtureInPage.toString()})(${JSON.stringify([candidate])})`);
      if(trial.error){rejected.push(trial);continue;}
      await call(`(()=>{const a=lijiangRaster;a.seek(38);if(a.getState().mode!=='free')a.toggleMode();a.pause(true);a.suspend(false);a.setClean(true);
        a.camera.position.fromArray(${JSON.stringify(candidate.position)});a.camera.fov=42;a.camera.updateProjectionMatrix();a.camera.lookAt(...${JSON.stringify(candidate.target)});a.camera.updateMatrixWorld(true);return true;})()`);
      await wait('Motion actual root cluster loads',isIdle);
      const actual=await call(`(${motionClusterInPage.toString()})(${JSON.stringify(candidate.source.anchor)})`);
      if(!actual){rejected.push({name:candidate.name,reason:'Actual rendered cluster attributes do not contain the selected root'});continue;}
      const nearDistance=d=>{const p=trial.root.map((v,i)=>v+trial.direction[i]*d),c=actual.center;return Math.max(0,Math.min(Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]),Math.hypot(p[0]-c[0],p[1]+c[1],p[2]-c[2]))-actual.boundRadius);};
      if(!(nearDistance(35)<actual.detailCutoff)){
        rejected.push({name:candidate.name,reason:'35 m root route does not reach actual individual-leaf detail',actual,nearDistance:nearDistance(35)});continue;
      }
      if(nearDistance(280)<=actual.farCutoff+.8){
        const rootToCenter=Math.hypot(...trial.root.map((v,i)=>v-actual.center[i]));
        const extendedEnd=Math.ceil((actual.farCutoff+actual.boundRadius+rootToCenter+10)/5)*5;
        const extended=await call(`(${motionFixtureInPage.toString()})(${JSON.stringify([candidate])},${extendedEnd})`);
        if(extended.error){rejected.push({name:candidate.name,reason:'Actual far threshold requires a longer route that is obstructed',actual,extended});continue;}
        trial=extended;
      }
      fixture=trial;cluster=actual;break;
    }
    evidence.rejectedFixtures=rejected;assert(fixture&&cluster,'No actual navigable tree-root route crosses both existing LOD thresholds');
    evidence.fixture=fixture;evidence.cluster=cluster;
    const position=d=>fixture.root.map((v,i)=>v+fixture.direction[i]*d);
    const nearDistance=d=>{const p=position(d),c=cluster.center;return Math.max(0,Math.min(Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]),Math.hypot(p[0]-c[0],p[1]+c[1],p[2]-c[2]))-cluster.boundRadius);};
    const cutoffDistance=cutoff=>{let lo=35,hi=fixture.endDistance;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(nearDistance(mid)<cutoff)lo=mid;else hi=mid;}return(lo+hi)/2;};
    const detailAt=cutoffDistance(cluster.detailCutoff),farAt=cutoffDistance(cluster.farCutoff);
    evidence.cutoffRootDistances={detail:detailAt,far:farAt};
    const edge=[detailAt-.75,detailAt+.75,farAt-.75,farAt+.75];
    const distances=[...new Set([...Array.from({length:Math.round((fixture.endDistance-35)/5)+1},(_,i)=>35+i*5),...edge].map(v=>Number(v.toFixed(6))))].sort((a,b)=>a-b);
    const route=[...distances.map(distance=>({distance,direction:'out'})),...distances.slice(0,-1).reverse().map(distance=>({distance,direction:'back'}))];
    const keyDistances={out:[35,edge[0],edge[1],140,edge[2],edge[3],fixture.endDistance],back:[edge[3],edge[2],edge[1],edge[0],35]};
    const keyImages=[];let priorFrame=null;
    for(let index=0;index<route.length;index++){
      const step=route[index],spec={position:position(step.distance),target:cluster.center};
      const result=await call(`(${completedMotionFrameInPage.toString()})(${JSON.stringify(spec)})`,30000);
      const image=nativeImage.createFromDataURL(result.data),size=image.getSize(),bytes=image.toPNG();
      const name='frame-'+String(index).padStart(3,'0')+'-'+step.direction+'-'+step.distance.toFixed(3)+'m',file=path.join(directory,name+'.png');
      fs.writeFileSync(file,bytes);
      const state=result.state,c=state.canopy,allCovered=c.visibleClusters===c.candidateClusters&&c.omittedByBudget===0;
      const drift=Math.hypot(...state.camera.position.map((v,i)=>v-spec.position[i]));
      const frame={index,...step,path:file,sha256:sha(bytes),...size,state,allCovered,cameraDrift:drift,
        targetNearDistance:nearDistance(step.distance),targetNominalTier:nearDistance(step.distance)<cluster.detailCutoff?'individual-leaves':nearDistance(step.distance)<cluster.farCutoff?'middle':'distant',
        targetDeclaredBlend:declaredLodBlend(cluster,nearDistance(step.distance)),
        tierScope:'Nominal cutoff classification only. A production blend band may render contributions from adjacent representations; this is not a claim of a single active tier.'};
      frame.checks={nonempty:!image.isEmpty()&&size.width>0&&size.height>0,allCovered,
        completedAtPose:state.mode==='free'&&state.completedFrames>=1&&!state.rendering&&drift<1e-5,
        advanced:priorFrame===null||state.frame>priorFrame};frame.passed=Object.values(frame.checks).every(Boolean);
      evidence.frames.push(frame);persist();priorFrame=state.frame;
      if(keyDistances[step.direction].some(d=>Math.abs(d-step.distance)<1e-5))keyImages.push({name:step.direction+' '+step.distance.toFixed(2)+'m / nominal '+frame.targetNominalTier,data:result.data});
      if(index%15===0)progress('actual-free-motion-'+index+'-of-'+route.length);
    }
    evidence.contactSheet=await contactSheet(keyImages,{filename:'motion-key-contact-sheet.png',columns:3,tileHeight:300});
    evidence.keyImageCount=keyImages.length;
    const frameTimes=evidence.frames.map(f=>f.state.frameMilliseconds),waitTimes=evidence.frames.map(f=>f.state.completedWaitMilliseconds);
    evidence.summary={frames:evidence.frames.length,allCovered:evidence.frames.every(f=>f.allCovered),gpuCompletedFrames:evidence.frames.reduce((sum,f)=>sum+f.state.completedFrames,0),
      meanFrameMilliseconds:frameTimes.reduce((sum,n)=>sum+n,0)/frameTimes.length,maxFrameMilliseconds:Math.max(...frameTimes),
      meanCompletedWaitMilliseconds:waitTimes.reduce((sum,n)=>sum+n,0)/waitTimes.length,maxCompletedWaitMilliseconds:Math.max(...waitTimes),
      detailPlantRange:[Math.min(...evidence.frames.map(f=>f.state.canopy.detailPlants)),Math.max(...evidence.frames.map(f=>f.state.canopy.detailPlants))]};
    persist();progress('actual-hidden-page-driving');
    evidence.input=await call(`(${actualPageDriveInPage.toString()})(${JSON.stringify({position:position(35),target:cluster.center,belowH:report.navigationEvidence.idle.fixture})})`,30000);
    persist();
    assert(evidence.frames.every(f=>f.passed),'Actual free-motion frame/coverage checks failed; complete sequence retained in '+evidence.path);
    assert(keyImages.length===12,'Motion must retain all 12 distance/threshold/direction key images');
    assert(evidence.input.passed,'Actual hidden page driving, key release or idle below coarse H failed');
    evidence.status='passed';persist();
    pass('actual-free-motion-both-LOD-thresholds-covered-with-completed-frames',{path:evidence.path,summary:evidence.summary,cutoffRootDistances:evidence.cutoffRootDistances,keyImages:evidence.keyImageCount,
      scope:'Functional sequence captured; art and shadow continuity remain subject to actual image review.'});
    pass('actual-hidden-page-mode-button-WASD-key-release-and-idle-below-H',{path:evidence.path,input:evidence.input});
  }catch(error){evidence.status='failed';evidence.error=String(error.stack||error);persist();report.tests.push({name:'actual-free-motion-and-hidden-page-driving',passed:false,evidence:{path:evidence.path,error:evidence.error}});throw error;}
  finally{await call(`(()=>{for(const key of ['w','a','s','d'])dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));lijiangRaster.suspend(false);return true;})()`).catch(()=>{});}
}
async function actualHorizonTransition(){
  const directory=path.join(output,'horizon');fs.mkdirSync(directory,{recursive:true});
  const evidence={status:'running',artAccepted:false,path:path.join(directory,'horizon.json'),frames:[],attempts:[],
    scope:'Nine actual GPU-completed views span the selected real member horizon cutoff and full blend band. Actual root-ray navigation and mesh instances are recorded. No colour metric or count automatically certifies disappearance-free visual blending.'};
  report.horizonTransition=evidence;const persist=()=>fs.writeFileSync(evidence.path,JSON.stringify(evidence,null,2));
  try{
    progress('actual-horizon-fixture');
    const preferred=report.freeMotion.fixture.pose.name;
    const candidates=report.mountainAnchorEvidence.poses.filter(p=>p.source?.anchor?.kind==='mountain-tree')
      .sort((a,b)=>(a.name===preferred?-1:0)-(b.name===preferred?-1:0));
    let fixture=null,cluster=null;
    for(const candidate of candidates){
      await call(`(()=>{const a=lijiangRaster;a.seek(38);if(a.getState().mode!=='free')a.toggleMode();a.pause(true);a.suspend(false);a.setClean(true);
        a.camera.position.fromArray(${JSON.stringify(candidate.position)});a.camera.fov=42;a.camera.updateProjectionMatrix();a.camera.lookAt(...${JSON.stringify(candidate.target)});a.camera.updateMatrixWorld(true);return true;})()`);
      await wait('Horizon actual root cluster loads',isIdle);
      const actual=await call(`(${motionClusterInPage.toString()})(${JSON.stringify(candidate.source.anchor)})`);
      if(!actual||!Number.isFinite(actual.horizonCutoff)||!(actual.horizonBlendHalfWidth>0)){
        evidence.attempts.push({name:candidate.name,reason:'Actual instance horizon cutoff/band attributes unavailable',actual});continue;
      }
      const root=candidate.source.anchor.position,rootToCenter=Math.hypot(...root.map((v,i)=>v-actual.center[i]));
      const maxDistance=Math.ceil((actual.horizonCutoff+actual.horizonBlendHalfWidth*1.3+actual.boundRadius+rootToCenter+10)/5)*5;
      const trial=await call(`(${motionFixtureInPage.toString()})(${JSON.stringify([candidate])},${maxDistance})`);
      if(trial.error){evidence.attempts.push({name:candidate.name,reason:'Actual long root ray or movement route is obstructed',trial});continue;}
      fixture=trial;cluster=actual;break;
    }
    persist();assert(fixture&&cluster,'No real visible outside-rock adult-root ray reaches its actual horizon blend band');
    evidence.fixture=fixture;evidence.cluster=cluster;evidence.sameRootAsNearMotion=fixture.pose.name===preferred;
    const position=d=>fixture.root.map((v,i)=>v+fixture.direction[i]*d);
    const lodDistance=d=>{const p=position(d),c=cluster.center;return Math.max(0,Math.min(Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]),Math.hypot(p[0]-c[0],p[1]+c[1],p[2]-c[2]))-cluster.boundRadius);};
    const rootDistance=target=>{let lo=35,hi=fixture.endDistance;for(let i=0;i<42;i++){const mid=(lo+hi)/2;if(lodDistance(mid)<target)lo=mid;else hi=mid;}return(lo+hi)/2;};
    const band=cluster.horizonBlendHalfWidth,offsets=[-band*1.25,-band,-band*.5,-.75,0,.75,band*.5,band,band*1.25],images=[];
    evidence.shaderDistanceBand=[cluster.horizonCutoff-band,cluster.horizonCutoff+band];
    evidence.rootDistanceBand=evidence.shaderDistanceBand.map(rootDistance);let priorFrame=null;
    for(let index=0;index<offsets.length;index++){
      const desiredLodDistance=cluster.horizonCutoff+offsets[index],distance=rootDistance(desiredLodDistance),spec={position:position(distance),target:cluster.center};
      const result=await call(`(${completedMotionFrameInPage.toString()})(${JSON.stringify(spec)})`,30000);
      const instances=await call(`(${rootInstancesInPage.toString()})(${JSON.stringify(fixture.pose.source.anchor)})`);
      const image=nativeImage.createFromDataURL(result.data),size=image.getSize(),bytes=image.toPNG(),name='horizon-'+String(index).padStart(2,'0')+'-'+distance.toFixed(3)+'m',file=path.join(directory,name+'.png');fs.writeFileSync(file,bytes);
      const state=result.state,c=state.canopy,drift=Math.hypot(...state.camera.position.map((v,i)=>v-spec.position[i]));
      const item={index,path:file,sha256:sha(bytes),...size,rootDistance:distance,targetNearDistance:lodDistance(distance),offsetFromActualCutoff:offsets[index],
        targetDeclaredBlend:declaredLodBlend(cluster,lodDistance(distance)),actualRootInstances:instances,state,cameraDrift:drift};
      item.checks={nonempty:!image.isEmpty()&&size.width>0&&size.height>0,allCovered:c.visibleClusters===c.candidateClusters&&c.omittedByBudget===0,
        actualRootSubmitted:instances.length>0,completedAtPose:state.mode==='free'&&state.completedFrames>=1&&!state.rendering&&drift<1e-5,
        advanced:priorFrame===null||state.frame>priorFrame,actualDistanceReached:Math.abs(item.targetNearDistance-desiredLodDistance)<1e-5};
      item.passed=Object.values(item.checks).every(Boolean);evidence.frames.push(item);persist();priorFrame=state.frame;
      images.push({name:'horizon '+(offsets[index]>=0?'+':'')+offsets[index].toFixed(2)+'m / root '+distance.toFixed(1)+'m',data:result.data});
    }
    evidence.contactSheet=await contactSheet(images,{filename:'horizon-key-contact-sheet.png',columns:3,tileHeight:300});
    evidence.visualContinuityVerdict='pending-independent-actual-frame-review';
    evidence.summary={frames:evidence.frames.length,allCovered:evidence.frames.every(f=>f.checks.allCovered),allRootsSubmitted:evidence.frames.every(f=>f.checks.actualRootSubmitted),
      meanFrameMilliseconds:evidence.frames.reduce((sum,f)=>sum+f.state.frameMilliseconds,0)/evidence.frames.length,
      maxFrameMilliseconds:Math.max(...evidence.frames.map(f=>f.state.frameMilliseconds))};persist();
    assert(evidence.frames.length===9&&evidence.frames.every(f=>f.passed),'Horizon functional/frame checks failed; all nine actual evidence frames retained');
    evidence.status='passed';persist();pass('actual-visible-horizon-root-nine-band-and-centre-views-with-completed-frames',{path:evidence.path,summary:evidence.summary,sameRootAsNearMotion:evidence.sameRootAsNearMotion,
      scope:'Functional coverage and evidence only; visual blend continuity is not automatically passed.'});
  }catch(error){evidence.status='failed';evidence.error=String(error.stack||error);persist();report.tests.push({name:'actual-visible-horizon-root-nine-band-and-centre-views-with-completed-frames',passed:false,evidence:{path:evidence.path,error:evidence.error}});throw error;}
  finally{await call('lijiangRaster.suspend(false);true').catch(()=>{});}
}
function recordMountainCoverage(){
  const names=['flight-00','flight-10','flight-25','flight-38','flight-45','primary-front','primary-back','primary-left','primary-right'];
  const captures=names.map(name=>{
    const item=report.captures.find(c=>c.name===name);assert(item,'Missing actual M6 mountain coverage capture: '+name);
    return{name:item.name,path:item.path,pixelSHA256:item.pixelSHA256,pose:item.pose,actualWorldState:item.state.world};
  });
  const closeups=report.captures.filter(c=>['actual-M6-SDF-mountain-anchor','actual-M6-same-plant-angular-view'].includes(c.pose?.source?.kind))
    .map(c=>({name:c.name,path:c.path,pixelSHA256:c.pixelSHA256,pose:c.pose,actualCamera:c.state.world.camera}));
  report.mountainVegetationEvidence={...report.mountainVegetationEvidence,status:'panorama-four-sides-seven-anchors-three-angular-and-seven-frozen-M5-views-recorded',
    path:path.join(output,'mountain-vegetation-coverage.json'),captures,comparisonBaseline,reviewCriteria:vegetationReviewCriteria,
    anchorCloseups:{pending:false,anchorCount:report.mountainAnchorEvidence.anchorCount,stats:report.mountainAnchorEvidence.stats,captures:closeups},
    scope:'Actual generated scene evidence and state only. No pixel colour ratio or successful capture automatically establishes mountain vegetation quality.'};
  fs.writeFileSync(report.mountainVegetationEvidence.path,JSON.stringify(report.mountainVegetationEvidence,null,2));
  pass('M6-panorama-and-primary-four-side-vegetation-evidence-recorded',{
    path:report.mountainVegetationEvidence.path,captures:names,anchorCloseups:report.mountainVegetationEvidence.anchorCloseups,
    scope:'Independent vegetation and art review remains required.'});
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
  const firstImage=nativeImage.createFromDataURL(first),secondImage=nativeImage.createFromDataURL(second),size=firstImage.getSize();
  const a=firstImage.toBitmap(),b=secondImage.toBitmap();
  assert(a.length===b.length&&a.length>0,'Relighting canvas dimensions differ');
  assert(size.width===secondImage.getSize().width&&size.height===secondImage.getSize().height,'Compared canvas dimensions differ');
  let total=0,changedPixels=0,alphaChangedPixels=0,maxAbsoluteChannelDifference=0,minX=size.width,minY=size.height,maxX=-1,maxY=-1;
  const histogram=Array(256).fill(0);
  for(let i=0;i<a.length;i+=4){
    let changed=false;
    for(let c=0;c<4;c++){
      const delta=Math.abs(a[i+c]-b[i+c]);histogram[delta]++;maxAbsoluteChannelDifference=Math.max(maxAbsoluteChannelDifference,delta);
      if(c<3)total+=delta;else if(delta)alphaChangedPixels++;
      if(delta)changed=true;
    }
    if(changed){const index=i/4,x=index%size.width,y=Math.floor(index/size.width);changedPixels++;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  }
  return {identical:a.equals(b),meanAbsoluteRGBDifference:total/(a.length/4*3),changedPixels,
    changedPixelRatio:changedPixels/(a.length/4),alphaChangedPixels,maxAbsoluteChannelDifference,
    changedPixelBounds:changedPixels?{minX,minY,maxX,maxY}:null,
    absoluteRGBAChannelDeltaHistogram:Object.fromEntries(histogram.map((count,delta)=>[delta,count]).filter(([,count])=>count))};
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
async function runFoliageDiagnosis(){
  const images=[],views=[];
  report.foliageIsolation={status:'running',artAccepted:false,fullFunctionalAcceptance:false,
    scope:'Same actual scene and camera; only the two named foliage groups change visibility. Direct renderer.render plus gl.finish while suspended; no seek or renderAt between variants. Existing baked/static shadows remain unchanged.',
    groupNames:{canopy:'Rooted mountain thickets / distant branch mantles',forest:'Li River · procedural broadleaf forest'},views};
  report.mountainAnchorEvidence=await mountainPoses();
  const wanted=['mountain-highest-supported-pocket','mountain-primary-slope-root','mountain-primary-shoulder'];
  const poses=wanted.map(name=>{const pose=report.mountainAnchorEvidence.poses.find(p=>p.name===name);
    assert(pose,'Missing actual mountain foliage diagnostic pose: '+name);return pose;});
  for(const pose of [null,...poses]){
    const viewName=pose?pose.name:'flight-25';
    images.push({name:viewName,data:pose?await freeShot(pose):await flightShot(25)});
    const saved=await call(`(async()=>{const a=lijiangRaster,s=a.getState();a.suspend(true);
      while(a.getState().rendering)await new Promise(r=>setTimeout(r,5));
      const canopy=a.scene.getObjectByName('Rooted mountain thickets / distant branch mantles'),forest=a.scene.getObjectByName('Li River · procedural broadleaf forest');
      if(!canopy||!forest)throw new Error('Actual named mountain canopy/forest groups are unavailable');
      const camera=JSON.stringify({position:a.camera.position.toArray(),quaternion:a.camera.quaternion.toArray(),fov:a.camera.fov,aspect:a.camera.aspect});
      return {suspended:!!s.suspended,canopyVisible:canopy.visible,forestVisible:forest.visible,camera};})()`);
    assert(saved.canopyVisible&&saved.forestVisible,'Foliage diagnostic baseline must include both actual foliage groups');
    const view={name:viewName,pose:pose||{kind:'production-flight',time:25},baseline:viewName,saved,variants:[]};views.push(view);
    try{
      for(const variant of [{name:'canopy-off',canopy:false,forest:true},{name:'forest-off',canopy:true,forest:false},{name:'both-off',canopy:false,forest:false}]){
        const completed=await call(`(()=>{const a=lijiangRaster,gl=a.renderer.getContext();
          if(!a.getState().suspended||a.getState().rendering)throw new Error('Foliage isolation requires a suspended, completed scene');
          const camera=JSON.stringify({position:a.camera.position.toArray(),quaternion:a.camera.quaternion.toArray(),fov:a.camera.fov,aspect:a.camera.aspect});
          if(camera!==${JSON.stringify(saved.camera)})throw new Error('Foliage isolation camera changed');
          const canopy=a.scene.getObjectByName('Rooted mountain thickets / distant branch mantles'),forest=a.scene.getObjectByName('Li River · procedural broadleaf forest');
          canopy.visible=${variant.canopy};forest.visible=${variant.forest};
          const began=performance.now();a.renderer.render(a.scene,a.camera);gl.finish();
          if(gl.isContextLost())throw new Error('Foliage isolation lost the actual WebGL context');
          return {completed:true,milliseconds:performance.now()-began,camera,canopyVisible:canopy.visible,forestVisible:forest.visible};})()`);
        const name=viewName+'-'+variant.name;images.push({name,data:await capture(name,{...view.pose,diagnosticVariant:variant.name})});
        view.variants.push({name,...completed});
      }
    }finally{
      view.restored=await call(`(()=>{const a=lijiangRaster,canopy=a.scene.getObjectByName('Rooted mountain thickets / distant branch mantles'),forest=a.scene.getObjectByName('Li River · procedural broadleaf forest');
        canopy.visible=${saved.canopyVisible};forest.visible=${saved.forestVisible};
        const gl=a.renderer.getContext();if(!gl.isContextLost()){a.renderer.render(a.scene,a.camera);gl.finish();}
        a.suspend(${saved.suspended});return{canopyVisible:canopy.visible,forestVisible:forest.visible,contextLost:gl.isContextLost()};})()`);
      assert(view.restored.canopyVisible===saved.canopyVisible&&view.restored.forestVisible===saved.forestVisible,
        'Foliage isolation did not restore the exact original group visibility');
    }
  }
  await contactSheet(images);
  report.foliageIsolation.status='completed';
  report.foliageIsolation.path=path.join(output,'foliage-isolation.json');
  fs.writeFileSync(report.foliageIsolation.path,JSON.stringify(report.foliageIsolation,null,2));
  pass('diagnostic-only-four-actual-views-with-same-camera-canopy-off-forest-off-both-off',report.foliageIsolation);
}
async function perfOnlyTiming(){
  await flightShot(45);
  progress('actual-performance-only-eight-frames');
  report.perfOnlyTiming=await call(`(async()=>{
    const a=lijiangRaster,renderer=a.renderer,gl=renderer.getContext(),info=renderer.info,savedState=a.getState();
    const originalRender=renderer.render,originalFenceSync=gl.fenceSync;
    const renderDescriptor=Object.getOwnPropertyDescriptor(renderer,'render'),fenceDescriptor=Object.getOwnPropertyDescriptor(gl,'fenceSync');
    const savedAutoReset=info.autoReset,result={view:{kind:'production-flight',time:45},sampleCount:8,samples:[],
      scope:'Directly follows actual generation and one move to the original flight-45 camera. No free-camera, sun, continuous-flight, export or component variants run. Submission is wall time inside synchronous renderer.render, including possible driver stalls; fence-to-resolution includes completion polling and is not an isolated GPU hardware timer.',
      rendererInfoScope:'autoReset=false with one explicit reset per sample includes nested planar-reflection render calls and triangles. Mesh visibility counts use object/ancestor flags, not camera-frustum or occlusion tests.'};
    let active=null,depth=0;
    function renderWrapper(...args){
      const began=performance.now(),outer=depth===0;depth++;
      try{return originalRender.apply(this,args);}
      finally{
        depth--;if(active){active.renderInvocationCount++;
          if(outer){active.cpuSubmissionMilliseconds+=performance.now()-began;active.submissionStartedAt=began;active.submissionCompletedAt=performance.now();}}
      }
    }
    function fenceWrapper(...args){
      const calledAt=performance.now(),fence=originalFenceSync.apply(this,args),createdAt=performance.now();
      if(active)active.fences.push({calledAt,createdAt,created:!!fence});return fence;
    }
    function meshCounts(){
      let total=0,visibleFlag=0,visibleThroughAncestors=0;
      a.scene.traverse(o=>{if(!o.isMesh)return;total++;if(o.visible)visibleFlag++;
        let node=o,visible=true;while(node){if(!node.visible){visible=false;break;}node=node.parent;}if(visible)visibleThroughAncestors++;});
      return{total,visibleFlag,visibleThroughAncestors};
    }
    function restoreMethod(object,key,descriptor,original){
      if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];
      if(object[key]!==original)throw new Error('PERF_ONLY did not restore original '+key+' identity');
    }
    try{
      a.suspend(true);while(a.getState().rendering)await new Promise(r=>setTimeout(r,10));
      renderer.render=renderWrapper;gl.fenceSync=fenceWrapper;
      if(renderer.render!==renderWrapper||gl.fenceSync!==fenceWrapper)throw new Error('PERF_ONLY timing methods could not be wrapped safely');
      info.autoReset=false;result.sceneBefore=meshCounts();
      for(let i=0;i<8;i++){
        info.reset();active={index:i,cpuSubmissionMilliseconds:0,renderInvocationCount:0,fences:[]};
        const sample=active,startedAt=performance.now(),framesBefore=a.getState().frames;
        await a.renderAt(45);const completedAt=performance.now();active=null;
        sample.totalMilliseconds=completedAt-startedAt;
        sample.preSubmissionMilliseconds=(sample.submissionStartedAt??startedAt)-startedAt;
        sample.postSubmissionToResolvedMilliseconds=completedAt-(sample.submissionCompletedAt??startedAt);
        sample.fences=sample.fences.map(f=>({...f,createdToResolvedMilliseconds:completedAt-f.createdAt}));
        sample.rendererInfo={calls:info.render.calls,triangles:info.render.triangles,lines:info.render.lines,points:info.render.points,
          programCount:info.programs?.length??null};
        sample.completedFrames=a.getState().frames-framesBefore;
        if(sample.completedFrames!==1)throw new Error('PERF_ONLY sample did not complete exactly one isolated frame');
        if(!sample.fences.length)throw new Error('PERF_ONLY did not observe the existing GPU completion fence');
        result.samples.push(sample);await new Promise(r=>setTimeout(r,20));
      }
      result.meanMilliseconds=result.samples.slice(2).reduce((sum,s)=>sum+s.totalMilliseconds,0)/6;
      result.meanCPUSubmissionMilliseconds=result.samples.slice(2).reduce((sum,s)=>sum+s.cpuSubmissionMilliseconds,0)/6;
      result.meanFenceCreatedToResolvedMilliseconds=result.samples.slice(2).reduce((sum,s)=>sum+(s.fences.at(-1)?.createdToResolvedMilliseconds??0),0)/6;
      result.sceneAfter=meshCounts();result.state=a.getState();return result;
    }finally{
      active=null;
      // Restore inherited/own method shape as well as function identity.
      try{restoreMethod(renderer,'render',renderDescriptor,originalRender);}
      finally{try{restoreMethod(gl,'fenceSync',fenceDescriptor,originalFenceSync);}
        finally{info.autoReset=savedAutoReset;a.pause(savedState.paused);a.suspend(!!savedState.suspended);}}
      result.restored={rendererRender:renderer.render===originalRender,fenceSync:gl.fenceSync===originalFenceSync,
        renderOwnProperty:!!Object.getOwnPropertyDescriptor(renderer,'render')===!!renderDescriptor,
        fenceOwnProperty:!!Object.getOwnPropertyDescriptor(gl,'fenceSync')===!!fenceDescriptor,rendererInfoAutoReset:info.autoReset===savedAutoReset};
    }
  })()`,180000);
  report.frameTiming={samples:report.perfOnlyTiming.samples.map(sample=>sample.totalMilliseconds),
    meanMilliseconds:report.perfOnlyTiming.meanMilliseconds,state:report.perfOnlyTiming.state,
    scope:'PERF_ONLY direct-after-generation route; first two of eight samples excluded from the mean, matching the full-QA timing summary.'};
  report.perfOnlyTiming.path=path.join(output,'perf-only-timing.json');
  fs.writeFileSync(report.perfOnlyTiming.path,JSON.stringify(report.perfOnlyTiming,null,2));
  pass('performance-only-direct-generated-view45-eight-completed-frames',report.perfOnlyTiming);
}
async function componentTiming(){
  const sampleCount=focusMode?3:5;
  const original=await read();
  assert(original.world?.ready&&original.world.mode==='flight'&&original.world.time===45&&original.world.paused,
    'Component timing requires the existing paused default flight view at 45 seconds');
  report.componentTiming={enabled:true,status:'running',requiredForFunctionalQA:false,path:path.join(output,'component-timing.json'),view:{kind:'production-flight',time:45},samplesPerVariant:sampleCount,
    scope:'Owned hidden-window diagnostic data only. Each sample awaits the existing renderAt GPU fence and includes CPU submission. Temporarily hiding layers does not establish an optimization or an art-quality pass. First-sample shader/cache costs remain in the raw data.'};
  try{
    await call(`(async()=>{const a=lijiangRaster;a.suspend(true);while(a.getState().rendering)await new Promise(r=>setTimeout(r,10));
      a.prepareView(45);await a.renderAt(45);return true;})()`);
    const beforePixels=await capture('component-timing-before',{kind:'production-flight',time:45});
    const beforeCapture=report.captures[report.captures.length-1];
    progress('actual-GPU-component-timing');
    try{
      report.componentTiming.measurement=await call(`(async()=>{
        const a=lijiangRaster,scene=a.scene,renderer=a.renderer,savedState=a.getState(),sampleCount=${sampleCount};
        const forestName='Li River · procedural broadleaf forest',rockNames=['Native SDF surface with generated vertex lighting','Independent runtime-generated rock SDF pilot'],waterName='Li River · real reflected scene';
        const forests=[],canopies=[],rocks=[],waters=[],shadowObjects=[];
        scene.traverse(o=>{
          if(o.isGroup&&o.name===forestName)forests.push(o);
          if(o.isGroup&&o.name==='Rooted mountain thickets / distant branch mantles')canopies.push(o);
          if(o.isGroup&&rockNames.includes(o.name))rocks.push(o);
          if(o.isMesh&&o.name===waterName&&typeof o.getRenderTarget==='function'&&typeof o.onBeforeRender==='function')waters.push(o);
          if(o.isMesh)shadowObjects.push({object:o,castShadow:o.castShadow,receiveShadow:o.receiveShadow});
        });
        const visibility=[...forests,...canopies,...rocks].map(object=>({object,visible:object.visible}));
        const shadows={enabled:renderer.shadowMap.enabled,autoUpdate:renderer.shadowMap.autoUpdate,needsUpdate:renderer.shadowMap.needsUpdate};
        const water=waters.length===1?waters[0]:null,reflectionHandler=water?.onBeforeRender;
        const frozenReflection=function(){};
        const result={scope:'Exact-name scene groups only; full CPU and GPU work of renderAt is measured. Cached shadows, LOD updates and retained resources remain unless explicitly changed by the named variant.',
          identified:{forest:forests.map(o=>({name:o.name,uuid:o.uuid,visible:o.visible})),canopy:canopies.map(o=>({name:o.name,uuid:o.uuid,visible:o.visible})),rocks:rocks.map(o=>({name:o.name,uuid:o.uuid,visible:o.visible})),
            water:waters.map(o=>({name:o.name,uuid:o.uuid})),shadowObjectCount:shadowObjects.length},variants:[]};
        function restore(){
          for(const item of visibility)item.object.visible=item.visible;
          for(const item of shadowObjects){item.object.castShadow=item.castShadow;item.object.receiveShadow=item.receiveShadow;}
          renderer.shadowMap.enabled=shadows.enabled;renderer.shadowMap.autoUpdate=shadows.autoUpdate;
          // The fixed camera/time never invalidates the original shadow map.
          // Keep that cache intact instead of needlessly regenerating it after
          // the temporary visibility/shadow flags have changed.
          renderer.shadowMap.needsUpdate=shadows.needsUpdate;
          if(water)water.onBeforeRender=reflectionHandler;
        }
        const variants=[
          {name:'baseline',available:true,apply(){},change:'Full original view'},
          {name:'forest-hidden',available:forests.length===1,apply(){forests[0].visible=false;},change:'Only the exact named forest group is hidden; CPU forest updates still run'},
          {name:'mountain-canopy-hidden',available:canopies.length===1,apply(){canopies[0].visible=false;},change:'Only the exact named mountain canopy group is hidden; CPU population and update work remain'},
          {name:'rock-groups-hidden',available:rocks.length>0,apply(){for(const group of rocks)group.visible=false;},change:'Only exact named generated rock groups are hidden; terrain clipping is retained'},
          {name:'shadows-off',available:!!renderer.shadowMap,apply(){renderer.shadowMap.enabled=false;for(const item of shadowObjects){item.object.castShadow=false;item.object.receiveShadow=false;}},change:'Renderer shadows and mesh cast/receive flags temporarily disabled'},
          {name:'planar-reflection-frozen',available:!!water,apply(){water.onBeforeRender=frozenReflection;},change:'Only the identified Reflector callback is temporarily a no-op; the last original reflection texture remains visible'}
        ];
        try{
          a.suspend(true);while(a.getState().rendering)await new Promise(r=>setTimeout(r,10));
          for(const variant of variants){
            if(!variant.available){result.variants.push({name:variant.name,skipped:true,reason:'Required exact-name object could not be identified safely',change:variant.change});continue;}
            restore();await a.renderAt(45);variant.apply();
            const before=a.getState(),samples=[];
            for(let i=0;i<sampleCount;i++){
              const started=performance.now();await a.renderAt(45);samples.push(performance.now()-started);
              await new Promise(r=>setTimeout(r,20));
            }
            const after=a.getState(),ordered=samples.slice().sort((x,y)=>x-y);
            const item={name:variant.name,change:variant.change,samples,meanMilliseconds:samples.reduce((x,y)=>x+y,0)/sampleCount,
              medianMilliseconds:ordered[Math.floor(sampleCount/2)],meanExcludingFirstMilliseconds:samples.slice(1).reduce((x,y)=>x+y,0)/(sampleCount-1),
              completedFrames:after.frames-before.frames,reflectionFramesBefore:before.environment?.reflectionFrames??null,
              reflectionFramesAfter:after.environment?.reflectionFrames??null,
              forestTriangles:after.forest?.totalTriangles??null,rockCount:after.rocks?.count??null};
            if(item.completedFrames!==sampleCount)throw new Error('Component timing did not complete exactly '+sampleCount+' isolated frames: '+variant.name);
            if(variant.name==='planar-reflection-frozen'&&item.reflectionFramesBefore!==null&&item.reflectionFramesAfter!==item.reflectionFramesBefore)
              throw new Error('Identified planar reflection did not remain frozen');
            result.variants.push(item);
          }
          return result;
        }finally{
          restore();await a.renderAt(45);
          renderer.shadowMap.needsUpdate=shadows.needsUpdate;
          a.pause(savedState.paused);a.suspend(!!savedState.suspended);
          result.restored={visibility:visibility.every(item=>item.object.visible===item.visible),
            shadowFlags:shadowObjects.every(item=>item.object.castShadow===item.castShadow&&item.object.receiveShadow===item.receiveShadow),
            rendererShadowSettings:renderer.shadowMap.enabled===shadows.enabled&&renderer.shadowMap.autoUpdate===shadows.autoUpdate&&renderer.shadowMap.needsUpdate===shadows.needsUpdate,
            reflectionCallback:!water||water.onBeforeRender===reflectionHandler};
          if(Object.values(result.restored).some(value=>!value))throw new Error('Component timing temporary state did not restore exactly');
        }
      })()`,180000);
    }finally{
      const afterPixels=await capture('component-timing-after',{kind:'production-flight',time:45});
      const afterCapture=report.captures[report.captures.length-1];
      const difference=pixelDifference(beforePixels,afterPixels),tolerance={maxAbsoluteChannelDifference:1,maximumChangedPixelRatio:.001,alphaChangesAllowed:0};
      const acceptable=difference.identical||(difference.maxAbsoluteChannelDifference<=tolerance.maxAbsoluteChannelDifference
        &&difference.changedPixelRatio<tolerance.maximumChangedPixelRatio&&difference.alphaChangedPixels===0);
      report.componentTiming.restoration={before:beforeCapture.path,after:afterCapture.path,
        beforePixelSHA256:beforeCapture.pixelSHA256,afterPixelSHA256:afterCapture.pixelSHA256,
        pixelSHA256Equal:beforeCapture.pixelSHA256===afterCapture.pixelSHA256,
        encodedPNGSHA256Equal:beforeCapture.sha256===afterCapture.sha256,pixelDifference:difference,tolerance,acceptable,
        status:difference.identical?'pixel-identical':acceptable?'within-explicit-GPU-rounding-tolerance':'failed'};
      fs.writeFileSync(report.componentTiming.path,JSON.stringify(report.componentTiming,null,2));
      assert(acceptable,'Optional component timing image restoration exceeded its explicit GPU rounding tolerance');
    }
    report.componentTiming.status='passed';
    pass('optional-view45-component-timing-recorded-with-restoration-evidence',report.componentTiming);
  }finally{
    await call('lijiangRaster.pause('+JSON.stringify(original.world.paused)+');lijiangRaster.suspend('+JSON.stringify(!!original.world.suspended)+');lijiangRaster.setClean('+JSON.stringify(original.world.uiHidden)+');true');
  }
}
async function optionalComponentTiming(){
  if(!profileComponents)return;
  try{await componentTiming();}
  catch(error){
    report.componentTiming.status='failed';report.componentTiming.error=String(error.stack||error);
    report.tests.push({name:'optional-view45-component-timing-diagnostic',passed:false,required:false,
      diagnostic:true,evidence:report.componentTiming,
      scope:'Reported separately; this optional profile does not replace production-scene functional, disposal or source-preservation checks.'});
    progress('optional-component-timing-diagnostic-failed');
  }finally{
    if(report.componentTiming.path)fs.writeFileSync(report.componentTiming.path,JSON.stringify(report.componentTiming,null,2));
  }
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
    const result=await mediaProcess(process.env.LIJIANG_M6_FFPROBE||'ffprobe',probeArgs,'ffprobe-full-2700-frame-decode');
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
    await mediaProcess(process.env.LIJIANG_M6_FFMPEG||'ffmpeg',[
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
  const before=await wait('Before actual full-film export',isIdle),baseline=await capture('before-full-export');
  assert(before.world.iteration==='m6'&&!before.cache,'Full film export requires the actual owned uncached M6 realm');
  const timeout=Math.max(180000,Number(process.env.LIJIANG_M6_EXPORT_TIMEOUT_MS)||1200000);
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
  const file=path.join(output,'lijiang-m6-1920x1080-60fps-2700frames.webm'),fd=fs.openSync(file,'wx'),hash=crypto.createHash('sha256');
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
  await parentCall(`document.getElementById('guide').scrollIntoView({behavior:'instant',block:'start'});true`);
  await sleep(300);
  await parentCall(`document.querySelector('#lijiang iframe.world-frame').scrollIntoView({behavior:'instant',block:'center'});true`);
  const reloaded=await wait('Formal parent regenerates a new actual M6 document',s=>isIdle(s)&&s.world.iteration==='m6'
    &&s.parent?.child?.sameDocument===false&&s.parent.child.timeOrigin!==saved.parent.child.timeOrigin,1200000);
  assert(reloaded.parent.contextLost===true&&reloaded.parent.child.currentContextLost===false
    &&reloaded.parent.child.currentContextMatchesOriginal===false,'Reload did not replace the disposed original with a distinct live M6 context');
  report.parentReloaded=reloaded;
  await parentCall(`(()=>{const f=document.querySelector('#lijiang iframe.world-frame'),api=f.contentWindow.lijiangRaster;
    if(api.getState().iteration!=='m6')throw new Error('Reloaded realm is not M6');
    window.__m6ReloadQA={api,context:api.renderer.getContext(),document:f.contentDocument};return true;})()`);
  await capture('parent-reloaded-m6',{kind:'formal-parent-reload',iteration:'m6'});
  pass('production-parent-reloads-new-M6-document-after-original-context-release',{
    iteration:reloaded.world.iteration,child:reloaded.parent.child,originalContextLost:reloaded.parent.contextLost});
  await parentCall(`(async()=>{await worldHub.disposeAll();return true;})()`);
  const reloadRetired=await wait('Formal parent releases the reloaded M6 context',s=>s.parent?.reloadContextLost===true
    &&s.parent.contextLost===true&&s.parent.previews.every(f=>(!f.src||f.src==='about:blank')&&f.href==='about:blank'),60000);
  report.disposed={state:reloadRetired.parent.reloadRetiredWorld,contextLost:reloadRetired.parent.reloadContextLost,
    originalContextLost:reloadRetired.parent.contextLost,parent:reloadRetired.parent};
  assert(report.disposed.state?.phase==='disposed','Reloaded M6 did not finish its actual disposal path');
  pass('production-parent-reloaded-M6-context-disposes-and-unloads',report.disposed);
}
async function verifyPreservation(originalHashes,originalHealth){
  report.protectedM5Pinned=m6Contracts.verifyM5();
  assert(JSON.stringify(m5ProtectedFiles)===JSON.stringify(sourceFiles(m5ProtectedDirectory)),'Protected M5 inventory changed during M6 full QA');
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
  assert(JSON.stringify(m2Files)===JSON.stringify(sourceFiles(m2Directory)),'Protected M2 baseline file inventory changed during QA');
  assert(JSON.stringify(m3BaselineFiles)===JSON.stringify(sourceFiles(m3BaselineDirectory)),'Protected M3 40-file baseline inventory changed during M6 QA');
  verifyM4Baseline();
  assert(JSON.stringify(files)===JSON.stringify(sourceFiles(m6Directory)),'M6 source inventory changed after its QA source freeze');
  const finalM6Hashes=Object.fromEntries(files.map(name=>[name,sha(fs.readFileSync(path.join(m6Directory,name)))]));
  assert(files.every(name=>report.modules[name]===finalM6Hashes[name]),'M6 source bytes changed after its QA source freeze');
  if(parentMode)for(const [name,hash]of Object.entries(report.parentModules||{}))
    assert(sha(fs.readFileSync(path.join(PROJECT,'web',name)))===hash,'Formal parent source changed during M6 QA: '+name);
  report.sourceFreeze.verifiedUnchanged=true;
  fs.writeFileSync(report.sourceFreeze.manifest,JSON.stringify(report.sourceFreeze,null,2));
  pass('M6-source-freeze-pinned-M5-M4-43-M3-40-and-M2-34-file-baselines-preserved',{sourceFreeze:report.sourceFreeze,protectedBaseline:report.protectedBaseline});
  pass('original-source-A-B-bytes-and-bridge-process-identities-preserved',
    {hashes:originalHashes,initialBridges:originalHealth,finalBridges:report.finalBridgeHealth,
      sessionActivity:report.bridgeSessionObservations});
}
async function readVolumeDiagnosis(){
  return call(`({url:location.href,diagnosis:window.lijiangM3VolumeDiagnosis||null,
    load:document.getElementById('loadtxt')?.textContent||null,now:performance.now()})`);
}
async function volumeCleanupCall(code,timeout=60000){
  // Cleanup must remain available after a recorded shader/GPU error. It still
  // addresses only this harness's own hidden window and obeys its UI guard.
  policy();let timer;
  try{
    const value=await Promise.race([window.webContents.executeJavaScript(code,false),
      new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Native diagnostic cleanup timed out')),timeout))]);
    policy();return value;
  }finally{clearTimeout(timer);}
}
async function runVolumeDiagnosis(loadBegan,originalHashes,originalHealth){
  const file=path.join(output,'volume-diagnosis.json');
  const timeout=Math.max(60000,Number(process.env.LIJIANG_M6_VOLUME_DIAG_TIMEOUT_MS)||1200000);
  const deadline=Date.now()+timeout;let sample=null,logged=0,diagnosisError=null;
  report.volumeDiagnostic.path=file;
  try{
    while(Date.now()<deadline){
      sample=await readVolumeDiagnosis();
      if(sample.diagnosis?.error)throw new Error('Native volume diagnosis failed: '+String(sample.diagnosis.error));
      if(/^\s*Error:/i.test(sample.load||''))throw new Error('Native volume diagnosis load failure: '+sample.load);
      if(sample.diagnosis?.complete===true)break;
      if(Date.now()-logged>5000){progress('actual-native-volume-diagnostic',sample);logged=Date.now();}
      await sleep(150);
    }
    assert(sample?.diagnosis?.complete===true,'Native volume diagnosis timed out: '+JSON.stringify(sample));
    assert(Array.isArray(sample.diagnosis.comparisons),'Native volume diagnosis completed without comparison data');
    report.volumeDiagnostic.seconds=(Date.now()-loadBegan)/1000;
    report.volumeDiagnostic.data=sample.diagnosis;
    fs.writeFileSync(file,JSON.stringify(sample.diagnosis,null,2));
    report.volumeDiagnostic.sha256=sha(fs.readFileSync(file));
    pass('actual-native-volume-diagnostic-data-saved',{
      path:file,sha256:report.volumeDiagnostic.sha256,seconds:report.volumeDiagnostic.seconds,
      scope:'Raw reference/packed/pruned data only. This check does not judge prune equivalence, rendered scene quality or art acceptance.'});
  }catch(error){
    diagnosisError=error;report.volumeDiagnostic.error=String(error.stack||error);
    fs.writeFileSync(file,JSON.stringify({diagnosis:sample?.diagnosis||null,load:sample?.load||null,
      harnessError:report.volumeDiagnostic.error},null,2));
  }
  try{
    report.adapter=await volumeCleanupCall(`(()=>{const gl=document.getElementById('c')?.getContext('webgl2');
      if(!gl)throw new Error('Owned native diagnostic WebGL context unavailable');
      window.__m6VolumeGL=gl;const e=gl.getExtension('WEBGL_debug_renderer_info');
      return{renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
    const released=await volumeCleanupCall(`(async()=>{if(typeof window.lijiangNativeReleaseFields!=='function')throw new Error('Native diagnostic releaseFields is unavailable');
      return await window.lijiangNativeReleaseFields();})()`);
    const releaseDeadline=Date.now()+30000;let contextLost=false;
    while(Date.now()<releaseDeadline){
      contextLost=await volumeCleanupCall('window.__m6VolumeGL.isContextLost()');if(contextLost)break;await sleep(50);
    }
    report.disposed={kind:'native-volume-diagnostic',released,contextLost};
    assert(contextLost,'Actual native diagnostic GL context was not released');
    pass('own-native-volume-diagnostic-context-released',report.disposed);
  }finally{
    await window.loadURL('about:blank');policy();
    assert(window.webContents.getURL()==='about:blank','Own native diagnostic page did not unload');
    await verifyPreservation(originalHashes,originalHealth);
  }
  if(diagnosisError)throw diagnosisError;
  report.status='passed';
}
async function runFocusedRegression(){
  const images=[],failures=[];
  report.focusedRegression={status:'running',skipped:['107-frame-near-LOD-route','9-frame-horizon-route','sun-roundtrip','45-second-continuous-flight','film-export','parent-lifecycle'],
    scope:'Focused regression evidence from the actual complete scene. Independent image review remains required; this is not full acceptance.'};
  progress('focused-full-scene-key-captures');
  for(const t of [0,10,25,38,45])images.push({name:'flight-'+t,data:await flightShot(t)});
  const retained=await freePoses(),sides=retained.filter(p=>['primary-left','primary-right'].includes(p.name));
  assert(sides.length===2,'Focused regression requires both primary side views');
  const manifest=JSON.parse(fs.readFileSync(path.join(m6Directory,'engine-preview.manifest.json'),'utf8'));
  const groups=(manifest.landscape?.previewViews||[]).map(p=>({...p,name:'group-'+p.name,
    source:{kind:'fixed-M6-group-view-on-full-scene',manifest:'engine-preview.manifest.json',
      scope:'Fixed group camera applied to the complete generated scene, without preview filtering.'}}));
  assert(groups.length===6&&groups.every(p=>p.position?.length===3&&p.target?.length===3),'Focused regression requires six actual manifest group cameras');
  report.derivedPoses=[...sides,...groups];
  // Get panoramas and connecting-ground evidence before any close-up fixture
  // search, so an unavailable root cannot suppress the seam regression views.
  for(const pose of report.derivedPoses)images.push({name:pose.name,data:await freeShot(pose)});
  try{
    report.mountainAnchorEvidence=await mountainPoses();
    const closeups=report.mountainAnchorEvidence.poses.filter(p=>p.name==='mountain-primary-slope-root'||p.name.startsWith('mountain-same-cliff-'));
    assert(closeups.length===4,'Focused regression requires slope root and three same-plant angles');
    report.derivedPoses.push(...closeups);
    for(const pose of closeups)images.push({name:pose.name,data:await freeShot(pose)});
  }catch(error){failures.push({phase:'focused-closeup-fixtures',error:String(error.stack||error)});progress('focused-closeup-fixture-failed-evidence-retained');}
  await contactSheet(images,{filename:'focused-contact-sheet.png',columns:3,tileHeight:360});
  report.focusedRegression.captures=report.captures.map(c=>({name:c.name,path:c.path,pose:c.pose,pixelSHA256:c.pixelSHA256}));
  if(report.mountainAnchorEvidence){
    try{
      await actualNavigationCheck();
      const position=groups[0].position,target=groups[0].target,belowH=report.navigationEvidence.idle.fixture;
      report.focusedRegression.input=await call(`(${actualPageDriveInPage.toString()})(${JSON.stringify({position,target,belowH})})`,30000);
      assert(report.focusedRegression.input.passed,'Focused actual page WASD/release/below-H idle checks failed');
      pass('focused-own-page-WASD-release-and-below-H-idle',report.focusedRegression.input);
    }catch(error){failures.push({phase:'focused-navigation',error:String(error.stack||error)});progress('focused-navigation-failed-evidence-retained');}
  }
  await call('lijiangRaster.prepareView(45);lijiangRaster.suspend(false);true');
  await wait('Focused paused view45 ready for component timing',isIdle);
  await optionalComponentTiming();
  report.focusedRegression.failures=failures;
  report.focusedRegression.status=failures.length?'failed':'passed';
  fs.writeFileSync(path.join(output,'focused-regression.json'),JSON.stringify(report.focusedRegression,null,2));
  assert(!failures.length,'Focused fixtures/navigation failed after visual and component evidence: '+JSON.stringify(failures));
  pass('focused-five-flight-two-side-four-root-and-six-group-views',{
    captures:report.focusedRegression.captures,domainCoverage:report.domainCoverage,
    scope:report.focusedRegression.scope,skipped:report.focusedRegression.skipped});
}
async function run() {
  assert(!useCache,'M6 acceptance requires actual generation without QA caches');
  const originalHashes = hashProtected(), originalHealth = await bridgeHealth();
  try{
  const sourceOutput=path.join(output,'source');fs.mkdirSync(sourceOutput,{recursive:true});
  report.moduleArtifacts={};
  report.modules = Object.fromEntries(files.map(name => {
    const bytes=fs.readFileSync(path.join(PROJECT,'web/lijiang-m6',name));
    const destination=path.join(sourceOutput,name);fs.writeFileSync(destination,bytes);
    report.moduleArtifacts[name]=destination;return[name,sha(bytes)];
  }));
  report.sourceFreeze={directory:m6Directory,fileCount:files.length,files:files.slice(),sha256:{...report.modules},
    manifest:path.join(sourceOutput,'source-freeze-manifest.json'),
    scope:'All current M6 source files copied before loading. Inventory and bytes are checked again after this run.'};
  report.protectedBaseline={m2Directory,m2FileCount:m2Files.length,m2Files:m2Files.slice(),
    m3Directory:m3BaselineDirectory,m3FileCount:m3BaselineFiles.length,m3Files:m3BaselineFiles.slice(),
    m4Directory:m4BaselineDirectory,m4FileCount:m4BaselineFiles.length,m4Files:m4BaselineFiles.slice(),m4Manifest:m4BaselineManifestPath,
    m5Directory:m5ProtectedDirectory,m5FileCount:m5ProtectedFiles.length,m5Files:m5ProtectedFiles.slice(),m5Pinned:protectedM5Pinned,
    otherEntryFileCount:protectedFiles.length-m2Files.length-m3BaselineFiles.length-m4BaselineFiles.length-m5ProtectedFiles.length,sha256:originalHashes};
  fs.writeFileSync(report.sourceFreeze.manifest,JSON.stringify(report.sourceFreeze,null,2));
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
  const entry = new URL('http://127.0.0.1:8796/projects/014-programmable-worlds/web/'+(volumeDiagnostic?'lijiang-m6/engine.html':parentMode?'index.html':'lijiang-m6/raster.html'));
  if(volumeDiagnostic){entry.searchParams.set('fieldsonly','1');entry.searchParams.set('diagnoseVolume','1');entry.searchParams.set('qa','1');}
  else if(!parentMode){entry.searchParams.set('surface', '1'); entry.searchParams.set('material', '1'); entry.searchParams.set('qa', '1');}
  else{entry.hash='lijiang';entry.searchParams.set('qa','1');}
  entry.searchParams.set('revision', process.env.LIJIANG_M6_REVISION || '20261026-m6');
  if (useCache) entry.searchParams.set('qaFields', '1');
  report.entry = entry.href; report.initialBridgeHealth = originalHealth;
  window = new BrowserWindow({ width, height, useContentSize: true, show: false, focusable: false,
    skipTaskbar: true, paintWhenInitiallyHidden: true, backgroundColor: '#071b1b',
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, devTools: false, backgroundThrottling: false,
      partition: 'persist:lijiang-m6-hidden-qa' } });
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
  if(volumeDiagnostic)return runVolumeDiagnosis(loadBegan,originalHashes,originalHealth);
  if(parentMode)await parentCall(`(()=>{const f=document.querySelector('#lijiang iframe.world-frame');
    if(!f)throw new Error('Actual production Li iframe is missing');f.scrollIntoView({behavior:'instant',block:'center'});return true;})()`);
  const firstOperable=await wait('first-operable-generated-M6-scene',s=>s.world?.ready,1200000);
  const firstOperableObservedSeconds=(Date.now()-loadBegan)/1000;
  const ready = isIdle(firstOperable)?firstOperable:await wait('production-generated-scene-ready', isIdle, 1200000);
  report.loadSeconds = (Date.now() - loadBegan) / 1000; report.initial = ready;
  assert(ready.world.iteration==='m6'&&ready.world.preview!==true,'M6 full QA loaded a different iteration or a limited preview');
  report.actualPeakCount=await call('lijiangRasterFields.peakSpec.length');
  assert(report.actualPeakCount===76,'M6 full acceptance requires the actual complete 76-peak generator');
  report.domainCoverage=await call(`(async()=>{const f=lijiangRasterFields,s=lijiangRaster.getState(),{connectionPatchSpecs}=await import('./native-pilot-batch.js');
    const expected=connectionPatchSpecs(f.peakSpec,f.groupSpec),rocks=f.rocks||[],ecology=s.mountainEcology;
    const domains=rocks.map((r,domainIndex)=>({domainIndex,authoredPeakIndex:r.metadata?.connectionPatch?null:r.peakIndex,
      connectionPatch:!!(r.connectionPatch||r.metadata?.connectionPatch),centre:r.metadata.centre,clipEllipse:r.metadata.clipEllipse,
      ecology:ecology?.perPeak?.[domainIndex]||null}));
    const h=f.height,rect=f.rect,w=h.width||f.resolution,n=h.height||w,a=h.data,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
    const H=(x,z)=>{const u=clamp((x-rect[0])/rect[2]*w-.5,0,w-1),v=clamp((z-rect[1])/(rect[3]>1?rect[3]:rect[2])*n-.5,0,n-1),ix=Math.floor(u),iz=Math.floor(v),tx=u-ix,tz=v-iz,c=h.channels||1;
      const at=(x,z)=>a[(z*w+x)*c];return(at(ix,iz)*(1-tx)+at(Math.min(ix+1,w-1),iz)*tx)*(1-tz)+(at(ix,Math.min(iz+1,n-1))*(1-tx)+at(Math.min(ix+1,w-1),Math.min(iz+1,n-1))*tx)*tz;};
    const connections=(f.groupSpec?.connections||[]).map((e,index)=>{const x=.25*e.A[0]+.5*e.control[0]+.25*e.B[0],z=.25*e.A[1]+.5*e.control[1]+.25*e.B[1];
      const covering=domains.filter(d=>((x-d.centre[0])/d.clipEllipse[0])**2+((z-d.centre[1])/d.clipEllipse[1])**2<=1);
      return{index,id:e.id??null,point:[x,z],sampledH:H(x,z),coveringDomains:covering.map(d=>d.domainIndex),visibleDomainOwner:covering[0]?.domainIndex??null,
        scope:'Height-field value and actual SDF clip-footprint coverage only. This is not a substitute for rendered connecting-ground continuity.'};});
    return{authoredPeaks:f.peakSpec.length,expectedConnectionDomains:expected.length,expectedSdfDomains:f.peakSpec.length+expected.length,
      actualConnectionDomains:domains.filter(d=>d.connectionPatch).length,nativeSdfDomains:domains.length,renderedSdfDomains:s.rocks?.count,
      ecologyDomains:ecology?.perPeak?.length,runtimeEcologyPeakCount:ecology?.peakCount,domains,connections,
      scope:'Authored peaks remain 76. Native connection patches, rendered rock meshes and ecology rows count distinct SDF domains and may exceed 76.'};})()`);
  const domainCoverage=report.domainCoverage;
  assert(domainCoverage.actualConnectionDomains===domainCoverage.expectedConnectionDomains
    &&domainCoverage.nativeSdfDomains===domainCoverage.expectedSdfDomains
    &&domainCoverage.renderedSdfDomains===domainCoverage.nativeSdfDomains
    &&domainCoverage.ecologyDomains===domainCoverage.nativeSdfDomains,
    'M6 authored peaks / actual connection SDF domains / rendered meshes / ecology domain rows do not agree');
  assert(ready.world.loadTimings&&ready.world.generation,'M6 getState must expose loadTimings and generation');
  report.loadTimings=ready.world.loadTimings;report.generation=ready.world.generation;
  report.loadObservations={firstOperableObservedSeconds,fullSceneReadyObservedSeconds:report.loadSeconds,
    sameObservation:firstOperable===ready,firstOperableState:firstOperable.world,
    observationPollingMilliseconds:150,
    scope:'First operable means observed ready=true; full scene ready means paused, idle and no pending forest work. These may be the same observation in the current pipeline; these are polling observations, not invented separate stages.'};
  assert(ready.cache === useCache && ready.world.materialOnly, 'Unexpected field provenance or shading mode');
  assert(!ready.generatorPresent, 'Material-only scene retained its producer context');
  if(parentMode){assert(ready.parent.child.sameDocument&&!ready.parent.contextLost,'Production child document/context evidence missing');
    pass('actual-production-parent-loads-only-Li-live-iframe',{entry:entry.href,child:ready.url,previews:ready.parent.previews});}
  pass('actual-M6-production-generation-without-QA-cache',
    { seconds: report.loadSeconds, entry: entry.href, iteration:ready.world.iteration,generatorAbsent: true,
      loadTimings:report.loadTimings,generation:report.generation,observations:report.loadObservations });
  report.adapter = await call(`(()=>{const gl=lijiangRaster.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');
    window.__m6OriginalGL=gl;return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
  if(focusMode)await runFocusedRegression();
  else if(foliageDiagnostic)await runFoliageDiagnosis();
  else if(perfOnly)await perfOnlyTiming();
  else{
  const images = [];
  for (const t of [0, 10, 25, 38, 45]) images.push({ name: 'flight-' + t, data: await flightShot(t) });
  const retainedPoses = await freePoses();
  report.mountainAnchorEvidence=await mountainPoses();
  // Get the new mountain-root evidence first; retain every original art and
  // defect-regression camera afterwards. This changes scheduling, not coverage.
  report.derivedPoses=[...report.mountainAnchorEvidence.poses,...fixedM5MountainPoses,rejectedFirstM5RightPose,...retainedPoses];
  for (const pose of report.derivedPoses) images.push({ name: pose.name, data: await freeShot(pose) });
  if(process.env.LIJIANG_M6_ART_CHECKPOINT==='1'){
    const retained=JSON.parse(fs.readFileSync(path.join(__dirname,'lijiang-m6-crack-regressions.json'),'utf8'));
    for(const pose of retained)images.push({name:pose.name,data:await freeShot(pose)});
    report.exactRetainedCrackPoses=retained;
  }
  await contactSheet(images);
  if(process.env.LIJIANG_M6_ART_CHECKPOINT==='1'){
    await call('lijiangRaster.suspend(true);true');
    const decisionPath=path.join(output,'visual-review-decision.json');
    report.visualCheckpoint={status:'awaiting-root-image-review',decisionPath,scope:'Agent inspection of actual frozen-view images before spending time on full-film export; no user window or input.'};
    const deadline=Date.now()+600000;let announced=0;
    while(!fs.existsSync(decisionPath)){
      if(Date.now()>deadline)throw new Error('Actual-image review checkpoint timed out');
      if(Date.now()-announced>5000){progress('actual-images-await-root-review');announced=Date.now();}
      await sleep(250);
    }
    const decision=JSON.parse(fs.readFileSync(decisionPath,'utf8'));
    report.visualCheckpoint={...report.visualCheckpoint,status:decision.approved?'passed':'rejected',decision};
    assert(decision.approved===true,'Root actual-image review rejected this candidate');
    await call('lijiangRaster.suspend(false);true');
  }
  recordMountainCoverage();
  assert(report.derivedPoses.length===35,'M6 near-field evidence requires original17, actual7, frozenM5reference7, same-plant-angular3 and rejected-first-right1 poses');
  pass('five-flight-seventeen-retained-seven-current-seven-frozen-M5-three-angular-and-one-rejected-view-captures', { captures: report.captures.map(c => c.name),
    priorArtEvidence:report.priorArtEvidence,
    scope: 'Evidence produced for independent visual review; not an automatic art-quality pass.' });
  await actualNavigationCheck();
  await actualFreeMotion();
  await actualHorizonTransition();
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
  await optionalComponentTiming();
  }
  if(parentMode)await parentLifecycle();
  else{
    await call('lijiangRaster.dispose()'); report.disposed = await call('({state:lijiangRaster.getState(),contextLost:__m6OriginalGL.isContextLost()})');
    assert(report.disposed.contextLost && report.disposed.state.phase === 'disposed', 'Actual main GL context was not released');
  }
  await window.loadURL('about:blank'); policy();
  assert(window.webContents.getURL() === 'about:blank', 'Own QA page did not unload');
  pass('own-scene-disposes-context-and-unloads', report.disposed);
  report.status = 'passed';
  report.functionalStatus=focusMode?'focused-checks-passed-full-acceptance-not-run':foliageDiagnostic?'not-evaluated-diagnostic-only':'passed';
  }finally{
    // A diagnostic failure or a functional exception must not bypass the
    // protected baseline/source/bridge verification at the end of this run.
    if(!volumeDiagnostic)await verifyPreservation(originalHashes,originalHealth);
  }
}
app.whenReady().then(async () => {
  try { await run(); }
  catch (error) {
    report.status = 'failed'; report.errors.push(String(error.stack || error));
    if(!volumeDiagnostic)report.functionalStatus=foliageDiagnostic?'not-evaluated-diagnostic-failed':'failed';
    if(foliageDiagnostic&&report.foliageIsolation)report.foliageIsolation.status='failed';
    if (!volumeDiagnostic&&window && !window.isDestroyed()) try { await capture('failure'); } catch {}
  } finally {
    if (window && !window.isDestroyed()) {
      try { await window.webContents.executeJavaScript(volumeDiagnostic
        ? `(async()=>{await window.lijiangNativeReleaseFields?.();return true;})()`
        : `(async()=>{if(typeof window.worldHub?.disposeAll==='function')await window.worldHub.disposeAll();
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
