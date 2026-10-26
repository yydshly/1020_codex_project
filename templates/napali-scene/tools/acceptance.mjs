// Uses the upstream's own headless CDP driver; never opens or controls user tabs.
import {launch} from '../vendor/napali/tools/cdp.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const origin = process.env.NAPALI_SCENE_URL || 'http://127.0.0.1:8820/';
const out = path.resolve(process.env.NAPALI_SCENE_ARTIFACTS || 'artifacts/acceptance');
mkdirSync(out,{recursive:true});
const report={status:'running',url:origin,tests:[],errors:[],startedAt:new Date().toISOString()};
const runtime=process.argv.includes('--runtime');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const pass=(name,detail)=>{report.tests.push({name,passed:true,detail});writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('PASS '+name);};
let browser;
try {
  browser=await launch({width:960,height:640});
  const evaluate=browser.evaluate;
  browser.evaluate=async(...args)=>{let timer;try{return await Promise.race([evaluate(...args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Page evaluation exceeded 30 seconds')),30000);})]);}finally{clearTimeout(timer);}};
  await browser.navigate(origin);
  await browser.waitFor("document.querySelector('#start') && !document.querySelector('#start').disabled",15000);
  assert(await browser.evaluate("document.querySelectorAll('iframe').length===0"),'Launcher started a scene automatically');
  writeFileSync(path.join(out,'launcher-desktop.png'),await browser.screenshot());
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile overflow');
  writeFileSync(path.join(out,'launcher-mobile.png'),await browser.screenshot());
  pass('explicit-start-and-mobile-layout',{desktop:'960x640',mobile:'390x844',autoStarted:false});
  if(runtime){
    await browser.send('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false});
    await browser.evaluate("document.querySelector('#start').click()");
    const child="document.querySelector('iframe').contentWindow";
    let previous='';const deadline=Date.now()+240000;
    for(;;){
      const result=await browser.evaluate(`(()=>{const w=${child};return {phase:w.napaliDiagnostics||null,control:w.napaliControl?.getState()||null,error:w.document.querySelector('#loadtxt')?.textContent||null};})()`);
      const phase=result.phase?.phase;
      if(phase!==previous){previous=phase;console.log('PHASE '+JSON.stringify(result.phase));writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2));}
      if(result.control?.error || result.error?.startsWith('Error:'))throw Error(JSON.stringify(result));
      if(result.control?.frames>=2){await browser.evaluate(`${child}.napaliControl.pause(true);${child}.napaliControl.suspend(true);`);break;}
      if(Date.now()>deadline)throw Error('Full baseline runtime exceeded 240 seconds; no runtime success claimed');
      await new Promise(r=>setTimeout(r,500));
    }
    const state=await browser.evaluate(`${child}.sceneTemplate.getState()`);
    assert(state.control.ready&&state.control.frames>=2,'No completed actual frames');
    pass('full-baseline-generates-and-renders',{frames:state.control.frames,phase:state.phase,params:state.config.params,sourceSHA256:state.sourceSHA256,frameMs:state.control.lastFrameMs,scale:state.control.scale});
    const driven=await browser.evaluate(`(()=>{const w=${child};w.napaliControl.seek(35);w.napaliControl.setQuality(0.75);const a=w.napaliDrive.getState();w.napaliDrive.setMode('free');w.napaliDrive.move({forward:2,up:1});w.napaliDrive.look({yawDelta:0.05});const b=w.napaliDrive.getState();w.napaliDrive.setMode('flight');return {control:w.napaliControl.getState(),a,b,route:w.sceneTemplate.checkRoute(10)};})()`);
    assert(driven.control.time===35&&driven.control.scale===0.75&&driven.b.mode==='free'&&driven.b.yaw!==driven.a.yaw,'Control API failed');
    pass('seek-quality-free-drive-and-route-diagnostic',driven);
    await browser.evaluate(`${child}.napaliControl.setQuality(0.5);${child}.napaliControl.suspend(false);`);
    const previousFrames=await browser.evaluate(`${child}.napaliControl.getState().frames`);
    await browser.waitFor(`${child}.napaliControl.getState().frames>${previousFrames}`,30000);
    await browser.evaluate(`${child}.napaliControl.suspend(true)`);
    await browser.waitFor(`!${child}.napaliControl.getState().rendering`,30000);
    writeFileSync(path.join(out,'runtime-driven.png'),await browser.screenshot());
    await browser.evaluate("document.querySelector('#stop').click()");
    assert(await browser.evaluate("document.querySelectorAll('iframe').length===0&&!document.querySelector('#start').disabled"),'Stop did not unload');
    pass('stop-unloads-renderer',{iframes:0});
  }
  report.status='passed';
}catch(error){report.status='failed';report.errors.push(error.stack||String(error));}
finally{report.finishedAt=new Date().toISOString();writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));if(browser)await browser.close();}
console.log(JSON.stringify({status:report.status,tests:report.tests.length,errors:report.errors,output:out}));
if(report.status!=='passed')process.exitCode=1;
