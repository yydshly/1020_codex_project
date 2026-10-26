'use strict';

// Measurement only, in the caller's own hidden renderer. No release shader or
// source/A/B file is changed. The default run compares two identical full-size
// frames per batching choice; diagnostic effect removal is explicitly opt-in.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { nativeImage } = require('electron');

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function replaceFunctionBody(source, name, replacement) {
  const expression = new RegExp('\\b(?:float|bool|vec[234]|void)\\s+' + name + '\\s*\\([^;{}]*\\)\\s*\\{', 'g');
  const matches = [...source.matchAll(expression)];
  if (matches.length !== 1) throw new Error('Expected one shader definition of ' + name);
  const bodyStart = matches[0].index + matches[0][0].length;
  let depth = 1, cursor = bodyStart;
  for (; cursor < source.length && depth; cursor++) {
    if (source.startsWith('//', cursor)) {
      const end = source.indexOf('\n', cursor + 2);
      cursor = end < 0 ? source.length : end;
    } else if (source.startsWith('/*', cursor)) {
      const end = source.indexOf('*/', cursor + 2);
      if (end < 0) throw new Error('Unclosed shader comment');
      cursor = end + 1;
    } else if (source[cursor] === '{') depth++;
    else if (source[cursor] === '}') depth--;
  }
  if (depth) throw new Error('Unclosed shader definition of ' + name);
  return source.slice(0, bodyStart) + replacement + source.slice(cursor - 1);
}

