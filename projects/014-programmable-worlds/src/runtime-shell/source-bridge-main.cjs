'use strict';

// This background service owns one invisible GL renderer and streams only that
// renderer's original canvas. It never captures a desktop or sends system input.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const {app, BrowserWindow} = require('electron');
try { os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* The hidden policy does not depend on optional scheduler tuning. */ }
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'renderer-config.json'), 'utf8'));
const workspace = path.resolve(config.workspaceDirectory);
const profile = path.join(workspace, '.cache', 'napali-source-bridge-profile');
const logDirectory = path.join(workspace, '.cache', 'napali-source-bridge');
const sourceURL = 'http://127.0.0.1:8796/projects/014-programmable-worlds/web/runtime/index.html?embed=1&qa=1&rs=1&t=0';
const origin = 'http://127.0.0.1:8796';
const port = 8797;
// The verified invisible OSR path keeps the real source renderer off the
// desktop without throttling its scheduler to one frame per second. The
// explicit 0 value is retained only for controlled fallback experiments.
const offscreen = process.env.NAPALI_SOURCE_OFFSCREEN !== '0';
let offscreenPaints = 0;
fs.mkdirSync(profile, {recursive:true}); fs.mkdirSync(logDirectory, {recursive:true});
app.setName('Na Pali Background Source Bridge'); app.setPath('userData',profile); app.setPath('sessionData',profile);
for (const [name,value] of [['use-gl','angle'],['use-angle','gl']]) app.commandLine.appendSwitch(name,value);
for (const name of ['disable-renderer-backgrounding','disable-background-timer-throttling','disable-backgrounding-occluded-windows']) app.commandLine.appendSwitch(name);
const log = (event,data={}) => fs.appendFileSync(path.join(logDirectory,'diagnostics.jsonl'),JSON.stringify({at:new Date().toISOString(),event,pid:process.pid,...data})+'\n');
let engine = null, session = null, server = null, polling = false, fatal = null;
const initialStatus = () => ({phase:'idle',ready:false,state:null,drive:null,diagnostics:null,stream:null,error:null,backend:'gl'});
let cached = initialStatus();
function bounded(promise, milliseconds, label) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),milliseconds);})]).finally(()=>clearTimeout(timer));
}
function assertHidden() { if (engine && (engine.isVisible() || engine.isFocused())) throw new Error('Source bridge renderer unexpectedly became visible or focused'); }
async function evaluate(code,label) {
  assertHidden();
  if (!engine || engine.isDestroyed()) throw new Error('Source renderer is not running');
  return bounded(engine.webContents.executeJavaScript(code,false),30000,label);
}
async function readEngine() {
  const readingEngine=engine,readingSession=session;
  const read = await evaluate(`(() => ({state:window.napaliControl?.getState() || null,drive:window.napaliDrive?.getState() || null,renderSize:typeof R!=='undefined'&&R?{width:R.w,height:R.h}:null,diagnostics:window.napaliDiagnostics || null,progress:document.getElementById('loadtxt')?.textContent || '',stream:window.__napaliSourceStream?.getState() || null}))()`, 'Read source renderer');
  if(engine!==readingEngine||session!==readingSession)return cached;
  const ready = !!read.state?.ready && read.state.frames >= 2;
  cached = {...read,phase:ready?'ready':read.diagnostics?.phase || 'initializing',ready,error:fatal || read.state?.error || (read.progress?.startsWith('Error:') ? read.progress : null),backend:'gl',offscreen,offscreenPaints,sessionId:session?.id || null,updatedAt:new Date().toISOString()};
  if (cached.error) cached.phase='error';
  return cached;
}
function stopEngine(reason='client-stop') {
  const old = session?.id;
  if (engine && !engine.isDestroyed()) engine.destroy();
  engine=null;session=null;fatal=null;cached=initialStatus();
  log('engine-stopped',{reason,sessionId:old});
}
async function startEngine() {
  if (engine && !engine.isDestroyed() && session) { session.lastActivity=Date.now(); return; }
  fatal=null; session={id:crypto.randomUUID(),token:crypto.randomBytes(24).toString('hex'),lastActivity:Date.now()};
  cached={...initialStatus(),phase:'opening-source',sessionId:session.id};
  offscreenPaints=0;
  engine=new BrowserWindow({width:1440,height:900,show:false,skipTaskbar:true,focusable:false,paintWhenInitiallyHidden:true,autoHideMenuBar:true,backgroundColor:'#030a14',webPreferences:{offscreen,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,devTools:false,spellcheck:false,backgroundThrottling:false,partition:'persist:napali-source-video-bridge'}});
  if(offscreen){engine.webContents.setFrameRate(30);engine.webContents.on('paint',()=>{offscreenPaints++;});}
  engine.webContents.setBackgroundThrottling(false);
  engine.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  engine.webContents.session.setPermissionCheckHandler(()=>false);
  engine.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  engine.webContents.on('will-navigate',(event,destination)=>{if(new URL(destination).origin!==origin)event.preventDefault();});
  engine.webContents.on('will-attach-webview',event=>event.preventDefault());
  engine.webContents.on('console-message',details=>log('renderer-console',{level:details.level,message:String(details.message||'').slice(0,4000)}));
  engine.webContents.on('render-process-gone',(_event,details)=>{fatal='Source renderer exited: '+details.reason;cached={...cached,error:fatal,phase:'error',ready:false};log('renderer-exited',details);});
  const startingEngine=engine;
  engine.on('closed',()=>{if(engine===startingEngine)engine=null;});
  log('engine-starting',{sessionId:session.id,sourceURL,windowPolicy:{show:false,focusable:false,skipTaskbar:true,offscreen,offscreenFrameRate:offscreen?30:null},backend:'gl'});
  engine.loadURL(sourceURL).then(async()=>{
    if(engine!==startingEngine)return;
    await evaluate(fs.readFileSync(path.join(__dirname,'source-stream-engine.js'),'utf8'),'Install source video adapter');
    await readEngine(); log('source-adapter-installed');
  }).catch(error=>{if(engine!==startingEngine)return;fatal=error.message;cached={...cached,phase:'error',error:fatal,ready:false};log('source-start-error',{message:fatal});});
}
const methods = {
  pause: args => `window.napaliControl.pause(${JSON.stringify(Boolean(args.paused))})`,
  seek: args => `window.napaliDrive.setMode('flight');window.napaliControl.seek(${number(args.time,0,132)})`,
  restart: () => `window.napaliDrive.setMode('flight');window.napaliControl.restart()`,
  quality: args => { const scale=number(args.scale,.5,1); if(![.5,.75,1].includes(scale))throw new Error('Quality must be .5, .75, or 1');return `window.napaliControl.setQuality(${scale})`; },
  mode: args => {if(!['free','flight'].includes(args.mode))throw new Error('Invalid source camera mode');return `window.napaliDrive.setMode(${JSON.stringify(args.mode)})`;},
  move: args => `window.napaliDrive.move(${JSON.stringify({forward:number(args.forward??0,-200,200),right:number(args.right??0,-200,200),up:number(args.up??0,-200,200)})})`,
  look: args => `window.napaliDrive.look(${JSON.stringify({yawDelta:number(args.yawDelta??0,-Math.PI,Math.PI),pitchDelta:number(args.pitchDelta??0,-1.4,1.4)})})`,
  suspend: args => `window.napaliControl.suspend(${JSON.stringify(Boolean(args.suspended))})`
};
function number(value,min,max) { if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('Control value out of range');return value; }
function send(response,code,value) {response.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}
function body(request) {return new Promise((resolve,reject)=>{let data='';request.on('data',chunk=>{data+=chunk;if(data.length>262144){reject(new Error('Request body too large'));request.destroy();}});request.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('Invalid JSON body'));}});request.on('error',reject);});}
function authorize(value) {if(!session||value.sessionId!==session.id||typeof value.token!=='string'||value.token.length!==session.token.length||!crypto.timingSafeEqual(Buffer.from(value.token),Buffer.from(session.token)))throw new Error('Invalid source session');session.lastActivity=Date.now();}
async function requestHandler(request,response) {
  const requestOrigin=request.headers.origin;
  if(requestOrigin && requestOrigin!==origin){send(response,403,{error:'Origin is not allowed'});return;}
  if(request.headers.host!==`127.0.0.1:${port}`){send(response,403,{error:'Host is not allowed'});return;}
  if(requestOrigin)response.setHeader('Access-Control-Allow-Origin',origin);
  response.setHeader('Vary','Origin');response.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');response.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
  const url=new URL(request.url,`http://127.0.0.1:${port}`);
  try {
    if(request.method==='GET'&&url.pathname==='/health'){send(response,200,{service:'napali-source-bridge',version:1,backend:'gl',pid:process.pid,sessionActive:!!session,offscreen,offscreenFrameRate:offscreen?30:null});return;}
    if(request.method==='GET'&&url.pathname==='/status'){
      if(session&&url.searchParams.get('sessionId')===session.id)session.lastActivity=Date.now();
      send(response,200,{...cached,sessionId:session?.id || null});return;
    }
    if(request.method!=='POST'){send(response,404,{error:'Unknown source bridge route'});return;}
    const value=await body(request);
    if(url.pathname==='/session'){await startEngine();send(response,200,{sessionId:session.id,token:session.token,status:cached});return;}
    authorize(value);
    if(url.pathname==='/session/stop'){stopEngine();send(response,200,{stopped:true});return;}
    if(url.pathname==='/offer'){
      if(!cached.ready) {send(response,409,{error:'Complete source renderer is still initializing',status:cached});return;}
      if(value.description?.type!=='offer'||typeof value.description.sdp!=='string'||value.description.sdp.length>200000)throw new Error('Invalid video offer');
      const description=await evaluate(`window.__napaliSourceStream.answer(${JSON.stringify(value.description)})`,'Connect local source video');
      send(response,200,{sessionId:session.id,description});log('video-answer-created',{sessionId:session.id});return;
    }
    if(url.pathname==='/control'){
      if(!cached.ready){send(response,409,{error:'Source controls are not ready',status:cached});return;}
      if(!Object.hasOwn(methods,value.method))throw new Error('Unknown source control');
      const code=methods[value.method](value.args||{});await evaluate(code,'Drive original source');
      send(response,200,await readEngine());return;
    }
    send(response,404,{error:'Unknown source bridge route'});
  }catch(error){log('request-error',{path:url.pathname,message:error.message});if(!response.headersSent)send(response,400,{error:error.message});}
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(()=>{
  server=http.createServer((request,response)=>{requestHandler(request,response).catch(error=>{if(!response.headersSent)send(response,500,{error:error.message});});});
  server.on('error',error=>{log('service-error',{message:error.message});app.exit(1);});
  server.listen(port,'127.0.0.1',()=>{log('service-ready',{port,backend:'gl'});fs.writeFileSync(path.join(logDirectory,'service.json'),JSON.stringify({pid:process.pid,port,backend:'gl',startedAt:new Date().toISOString()},null,2));});
  setInterval(async()=>{
    if(!session||!engine||polling)return;
    if(Date.now()-session.lastActivity>90000){stopEngine('client-lease-expired');return;}
    polling=true;
    const polledSession=session;
    try{await readEngine();}catch(error){if(session===polledSession)cached={...cached,error:error.message,phase:'error',ready:false};}finally{polling=false;}
  },500);
  app.on('child-process-gone',(_event,details)=>{if(details.type==='GPU'&&['crashed','killed','abnormal-exit'].includes(details.reason)){fatal='Source GPU exited: '+details.reason;cached={...cached,phase:'error',ready:false,error:fatal};}log('child-process-gone',details);});
  log('app-ready',{electron:process.versions.electron,chrome:process.versions.chrome});
}).catch(error=>{log('startup-error',{message:error.message});app.exit(1);});
app.on('before-quit',()=>{stopEngine('service-quit');server?.close();});
// Closing the source document leaves the small localhost service available for
// the next explicit in-page session; no visible windows are ever created.
app.on('window-all-closed',()=>{});
