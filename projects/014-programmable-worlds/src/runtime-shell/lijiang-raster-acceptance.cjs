'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {nativeImage}=require('electron');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function runLijiangRasterAcceptance({window,getFatal,getPresentation,record,projectDirectory}){
 const runId=new Date().toISOString().replace(/[:.]/g,'-'),output=path.join('C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-raster-qa',runId);
 fs.mkdirSync(output,{recursive:true});const start=Date.now(),report={runId,output,status:'running',artAccepted:false,tests:[],errors:[],captures:[]};
 const progress=(phase,state)=>{report.phase=phase;report.elapsedSeconds=(Date.now()-start)/1000;fs.writeFileSync(path.join(output,'status.json'),JSON.stringify({...report,state},null,2));};
 const call=async js=>{if(window.isVisible()||window.isFocused()||getFatal())throw new Error(getFatal()||'Own hidden QA window became visible/focused');return window.webContents.executeJavaScript(js,false);};
 let fieldsSaved=false;
 async function saveGeneratedFields(){
  if(fieldsSaved||!await call('!!window.lijiangRasterFields'))return;fieldsSaved=true;if(await call('!!lijiangRasterFields.provenance.qaGeneratedFieldCache')){report.generatedFieldCache={reused:true,engineSHA256:await call('lijiangRasterFields.provenance.engineSHA256')};return;}
  if(await call('!!lijiangRasterFields.rocks?.length')){report.generatedFieldCache={reused:false,saved:false,scope:'Actual full production generation. Only the dedicated immutable producer may publish a complete terrain/rock bundle.'};return;}
  const root='C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-generated-fields';fs.mkdirSync(root,{recursive:true});
  const engineSHA=crypto.createHash('sha256').update(fs.readFileSync(path.join(projectDirectory,'web/lijiang-native/engine.html'))).digest('hex');
  const meta=await call(`(()=>{const f=lijiangRasterFields,m={rect:f.rect,resolution:f.resolution,provenance:f.provenance,fields:{}};window.__fieldExport={};for(const k of ['height','vegetation','attributes']){__fieldExport[k]=new Uint8Array(f[k].data.buffer,f[k].data.byteOffset,f[k].data.byteLength);m.fields[k]={width:f[k].width,height:f[k].height,channels:f[k].channels,type:'Float32Array',byteLength:f[k].data.byteLength};}for(const k of ['trees','bushes']){const a=new Float64Array(f[k].length*6);f[k].forEach((p,i)=>a.set([p.x,p.y,p.z,p.radius,p.species,p.seed],i*6));__fieldExport[k]=new Uint8Array(a.buffer);m.fields[k]={count:f[k].length,type:'Float64Array',byteLength:a.byteLength};}return m;})()`);
  meta.engineSHA256=engineSHA;meta.generatedAt=new Date().toISOString();meta.scope='QA cache of actual runtime code-generated fields, not authored models or imagery';
  for(const[k,info]of Object.entries(meta.fields)){
   const name=engineSHA.slice(0,12)+'-'+k+'.bin',file=path.join(root,name),fd=fs.openSync(file,'w');
   try{for(let offset=0;offset<info.byteLength;offset+=524288){const n=Math.min(524288,info.byteLength-offset),b64=await call(`(()=>{const a=__fieldExport[${JSON.stringify(k)}].subarray(${offset},${offset+n});let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);})()`);fs.writeSync(fd,Buffer.from(b64,'base64'));}}finally{fs.closeSync(fd);}
   info.file=name;info.sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(meta,null,2));await call('delete window.__fieldExport;true');report.generatedFieldCache={root,engineSHA256:engineSHA};
 }

 try{
  report.modules={};for(const name of ['raster-main.js','raster-terrain.js','raster-forest.js','raster-water-sky.js','raster-air.js','raster-sdf-mesh.js','raster-cliff-gardens.js','raster-experience-ui.js','native-sdf-fields.js','native-surface-fields.js','native-radiance-field.js','native-pilot-builder.js','raster-rock-cull.js','raster-color-grade.js','raster-riparian.js']){const bytes=fs.readFileSync(path.join(projectDirectory,'web/lijiang-native',name));fs.writeFileSync(path.join(output,name),bytes);report.modules[name]=crypto.createHash('sha256').update(bytes).digest('hex');}
  const deadline=Date.now()+1200000;let state;
  while(Date.now()<deadline){state=await call(`({world:window.lijiangRaster?.getState(),load:document.querySelector('#load-detail')?.textContent})`);progress('await-runtime-generated-fields-and-real-raster',state);await saveGeneratedFields();if(state.world?.error)throw new Error(state.world.error);if(state.world?.ready)break;await sleep(500);}
  if(!state?.world?.ready)throw new Error('Raster initialization timeout');
  report.initial=state;report.tests.push({name:'complete-pure-code-raster-scene-loaded',passed:true});
  report.adapter=await call(`(()=>{const gl=lijiangRaster.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
  for(const time of [0,25,45]){
   await call(`lijiangRaster.prepareView(${time});lijiangRaster.setClean(true);true`);
   const before=await call('lijiangRaster.getState().frames');let shot;await call(`(async()=>{lijiangRaster.suspend(true);while(lijiangRaster.getState().rendering)await new Promise(r=>setTimeout(r,10));for(let i=0;i<3;i++)await lijiangRaster.renderAt(${time});})()`);
   const until=Date.now()+180000;while(Date.now()<until){shot=await call('lijiangRaster.getState()');if(shot.frames>=before+3)break;await sleep(250);}
   if(shot.frames<before+3)throw new Error('Raster frame progression stalled at '+time);
   const data=await call(`document.querySelector('#scene').toDataURL('image/png')`),img=nativeImage.createFromDataURL(data),pixels=img.toBitmap();let nonBlack=0;for(let k=0;k<pixels.length;k+=4)if(pixels[k]+pixels[k+1]+pixels[k+2]>15)nonBlack++;if(nonBlack<pixels.length/4*.15)throw new Error('Actual raster canvas is black');const bytes=img.toPNG(),file=path.join(output,'flight-'+time+'.png');fs.writeFileSync(file,bytes);
   report.captures.push({time,path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),state:shot});progress('actual-flight-shot-'+time,shot);
  }
  if(process.env.LIJIANG_RASTER_SHADOW_DIAG==='1'){
   await call(`lijiangRaster.renderer.shadowMap.enabled=false;lijiangRaster.scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;}});lijiangRaster.prepareView(45);true`);
   await call('lijiangRaster.renderAt(45)');const png=nativeImage.createFromDataURL(await call(`document.querySelector('#scene').toDataURL('image/png')`)).toPNG();const file=path.join(output,'diagnostic-no-shadows-45.png');fs.writeFileSync(file,png);report.shadowDiagnostic={path:file,scope:'Only shadow mapping disabled in this own QA process; not production shader or artwork acceptance'};
   await call(`lijiangRaster.renderer.shadowMap.enabled=true;lijiangRaster.renderer.shadowMap.needsUpdate=true;lijiangRaster.scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;}});true`);await call('lijiangRaster.renderAt(45)');
  }
  report.gpuCompletedFrames=await call(`(async()=>{const api=lijiangRaster;api.suspend(true);while(api.getState().rendering)await new Promise(r=>setTimeout(r,10));const gl=api.renderer.getContext(),samples=[];for(let i=0;i<35;i++){const t=performance.now();await api.renderAt(45);samples.push(performance.now()-t);await new Promise(r=>setTimeout(r,10));}api.suspend(false);return{samples,meanMilliseconds:samples.slice(5).reduce((a,b)=>a+b,0)/30,state:api.getState()};})()`);
  report.tests.push({name:'actual-gpu-completed-render-timing',passed:true});
  await call('lijiangRaster.suspend(false);true');let idleReady=false;for(let k=0;k<120;k++){if(await call('lijiangRaster.getState().idle&&!lijiangRaster.getState().rendering')){idleReady=true;break;}await sleep(500);}if(!idleReady)throw new Error('Paused raster never reached idle');const idleA=await call('lijiangRaster.getState()');await sleep(1500);const idleB=await call('lijiangRaster.getState()');report.pausedIdle={before:idleA,after:idleB};if(!idleB.idle||idleA.frames!==idleB.frames)throw new Error('Paused raster still redraws unchanged frames');report.tests.push({name:'unchanged-paused-scene-does-not-burn-gpu',passed:true});
  const resources=await call(`performance.getEntriesByType('resource').map(r=>r.name)`);report.resources=resources;
  if(resources.some(r=>/\.(png|jpe?g|hdr|exr|glb|gltf|obj|fbx|webp)(?:[?#]|$)/i.test(r)))throw new Error('Raster scene loaded external scene asset');
  report.tests.push({name:'no-authored-model-image-or-HDR-assets',passed:true});
  report.beforeDispose=await call('lijiangRaster.getState()');await call('lijiangRaster.dispose()');report.afterDispose=await call('lijiangRaster.getState()');report.status='passed';
 }catch(error){report.status='failed';report.errors.push(String(error.stack||error));try{const bytes=nativeImage.createFromDataURL(await call(`document.querySelector('#scene').toDataURL('image/png')`)).toPNG();fs.writeFileSync(path.join(output,'failure.png'),bytes);}catch{}}
 report.presentation=getPresentation();progress('finished');fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));record('raster-qa-result',{status:report.status,output,errors:report.errors});return report;
}
module.exports={runLijiangRasterAcceptance};
