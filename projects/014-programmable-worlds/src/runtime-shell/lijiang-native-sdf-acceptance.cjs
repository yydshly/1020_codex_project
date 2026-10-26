'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function hashFile(file) {
  const digest = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), buffer = Buffer.allocUnsafe(1048576);
  try { for (;;) { const n = fs.readSync(fd, buffer, 0, buffer.length, null);if (!n) break;digest.update(buffer.subarray(0, n)); } }
  finally { fs.closeSync(fd); }
  return digest.digest('hex');
}

function immutableLink(stage, destination, byteLength, sha256) {
  let reused = false;
  try { fs.linkSync(stage, destination); }
  catch (error) { if (error.code !== 'EEXIST') throw error;reused = true; }
  if (fs.statSync(destination).size !== byteLength || hashFile(destination) !== sha256)
    throw new Error('Immutable cache mismatch; historical file was not overwritten: ' + destination);
  return reused;
}

function immutableJSON(directory, prefix, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'), sha256 = hash(bytes);
  const filename = prefix + '-' + sha256 + '.json', file = path.join(directory, filename);
  try { fs.writeFileSync(file, bytes, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (fs.statSync(file).size !== bytes.length || hashFile(file) !== sha256) throw new Error('Immutable manifest mismatch: ' + file);
  return { file: filename, sha256, byteLength: bytes.length };
}

function validateVolumeContract(metadata, byteLength, requestedResolution) {
  const n = metadata.resolution;
  if (!Number.isInteger(n) || n < 64 || n > 512 || n !== requestedResolution || byteLength !== n ** 3 * 4)
    throw new Error('Volume byte/resolution contract disagrees with sdfres');
  if (!metadata.positiveOutside || metadata.gVeg !== false || metadata.statistics?.nonFiniteSamples !== 0
    || metadata.sourceHeightResolution !== 4096 || !metadata.glStateRestored
    || metadata.statistics.evaluations !== n ** 3 || metadata.statistics.readbackPlanes !== n)
    throw new Error('Volume lacks full signed source geometry, finite readback or GL restoration');
  if (!(metadata.statistics.minimum < 0 && metadata.statistics.maximum > 0)
    || !Number.isFinite(metadata.size) || metadata.size <= 0
    || !Number.isFinite(metadata.spacing) || Math.abs(metadata.spacing - metadata.size / (n - 1)) > 1e-10
    || !Array.isArray(metadata.dimensions) || metadata.dimensions.length !== 3 || metadata.dimensions.some(value => value !== n)
    || Object.values(metadata.glErrors || {}).some(value => value !== 0)) throw new Error('Volume geometry or GL-completion metadata is invalid');
  return n;
}

function validateSurfaceComparison(comparison) {
  const maximumAbsolute = comparison?.comparison?.maximumAbsoluteRGBDifference;
  if (!Number.isFinite(maximumAbsolute) || maximumAbsolute < 0 || maximumAbsolute > 1e-4)
    throw new Error('Actual native surface specialization RGB difference exceeds 1e-4: ' + maximumAbsolute);
  return maximumAbsolute;
}

async function runLijiangNativeSdfAcceptance({ window, getFatal, getPresentation, record, projectDirectory }) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.join('C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-sdf-qa', runId);
  const cache = 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-generated-fields';
  fs.mkdirSync(output, { recursive: true });fs.mkdirSync(cache, { recursive: true });
  const started = Date.now(), report = { runId, output, status: 'running', artAccepted: false,
    scope: 'Actual native GPU fields and optional HDR readback with immutable caches; not visual artwork acceptance', tests: [], errors: [] };
  const call = async js => {
    if (window.isVisible() || window.isFocused() || getFatal()) throw new Error(getFatal() || 'Own hidden SDF QA became visible/focused');
    return window.webContents.executeJavaScript(js, false);
  };
  const progress = (phase, state) => {
    report.phase = phase;report.elapsedSeconds = (Date.now() - started) / 1000;
    fs.writeFileSync(path.join(output, 'status.json'), JSON.stringify({ runId, output, status: report.status,
      phase, elapsedSeconds: report.elapsedSeconds, tests: report.tests.length, errors: report.errors, state }, null, 2));
  };
  async function exportBytes(key, info, prefix, extension = 'bin') {
    const stage = path.join(output, 'actual-' + key + '.' + extension), fd = fs.openSync(stage, 'wx');
    const digest = crypto.createHash('sha256');let written = 0;
    try {
      for (let offset = 0; offset < info.byteLength; offset += 524288) {
        const count = Math.min(524288, info.byteLength - offset);
        const base64 = await call(`(()=>{const view=window.__nativeSdfQAExport[${JSON.stringify(key)}];
          if(view.byteLength!==${info.byteLength})throw new Error('Generated field mutated during export');
          const a=view.subarray(${offset},${offset + count});let s='';
          for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);})()`);
        const bytes = Buffer.from(base64, 'base64');if (bytes.length !== count) throw new Error('Field IPC chunk byte count mismatch: ' + key);
        for (let at = 0; at < bytes.length;) { const n = fs.writeSync(fd, bytes, at, bytes.length - at, null);if (n <= 0) throw new Error('Field write stalled');at += n;written += n; }
        digest.update(bytes);
      }
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    const sha256 = digest.digest('hex');
    if (written !== info.byteLength || hashFile(stage) !== sha256) throw new Error('Field staging SHA mismatch: ' + key);
    const filename = prefix + '-' + sha256 + '.' + extension, file = path.join(cache, filename);
    const reused = immutableLink(stage, file, written, sha256);
    return { file: filename, byteLength: written, sha256, reused, stage };
  }
  try {
    report.actualEntry = await call('location.href');
    const url = new URL(report.actualEntry), requestedResolution = url.searchParams.has('sdfres') ? Number(url.searchParams.get('sdfres')) : 192;
    if (!Number.isInteger(requestedResolution) || requestedResolution < 64 || requestedResolution > 512) throw new Error('Invalid producer sdfres');
    report.requestedResolution = requestedResolution;
    const script = await call(`[...document.scripts].find(s=>s.textContent.includes('const GLSL_COMMON'))?.textContent||''`);
    if (!script) throw new Error('Actual native engine script missing');
    fs.writeFileSync(path.join(output, 'loaded-engine-script.js'), script);report.loadedScriptSHA256 = hash(Buffer.from(script));
    report.engineSHA256 = hashFile(path.join(projectDirectory, 'web/lijiang-native/engine.html'));
    report.collectors = {};
    for (const name of ['native-fields.js', 'native-sdf-fields.js', 'native-surface-fields.js', 'native-surface-compare.js', 'native-radiance-field.js']) {
      const file = path.join(projectDirectory, 'web/lijiang-native', name);if (fs.existsSync(file)) report.collectors[name] = hashFile(file);
    }
    report.collectorSHA256 = report.collectors['native-sdf-fields.js'];
    let ready = false;
    for (const end = Date.now() + 1200000; Date.now() < end;) {
      const state = await call(`({ready:!!window.lijiangGeneratedFields?.sdfPilot,
        progress:window.lijiangNativeSDFStatus||null,surface:window.lijiangNativeSurfaceStatus||null,
        text:document.getElementById('loadtxt')?.textContent})`);
      progress('actual-native-generated-fields', state);if (state.text?.startsWith('Error:')) throw new Error(state.text);
      if (state.ready) { ready = true;break; }await sleep(500);
    }
    if (!ready) throw new Error('Native generated-field production timed out');
    if(process.env.LIJIANG_COMPARE_ONLY==='1'){
      const comparison=await call('lijiangGeneratedFields.sdfPilot.surfaceComparison');
      report.surfaceComparison=comparison;
      const error=comparison?.comparison?.maximumAbsoluteRGBDifference;
      if(!comparison?.actualGPU||!Number.isFinite(error)||error>1e-4)throw new Error('Actual GPU vegetation specialization changed surface radiance');
      report.tests.push({name:'actual-GPU-specialization-equivalence-without-cache-mutation',passed:true});
      report.status='passed';report.presentation=getPresentation();progress('finished');
      fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
      record('native-sdf-qa-result',{status:report.status,output,errors:report.errors});return report;
    }
    const description = await call(`(()=>{
      const f=window.lijiangGeneratedFields,m={rect:f.rect,resolution:f.resolution,provenance:f.provenance,fields:{},
        volume:{byteLength:f.sdfPilot.field.byteLength,metadata:f.sdfPilot.metadata}};
      const views={volume:new Uint8Array(f.sdfPilot.field.buffer,f.sdfPilot.field.byteOffset,f.sdfPilot.field.byteLength)};
      for(const key of ['height','vegetation','attributes',...(f.radiance?['radiance']:[])]){
        const v=f[key];if(!v||Object.prototype.toString.call(v.data)!=='[object Float32Array]')throw new Error('Native '+key+' Float32 field missing');
        views[key]=new Uint8Array(v.data.buffer,v.data.byteOffset,v.data.byteLength);
        m.fields[key]={width:v.width,height:v.height,channels:v.channels,type:'Float32Array',byteLength:v.data.byteLength,...(v.metadata?{metadata:v.metadata}:{})};
      }
      for(const key of ['trees','bushes']){
        if(!Array.isArray(f[key]))throw new Error('Native plant records missing');
        const a=new Float64Array(f[key].length*6);
        f[key].forEach((p,i)=>{const v=[p.x,p.y,p.z,p.radius,p.species,p.seed];if(!v.every(Number.isFinite))throw new Error('Nonfinite native plant');a.set(v,i*6);});
        views[key]=new Uint8Array(a.buffer);m.fields[key]={count:f[key].length,type:'Float64Array',byteLength:a.byteLength};
      }
      if(f.sdfPilot.colors){const a=f.sdfPilot.colors;views.surface=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);m.surface={byteLength:a.byteLength,metadata:f.sdfPilot.colorMetadata};}
      if(f.sdfPilot.surfaceComparison)m.surfaceComparison=f.sdfPilot.surfaceComparison;
      if(f.rocks!==undefined){
        if(!Array.isArray(f.rocks))throw new Error('Native rocks must be an array');
        const peaks=new Set();m.rocks=f.rocks.map((rock,at)=>{
          if(!Number.isInteger(rock.peakIndex)||rock.peakIndex<0||peaks.has(rock.peakIndex))throw new Error('Invalid or duplicate native rock peakIndex');
          peaks.add(rock.peakIndex);const result={peakIndex:rock.peakIndex,metadata:rock.metadata,colorMetadata:rock.colorMetadata,stats:rock.stats,meshData:{}};
          let vertices=0;
          for(const key of ['positions','normals','indices','colors']){
            const a=rock.meshData?.[key],type=key==='indices'?'Uint32Array':'Float32Array',itemSize=key==='indices'?1:3;
            if(!a||Object.prototype.toString.call(a)!=='[object '+type+']'||!a.length||a.length%itemSize!==0)throw new Error('Invalid native rock '+key+' typed array');
            if(key==='positions')vertices=a.length/3;
            else if(key!=='indices'&&a.length!==vertices*3)throw new Error('Native rock vertex attribute counts disagree');
            if(key==='indices'&&a.length%3!==0)throw new Error('Native rock triangle indices are incomplete');
            for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i])||(key==='indices'&&a[i]>=vertices)||(key==='colors'&&a[i]<0))throw new Error('Invalid native rock '+key+' element');
            const exportKey='rock-'+at+'-'+key;views[exportKey]=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
            result.meshData[key]={exportKey,type,itemSize,count:a.length/itemSize,length:a.length,byteLength:a.byteLength};
          }
          return result;
        });
      }
      window.__nativeSdfQAExport=views;return m;
    })()`);
    if (description.provenance?.qaGeneratedFieldCache) throw new Error('Producer used an old QA field cache instead of current generated fields');
    if (description.surfaceComparison) {
      report.surfaceComparison = description.surfaceComparison;
      const maximumAbsolute = validateSurfaceComparison(description.surfaceComparison);
      report.tests.push({ name: 'actual-native-surface-specialization-RGB-equivalence', passed: true,
        maximumAbsoluteRGBDifference: maximumAbsolute, maximumAllowedAbsoluteRGBDifference: 1e-4 });
    }
    const resolution = validateVolumeContract(description.volume.metadata, description.volume.byteLength, requestedResolution);
    const volume = await exportBytes('volume', description.volume, 'sdf-pilot-r' + resolution, 'f32');
    report.volume = { file: path.join(cache, volume.file), bytes: volume.byteLength, sha256: volume.sha256, metadata: description.volume.metadata, reused: volume.reused };
    const cacheManifest = { file: volume.file, byteLength: volume.byteLength, sha256: volume.sha256, metadata: description.volume.metadata };
    if (description.surface) {
      const info = description.surface, meta = info.metadata;
      if (!meta?.colorsSHA256 || !meta.positionsSHA || info.byteLength !== meta.vertices * 3 * 4 || !meta.noFog || !meta.noPost) throw new Error('Native surface metadata contract mismatch');
      const surface = await exportBytes('surface', info, 'sdf-pilot-colors-r' + resolution, 'f32');
      if (surface.sha256 !== meta.colorsSHA256) throw new Error('Surface radiance bytes failed source SHA');
      cacheManifest.surface = { file: surface.file, byteLength: surface.byteLength, sha256: surface.sha256, metadata: meta };
      report.surface = cacheManifest.surface;report.tests.push({ name: 'actual-native-surface-HDR-readback-verified', passed: true });
    }
    const base = { rect: description.rect, resolution: description.resolution, provenance: description.provenance,
      fields: {}, engineSHA256: report.engineSHA256, loadedScriptSHA256: report.loadedScriptSHA256,
      collectors: report.collectors, generatedAt: new Date().toISOString(),
      scope: 'QA cache of current runtime-generated H/V/A/plants and optional HDR radiance; no authored model/image data' };
    for (const [key, info] of Object.entries(description.fields)) {
      if (info.type === 'Float32Array') {
        if (!Number.isInteger(info.width) || !Number.isInteger(info.height) || !Number.isInteger(info.channels)
          || info.width < 2 || info.height < 2 || info.channels < 1 || info.channels > 4
          || info.byteLength !== info.width * info.height * info.channels * 4) throw new Error('Generated float-field shape mismatch: ' + key);
      } else if (info.type !== 'Float64Array' || !Number.isInteger(info.count) || info.count < 0 || info.byteLength !== info.count * 6 * 8) throw new Error('Generated plant-cache shape mismatch: ' + key);
      progress('immutable-current-field-export-' + key, { byteLength: info.byteLength });
      const stored = await exportBytes(key, info, 'generated-' + report.engineSHA256.slice(0, 12) + '-' + key);
      base.fields[key] = { ...info, file: stored.file, sha256: stored.sha256 };
      if (key === 'radiance') {
        const expected = info.metadata?.dataSHA256 || info.metadata?.rgbaSHA256;
        if (expected && stored.sha256 !== expected) throw new Error('World radiance bytes failed source SHA');
      }
    }
    let rocksManifest = null;
    if (description.rocks) {
      rocksManifest = { engineSHA256: report.engineSHA256, loadedScriptSHA256: report.loadedScriptSHA256,
        generatedAt: base.generatedAt, rocks: [],
        scope: 'Actual runtime-generated native SDF mesh attributes and HDR source shading; immutable raw typed-array bytes' };
      for (const rock of description.rocks) {
        const storedRock = { peakIndex: rock.peakIndex, metadata: rock.metadata, colorMetadata: rock.colorMetadata,
          stats: rock.stats, meshData: {} };
        const colorMeta = rock.colorMetadata, vertices = rock.meshData.positions.count;
        if (!colorMeta?.colorsSHA256 || !(colorMeta.positionsSHA || colorMeta.positionsSHA256)
          || colorMeta.vertices !== vertices || !colorMeta.noFog || !colorMeta.noPost)
          throw new Error('Native rock source-shading metadata contract mismatch: peak ' + rock.peakIndex);
        for (const [key, info] of Object.entries(rock.meshData)) {
          progress('immutable-rock-export', { peakIndex: rock.peakIndex, attribute: key, byteLength: info.byteLength });
          const stored = await exportBytes(info.exportKey, info,
            'rock-p' + rock.peakIndex + '-r' + rock.metadata.resolution + '-' + key, info.type === 'Uint32Array' ? 'u32' : 'f32');
          const { exportKey, ...shape } = info;
          storedRock.meshData[key] = { ...shape, file: stored.file, sha256: stored.sha256 };
          const expected = key === 'positions' ? (colorMeta.positionsSHA || colorMeta.positionsSHA256)
            : key === 'colors' ? colorMeta.colorsSHA256 : null;
          if (expected && stored.sha256 !== expected) throw new Error('Native rock ' + key + ' bytes failed source SHA: peak ' + rock.peakIndex);
        }
        rocksManifest.rocks.push(storedRock);
      }
    }
    const bundleId = hash(Buffer.from(JSON.stringify({ engineSHA256: report.engineSHA256,
      fields: Object.entries(base.fields).map(([key, info]) => [key, info.sha256]), volume: volume.sha256,
      resolution, surface: cacheManifest.surface?.sha256 || null,
      ...(rocksManifest ? { rocks: rocksManifest.rocks.map(rock => [rock.peakIndex,
        Object.entries(rock.meshData).map(([key, info]) => [key, info.sha256])]) } : {}) })));
    base.bundleId = bundleId;base.sdfPilot = { file: volume.file, sha256: volume.sha256, resolution };
    cacheManifest.bundleId = bundleId;cacheManifest.generatedFields = { bundleId, engineSHA256: report.engineSHA256,
      fields: Object.fromEntries(Object.entries(base.fields).map(([key, info]) => [key, info.sha256])) };
    cacheManifest.generatedAt = base.generatedAt;
    let historyRocks = null;
    if (rocksManifest) {
      rocksManifest.bundleId = bundleId;
      historyRocks = immutableJSON(cache, 'rocks-' + report.engineSHA256.slice(0, 12), rocksManifest);
      base.rocksManifest = { file: 'rocks.json', bundleId, immutableManifest: historyRocks };
      cacheManifest.rocksManifest = base.rocksManifest;
      report.rocks = { count: rocksManifest.rocks.length, bundleId, immutableManifest: historyRocks,
        peaks: rocksManifest.rocks.map(rock => ({ peakIndex: rock.peakIndex, vertices: rock.meshData.positions.count,
          triangles: rock.meshData.indices.count / 3, attributes: rock.meshData })) };
    }
    const historyVolume = immutableJSON(cache, 'sdf-pilot-r' + resolution + '-' + volume.sha256, cacheManifest);
    const historyFields = immutableJSON(cache, 'generated-fields-' + report.engineSHA256.slice(0, 12), base);
    // Compatibility pointers advance only after all content-addressed files
    // and immutable historical manifests have passed actual byte SHA checks.
    if (rocksManifest) fs.writeFileSync(path.join(cache, 'rocks.json'), JSON.stringify({ ...rocksManifest, immutableManifest: historyRocks }, null, 2));
    fs.writeFileSync(path.join(cache, 'sdf-pilot.json'), JSON.stringify({ ...cacheManifest, immutableManifest: historyVolume }, null, 2));
    fs.writeFileSync(path.join(cache, 'manifest.json'), JSON.stringify({ ...base, immutableManifest: historyFields }, null, 2));
    fs.writeFileSync(path.join(output, 'sdf-cache-manifest.json'), JSON.stringify(cacheManifest, null, 2));
    fs.writeFileSync(path.join(output, 'generated-fields-manifest.json'), JSON.stringify(base, null, 2));
    if (rocksManifest) {
      fs.writeFileSync(path.join(output, 'rocks-manifest.json'), JSON.stringify(rocksManifest, null, 2));
      report.tests.push({ name: 'actual-native-rock-attributes-SHA-verified-immutable-bundle-exported', passed: true });
    }
    report.generatedFieldCache = { root: cache, engineSHA256: report.engineSHA256, bundleId,
      historicalManifest: historyFields, fields: base.fields, producedFromCurrentRuntime: true };
    report.historicalSdfManifest = historyVolume;
    report.tests.push({ name: 'actual-resolution-signed-volume-and-GL-contract', passed: true },
      { name: 'raw-byte-SHA-verified-before-immutable-publication', passed: true },
      { name: 'current-H-V-A-plants-and-optional-radiance-bundle-exported', passed: true });
    report.status = 'passed';
  } catch (error) { report.status = 'failed';report.errors.push(String(error.stack || error)); }
  finally { try { await call('delete window.__nativeSdfQAExport;true'); } catch { /* Own renderer may have failed. */ } }
  report.presentation = getPresentation();progress('finished');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  record('native-sdf-qa-result', { status: report.status, output, errors: report.errors });return report;
}
module.exports = { runLijiangNativeSdfAcceptance, validateVolumeContract, validateSurfaceComparison, immutableLink, immutableJSON, hashFile };
