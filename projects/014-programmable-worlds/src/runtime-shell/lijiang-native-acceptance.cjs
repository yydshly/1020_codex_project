'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {nativeImage}=require('electron');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function runLijiangNativeAcceptance({window,projectDirectory,workspaceDirectory,backend,record,getFatal,getPresentation}){
 const runId=new Date().toISOString().replace(/[:.]/g,'-'),start=Date.now();
 const output=path.join('C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-qa',runId);
 fs.mkdirSync(output,{recursive:true});
 const report={runId,status:'running',scene:'lijiang-native',backend,tests:[],captures:[],errors:[],artworkQualityAccepted:false,scope:'Source-renderer-derived fixed-camera quality candidate; functionality and screenshots alone do not pass the source-quality visual gate.',output};
 const statusFile=path.join(workspaceDirectory,'.cache','lijiang-native-qa-status.json');
 function progress(phase,state){fs.writeFileSync(statusFile,JSON.stringify({...report,phase,state,elapsedSeconds:(Date.now()-start)/1000},null,2));}
 async function call(js){if(window.isVisible()||window.isFocused())throw new Error('Own QA window became visible/focused');if(getFatal())throw new Error(getFatal());return window.webContents.executeJavaScript(js,false);}
 async function wait(fn,label,timeout=1200000){const end=Date.now()+timeout;while(Date.now()<end){const s=await call(`({control:window.napaliControl?.getState(),diagnostics:window.napaliDiagnostics,progress:document.getElementById('loadtxt')?.textContent,native:window.lijiangNative?.getState?.()||window.lijiangNative||null})`);if(s.control?.error||s.progress?.startsWith('Error:'))throw new Error(s.control?.error||s.progress);progress(label,s);if(fn(s))return s;await sleep(300);}throw new Error(label+' timeout');}
 function pass(name,evidence){report.tests.push({name,passed:true,evidence});}
 async function capture(name){const data=await call(`document.getElementById('c').toDataURL('image/png')`),img=nativeImage.createFromDataURL(data),bytes=img.toPNG();const file=path.join(output,name+'.png');fs.writeFileSync(file,bytes);report.captures.push({name,path:file,sha256:hash(bytes),...img.getSize(),state:await call(`({control:napaliControl.getState(),camera:flightCam(napaliControl.getState().time),diagnostic:Q.get('dbgm'),native:window.lijiangNative?.getState?.()||window.lijiangNative||null})`)});return img;}
 try{
  report.actualEntry=await call('location.href');
  const loaded=await call(`[...document.scripts].find(s=>s.textContent.includes('const GLSL_COMMON'))?.textContent||''`);const loadedPath=path.join(output,'loaded-engine-script.js');fs.writeFileSync(loadedPath,loaded);report.loadedSource={path:loadedPath,sha256:hash(Buffer.from(loaded)),bytes:Buffer.byteLength(loaded)};
  let s=await wait(s=>s.control?.ready,'Native complete source pipeline initialization');
  await call(`napaliControl.pause(true);napaliControl.seek(45);document.querySelector('.runtime-ui')?.setAttribute('hidden','');if(typeof hudOn!=='undefined')hudOn=false;true`);
  report.floatFiltering=await call(`(()=>{const old=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.bindTexture(gl.TEXTURE_2D,world.hTex);const r={floatLinear:LINF,min:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER),mag:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER)};gl.bindTexture(gl.TEXTURE_2D,old);return r;})()`);
  if(process.env.LIJIANG_NATIVE_FIELD_PROBE==='1'){
   const field=await call(`(async()=>{napaliControl.suspend(true);while(napaliControl.getState().rendering)await new Promise(r=>setTimeout(r,30));const n=1024,t=tex(n,2,gl.RGBA32F,gl.RGBA,gl.FLOAT,gl.NEAREST),fb=fbo(t),p=prog(GLSL_COMMON+'uniform sampler2D a,b,c,d;out vec4 o;void main(){float u=gl_FragCoord.x/1024.;vec2 w=gl_FragCoord.y<1.?vec2(mix(220.,950.,u),-170.):vec2(575.,mix(-700.,500.,u));o=vec4(textureLod(a,(w-vec2(-2400.))/4800.,0.).r,textureLod(b,(w-vec2(-2400.))/4800.,0.).r,textureLod(c,(w-vec2(-2000.))/4000.,0.).r,textureLod(d,(w-vec2(-2400.))/4800.,0.).r);}');gl.useProgram(p.p);for(const[i,key,v]of [[0,'a',world.hTex],[1,'b',world.bTex],[2,'c',world.eTex],[3,'d',world.msTex]]){bindTex(i,v);gl.uniform1i(p.u[key],i);}gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,n,2);gl.drawArrays(gl.TRIANGLES,0,3);await gpuWait();const out=new Float32Array(n*2*4);gl.readPixels(0,0,n,2,gl.RGBA,gl.FLOAT,out);const error=gl.getError();gl.deleteProgram(p.p);gl.deleteFramebuffer(fb);gl.deleteTexture(t);napaliControl.suspend(false);return {columns:n,channels:['finalHeight','baseHeight','erodedHeight','maxSlope'],rows:[{x0:220,x1:950,z:-170},{x:575,z0:-700,z1:500}],glError:error,data:Array.from(out)};})()`);
   const file=path.join(output,'height-profiles.json');fs.writeFileSync(file,JSON.stringify(field));report.fieldProbe={path:file,sha256:hash(fs.readFileSync(file)),glError:field.glError};
  }
  const frame=await call('napaliControl.getState().frames');s=await wait(s=>s.control?.frames>=frame+2&&s.control.time===45,'Native actual fixed final-view frames');
  if(s.control.scale!==1||s.control.autoQuality)throw new Error('Candidate used reduced or automatic quality');pass('complete-native-source-pipeline-real-frames-at-full-scale',s);
  const im=await capture('fixed-45-full');
  // Exact pixel crops preserve the information visible in the actual full frame.
  const {width,height}=im.getSize();for(const [name,x,y,w,h]of [['rock',.40,.15,.36,.52],['near-forest',0,.48,.38,.43],['bank-water',.35,.54,.58,.44]]){const rect={x:Math.floor(x*width),y:Math.floor(y*height),width:Math.floor(w*width),height:Math.floor(h*height)},bytes=im.crop(rect).toPNG(),file=path.join(output,name+'-crop.png');fs.writeFileSync(file,bytes);report.captures.push({name:name+'-crop',path:file,sha256:hash(bytes),source:'fixed-45-full',rect});}
  report.airAcceleration=await call('window.lijiangNativeMaxHeight?.getState()||null');
  if(process.env.LIJIANG_NATIVE_SHORT_STATE==='1'){
   await call(`(async()=>{napaliControl.suspend(true);while(napaliControl.getState().rendering)await new Promise(r=>setTimeout(r,30));window.__nativeShortStateFS=FS_RENDER.replace(/^\\s+(?:float|bool|vec[234]) liSaved_(?!gWhy\\b|gIt\\b|gHz\\b)[^\\n]+;/gm,'').replace(/^\\s+(?!gWhy\\b|gIt\\b|gHz\\b)\\w+=liSaved_\\w+;/gm,'');if((window.__nativeShortStateFS.match(/(?:float|bool|vec[234]) liSaved_/g)||[]).length!==3)throw new Error('Expected exactly three live state saves');pr=await progDeferred(window.__nativeShortStateFS,'Native three-live-state comparison');napaliControl.suspend(false);return true;})()`);
   const n=await call('napaliControl.getState().frames');await wait(s=>s.control.frames>=n+2,'Actual three-live-water-state comparison');
   const other=await capture('three-water-states-same-camera'),a=im.toBitmap(),b=other.toBitmap();let total=0,large=0;
   for(let i=0;i<a.length;i+=4){let m=0;for(let j=0;j<3;j++){const d=Math.abs(a[i+j]-b[i+j]);total+=d;m=Math.max(m,d);}if(m>40)large++;}
   const file=path.join(output,'three-live-water-states.fs.glsl');fs.writeFileSync(file,await call('window.__nativeShortStateFS'));
   report.waterStateComparison={path:file,meanAbsoluteRGBDifference:total/(width*height*3),fractionPixelsAnyChannelDifferenceOver40:large/(width*height),pixelBytesIdentical:a.equals(b),scope:'Same actual field, camera, time and full geometry; only three post-water live scalar states are preserved. GPU timing is measured rather than inferred from source size.'};
  }
  if(process.env.LIJIANG_NATIVE_MAX_COMPARE==='1'){
   const n=await call(`lijiangNativeMaxHeight.setEnabled(false);napaliControl.getState().frames`);
   await wait(s=>s.control.frames>=n+2,'Same actual field with conservative air acceleration disabled');
   const other=await capture('maxheight-disabled-same-camera'),a=im.toBitmap(),b=other.toBitmap();let total=0,large=0;
   for(let i=0;i<a.length;i+=4){let m=0;for(let j=0;j<3;j++){const d=Math.abs(a[i+j]-b[i+j]);total+=d;m=Math.max(m,d);}if(m>40)large++;}
   report.maxHeightComparison={meanAbsoluteRGBDifference:total/(width*height*3),fractionPixelsAnyChannelDifferenceOver40:large/(width*height),scope:'Actual same generated field/camera/time. Numerical hit search can vary at the subpixel scale; this metric is evidence for visual review, not artwork acceptance.'};
   const m=await call(`lijiangNativeMaxHeight.setEnabled(true);napaliControl.getState().frames`);await wait(s=>s.control.frames>=m+2,'Conservative air acceleration restored');
  }
  if(process.env.LIJIANG_NATIVE_FLIGHT==='1'){
   for(const time of [0,12,25,45]){
    const n=await call(`napaliControl.seek(${time});napaliControl.getState().frames`);
    await wait(s=>s.control.frames>=n+2&&s.control.time===time,'Actual production flight shot '+time);await capture('flight-'+time);
   }
  }
  if(process.env.LIJIANG_NATIVE_COMPOSITION==='1'){
   await call(`window.__nativeSavedCS={...CS};true`);
   for(const [name,pos,target,fov]of [['low-left-river',[-50,16,650],[520,0,-480],58],['open-river-group',[25,30,1075],[80,-20,-450],52]]){
    const n=await call(`(()=>{const p=${JSON.stringify(pos)},a=${JSON.stringify(target)};Object.assign(CS,{x:()=>p[0],y:()=>p[1],z:()=>p[2],lx:()=>a[0],ly:()=>a[1],lz:()=>a[2],fov:()=>${fov}});return napaliControl.getState().frames;})()`);
    await wait(s=>s.control.frames>=n+2,'Actual production composition '+name);await capture('composition-'+name);
   }
   const n=await call(`Object.assign(CS,window.__nativeSavedCS);delete window.__nativeSavedCS;napaliControl.getState().frames`);
   await wait(s=>s.control.frames>=n+2,'Original fixed quality camera restored');
  }
  if(process.env.LIJIANG_NATIVE_COMPARE_CANOPY==='1'){
   const n=await call(`Q.set('dbgm','85');napaliControl.getState().frames`);await wait(s=>s.control.frames>=n+2,'Isolated source ground-canopy diagnostic');await capture('diagnostic-ground-canopy-off');const m=await call(`Q.delete('dbgm');napaliControl.getState().frames`);await wait(s=>s.control.frames>=m+2,'Default source ground canopy restored');
  }
  if(process.env.LIJIANG_NATIVE_DIAGNOSTICS==='1'){
   for(const[mode,name]of [[1,'material'],[22,'independent-trees-off'],[85,'ground-canopy-off']]){const n=await call(`Q.set('dbgm','${mode}');napaliControl.getState().frames`);await wait(s=>s.control.frames>=n+2,'Isolated source diagnostic '+name);await capture('diagnostic-'+name);}const n=await call(`Q.delete('dbgm');napaliControl.getState().frames`);await wait(s=>s.control.frames>=n+2,'Default shading after component isolation');
  }
  if(process.env.LIJIANG_NATIVE_EXPORT_SMOKE==='1'){
   const before=await call(`({state:napaliControl.getState(),size:[cv.width,cv.height],hook:!!window.lijiangNativeExport?.startQA})`);if(!before.hook)throw new Error('Actual native exporter module did not install');
   await call(`window.__nativeQAJob=window.lijiangNativeExport.startQA({duration:.1,width:1920,height:1080,fps:60}).then(()=>({ok:true}),e=>({error:String(e.stack||e)}));true`);
   const deadline=Date.now()+240000;let exportState;
   while(Date.now()<deadline){exportState=await call('window.lijiangNativeExport.getState()');progress('Actual native six-frame 1080p60 QA encoding',exportState);if(['complete','error','cancelled'].includes(exportState.phase))break;await sleep(300);}
   if(exportState?.phase!=='complete')throw new Error('Native QA export failed: '+JSON.stringify(exportState));
   report.exportSmoke={before,after:await call('({state:napaliControl.getState(),size:[cv.width,cv.height],exportState:lijiangNativeExport.getState()})')};
   const metadata=await call('lijiangNativeExport.metadata()');if(metadata.frameCount!==6||metadata.width!==1920||metadata.height!==1080||!metadata.timestampGridVerified)throw new Error('Actual native QA encoded metadata mismatch');
   const chunks=[];for(let offset=0;offset<metadata.size;){const part=await call(`lijiangNativeExport.readChunk({offset:${offset},length:524288,exportId:${JSON.stringify(metadata.exportId)}})`);const bytes=Buffer.from(part.data,'base64');if(bytes.length!==part.byteLength||part.offset!==offset||part.nextOffset<=offset)throw new Error('Native video chunk mismatch');chunks.push(bytes);offset=part.nextOffset;}
   const file=path.join(output,path.basename(metadata.filename));fs.writeFileSync(file,Buffer.concat(chunks));report.exportSmoke.file={path:file,bytes:fs.statSync(file).size,sha256:hash(fs.readFileSync(file)),metadata};
  }
  if(process.env.LIJIANG_NATIVE_NO_ROCK==='1'){
   progress('Compile isolated no-rock-relief diagnostic; same camera and generated field',null);
   await call(`(async()=>{napaliControl.suspend(true);while(napaliControl.getState().rendering)await new Promise(r=>setTimeout(r,40));PARAMS.vegRange=0;const token='if(rw>.01) d=';if(FS_RENDER.split(token).length!==2)throw new Error('Rock diagnostic anchor changed');pr=await progDeferred(FS_RENDER.replace(token,'if(false) d='),'Native no-rock diagnostic');napaliControl.suspend(false);return true;})()`);
   const n=await call('napaliControl.getState().frames');await wait(s=>s.control.frames>=n+2,'Actual isolated no-rock-relief view');await capture('diagnostic-no-rock-relief');report.diagnostic='Only terrSD rockDisp disabled in own runtime after baseline capture; not a release shader or visual acceptance.';
  }
  const a=await call('napaliControl.getState()');await wait(s=>s.control.frames>a.frames,'Actual held native renderer completes another frame',120000);const b=await call('napaliControl.getState()');if(b.time!==a.time||b.frames<=a.frames)throw new Error('Native held-view renderer did not continue real rendering');pass('actual-paused-view-holds-time-while-rendering',{before:a,after:b});
  const resources=await call('performance.getEntriesByType("resource").map(r=>r.name)');if(resources.some(r=>/\.(png|jpe?g|hdr|exr|glb|gltf|obj|fbx|webp)(?:[?#]|$)/i.test(r)))throw new Error('Native candidate loaded scene assets');pass('no-external-scene-assets',resources);
  await call('napaliControl.suspend(true)');pass('own-native-candidate-suspended',{suspended:true});report.status='passed';
 }catch(e){report.status='failed';report.errors.push(String(e.stack||e));try{if(await call('!!window.napaliControl')){await capture('failure');await call('napaliControl.suspend(true)');}}catch{}}
 report.elapsedSeconds=(Date.now()-start)/1000;report.presentation=getPresentation();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(projectDirectory,'notes','lijiang-native-fixed-view.'+backend+'.latest.json'),JSON.stringify(report,null,2));progress('finished',null);return report;
}
module.exports={runLijiangNativeAcceptance};
