'use strict';
// Optional Windows verifier using the known OpenGL host. Always hidden, unfocused,
// sandboxed, and confined to a task-owned localhost page and separate profile.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(process.env.NAPALI_TEMPLATE_ARTIFACTS||path.join(os.tmpdir(),'napali-template-acceptance'));
const profile=path.join(root,'electron-profile');fs.mkdirSync(profile,{recursive:true});
const target=new URL(process.env.NAPALI_SCENE_URL||'http://127.0.0.1:8820/');
if(target.hostname!=='127.0.0.1')throw Error('Acceptance target must be task-owned localhost');
app.setPath('userData',profile);app.setPath('sessionData',profile);
app.commandLine.appendSwitch('use-gl','angle');app.commandLine.appendSwitch('use-angle','gl');
for(const flag of ['disable-renderer-backgrounding','disable-background-timer-throttling','disable-backgrounding-occluded-windows'])app.commandLine.appendSwitch(flag);
try{os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
const report={status:'running',startedAt:new Date().toISOString(),tests:[],phases:[],errors:[],host:'Electron ANGLE OpenGL',target:target.href};
const persist=()=>fs.writeFileSync(path.join(root,'electron-acceptance.json'),JSON.stringify(report,null,2));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const pass=(name,detail)=>{report.tests.push({name,detail,passed:true});persist();console.log('PASS '+name);};
let win;
app.whenReady().then(async()=>{
  report.stage='create-window';persist();
  win=new BrowserWindow({width:960,height:640,useContentSize:true,show:false,focusable:false,skipTaskbar:true,paintWhenInitiallyHidden:true,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'persist:napali-hidden-acceptance'}});
  win.webContents.setFrameRate(20);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.session.setPermissionRequestHandler((_web,_permission,cb)=>cb(false));
  win.webContents.on('console-message',details=>{if(String(details.message).startsWith('NAPALI_PHASE'))console.log(details.message);});
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==target.origin)event.preventDefault();});
  const evaluate=code=>Promise.race([win.webContents.executeJavaScript(code,false),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Page evaluation exceeded 30 seconds')),30000);timer.unref();})]);
  const wait=async(code,timeout=15000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(code))return;await sleep(150);}throw Error('Timed out: '+code);};
  const child="document.querySelector('iframe').contentWindow";
  const capture=async name=>{let last;for(let i=0;i<15;i++){try{const image=await win.webContents.capturePage();if(!image.isEmpty()){fs.writeFileSync(path.join(root,name+'.png'),image.toPNG());return;}}catch(error){last=error;}await sleep(200);}throw last||Error('No painted screenshot surface');};
  try{
    report.stage='load-launcher';persist();await win.loadURL(target.href);await wait("!document.querySelector('#start').disabled");await sleep(300);
    assert(await evaluate("document.querySelectorAll('iframe').length===0"),'Auto-started renderer');
    report.stage='capture-launcher';persist();await capture('launcher-desktop');
    win.setContentSize(390,844);await sleep(200);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile overflow');
    await capture('launcher-mobile');
    pass('explicit-start-desktop-mobile-and-hidden-window',{visible:win.isVisible(),focused:win.isFocused()});
    win.setContentSize(640,480);await evaluate("document.querySelector('#start').click()");
    const until=Date.now()+240000;let previous='';
    while(Date.now()<until){
      const state=await evaluate(`(()=>{const w=${child};return {phase:w.napaliDiagnostics||null,control:w.napaliControl?.getState()||null,error:w.document.querySelector('#loadtxt')?.textContent||null};})()`);
      report.latest=state;
      if(state.phase?.phase!==previous){previous=state.phase?.phase;report.phases.push(state.phase);persist();}
      if(state.error?.startsWith('Error:')||state.control?.error)throw Error(JSON.stringify(state));
      if(state.control?.frames>=2)break;
      await sleep(300);
    }
    const first=await evaluate(`${child}.sceneTemplate.getState()`);
    assert(first.control?.frames>=2&&first.control.ready,'No actual completed full-baseline frames');
    await evaluate(`${child}.napaliControl.pause(true);${child}.napaliControl.suspend(true);`);
    await wait(`!${child}.napaliControl.getState().rendering`,30000);
    pass('full-baseline-actual-world-and-frames',first);
    const driven=await evaluate(`(()=>{const w=${child};w.napaliControl.seek(35);w.napaliControl.setQuality(.75);const a=w.napaliDrive.getState();w.napaliDrive.setMode('free');w.napaliDrive.move({forward:2,up:1});w.napaliDrive.look({yawDelta:.05});const b=w.napaliDrive.getState();w.napaliDrive.setMode('flight');return {control:w.napaliControl.getState(),a,b,route:w.sceneTemplate.checkRoute(10)};})()`);
    assert(driven.control.time===35&&driven.control.scale===.75&&driven.b.mode==='free'&&driven.b.yaw!==driven.a.yaw,'Driving API failed');pass('driving-time-quality-and-route-diagnostic',driven);
    await evaluate(`${child}.napaliControl.setQuality(.5);${child}.napaliControl.suspend(false)`);
    const n=await evaluate(`${child}.napaliControl.getState().frames`);await wait(`${child}.napaliControl.getState().frames>${n}`,45000);
    await evaluate(`${child}.napaliControl.suspend(true)`);await wait(`!${child}.napaliControl.getState().rendering`,30000);
    await capture('runtime-driven');
    await evaluate("document.querySelector('#stop').click()");assert(await evaluate("document.querySelectorAll('iframe').length===0&&!document.querySelector('#start').disabled"),'Stop did not unload renderer');
    assert(!win.isVisible()&&!win.isFocused(),'QA changed window focus');pass('stop-unloads-and-window-remains-hidden',{iframes:0});
    await evaluate("(async()=>{const {mountScene}=await import('./embed.js');window.__embedTest=mountScene(document.querySelector('#stage'),'./engine.html');document.body.classList.add('running');})()");
    await wait(`${child}.napaliControl?.getState().frames>=2`,120000);
    await evaluate('window.__embedTest.pause(true);window.__embedTest.seek(55);window.__embedTest.quality(.75)');
    await wait(`${child}.napaliControl.getState().paused&&${child}.napaliControl.getState().time===55&&${child}.napaliControl.getState().scale===.75`);
    await evaluate("document.querySelector('#stage').style.display='none'");
    await wait(`${child}.napaliControl.getState().suspended`);
    await evaluate('window.__embedTest.dispose()');
    assert(await evaluate("document.querySelectorAll('iframe').length===0"),'Embedded disposal failed');
    pass('real-embed-module-postmessage-visibility-and-disposal',{pause:true,seek:55,scale:.75,hiddenSuspended:true,unloaded:true});
    report.status='passed';
  }catch(error){report.status='failed';report.errors.push(error.stack||String(error));}
  finally{report.finishedAt=new Date().toISOString();persist();win.destroy();app.exit(report.status==='passed'?0:1);}
}).catch(error=>{report.status='failed';report.errors.push(error.stack||String(error));persist();app.exit(1);});
