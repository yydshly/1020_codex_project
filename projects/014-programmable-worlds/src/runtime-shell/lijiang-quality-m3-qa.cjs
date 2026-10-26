'use strict';
// Standalone, task-owned hidden Electron QA. It never uses OS input, attaches
// to another browser, starts a server, or borrows an existing rendering window.
// Run via `node launch-lijiang-quality-m3-qa.cjs`. The pinned Electron is
// packaged: a loose .cjs argument is not an application entry. The launcher
// verifies resources/app/entry.cjs and uses its explicit --lijiang-quality-m3-qa
// dispatch; it refuses to fall through to the regular research hub.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, nativeImage } = require('electron');

const PROJECT = path.resolve(__dirname, '../..');
const ROOT = 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-m3';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(ROOT, runId);
const backend = process.env.LIJIANG_M3_BACKEND || 'd3d11';
const useCache = process.env.LIJIANG_M3_CACHE === '1';
const short = process.env.LIJIANG_M3_SHORT === '1';
const parentMode = process.env.LIJIANG_M3_PARENT === '1';
const fullExport = process.env.LIJIANG_M3_EXPORT === '1';
const volumeDiagnostic = process.env.LIJIANG_M3_VOLUME_DIAG === '1';
const profileComponents = process.env.LIJIANG_M3_COMPONENT_TIMING === '1';
const perfOnly = process.env.LIJIANG_M3_PERF_ONLY === '1';
const fps = Math.max(10, Math.min(30, Number(process.env.LIJIANG_M3_FPS) || 20));
const width = Math.max(640, Math.min(1920, Number(process.env.LIJIANG_M3_WIDTH) || 1440));
const height = Math.max(400, Math.min(1080, Number(process.env.LIJIANG_M3_HEIGHT) || 900));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
// Reject an unpromoted M2 home before app readiness/window creation. The actual
// loaded DOM and live child iteration are checked again by checkParent/read.
function assertM3ParentEntry(html){
  const section=html.match(/<section\b[^>]*\bid=["']lijiang["'][^>]*>[\s\S]*?<\/section>/i)?.[0];
  const frames=section?.match(/<iframe\b[^>]*>/gi)||[];
  assert(frames.length===1,'Formal #lijiang section must contain exactly one iframe');
  const source=frames[0].match(/\bdata-src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g,'&');
  const entry=new URL(source||'about:blank','http://127.0.0.1:8796/projects/014-programmable-worlds/web/index.html');
  assert(entry.origin==='http://127.0.0.1:8796'&&entry.pathname==='/projects/014-programmable-worlds/web/lijiang-m3/raster.html'
    &&entry.searchParams.get('surface')==='1'&&entry.searchParams.get('material')==='1'&&!entry.searchParams.has('qaFields'),
    'M3 PARENT refuses the formal home unless its actual #lijiang data-src points to uncached M3');
  return entry.href;
}
if(parentMode)assertM3ParentEntry(fs.readFileSync(path.join(PROJECT,'web/index.html'),'utf8'));
assert(!useCache, 'M3 QA requires actual generation and refuses QA field caches');
assert(!parentMode||(!volumeDiagnostic&&!perfOnly),'M3 PARENT cannot use the independent volume/performance-only routes');
assert(!volumeDiagnostic||!fullExport, 'M3 volume diagnostic mode cannot run the full-scene film export');
assert(!perfOnly||(!volumeDiagnostic&&!fullExport&&!profileComponents), 'M3 PERF_ONLY requires its independent timing route without volume diagnosis, export or component profile');
const sourceFiles = directory => fs.readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => entry.name).sort();
const m3Directory = path.join(PROJECT, 'web/lijiang-m3');
// Include newly-added modules, styles and generator manifests automatically.
const files = sourceFiles(m3Directory);
const m2Directory = path.join(PROJECT, 'web/lijiang-native');
const m2Files = sourceFiles(m2Directory);
assert(m2Files.length === 34, 'The protected M2 baseline must contain its 34 original files');
const protectedFiles = ['upstream/index.html', 'runtime/index.html', 'runtime/source-live.html',
  'runtime/source-live.js', 'runtime/source-live.css', 'runtime/controller.js',
  'canal-real/index.html', 'canal-real/main.js', 'shipyard-station/index.html', 'shipyard-station/main.js'];
for(const name of m2Files)protectedFiles.push('lijiang-native/'+name);
const priorArtRun=path.join(ROOT,'2026-10-26T00-39-27-846Z');
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
  mode:volumeDiagnostic?'volume-diagnostic-data':perfOnly?'performance-only':'full-scene-QA',perfOnly,
  scope: volumeDiagnostic
    ? 'Actual native volume diagnostic data only. Reference, packed and pruned comparisons require independent interpretation; no scene or art acceptance is performed.'
    : perfOnly?'Actual generation then the original flight view at 45 seconds and eight isolated completed frames. Timing data only; the full functional/art/motion suite is not run.'
    : 'Actual generated scene/canvas evidence and functional measurements. Visual quality requires independent image and motion review.',
  cache: useCache, short, parentMode, targetFrameRate: fps, tests: [], captures: [], errors: [], console: [], flightSamples: [],
  downloadAttempts:0,fullExport:{enabled:fullExport,ffprobePending:fullExport},
  volumeDiagnostic:{enabled:volumeDiagnostic,comparisonVerdict:'not-evaluated',sceneAcceptancePerformed:false},
  componentTiming:{enabled:profileComponents,status:profileComponents?'pending':'disabled',requiredForFunctionalQA:false,
    scope:'Optional diagnostic; enable LIJIANG_M3_COMPONENT_TIMING=1 explicitly. Diagnostic failure is reported separately from production-scene functional checks.'},
  priorArtEvidence:volumeDiagnostic?null:priorArtEvidence};