async function runLijiangNativePerformance({ window, getFatal = () => null,
  getPresentation = () => null, record = () => {}, outputDirectory,
  includeDiagnostics = process.env.LIJIANG_NATIVE_PERF_DIAGNOSTICS === '1',
  repetitions = 2, fixedTime = 45 }) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 4) throw new Error('Performance repetitions must be 1..4');
  if (!Number.isFinite(fixedTime) || fixedTime < 0 || fixedTime > 45) throw new Error('Invalid fixed camera time');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const output = outputDirectory || path.join('C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-performance', runId);
  if (!path.isAbsolute(output)) throw new Error('Performance artifacts require an absolute task path');
  fs.mkdirSync(output, { recursive: true });
  const started = Date.now();
  const report = { schema: 'lijiang-native-performance-v1', runId, status: 'running',
    artworkQualityAccepted: false, output, fixedTime, tests: [], errors: [], variants: [],
    scope: 'Actual full-size fixed-camera renderer timing. Diagnostic effect removals are not proposed release quality changes.',
    gpuTimerCaveat: 'EXT elapsed queries bracket GPU commands across the existing cooperative submission waits; they can include command-stream scheduling gaps. Compare with wall time and wait counts, not a fabricated pure shader-time claim.' };
  const progress = phase => {
    report.phase = phase;
    report.elapsedSeconds = (Date.now() - started) / 1000;
    fs.writeFileSync(path.join(output, 'status.json'), JSON.stringify(report, null, 2));
    record('native-performance-progress', { phase, elapsedSeconds: report.elapsedSeconds, output });
  };
  const call = async js => {
    if (!window || window.isDestroyed() || window.isVisible() || window.isFocused()) throw new Error('Performance window must remain own, hidden and unfocused');
    if (getFatal()) throw new Error(getFatal());
    return window.webContents.executeJavaScript(js, false);
  };
  const saveFrame = (name, data) => {
    const bitmap = Buffer.from(data.pixels, 'base64');
    if (bitmap.length !== data.width * data.height * 4) throw new Error('Actual pixel byte count mismatch');
    // readPixels is bottom-up RGBA. Keep exact raw bytes for equality and store
    // the independently obtained visible canvas PNG for visual inspection.
    const file = path.join(output, name + '.png');
    const png = nativeImage.createFromDataURL(data.png).toPNG();
    fs.writeFileSync(file, png);
    return { path: file, width: data.width, height: data.height,
      rgbaReadPixelsSHA256: digest(bitmap), pngSHA256: digest(png), bitmap };
  };
  let initialized = false;
  try {
    progress('await-own-native-renderer');
    const deadline = Date.now() + 1200000;
    while (Date.now() < deadline) {
      const state = await call('({state:window.napaliControl?.getState(),load:document.getElementById("loadtxt")?.textContent})');
      if (state.state?.error || /^Error:/.test(state.load || '')) throw new Error(state.state?.error || state.load);
      if (state.state?.ready) break;
      await sleep(300);
    }
    report.identity = await call(`(async()=>{
      if(!window.napaliControl?.getState().ready)throw new Error('Native renderer not ready');
      const saved=napaliControl.getState();
      napaliControl.pause(true);napaliControl.suspend(true);
      while(napaliControl.getState().rendering)await new Promise(r=>setTimeout(r,20));
      await gpuWait();
      const dbg=gl.getExtension('WEBGL_debug_renderer_info');
      const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      window.__liPerf={saved,query:[...Q],program:pr,frameNo,look:{...LOOK},gpuWait,
        timer,measurements:[],originalShader:FS_RENDER};
      return {url:location.href,provenance:window.lijiangNativeProvenance,
        glRenderer:gl.getParameter(gl.RENDERER),glVendor:gl.getParameter(gl.VENDOR),
        unmaskedRenderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):null,
        unmaskedVendor:dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):null,
        version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        contextAttributes:gl.getContextAttributes(),timerQueryAvailable:!!timer,
        size:{canvas:[cv.width,cv.height],render:[R.w,R.h]},saved,
        camera:cineCam(${fixedTime})};
    })()`);
    initialized = true;
    const loaded = await call('window.__liPerf.originalShader');
    fs.writeFileSync(path.join(output, 'loaded-render.fs.glsl'), loaded);
    report.shaderSHA256 = digest(Buffer.from(loaded));
    // Existing loop is suspended. This hook renders one real zero-jitter frame
    // with the same time, camera and post-frame grain seed for every variant.
    await call(`window.__liPerf.measure=async function(spec){
      const p=window.__liPerf,waits=[];
      Q.set('bandpx',String(spec.bandpx));
      for(const key of ['dbgm','sk0'])Q.delete(key);
      for(const [key,value]of Object.entries(spec.query||{}))Q.set(key,String(value));
      gpuWait=async function(){const a=performance.now();try{return await p.gpuWait();}finally{waits.push(performance.now()-a);}};
      const timer=p.timer,q=timer?gl.createQuery():null;
      let queryOpen=false,queryResult=null;
      try{
        clearAcc();frameNo=p.frameNo;
        const cam=cineCam(${fixedTime});setLook(cam);
        const begin=performance.now();
        if(q){gl.beginQuery(timer.TIME_ELAPSED_EXT,q);queryOpen=true;}
        await renderSample(cam,${fixedTime},[0,0],true);
        if(q){gl.endQuery(timer.TIME_ELAPSED_EXT);queryOpen=false;}
        await gpuWait();
        const renderEnd=performance.now();
        present(false);await gpuWait();
        const end=performance.now();
        if(q){
          const deadline=performance.now()+30000;
          while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&performance.now()<deadline)await runtimeYield();
          const disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT);
          const available=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);
          queryResult={available,disjoint,elapsedMilliseconds:available&&!disjoint?gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6:null};
        }
        const pix=new Uint8Array(cv.width*cv.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        const readStart=performance.now();gl.readPixels(0,0,cv.width,cv.height,gl.RGBA,gl.UNSIGNED_BYTE,pix);
        const readPixelsMs=performance.now()-readStart;
        let binary='';for(let at=0;at<pix.length;at+=16384)binary+=String.fromCharCode(...pix.subarray(at,at+16384));
        return {name:spec.name,bandpx:spec.bandpx,query:spec.query||{},
          renderSampleAndCompletionMs:renderEnd-begin,presentAndCompletionMs:end-renderEnd,totalRenderMs:end-begin,
          readPixelsMs,gpuElapsed:queryResult,waitCount:waits.length,waitMilliseconds:waits,
          glError:gl.getError(),width:cv.width,height:cv.height,renderWidth:R.w,renderHeight:R.h,
          camera:cam,pixels:btoa(binary),png:cv.toDataURL('image/png')};
      }finally{
        if(queryOpen)gl.endQuery(timer.TIME_ELAPSED_EXT);
        if(q)gl.deleteQuery(q);
        gpuWait=p.gpuWait;
      }
    };true`);
    const variants = [
      { name: 'full-band12000', bandpx: 12000, repeats: repetitions },
      { name: 'full-band60000', bandpx: 60000, repeats: repetitions }
    ];
    if (includeDiagnostics) variants.push(
      { name: 'diagnostic-march-only-71', bandpx: 60000, query: { dbgm: 71 }, repeats: 1 },
      { name: 'diagnostic-independent-trees-off-22', bandpx: 60000, query: { dbgm: 22 }, repeats: 1 },
      { name: 'diagnostic-ground-canopy-off-85', bandpx: 60000, query: { dbgm: 85 }, repeats: 1 },
      { name: 'diagnostic-mist-shadow-off', bandpx: 60000, query: { sk0: 0 }, repeats: 1 },
      { name: 'diagnostic-fog-off', bandpx: 60000, fogOff: true, repeats: 1 }
    );
    let reference = null;
    for (const spec of variants) {
      if (spec.fogOff) {
        progress('compile-isolated-fog-off-diagnostic');
        const shader = replaceFunctionBody(loaded, 'fogApply', '\n  gHz=0.;return col;\n');
        fs.writeFileSync(path.join(output, 'diagnostic-fog-off.fs.glsl'), shader);
        await call(`pr=await progDeferred(${JSON.stringify(shader)},'Isolated performance fog-off diagnostic');true`);
      }
      const entry = { name: spec.name, bandpx: spec.bandpx, query: spec.query || {},
        diagnosticEffectRemoval: !!spec.query || !!spec.fogOff, samples: [] };
      report.variants.push(entry);
      for (let index = 0; index < spec.repeats; index++) {
        progress(spec.name + '-sample-' + (index + 1));
        const measured = await call(`window.__liPerf.measure(${JSON.stringify(spec)})`);
        const capture = saveFrame(spec.name + '-' + (index + 1), measured);
        if (!reference) reference = capture.bitmap;
        let totalDifference = 0, changed = 0, large = 0;
        for (let offset = 0; offset < reference.length; offset += 4) {
          let max = 0;
          for (let channel = 0; channel < 3; channel++) {
            const delta = Math.abs(reference[offset + channel] - capture.bitmap[offset + channel]);
            totalDifference += delta;max = Math.max(max, delta);
          }
          if (max) changed++;if (max > 20) large++;
        }
        delete capture.bitmap;delete measured.pixels;delete measured.png;
        entry.samples.push({ ...measured, capture, comparisonToFirstFullFrame: {
          pixelBytesIdentical: digest(reference) === capture.rgbaReadPixelsSHA256,
          meanAbsoluteRGBDifference: totalDifference / (reference.length / 4 * 3),
          changedPixelFraction: changed / (reference.length / 4),
          fractionPixelsAnyChannelOver20: large / (reference.length / 4)
        } });
        if (measured.glError) throw new Error(spec.name + ' GL error ' + measured.glError);
      }
      entry.meanTotalRenderMs = entry.samples.reduce((sum, sample) => sum + sample.totalRenderMs, 0) / entry.samples.length;
      entry.meanRenderSampleAndCompletionMs = entry.samples.reduce((sum, sample) => sum + sample.renderSampleAndCompletionMs, 0) / entry.samples.length;
      entry.meanPresentAndCompletionMs = entry.samples.reduce((sum, sample) => sum + sample.presentAndCompletionMs, 0) / entry.samples.length;
    }
    report.batchingComparison = {
      speedup: report.variants[0].meanTotalRenderMs / report.variants[1].meanTotalRenderMs,
      allFullFramesPixelBytesIdentical: report.variants.slice(0, 2).every(v => v.samples.every(s => s.comparisonToFirstFullFrame.pixelBytesIdentical)),
      scope: 'Same generated field, camera, resolution, uniforms, zero jitter and post seed; only cooperative scissor-band size differs.'
    };
    report.tests.push({ name: 'actual-hidden-fixed-frame-measurements-completed', passed: true });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';report.errors.push(String(error.stack || error));
  } finally {
    if (initialized) {
      try {
        report.restoration = await call(`(async()=>{
          const p=window.__liPerf;if(!p)throw new Error('Performance saved state missing');
          gpuWait=p.gpuWait;pr=p.program;frameNo=p.frameNo;Object.assign(LOOK,p.look);
          for(const key of [...Q.keys()])Q.delete(key);for(const [key,value]of p.query)Q.set(key,value);
          napaliControl.seek(p.saved.time);napaliControl.pause(p.saved.paused);clearAcc();
          napaliControl.suspend(p.saved.suspended);const restored=napaliControl.getState();
          const shaderRestored=pr===p.program;delete window.__liPerf;
          return {shaderRestored,restored,query:[...Q]};
        })()`);
        if (!report.restoration.shaderRestored) throw new Error('Original shader not restored');
        report.tests.push({ name: 'original-program-query-pause-suspend-time-restored', passed: true });
      } catch (error) { report.status = 'failed';report.errors.push('Restoration: ' + String(error.stack || error)); }
    }
  }
  report.presentation = getPresentation();
  progress('finished');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  return report;
}

module.exports = { runLijiangNativePerformance, replaceFunctionBody };
