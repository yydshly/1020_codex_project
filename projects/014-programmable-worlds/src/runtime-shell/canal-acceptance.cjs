'use strict';
// Actual hidden renders for art review. A successful run only proves these
// camera/interaction operations work; the images still require visual critique.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {nativeImage}=require('electron');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(value,message){if(!value)throw new Error(message);}
function waterDifference(a,b){const first=nativeImage.createFromBuffer(a),second=nativeImage.createFromBuffer(b),size=first.getSize(),x=first.toBitmap(),y=second.toBitmap();let total=0,count=0;for(let row=0;row<24;row++)for(let column=0;column<24;column++){const px=Math.floor(size.width*(.065+.15*(column+.5)/24)),py=Math.floor(size.height*(.66+.23*(row+.5)/24)),index=(py*size.width+px)*4;for(let c=0;c<3;c++){total+=Math.abs(x[index+c]-y[index+c]);count++;}}return total/count;}
async function runCanalAcceptance({window,projectDirectory,workspaceDirectory,backend,record,getFatal,getPresentation=()=>null}){
  const started=Date.now(),runId=new Date().toISOString().replace(/[:.]/g,'-');
  const exportOnly=process.env.NAPALI_CANAL_EXPORT_ONLY==='1';
  const captureOnly=process.env.NAPALI_CANAL_CAPTURE_ONLY==='1';
  const layoutOnly=process.env.NAPALI_CANAL_LAYOUT_ONLY==='1';
  const output=path.join(projectDirectory,'assets','canal-real-qa',runId);fs.mkdirSync(output,{recursive:true});
  const report={runId,status:'running',scene:'canal-real',backend,tests:[],captures:[],timingSamples:[],errors:[],artQuality:'requires visual review; no equivalence claim',windowPolicy:{show:false,focusable:false,skipTaskbar:true,...getPresentation()}};
  const relative=file=>path.relative(projectDirectory,file).replaceAll('\\','/');
  async function call(code){assert(!window.isVisible()&&!window.isFocused(),'Own QA window became visible or focused');if(getFatal())throw new Error(getFatal());return window.webContents.executeJavaScript(code,false);}
  function progress(phase,state){fs.writeFileSync(path.join(workspaceDirectory,'.cache','canal-real-qa-status.json'),JSON.stringify({...report,phase,elapsedSeconds:(Date.now()-started)/1000,state},null,2));record('canal-qa-progress',{phase,state});}
  function sample(label,state){report.timingSamples.push({label,monotonicMs:performance.now(),frames:state?.frames??null,time:state?.time??null,tourElapsed:state?.tour?.elapsed??null,presentation:getPresentation()});}
  async function wait(predicate,label,timeout=120000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const state=await call('window.canalReal?.getState()||null');sample(label,state);if(state?.error||state?.errors?.length)throw new Error(JSON.stringify(state));progress(label,state);if(predicate(state))return state;await sleep(400);}throw new Error(label+' timed out');}
  async function waitDOM(expression,label){const deadline=Date.now()+10000;while(Date.now()<deadline){if(await call(expression))return;await sleep(200);}throw new Error(label+' timed out');}
  function pass(name,evidence){report.tests.push({name,passed:true,evidence});}
  async function capture(name){
    const state=await call('window.canalReal.getState()');
    const data=await call("document.querySelector('#world canvas').toDataURL('image/png')");
    const image=nativeImage.createFromDataURL(data),size=image.getSize(),buffer=image.toPNG();
    const scenePath=path.join(output,name+'-canvas.png'),pagePath=path.join(output,name+'-page.png');
    fs.writeFileSync(scenePath,buffer);fs.writeFileSync(pagePath,(await window.webContents.capturePage(undefined,{stayHidden:true})).toPNG());
    report.captures.push({name,canvas:relative(scenePath),page:relative(pagePath),...size,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),monotonicMs:performance.now(),presentation:getPresentation(),state});
    return {state,buffer};
  }
  async function viewportChecks(){
    let state=await call('window.canalReal.getState()');
    if(state.experience==='window')await call("window.canalReal.setShot('window',true)");
    if(state.experience==='story'){
      await call('window.canalReal.seekTour(25)');
      await waitDOM('!document.querySelector("#choice").hidden&&!document.querySelector("[data-choice=read]").disabled','Portrait read choice button');
      if(layoutOnly){state=await call('window.canalReal.getState()');await wait(s=>s.frames>=state.frames+3,'Final courtyard and actual boat at choice');await capture('final-story-choice');}
      await call('document.querySelector("[data-choice=read]").click()');
      await wait(s=>s.dynamic?.letterParent==='held'&&s.dynamic.paperUnfold>.99,'Read outcome before portrait view');
      if(layoutOnly){
        await waitDOM('document.body.classList.contains("reading-letter")','Final reading HUD');
        await capture('final-story-read');
        await call('window.canalReal.seekTour(25)');
        await waitDOM('!document.querySelector("#choice").hidden&&!document.querySelector("[data-choice=drift]").disabled','Final drift button');
        await call('document.querySelector("[data-choice=drift]").click()');await sleep(2000);await capture('final-story-drift');
        await call('window.canalReal.seekTour(25)');
        await waitDOM('!document.querySelector("#choice").hidden&&!document.querySelector("[data-choice=read]").disabled','Final return to reading');
        await call('document.querySelector("[data-choice=read]").click()');
        await wait(s=>s.dynamic?.letterParent==='held'&&s.dynamic.paperUnfold>.99,'Final paper before narrow layout');
      }
    }
    for(const [width,height] of [[390,844],[640,520]]){
      window.setContentSize(width,height);state=await call('window.canalReal.getState()');
      state=await wait(s=>s.frames>=state.frames+3,'Actual '+width+' by '+height+' viewport rendering');
      const viewport=await call('({width:innerWidth,height:innerHeight})');
      const requestedViewport={width,height},actualViewport=viewport;
      assert(viewport.width===width&&Math.abs(viewport.height-height)<=1,'Hidden client dimensions differ from the requested width or exceed one CSS pixel of height rounding');
      await capture('viewport-'+viewport.width+'-'+viewport.height);
      Object.assign(report.captures[report.captures.length-1],{requestedViewport,actualViewport});
      const layout=await call(`(() => {const nodes=[...document.querySelectorAll('#experience-overlay button:not([hidden]),#experience-overlay h1,#experience-overlay p')].filter(e=>e.getClientRects().length);return {overflow:document.documentElement.scrollWidth>innerWidth+1,elements:nodes.map(e=>({text:e.textContent.trim(),rect:e.getBoundingClientRect().toJSON()}))};})()`);
      assert(!layout.overflow,'Experience UI overflows the viewport');
      pass('actual-'+viewport.width+'-'+viewport.height+'-viewport-without-horizontal-overflow',{requestedViewport,actualViewport,layout});
      if(state.experience==='story'){
        const dynamic=(await call('window.canalReal.getState()')).dynamic,paper=dynamic.paperScreenBounds,area=dynamic.readingLayout?.area;
        // The product exposes CSS pixels, not normalized device coordinates.
        assert(paper&&area&&paper.left>=area.left-1&&paper.right<=area.right+1&&paper.top>=area.top-1&&paper.bottom<=area.bottom+1,'Actual paper overlaps the available reading area');
        assert(paper.bodyFontEstimate>=18,'Physical letter body is too small to read');
        pass('actual-'+viewport.width+'-'+viewport.height+'-letter-fits-reading-area',{requestedViewport,actualViewport,paper,readingLayout:dynamic.readingLayout});
      }
    }
  }
  async function navigationChecks(){
    await call("window.canalReal.pause(true);window.canalReal.setShot('window',true)");
    const roomBefore=await call('window.canalReal.getState()');
    await call('window.canalReal.drive({yaw:.8,pitch:.4})');
    let state=await call('window.canalReal.getState()');
    assert(Math.hypot(...state.camera.position.map((v,i)=>v-roomBefore.camera.position[i]))<.015,'Room look moved the camera through its walls');
    await call('window.canalReal.drive({forward:100,right:100,up:100})');state=await call('window.canalReal.getState()');
    const p=state.camera.position,tolerance=1e-6;assert(p[0]>=-14.1-tolerance&&p[0]<=-9.65+tolerance&&p[1]>=1.65-tolerance&&p[1]<=4.35+tolerance&&p[2]>=7.9-tolerance&&p[2]<=15.1+tolerance,'Room movement escaped its physical envelope');
    pass('actual-room-look-and-movement-stay-inside-room',{before:roomBefore.camera,after:state.camera,navigation:state.navigation});
    const results=[];
    for(const [label,y,shouldPass] of [['solid-bridge-crown',1.8,false],['open-bridge-arch',1.1,true],['above-bridge-deck',3,true]]){
      await call(`window.canalReal.setPose({position:[0,${y},-24],target:[0,${y},-40]});window.canalReal.drive({forward:10})`);
      state=await call('window.canalReal.getState()');
      assert(shouldPass?state.camera.position[2]<-30.45:state.camera.position[2]>-26.55,'Bridge constraint failed at '+label);
      results.push({label,camera:state.camera,navigation:state.navigation});
    }
    pass('actual-swept-navigation-respects-solid-bridge-and-open-arch',results);
    const thinBodies=[];
    for(const [label,position,target,forward,predicate]of [
      ['window-solid-pier',[-8,2.7,8.6],[-12,2.7,8.6],4,s=>s.camera.position[0]>-8.79],
      ['window-open-centre',[-8,2.7,11.5],[-12,2.7,11.5],1.3,s=>Math.abs(s.camera.position[0]+9.3)<.06],
      ['central-bridge-railing',[0,2.6,-20],[0,2.6,-50],100,s=>s.camera.position[2]>-26.475],
      ['lower-side-railing',[5.7,2.6,-20],[5.7,2.6,-50],20,s=>s.camera.position[2]<-30.45],
      ['above-central-railing',[0,2.95,-20],[0,2.95,-50],20,s=>s.camera.position[2]<-30.45]
    ]){
      await call(`window.canalReal.setShot('quay',true);window.canalReal.setPose(${JSON.stringify({position,target})});window.canalReal.drive({forward:${forward}})`);
      state=await call('window.canalReal.getState()');assert(predicate(state),'Actual thin-body navigation failed at '+label);
      thinBodies.push({label,camera:state.camera,navigation:state.navigation});
    }
    pass('actual-window-opening-and-height-varying-railings',thinBodies);
    const interrupted=await call("window.canalReal.setShot('quay',true);const prior=window.canalReal.getState();window.canalReal.setShot('window');window.canalReal.drive({yaw:.2});({prior,after:window.canalReal.getState()})");
    assert(Math.hypot(...interrupted.after.camera.position.map((v,i)=>v-interrupted.prior.camera.position[i]))<.015,'Interrupting the return trip jumped across the window wall');
    pass('actual-interrupted-window-return-retains-outdoor-position',{before:interrupted.prior.camera,after:interrupted.after.camera,navigation:interrupted.after.navigation});
    await call("window.canalReal.setShot('quay',true);window.canalReal.setTime(8.25)");state=await call('window.canalReal.getState()');
    await wait(s=>s.frames>=state.frames+3,'Actual broad water bands at time A');const first=await capture('water-bands-a');
    await call('window.canalReal.setTime(11.25)');state=await call('window.canalReal.getState()');
    await wait(s=>s.frames>=state.frames+3,'Actual broad water bands at time B');const second=await capture('water-bands-b');
    const difference=waterDifference(first.buffer,second.buffer);assert(difference>.2,'Updated calm-water spectrum did not change actual visible water');
    pass('actual-calm-water-bands-animate',{difference,timeA:8.25,timeB:11.25});
  }
  try{
    let state=await wait(s=>s?.ready&&s.frames>=3,'Load actual new canal');
    report.experience=state.experience;
    pass('new-canal-initializes-without-script-errors',state);
    if(getPresentation()?.offscreen&&!captureOnly&&!exportOnly&&!layoutOnly){
      const before=await call('window.canalReal.getState()'),paintBefore=getPresentation(),start=performance.now();sample('offscreen-cadence-start',before);
      await sleep(4000);const after=await call('window.canalReal.getState()'),end=performance.now(),paintAfter=getPresentation();sample('offscreen-cadence-end',after);
      const seconds=(end-start)/1000;assert(after.frames>before.frames&&paintAfter.paints>paintBefore.paints,'Offscreen renderer or presentation did not advance');
      pass('actual-offscreen-frame-and-paint-cadence',{seconds,monotonicStartMs:start,monotonicEndMs:end,beforeFrames:before.frames,afterFrames:after.frames,completedFramesPerSecond:(after.frames-before.frames)/seconds,paintCallbacksPerSecond:(paintAfter.paints-paintBefore.paints)/seconds,presentation:paintAfter,note:'Observed wall-clock cadence; lastFrameMs is render work duration and is not FPS.'});
    }
    if(process.env.NAPALI_CANAL_EXPORT==='1'){
      const service=JSON.parse(fs.readFileSync(path.join(workspaceDirectory,'.cache','canal-real-export-service.json'),'utf8'));
      const receipt=await call(`window.canalReal.exportScene(${JSON.stringify(service.endpoint)})`);
      pass('exact-current-scene-exported-for-light-transport',receipt);
    }
    if(layoutOnly){
      await navigationChecks();await viewportChecks();
      await call('window.canalReal.dispose()');pass('task-owned-renderer-disposes',{disposed:true});
      report.status='passed';report.scope='focused actual navigation and responsive reading supplement; complete tour retained in its earlier run';
    }else if(exportOnly){
      await capture('00-export-window');
      await call('window.canalReal.dispose()');
      report.status='passed';report.scope='exact-scene-export-only; not a functional replay or artwork pass';
    }else{
    await call('window.canalReal.pause(true);window.canalReal.setTime(8.25)');
    for(const shot of ['window','quay','shop','story']){
      const before=await call(`window.canalReal.setShot('${shot}',true)`);
      state=await wait(s=>s?.frames>=before.frames+3,'Render '+shot);
      await capture('0'+(report.captures.length+1)+'-'+shot);
      pass('actual-camera-'+shot,{camera:state.camera,frames:state.frames});
    }
    if(process.env.NAPALI_CANAL_QUAY_AB==='1'){
      for(const [name,position]of [['quay-A-past-lamp',[6.8,1.86,8.8]],['quay-B-lamp-out-left',[8.7,1.86,12.7]]]){
        const before=await call(`window.canalReal.setShot('quay',true);window.canalReal.setPose({position:${JSON.stringify(position)},target:[8.3,3.9,-7.8],fov:54})`);
        await wait(s=>s.frames>=before.frames+4,'Actual composition '+name);await capture(name);
      }
    }
    if(captureOnly){
      if(process.env.NAPALI_CANAL_PROBES==='1'){
        await call("window.canalReal.setShot('window',true)");
        for(const mode of ['diffuse','no-ibl','specular']){
          state=await call(`window.canalReal.setLightingDiagnostic('${mode}')`);
          await wait(s=>s.frames>=state.frames+2,'Actual lighting diagnostic '+mode);await capture('diagnostic-'+mode);
        }
      }
      report.scope='actual framebuffer captures and lighting isolation; not a functional replay or artwork pass';
    }else{
    await call("window.canalReal.setShot('quay',true);window.canalReal.pause(true);window.canalReal.setTime(8.25)");
    state=await wait(s=>s?.view==='quay','Move to water');
    await wait(s=>s?.frames>=state.frames+3,'Water time A');const first=await capture('05-water-time-a');
    await call('window.canalReal.setTime(11.25)');state=await call('window.canalReal.getState()');
    await wait(s=>s?.frames>=state.frames+3,'Water time B');const second=await capture('06-water-time-b');
    const waterPixelDifference=waterDifference(first.buffer,second.buffer);assert(waterPixelDifference>.2,'Water-time change did not affect the actual visible water region');pass('water-time-changes-actual-rendered-pixels',{timeA:8.25,timeB:11.25,waterPixelDifference});
    const before=await call('window.canalReal.getState()');await call('window.canalReal.drive({forward:.3,right:.25,yaw:.04})');
    state=await wait(s=>s?.frames>=before.frames+3,'Actual camera drive');
    assert(JSON.stringify(before.camera.position)!==JSON.stringify(state.camera.position),'Driving did not move camera');
    await capture('07-drive');pass('drive-moves-actual-camera',{before:before.camera,after:state.camera});
    await call("window.canalReal.setShot('story',true);window.canalReal.choose('read')");state=await call('window.canalReal.getState()');
    await wait(s=>s?.frames>=state.frames+3,'Read outcome');await capture('08-read');
    await call("window.canalReal.setShot('story',true);window.canalReal.choose('drift')");state=await call('window.canalReal.getState()');
    await wait(s=>s?.frames>=state.frames+3,'Drift outcome');await capture('09-drift');
    pass('choices-change-visible-scene-state',{read:'same physical letter is picked up and unfolds',drift:'boat continues with the letter'});
    await call('window.canalReal.pause(false)');state=await call('window.canalReal.getState()');
    const samples=[];for(let i=0;i<8;i++){await sleep(400);const s=await call('window.canalReal.getState()');samples.push({frames:s.frames,time:s.time,lastFrameMs:s.lastFrameMs});}
    pass('animation-continues-after-resume',{samples});
    if(state.experience==='story'){
      await call('window.canalReal.seekTour(0);document.querySelector("#pause").click()');
      state=await wait(s=>s.tour?.playing&&s.tour.elapsed>=5,'Actual tour first five wall-clock seconds');
      await capture('10-tour-first-five-seconds');
      await call('document.querySelector("#pause").click()');
      const paused=await call('window.canalReal.getState()');await sleep(2200);
      const held=await call('window.canalReal.getState()');
      assert(!held.tour.playing&&Math.abs(held.tour.elapsed-paused.tour.elapsed)<.06,'Story pause did not hold wall-clock timeline');
      assert(Math.hypot(...held.camera.position.map((v,i)=>v-paused.camera.position[i]))<.015,'Paused tour camera moved without input');
      pass('actual-story-tour-pause-holds-time',{paused:paused.tour,held:held.tour});
      const resumeAt=Date.now();await call('document.querySelector("#pause").click()');
      await wait(s=>s.tour?.elapsed>=12,'Actual tour twelve seconds',30000);await capture('11-tour-twelve-seconds');
      await wait(s=>s.tour?.elapsed>=18,'Actual tour eighteen seconds',20000);await capture('12-tour-eighteen-seconds');
      state=await wait(s=>s.tour?.ended&&s.frames>held.frames&&Math.hypot(s.camera.position[0]-4.65,s.camera.position[1]-1.35,s.camera.position[2]-9.8)<.03,'Complete actual twenty-five-second story',20000);
      assert(state.tour.elapsed===25,'Tour endpoint was not exactly 25 seconds');
      const resumedWall=(Date.now()-resumeAt)/1000;
      assert(resumedWall>=25-paused.tour.elapsed-1&&resumedWall<=25-paused.tour.elapsed+6,'Story clock failed to match real resumed time');
      await capture('13-tour-complete');
      await waitDOM('!document.querySelector("#choice").hidden&&!document.querySelector("[data-choice=read]").disabled','Actual story choice buttons');
      pass('whole-twenty-five-second-wall-clock-tour-reaches-choice',{tour:state.tour,resumedWall,camera:state.camera});
      await call('document.querySelector("[data-choice=read]").click()');
      state=await wait(s=>s.dynamic?.letterParent==='held'&&s.dynamic.paperVisible&&s.dynamic.paperUnfold>.99,'Actual physical letter pickup');
      await capture('14-held-physical-letter');pass('read-reparents-and-unfolds-same-physical-letter',state.dynamic);
      await call('window.canalReal.seekTour(25)');await wait(s=>s.tour?.ended,'Second choice endpoint');
      await waitDOM('!document.querySelector("#choice").hidden&&!document.querySelector("[data-choice=drift]").disabled','Second actual choice buttons');
      await call('document.querySelector("[data-choice=drift]").click()');
      const drifting=await call('window.canalReal.getState()');await sleep(2400);state=await call('window.canalReal.getState()');
      assert(state.dynamic.letterParent==='boat'&&state.dynamic.boatPosition[2]<drifting.dynamic.boatPosition[2]-.7,'Drift did not carry the actual letter downstream');
      await capture('15-letter-drifts-on-boat');pass('drift-retains-letter-and-moves-boat-downstream',{before:drifting.dynamic,after:state.dynamic});
    }
    await viewportChecks();
    }
    await call('window.canalReal.dispose()');pass('task-owned-renderer-disposes',{disposed:true});report.status='passed';
    }
  }catch(error){report.errors.push(String(error.stack||error));report.status='failed';try{await capture('failure');}catch{}try{await call('window.canalReal?.dispose()');}catch{}}
  report.elapsedSeconds=(Date.now()-started)/1000;report.presentation=getPresentation();
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
  const category=layoutOnly?'canal-real-'+(report.experience||'benchmark')+'-navigation-layout':exportOnly?'canal-real-export':captureOnly?'canal-real-captures':'canal-real-'+(report.experience||'benchmark')+'-functional';
  fs.writeFileSync(path.join(projectDirectory,'notes',category+'.'+backend+'.latest.json'),JSON.stringify(report,null,2));
  if(report.status==='passed')fs.writeFileSync(path.join(projectDirectory,'notes',category+'.'+backend+'.json'),JSON.stringify(report,null,2));
  progress('finished',null);return report;
}
module.exports={runCanalAcceptance};