let window, fatal = null, paints = 0, began = Date.now();
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'profile-' + backend), { recursive: true });
app.setName('Li River M3 Hidden Visual QA');
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
      &&u.pathname==='/projects/014-programmable-worlds/web/lijiang-m3/raster.html';}catch{return false;}
  });
}
async function call(code,timeout=60000){
  const target=sceneTarget();assert(target,'Own production Li iframe realm is not loaded');
  return evaluate(target,code,timeout);
}
async function readParent(){
  if(!parentMode)return null;
  return parentCall(`(()=>{const f=document.querySelector('#lijiang iframe.world-frame'),w=f?.contentWindow,api=w?.lijiangRaster;
    const ref=window.__m3ParentQA||(window.__m3ParentQA={}),reload=window.__m3ReloadQA;
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
    &&source.pathname==='/projects/014-programmable-worlds/web/lijiang-m3/raster.html'
    &&source.searchParams.get('surface')==='1'&&source.searchParams.get('material')==='1'
    &&!source.searchParams.has('qaFields'),'Production parent does not embed the full live material renderer');
  const direct=new URL(parent.directLink||'about:blank',parent.url);
  assert(direct.origin===source.origin&&direct.pathname===source.pathname&&direct.searchParams.get('surface')==='1'
    &&direct.searchParams.get('material')==='1'&&!direct.searchParams.has('qaFields'),'Formal independent Li link does not point to uncached M3');
  if(li.href&&li.href!=='about:blank'){
    const childURL=new URL(li.href);assert(childURL.origin===source.origin&&childURL.pathname===source.pathname,
      'Formal parent loaded a different child path instead of M3');
  }
  if(parent.child?.iteration)assert(parent.child.iteration==='m3','Formal parent live child is M2 or another non-M3 iteration');
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
  if(value.world)assert(value.world.iteration==='m3','QA encountered a non-M3 live world');
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
  await call(`(()=>{const a=lijiangRaster;a.prepareView(38);if(a.getState().mode!=='free')a.toggleMode();
    a.pause(true);a.suspend(false);a.setClean(true);a.camera.position.set(...${JSON.stringify(pose.position)});
    a.camera.fov=58;a.camera.updateProjectionMatrix();a.camera.lookAt(...${JSON.stringify(pose.target)});a.camera.updateMatrixWorld(true);return true;})()`);
  const ready = await wait('Near-field LOD settles: ' + pose.name, isIdle);
  assert(ready.world.mode === 'free', 'Near-field shot reverted to the production flight camera');
  if(pose.source?.kind==='fixed-prior-actual-pose')assert(pose.position.every((v,i)=>Math.abs(v-ready.world.camera.position[i])<1e-5),
    'A retained defect-regression camera moved from its original actual pose: '+pose.name);
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
  const original=await read();
  assert(original.world?.ready&&original.world.mode==='flight'&&original.world.time===45&&original.world.paused,
    'Component timing requires the existing paused default flight view at 45 seconds');
  report.componentTiming={enabled:true,status:'running',requiredForFunctionalQA:false,path:path.join(output,'component-timing.json'),view:{kind:'production-flight',time:45},samplesPerVariant:5,
    scope:'Owned hidden-window diagnostic data only. Each sample awaits the existing renderAt GPU fence and includes CPU submission. Temporarily hiding layers does not establish an optimization or an art-quality pass. First-sample shader/cache costs remain in the raw data.'};
  try{
    await call(`(async()=>{const a=lijiangRaster;a.suspend(true);while(a.getState().rendering)await new Promise(r=>setTimeout(r,10));
      a.prepareView(45);await a.renderAt(45);return true;})()`);
    const beforePixels=await capture('component-timing-before',{kind:'production-flight',time:45});
    const beforeCapture=report.captures[report.captures.length-1];
    progress('actual-GPU-component-timing');
    try{
      report.componentTiming.measurement=await call(`(async()=>{
        const a=lijiangRaster,scene=a.scene,renderer=a.renderer,savedState=a.getState();
        const forestName='Li River · procedural broadleaf forest',rockNames=['Native SDF surface with generated vertex lighting','Independent runtime-generated rock SDF pilot'],waterName='Li River · real reflected scene';
        const forests=[],rocks=[],waters=[],shadowObjects=[];
        scene.traverse(o=>{
          if(o.isGroup&&o.name===forestName)forests.push(o);
          if(o.isGroup&&rockNames.includes(o.name))rocks.push(o);
          if(o.isMesh&&o.name===waterName&&typeof o.getRenderTarget==='function'&&typeof o.onBeforeRender==='function')waters.push(o);
          if(o.isMesh)shadowObjects.push({object:o,castShadow:o.castShadow,receiveShadow:o.receiveShadow});
        });
        const visibility=[...forests,...rocks].map(object=>({object,visible:object.visible}));
        const shadows={enabled:renderer.shadowMap.enabled,autoUpdate:renderer.shadowMap.autoUpdate,needsUpdate:renderer.shadowMap.needsUpdate};
        const water=waters.length===1?waters[0]:null,reflectionHandler=water?.onBeforeRender;
        const frozenReflection=function(){};
        const result={scope:'Exact-name scene groups only; full CPU and GPU work of renderAt is measured. Cached shadows, LOD updates and retained resources remain unless explicitly changed by the named variant.',
          identified:{forest:forests.map(o=>({name:o.name,uuid:o.uuid,visible:o.visible})),rocks:rocks.map(o=>({name:o.name,uuid:o.uuid,visible:o.visible})),
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
            for(let i=0;i<5;i++){
              const started=performance.now();await a.renderAt(45);samples.push(performance.now()-started);
              await new Promise(r=>setTimeout(r,20));
            }
            const after=a.getState(),ordered=samples.slice().sort((x,y)=>x-y);
            const item={name:variant.name,change:variant.change,samples,meanMilliseconds:samples.reduce((x,y)=>x+y,0)/5,
              medianMilliseconds:ordered[2],meanExcludingFirstMilliseconds:samples.slice(1).reduce((x,y)=>x+y,0)/4,
              completedFrames:after.frames-before.frames,reflectionFramesBefore:before.environment?.reflectionFrames??null,
              reflectionFramesAfter:after.environment?.reflectionFrames??null,
              forestTriangles:after.forest?.totalTriangles??null,rockCount:after.rocks?.count??null};
            if(item.completedFrames!==5)throw new Error('Component timing did not complete exactly five isolated frames: '+variant.name);
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
    const result=await mediaProcess(process.env.LIJIANG_M3_FFPROBE||'ffprobe',probeArgs,'ffprobe-full-2700-frame-decode');
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
    await mediaProcess(process.env.LIJIANG_M3_FFMPEG||'ffmpeg',[
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
  assert(before.world.iteration==='m3'&&!before.cache,'Full film export requires the actual owned uncached M3 realm');
  const timeout=Math.max(180000,Number(process.env.LIJIANG_M3_EXPORT_TIMEOUT_MS)||1200000);
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
  const file=path.join(output,'lijiang-m3-1920x1080-60fps-2700frames.webm'),fd=fs.openSync(file,'wx'),hash=crypto.createHash('sha256');
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
  const reloaded=await wait('Formal parent regenerates a new actual M3 document',s=>isIdle(s)&&s.world.iteration==='m3'
    &&s.parent?.child?.sameDocument===false&&s.parent.child.timeOrigin!==saved.parent.child.timeOrigin,1200000);
  assert(reloaded.parent.contextLost===true&&reloaded.parent.child.currentContextLost===false
    &&reloaded.parent.child.currentContextMatchesOriginal===false,'Reload did not replace the disposed original with a distinct live M3 context');
  report.parentReloaded=reloaded;
  await parentCall(`(()=>{const f=document.querySelector('#lijiang iframe.world-frame'),api=f.contentWindow.lijiangRaster;
    if(api.getState().iteration!=='m3')throw new Error('Reloaded realm is not M3');
    window.__m3ReloadQA={api,context:api.renderer.getContext(),document:f.contentDocument};return true;})()`);
  await capture('parent-reloaded-m3',{kind:'formal-parent-reload',iteration:'m3'});
  pass('production-parent-reloads-new-M3-document-after-original-context-release',{
    iteration:reloaded.world.iteration,child:reloaded.parent.child,originalContextLost:reloaded.parent.contextLost});
  await parentCall(`(async()=>{await worldHub.disposeAll();return true;})()`);
  const reloadRetired=await wait('Formal parent releases the reloaded M3 context',s=>s.parent?.reloadContextLost===true
    &&s.parent.contextLost===true&&s.parent.previews.every(f=>(!f.src||f.src==='about:blank')&&f.href==='about:blank'),60000);
  report.disposed={state:reloadRetired.parent.reloadRetiredWorld,contextLost:reloadRetired.parent.reloadContextLost,
    originalContextLost:reloadRetired.parent.contextLost,parent:reloadRetired.parent};
  assert(report.disposed.state?.phase==='disposed','Reloaded M3 did not finish its actual disposal path');
  pass('production-parent-reloaded-M3-context-disposes-and-unloads',report.disposed);
}
async function verifyPreservation(originalHashes,originalHealth){
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
  assert(JSON.stringify(files)===JSON.stringify(sourceFiles(m3Directory)),'M3 source inventory changed after its QA source freeze');
  const finalM3Hashes=Object.fromEntries(files.map(name=>[name,sha(fs.readFileSync(path.join(m3Directory,name)))]));
  assert(files.every(name=>report.modules[name]===finalM3Hashes[name]),'M3 source bytes changed after its QA source freeze');
  if(parentMode)for(const [name,hash]of Object.entries(report.parentModules||{}))
    assert(sha(fs.readFileSync(path.join(PROJECT,'web',name)))===hash,'Formal parent source changed during M3 QA: '+name);
  report.sourceFreeze.verifiedUnchanged=true;
  fs.writeFileSync(report.sourceFreeze.manifest,JSON.stringify(report.sourceFreeze,null,2));
  pass('M3-source-freeze-and-34-file-M2-baseline-preserved',{sourceFreeze:report.sourceFreeze,protectedBaseline:report.protectedBaseline});
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
  const timeout=Math.max(60000,Number(process.env.LIJIANG_M3_VOLUME_DIAG_TIMEOUT_MS)||1200000);
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
      window.__m3VolumeGL=gl;const e=gl.getExtension('WEBGL_debug_renderer_info');
      return{renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
    const released=await volumeCleanupCall(`(async()=>{if(typeof window.lijiangNativeReleaseFields!=='function')throw new Error('Native diagnostic releaseFields is unavailable');
      return await window.lijiangNativeReleaseFields();})()`);
    const releaseDeadline=Date.now()+30000;let contextLost=false;
    while(Date.now()<releaseDeadline){
      contextLost=await volumeCleanupCall('window.__m3VolumeGL.isContextLost()');if(contextLost)break;await sleep(50);
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
async function run() {
  assert(!useCache,'M3 acceptance requires actual generation without QA caches');
  const originalHashes = hashProtected(), originalHealth = await bridgeHealth();
  try{
  const sourceOutput=path.join(output,'source');fs.mkdirSync(sourceOutput,{recursive:true});
  report.moduleArtifacts={};
  report.modules = Object.fromEntries(files.map(name => {
    const bytes=fs.readFileSync(path.join(PROJECT,'web/lijiang-m3',name));
    const destination=path.join(sourceOutput,name);fs.writeFileSync(destination,bytes);
    report.moduleArtifacts[name]=destination;return[name,sha(bytes)];
  }));
  report.sourceFreeze={directory:m3Directory,fileCount:files.length,files:files.slice(),sha256:{...report.modules},
    manifest:path.join(sourceOutput,'source-freeze-manifest.json'),
    scope:'All current M3 source files copied before loading. Inventory and bytes are checked again after this run.'};
  report.protectedBaseline={m2Directory,m2FileCount:m2Files.length,m2Files:m2Files.slice(),
    otherEntryFileCount:protectedFiles.length-m2Files.length,sha256:originalHashes};
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
  const entry = new URL('http://127.0.0.1:8796/projects/014-programmable-worlds/web/'+(volumeDiagnostic?'lijiang-m3/engine.html':parentMode?'index.html':'lijiang-m3/raster.html'));
  if(volumeDiagnostic){entry.searchParams.set('fieldsonly','1');entry.searchParams.set('diagnoseVolume','1');entry.searchParams.set('qa','1');}
  else if(!parentMode){entry.searchParams.set('surface', '1'); entry.searchParams.set('material', '1'); entry.searchParams.set('qa', '1');}
  else{entry.hash='lijiang';entry.searchParams.set('qa','1');}
  entry.searchParams.set('revision', process.env.LIJIANG_M3_REVISION || '20261026-m3');
  if (useCache) entry.searchParams.set('qaFields', '1');
  report.entry = entry.href; report.initialBridgeHealth = originalHealth;
  window = new BrowserWindow({ width, height, useContentSize: true, show: false, focusable: false,
    skipTaskbar: true, paintWhenInitiallyHidden: true, backgroundColor: '#071b1b',
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, devTools: false, backgroundThrottling: false,
      partition: 'persist:lijiang-m3-hidden-qa' } });
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
  const firstOperable=await wait('first-operable-generated-M3-scene',s=>s.world?.ready,1200000);
  const firstOperableObservedSeconds=(Date.now()-loadBegan)/1000;
  const ready = isIdle(firstOperable)?firstOperable:await wait('production-generated-scene-ready', isIdle, 1200000);
  report.loadSeconds = (Date.now() - loadBegan) / 1000; report.initial = ready;
  assert(ready.world.iteration==='m3','M3 QA loaded a different world iteration');
  assert(ready.world.loadTimings&&ready.world.generation,'M3 getState must expose loadTimings and generation');
  report.loadTimings=ready.world.loadTimings;report.generation=ready.world.generation;
  report.loadObservations={firstOperableObservedSeconds,fullSceneReadyObservedSeconds:report.loadSeconds,
    sameObservation:firstOperable===ready,firstOperableState:firstOperable.world,
    observationPollingMilliseconds:150,
    scope:'First operable means observed ready=true; full scene ready means paused, idle and no pending forest work. These may be the same observation in the current pipeline; these are polling observations, not invented separate stages.'};
  assert(ready.cache === useCache && ready.world.materialOnly, 'Unexpected field provenance or shading mode');
  assert(!ready.generatorPresent, 'Material-only scene retained its producer context');
  if(parentMode){assert(ready.parent.child.sameDocument&&!ready.parent.contextLost,'Production child document/context evidence missing');
    pass('actual-production-parent-loads-only-Li-live-iframe',{entry:entry.href,child:ready.url,previews:ready.parent.previews});}
  pass('actual-M3-production-generation-without-QA-cache',
    { seconds: report.loadSeconds, entry: entry.href, iteration:ready.world.iteration,generatorAbsent: true,
      loadTimings:report.loadTimings,generation:report.generation,observations:report.loadObservations });
  report.adapter = await call(`(()=>{const gl=lijiangRaster.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');
    window.__m3OriginalGL=gl;return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
  if(perfOnly)await perfOnlyTiming();
  else{
  const images = [];
  for (const t of [0, 10, 25, 38, 45]) images.push({ name: 'flight-' + t, data: await flightShot(t) });
  report.derivedPoses = await freePoses();
  for (const pose of report.derivedPoses) images.push({ name: pose.name, data: await freeShot(pose) });
  await contactSheet(images);
  assert(report.derivedPoses.length===17,'M3 near-field evidence requires 3 original, 4 primary-rock, 8 fair tree-family and 2 retained defect-regression poses');
  pass('five-flight-three-original-four-primary-eight-fair-tree-family-and-two-regression-canvas-captures', { captures: report.captures.map(c => c.name),
    priorArtEvidence:report.priorArtEvidence,
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
  await optionalComponentTiming();
  }
  if(parentMode)await parentLifecycle();
  else{
    await call('lijiangRaster.dispose()'); report.disposed = await call('({state:lijiangRaster.getState(),contextLost:__m3OriginalGL.isContextLost()})');
    assert(report.disposed.contextLost && report.disposed.state.phase === 'disposed', 'Actual main GL context was not released');
  }
  await window.loadURL('about:blank'); policy();
  assert(window.webContents.getURL() === 'about:blank', 'Own QA page did not unload');
  pass('own-scene-disposes-context-and-unloads', report.disposed);
  report.status = 'passed';
  report.functionalStatus='passed';
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
    if(!volumeDiagnostic)report.functionalStatus='failed';
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
