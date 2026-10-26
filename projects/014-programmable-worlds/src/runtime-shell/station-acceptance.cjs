'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {nativeImage}=require('electron');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(value,message){if(!value)throw new Error(message);}
async function runStationAcceptance({window,projectDirectory,workspaceDirectory,backend,record,getFatal,getPresentation=()=>null}){
 const started=Date.now(),runId=new Date().toISOString().replace(/[:.]/g,'-'),exporting=process.env.NAPALI_STATION_EXPORT==='1',captureOnly=process.env.NAPALI_STATION_CAPTURE_ONLY==='1',lightingOnly=process.env.NAPALI_STATION_LIGHTING_ONLY==='1';
 const output=path.join(projectDirectory,'assets','shipyard-station-qa',runId);fs.mkdirSync(output,{recursive:true});
 const report={runId,status:'running',scene:'shipyard-station',backend,tests:[],captures:[],errors:[],exporting,scope:exporting?'Independent geometry source export and real-frame preview; artwork not accepted':captureOnly?'Actual independent station captures; visual review required':'Independent station actual user journey and controls',windowPolicy:{show:false,focusable:false,skipTaskbar:true}};
 async function call(code){assert(!window.isVisible()&&!window.isFocused(),'Own station client became visible/focused');if(getFatal())throw new Error(getFatal());return window.webContents.executeJavaScript(code,false);}
 function progress(phase,state){fs.writeFileSync(path.join(workspaceDirectory,'.cache','shipyard-station-qa-status.json'),JSON.stringify({...report,phase,elapsedSeconds:(Date.now()-started)/1000,state},null,2));record('station-qa-progress',{phase});}
 async function wait(predicate,label,timeout=120000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const s=await call('window.stationWorld?.getState()||null');if(s?.error||s?.errors?.length)throw new Error(JSON.stringify(s));progress(label,s);if(predicate(s))return s;await sleep(300);}throw new Error(label+' timed out');}
 function pass(name,evidence){report.tests.push({name,passed:true,evidence});}
 async function capture(name){const s=await call('window.stationWorld.getState()'),data=await call("document.querySelector('#world canvas').toDataURL('image/png')"),im=nativeImage.createFromDataURL(data),buffer=im.toPNG(),canvas=path.join(output,name+'-canvas.png'),page=path.join(output,name+'-page.png');fs.writeFileSync(canvas,buffer);fs.writeFileSync(page,(await window.webContents.capturePage(undefined,{stayHidden:true})).toPNG());report.captures.push({name,canvas:path.relative(projectDirectory,canvas).replaceAll('\\','/'),page:path.relative(projectDirectory,page).replaceAll('\\','/'),...im.getSize(),sha256:crypto.createHash('sha256').update(buffer).digest('hex'),state:s});return s;}
 async function click(id){const deadline=Date.now()+10000;while(Date.now()<deadline){if(await call(`(()=>{const b=document.getElementById(${JSON.stringify(id)});return !!b&&!b.disabled&&!b.hidden&&b.getClientRects().length>0;})()`)){await call(`document.getElementById(${JSON.stringify(id)}).click()`);return;}await sleep(100);}throw new Error('Actual station button unavailable: '+id);}
 try{
  let state=await wait(s=>s?.ready&&s.frames>=3,'Independent station actual first frames');
  assert(state.sceneId==='shipyard-station'&&state.setting==='old-dry-dock-and-passenger-station','A mode of the old street was substituted');
  if(!exporting)assert(state.runtimeRevision==='shipyard-oak2048-aftdeck-2'&&state.journey.passengerSurface?.physicalBevels&&state.journey.passengerSurface.sampledVertices>0,'Actual browser did not load the current station runtime revision');
  pass('independent-station-identity-and-actual-renderer',state);
  if(!exporting){assert(state.lighting?.mode==='full-diffuse'&&state.lighting.modelSha256!=='819b849b252ff22970c66e6349cf9eb4f470ad1ec775260e355ab2480c7da227','Station reused the old city model or incomplete lighting');assert(state.lighting.manifestURL.endsWith('/manifest-oak2048.json')&&state.lighting.manifestSha256==='97eb5a39b308d200f0011f9732725a812b7794cca48553178a11e4841b0f882e'&&state.lighting.sampling.filter(g=>g.samples===2048).length===1&&state.lighting.sampling.filter(g=>g.samples===128).length===22,'Actual station did not load the refined independent lighting package');pass('own-independent-geometry-and-complete-lighting',state.lighting);}
  await call('window.stationWorld.pause(true)');
  for(const [i,shot]of (lightingOnly?['hall']:['platform','shipyard','hall','basin']).entries()){
   const before=await call(`window.stationWorld.setShot('${shot}',true)`);state=await wait(s=>s.frames>=before.frames+3,'Actual station '+shot);await capture('0'+(i+1)+'-'+shot);pass('actual-independent-camera-'+shot,state.camera);
   if(captureOnly&&shot==='hall'){const before=await call('window.stationWorld.setLightingDiagnostic("diffuse");window.stationWorld.getState()');await wait(s=>s.frames>=before.frames+3,'Hall diffuse candidate');await capture('03-hall-diffuse');await call('window.stationWorld.setLightingDiagnostic("combined")');}
  }
  if(lightingOnly){
   for(const mode of ["combined","diffuse","specular","no-ibl"]){const before=await call(`window.stationWorld.setLightingDiagnostic("${mode}");window.stationWorld.getState()`);await wait(s=>s.frames>=before.frames+3,"Actual hall lighting channel "+mode);await capture("hall-"+mode);}
   report.scope="Actual hall diffuse and specular channel isolation; diagnostic only, no artwork acceptance";
  }else if(exporting){
   const config=JSON.parse(fs.readFileSync(path.join(workspaceDirectory,'.cache','shipyard-station-export-service.json'),'utf8'));
   const receipt=await call(`window.stationWorld.exportScene(${JSON.stringify(config.endpoint)})`);pass('independent-source-exported-with-own-receiver',receipt);
  }else if(captureOnly){
   await call('window.stationWorld.reset()');await click('callBoat');
   state=await wait(s=>s.journey.phase==='docked'&&s.journey.gangwayOpen>.99,'Pilot actual ferry arrival and physical gangway',40000);await capture('05-pilot-actual-docked');pass('pilot-real-arrival-for-visual-review',state.journey);
   await click('board');await wait(s=>s.journey.phase==='boarding'&&s.journey.elapsed>=3,'Pilot actual passage toward gangway',10000);await capture('06-pilot-boarding-path');
   state=await wait(s=>s.journey.phase==='departing'&&s.journey.cameraFollow&&s.journey.elapsed>=3,'Pilot actual onboard view',15000);await capture('07-pilot-onboard');pass('pilot-boarding-and-onboard-for-visual-review',state);
   report.scope='Actual independent station and real arrival/boarding/onboard captures; complete outcome acceptance remains separate';
  }else{
   await call('window.stationWorld.reset();window.stationWorld.pause(false)');
   const cadenceStart=await call('window.stationWorld.getState()'),presentStart=getPresentation(),clockStart=performance.now();await sleep(4000);const cadenceEnd=await call('window.stationWorld.getState()'),clockEnd=performance.now(),presentEnd=getPresentation(),seconds=(clockEnd-clockStart)/1000;
   assert(cadenceEnd.frames>cadenceStart.frames+4,'Actual station animation did not continue');pass('actual-station-wall-clock-frame-cadence',{seconds,completedFramesPerSecond:(cadenceEnd.frames-cadenceStart.frames)/seconds,paintCallbacksPerSecond:presentStart&&presentEnd?(presentEnd.paints-presentStart.paints)/seconds:null,presentation:presentEnd});
   const before=await call('window.stationWorld.getState()');await call('window.stationWorld.drive({forward:.35,right:.2,yaw:.15})');
   state=await wait(s=>s.frames>=before.frames+3,'Own station drive actual render');assert(Math.hypot(...state.camera.position.map((v,i)=>v-before.camera.position[i]))>.1,'Station camera did not drive');pass('station-camera-drive-moves-physical-view',{before:before.camera,after:state.camera});
   await click('callBoat');await wait(s=>s.journey.phase==='approaching'&&s.journey.elapsed>=5,'Actual ferry approaches in real time',20000);
   await click('pause');const paused=await call('window.stationWorld.getState()');await sleep(1800);const held=await call('window.stationWorld.getState()');
   assert(held.journey.paused&&Math.hypot(...held.journey.boatPosition.map((v,i)=>v-paused.journey.boatPosition[i]))<.025,'Pause did not hold the actual passenger launch');pass('real-passenger-launch-pause-holds',{before:paused.journey,after:held.journey});
   await click('pause');state=await wait(s=>s.journey.phase==='docked'&&s.journey.canChoose&&s.journey.gangwayOpen>.99,'Complete actual ferry approach and gangway',40000);await capture('05-actual-docked');
   assert(Math.hypot(state.journey.boatPosition[0]-17.6,state.journey.boatPosition[2]-8)<.1&&state.journey.gangwayOpen>.98,'Passenger launch did not moor at the real gangway');pass('whole-approach-moors-and-opens-physical-gangway',state.journey);
   await click('board');await wait(s=>s.journey.phase==='departing'&&s.journey.cameraFollow,'Actual seven-second boarding via gangway',15000);await capture('06-on-actual-passenger-deck');
   state=await wait(s=>s.journey.phase==='complete','Complete actual departure aboard',45000);await capture('07-complete-aboard');assert(state.journey.choice==='board'&&state.journey.cameraFollow&&state.journey.boatPosition[2]<-60,'Board outcome did not carry camera away on the passenger launch');pass('complete-boarding-and-departure-carries-camera',state);
   await click('reset');await click('callBoat');await wait(s=>s.journey.phase==='docked'&&s.journey.canChoose,'Second physical approach',35000);await click('stay');const shore=await call('window.stationWorld.getState()');
   state=await wait(s=>s.journey.phase==='complete','Whole departure while remaining on shore',40000);await capture('08-complete-on-shore');assert(state.journey.choice==='stay'&&!state.journey.cameraFollow&&Math.hypot(...state.camera.position.map((v,i)=>v-shore.camera.position[i]))<.02&&state.journey.boatPosition[2]<-60,'Stay outcome did not keep the camera on shore');pass('complete-shore-outcome-keeps-view-and-departs-boat',state);
   for(const requested of [{width:390,height:844},{width:640,height:520}]){
    await click('reset');window.setContentSize(requested.width,requested.height);state=await call('window.stationWorld.getState()');await wait(s=>s.frames>=state.frames+3,'Actual narrow station viewport');
    const layout=await call('({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:[...document.querySelectorAll("button")].filter(b=>!b.hidden&&b.getClientRects().length).map(b=>({text:b.textContent,disabled:b.disabled,rect:b.getBoundingClientRect().toJSON()}))})');
    assert(Math.abs(layout.width-requested.width)<=1&&Math.abs(layout.height-requested.height)<=1&&!layout.overflow,'Station narrow layout dimensions or overflow failed');assert(layout.buttons.every(b=>b.rect.left>=-1&&b.rect.right<=layout.width+1&&b.rect.top>=-1&&b.rect.bottom<=layout.height+1),'Station narrow controls were clipped');await capture('viewport-'+layout.width+'-'+layout.height);pass('actual-station-controls-fit-'+layout.width+'-'+layout.height,{requested,actual:layout});
   }
  }
  await call('window.stationWorld.dispose()');pass('own-independent-renderer-disposes',{disposed:true});report.status='passed';
 }catch(error){report.status='failed';report.errors.push(String(error.stack||error));try{await capture('failure');}catch{}try{await call('window.stationWorld?.dispose()');}catch{}}
 report.elapsedSeconds=(Date.now()-started)/1000;report.presentation=getPresentation();const category=lightingOnly?'station-lighting-diagnostic':exporting?'station-source-export':captureOnly?'station-captures':'station-functional';
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(projectDirectory,'notes',category+'.'+backend+'.latest.json'),JSON.stringify(report,null,2));if(report.status==='passed')fs.writeFileSync(path.join(projectDirectory,'notes',category+'.'+backend+'.json'),JSON.stringify(report,null,2));progress('finished',null);return report;
}
module.exports={runStationAcceptance};
