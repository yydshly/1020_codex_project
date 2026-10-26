/**
 * Offline WebCodecs recording. Simulation time advances by exactly 1 / fps per
 * rendered frame; wall-clock rendering speed never changes the output cadence.
 * Mediabunny is bundled locally by Vite and supplies the WebM muxer/backpressure.
 */
export function createRecorder({ renderer, canvas = renderer?.domElement, renderAt, resizeForCapture, restoreAfterCapture, onProgress, getDuration = () => 45 }) {
  if (!canvas || typeof renderAt !== 'function') throw new Error('Recorder requires a canvas and renderAt(seconds).');

  let activeJob = null;
  let lastResult = null;
  let disposed = false;
  let state = { phase: 'idle', active: false, progress: 0, frameCount: 0, encodedFrameCount: 0, totalFrames: 0 };
  const now = () => globalThis.performance?.now() ?? Date.now();
  const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));
  const abortError = () => new DOMException('Recording cancelled.', 'AbortError');

  function publish(patch = {}) {
    state = { ...state, ...patch };
    if (typeof onProgress === 'function') {
      try { onProgress({ ...state }); } catch { /* UI observers must not interrupt encoder cleanup. */ }
    }
    return { ...state };
  }

  function checkCancelled(job) {
    if (job.cancelled || disposed) throw abortError();
  }

  function numberOption(value, fallback, name, min, max, integer = false) {
    const n = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && Math.floor(n) !== n)) {
      throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
    }
    return n;
  }

  async function run(job, options) {
    const startedAt = now();
    let snapshot;
    let didResize = false;
    let source;
    let output;
    let completed = false;
    let terminalPatch = null;
    try {
      const duration = numberOption(options.duration, Number(getDuration()) || 45, 'duration', 0.01, 600);
      const width = numberOption(options.width, 1920, 'width', 2, 8192, true);
      const height = numberOption(options.height, 1080, 'height', 2, 8192, true);
      const fps = numberOption(options.fps, 60, 'fps', 1, 120, true);
      if (width % 2 || height % 2) throw new Error('Video width and height must both be even.');
      const totalFrames = Math.round(duration * fps);
      if (totalFrames < 1) throw new Error('Recording must contain at least one frame.');
      // Report the quantized duration explicitly for arbitrary short QA captures.
      const outputDuration = totalFrames / fps;
      const bitrate = numberOption(options.bitrate, Math.max(2_000_000, Math.round(width * height * fps * 0.115)), 'bitrate', 100_000, 100_000_000);
      publish({ phase: 'preparing', active: true, progress: 0, frameCount: 0, encodedFrameCount: 0, totalFrames, width, height, fps, duration: outputDuration, elapsedMs: 0, error: null, metadata: null });
      if (typeof globalThis.VideoEncoder !== 'function' || typeof globalThis.VideoFrame !== 'function') {
        throw new Error('This browser cannot perform fixed-frame WebCodecs export. Open the app in a current Chromium browser on localhost or HTTPS.');
      }
      checkCancelled(job);
      const { Output, WebMOutputFormat, BufferTarget, CanvasSource, Quality, canEncodeVideo } = await import('mediabunny');
      const quality = new Quality({ bitrate });
      const codecCandidates = options.codec ? [options.codec] : ['vp9', 'vp8'];
      if (codecCandidates.some((codec) => !['vp9', 'vp8', 'av1'].includes(codec))) {
        throw new Error('WebM export supports vp9, vp8, or av1.');
      }
      let codec;
      for (const candidate of codecCandidates) {
        checkCancelled(job);
        if (await canEncodeVideo(candidate, { width, height, frameRate: fps, quality, latencyMode: 'quality' })) {
          codec = candidate;
          break;
        }
      }
      if (!codec) throw new Error(`No WebCodecs encoder supports ${width}×${height} at ${fps} fps (${codecCandidates.join(', ')}).`);
      checkCancelled(job);

      // The application callback also pauses its live RAF and saves camera/UI state.
      if (typeof resizeForCapture === 'function') {
        didResize = true;
        snapshot = await resizeForCapture(width, height, { fps, duration: outputDuration });
      } else {
        snapshot = { width: canvas.width, height: canvas.height, pixelRatio: renderer?.getPixelRatio?.() };
        didResize = true;
        renderer?.setPixelRatio?.(1);
        if (renderer?.setSize) renderer.setSize(width, height, false);
        else { canvas.width = width; canvas.height = height; }
      }
      checkCancelled(job);
      if (canvas.width !== width || canvas.height !== height) {
        throw new Error(`Capture canvas is ${canvas.width}×${canvas.height}; expected ${width}×${height}. resizeForCapture must use pixel ratio 1.`);
      }

      let encodedFrameCount = 0;
      let encodedByteCount = 0;
      let firstTimestamp = Infinity;
      let lastTimestamp = -Infinity;
      let lastFrameEnd = -Infinity;
      let encoderConfig = null;
      const encodedTicks = new Set();
      let invalidTimestampCount = 0;
      let inferredDurationCount = 0;
      const target = new BufferTarget();
      output = new Output({ format: new WebMOutputFormat(), target });
      job.output = output;
      source = new CanvasSource(canvas, {
        codec,
        quality,
        alpha: 'discard',
        latencyMode: 'quality',
        keyFrameInterval: 2,
        sizeChangeBehavior: 'deny',
        onEncoderConfig: (config) => { encoderConfig = { ...config }; },
        onEncodedPacket: (packet) => {
          encodedFrameCount++;
          encodedByteCount += packet.data.byteLength;
          firstTimestamp = Math.min(firstTimestamp, packet.timestamp);
          lastTimestamp = Math.max(lastTimestamp, packet.timestamp);
          lastFrameEnd = Math.max(lastFrameEnd, packet.timestamp + (packet.duration || 1 / fps));
          const tick = Math.round(packet.timestamp * fps);
          if (Math.abs(packet.timestamp - tick / fps) > 0.00002 || tick < 0 || tick >= totalFrames || encodedTicks.has(tick)) invalidTimestampCount++;
          encodedTicks.add(tick);
          if (!(packet.duration > 0)) inferredDurationCount++;
        },
      });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();
      checkCancelled(job);
      publish({ phase: 'encoding', codec, container: 'webm', elapsedMs: now() - startedAt });

      let lastProgressAt = now();
      for (let frame = 0; frame < totalFrames; frame++) {
        checkCancelled(job);
        const timestamp = frame / fps;
        await renderAt(timestamp, { capture: true, frame, fps, totalFrames, duration: outputDuration });
        checkCancelled(job);
        // CanvasSource snapshots this exact canvas state and awaits encoder/muxer
        // backpressure. Every submitted frame has its own explicit timestamp.
        await source.add(timestamp, 1 / fps, { keyFrame: frame % (fps * 2) === 0 });
        checkCancelled(job);
        const frameCount = frame + 1;
        const elapsedMs = now() - startedAt;
        if (frameCount === totalFrames || now() - lastProgressAt >= 150 || frameCount % 8 === 0) {
          publish({ phase: 'encoding', progress: frameCount / totalFrames, frameCount, encodedFrameCount, elapsedMs });
          lastProgressAt = now();
        }
        // Timers keep Cancel and progress UI responsive even on fast encoders.
        if (frameCount % 8 === 0) await yieldToUI();
      }
      source.close();
      publish({ phase: 'finalizing', frameCount: totalFrames, encodedFrameCount, progress: 1, elapsedMs: now() - startedAt });
      await output.finalize();
      checkCancelled(job);
      if (encodedFrameCount !== totalFrames) {
        throw new Error(`Encoder produced ${encodedFrameCount} packets from ${totalFrames} submitted frames; export was not accepted.`);
      }
      if (invalidTimestampCount || encodedTicks.size !== totalFrames || !encodedTicks.has(0) || !encodedTicks.has(totalFrames - 1)) {
        throw new Error('Encoded frame timestamps do not form the requested fixed frame-rate timeline.');
      }
      if (!target.buffer?.byteLength) throw new Error('WebM muxer produced an empty file.');
      const blob = new Blob([target.buffer], { type: 'video/webm' });
      const actualDuration = lastFrameEnd - Math.min(0, firstTimestamp);
      if (Math.abs(actualDuration - outputDuration) > 1 / fps + 0.00001) {
        throw new Error(`Encoded duration ${actualDuration.toFixed(6)}s does not match ${outputDuration.toFixed(6)}s.`);
      }
      const metadata = {
        container: 'webm',
        mimeType: blob.type,
        codec: encoderConfig?.codec || codec,
        videoCodec: codec,
        width: encoderConfig?.width || width,
        height: encoderConfig?.height || height,
        fps,
        measuredFps: encodedFrameCount / actualDuration,
        fixedFrameRate: true,
        timestampGridVerified: true,
        frameCount: encodedFrameCount,
        encodedFrameCount,
        submittedFrameCount: totalFrames,
        duration: actualDuration,
        requestedDuration: duration,
        timelineDuration: outputDuration,
        firstTimestamp,
        lastTimestamp,
        frameDurationSource: inferredDurationCount ? 'submitted-frame-duration' : 'encoded-packet',
        inferredDurationCount,
        size: blob.size,
        encodedByteCount,
        bitrate,
        elapsedMs: now() - startedAt,
      };
      lastResult = { blob, metadata };
      completed = true;
      terminalPatch = { phase: 'complete', active: false, progress: 1, encodedFrameCount, metadata, elapsedMs: metadata.elapsedMs };
      // Download defaults to false. The UI can explicitly call download() later.
      if (options.download === true) download(lastResult, options.filename);
      return lastResult;
    } catch (error) {
      if (output && output.state !== 'finalized' && output.state !== 'canceled') {
        try { await output.cancel(); } catch { /* Preserve the original failure. */ }
      }
      if (job.cancelled || error?.name === 'AbortError') {
        terminalPatch = { phase: 'cancelled', active: false, elapsedMs: now() - startedAt, error: null };
        return { cancelled: true, blob: null, metadata: null };
      }
      terminalPatch = { phase: 'error', active: false, elapsedMs: now() - startedAt, error: error?.message || String(error) };
      throw error;
    } finally {
      job.output = null;
      if (!completed && source && output?.state !== 'canceled') {
        try { source.close(); } catch { /* A failed encoder may already be closed. */ }
      }
      try {
        if (didResize) {
          if (typeof restoreAfterCapture === 'function') await restoreAfterCapture(snapshot);
          else if (snapshot) {
            renderer?.setPixelRatio?.(snapshot.pixelRatio || 1);
            if (renderer?.setSize) renderer.setSize(snapshot.width / (snapshot.pixelRatio || 1), snapshot.height / (snapshot.pixelRatio || 1), false);
            else { canvas.width = snapshot.width; canvas.height = snapshot.height; }
          }
        }
      } catch (restoreError) {
        terminalPatch = { phase: 'error', active: false, elapsedMs: now() - startedAt, error: `View restoration failed: ${restoreError?.message || restoreError}` };
        throw restoreError;
      } finally {
        if (activeJob === job) activeJob = null;
        if (terminalPatch) publish(terminalPatch);
      }
    }
  }

  function start(options = {}) {
    if (disposed) return Promise.reject(new Error('Recorder has been disposed.'));
    if (activeJob) return Promise.reject(new Error('A recording is already in progress.'));
    const job = { cancelled: false, output: null, done: null };
    activeJob = job;
    // The first continuation also guarantees job.done exists before cancellation.
    job.done = Promise.resolve().then(() => run(job, options));
    return job.done;
  }

  function cancel() {
    const job = activeJob;
    if (!job) return Promise.resolve(false);
    job.cancelled = true;
    publish({ phase: 'cancelling' });
    if (job.output && !['canceled', 'finalized'].includes(job.output.state)) {
      // Interrupt a pending add/finalize instead of waiting for another frame.
      void job.output.cancel().catch(() => {});
    }
    return job.done.then(() => true, () => true);
  }

  function download(result = lastResult, filename) {
    if (!result?.blob) throw new Error('No finished recording is available to download.');
    const details = result.metadata;
    const name = filename || `lijiang-${details.width}x${details.height}-${details.fps}fps-${details.frameCount}frames.webm`;
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { filename: name, metadata: details };
  }

  return {
    start,
    cancel,
    download,
    getState: () => ({ ...state }),
    getResult: () => lastResult,
    dispose: async () => { disposed = true; await cancel(); lastResult = null; },
  };
}
