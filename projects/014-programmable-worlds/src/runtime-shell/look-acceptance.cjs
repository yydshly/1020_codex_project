'use strict';

// A controlled own-app comparison of two display transforms. Lighting, camera,
// weather and simulation time stay fixed within each set of three captures.
async function runLookAcceptance(ctx) {
  const { evaluate, readState, waitState, capture, progress, check, invariant, pixelDifference } = ctx;
  const api = 'window.worldAcceptance';
  const balanced = { exposure: 1.55, indirectScale: 2.4, environmentIntensity: .8, keyIntensity: .9, practicalScale: 1, iblDiffuseScale: .08 };
  const candidates = [
    { mode: 'three', exposure: 1.55, name: 'three-exposure-1p55' },
    { mode: 'source', exposure: 1.55, name: 'source-exposure-1p55' },
    { mode: 'source', exposure: 2, name: 'source-exposure-2p00' }
  ];
  const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
  progress('awaiting-display-look-comparison-initialization');
  const initialized = await waitState(state => state.state?.ready && state.state.frames >= 2, 'Complete window initialization before display-look comparison', 300000);
  check('real-window-scene-ready-for-display-look-comparison', initialized);
  if (initialized.state.quality?.lightmapMode === 'full-diffuse') {
    invariant(initialized.state.quality.fullDiffuseBoundMaterials === 24, 'Full diffuse comparison did not bind all source materials');
    balanced.indirectScale = Math.PI;
    check('full-diffuse-comparison-preserves-source-radiance-units', { boundMaterials: 24, radianceToIrradiance: Math.PI });
  }
  invariant(await evaluate(`typeof ${api}.tuneLookdev === 'function' && typeof ${api}.setDisplayLook === 'function'`), 'Own window display-look API is unavailable');
  check('own-window-exposes-controlled-display-look-api', { api: ['worldAcceptance.tuneLookdev', 'worldAcceptance.setDisplayLook'], noOperatingSystemInput: true });
  let captureNumber = 0;
  for (const view of ['window', 'detail', 'orbit']) {
    let threeImage = null, sourceImage = null, referenceCamera = null;
    for (const candidate of candidates) {
      const preset = { ...balanced, exposure: candidate.exposure };
      const name = String(++captureNumber).padStart(2, '0') + '-' + view + '-' + candidate.name;
      progress('comparing-display-look-' + name, { view, preset, displayMode: candidate.mode });
      await evaluate(`${api}.reset();${api}.pause(true);${api}.setView(${JSON.stringify(view)});${api}.tuneLookdev(${JSON.stringify(preset)});${api}.setDisplayLook(${JSON.stringify(candidate.mode)})`, 'Reset fixed scene and apply display look ' + name);
      const submitted = (await readState()).state;
      const completed = await waitState(state => state.state?.ready && !state.state.error && state.state.paused && state.state.frames >= submitted.frames + 2 && (state.state.mode || state.state.view) === view, 'Two completed fixed display-look frames for ' + name, 90000);
      const state = completed.state, tuning = state.quality?.lightingTuning, pipeline = state.quality?.displayPipeline;
      invariant(tuning, 'Display-look comparison did not report lighting tuning');
      for (const [key, value] of Object.entries(preset)) invariant(Number.isFinite(tuning[key]) && Math.abs(tuning[key] - value) < 1e-7, 'Fixed display-look lighting mismatch: ' + key);
      invariant(pipeline?.mode === candidate.mode, 'Reported display pipeline did not match requested mode: ' + candidate.mode);
      invariant(Number.isFinite(pipeline.exposure) && Math.abs(pipeline.exposure - candidate.exposure) < 1e-7, 'Final display pass exposure differs from lighting exposure');
      invariant(pipeline.input === 'raw scene-linear HDR' && pipeline.rawTarget === 'RGBA16F', 'Display-look comparison did not use the raw linear HDR render target');
      invariant(pipeline.lutHashVerified === true && /^[a-f0-9]{64}$/i.test(pipeline.lutSHA256 || ''), 'Actual source OCIO LUT checksum was not verified');
      invariant(pipeline.frames >= 2 && pipeline.width === completed.canvas?.width && pipeline.height === completed.canvas?.height, 'Final display pipeline did not complete at actual canvas resolution');
      invariant(Math.abs(state.time) < .0001 && state.wet === true && state.light === 'dusk', 'Display-look comparison changed time/weather/atmosphere');
      invariant(Array.isArray(state.camera?.position) && Array.isArray(state.camera?.quaternion), 'Display-look comparison did not expose actual camera pose');
      if (!referenceCamera) referenceCamera = state.camera;
      else invariant(distance(referenceCamera.position, state.camera.position) < 1e-7 && distance(referenceCamera.quaternion, state.camera.quaternion) < 1e-7, 'Display-look AB camera pose changed within the same view');
      const image = await capture(name), captured = image.entry.state.state;
      invariant(captured.paused && Math.abs(captured.time - state.time) < .0001, 'Display-look capture advanced simulation time');
      const differences = {
        againstThreeSameView: threeImage ? pixelDifference(threeImage.samples, image.samples) : null,
        againstSource1p55SameView: sourceImage ? pixelDifference(sourceImage.samples, image.samples) : null
      };
      check('fixed-display-look-captured-' + name, { view, preset, requestedMode: candidate.mode, pipeline, state, completedFrames: state.frames - submitted.frames, pixelDifferences: differences });
      if (candidate.mode === 'three') threeImage = image;
      else if (candidate.exposure === 1.55) sourceImage = image;
    }
  }
  check('display-look-numeric-pass-is-not-artistic-approval', {
    balancedLighting: balanced, candidates, views: ['window', 'detail', 'orbit'], captures: 9,
    comparisonScope: 'Identical paused geometry/camera/weather/light parameters within each view, with only the named display transform and exposure candidate varied.',
    pixelDeltasAreMeasuredOnly: true, visualReviewRequired: true
  });
}

module.exports = { runLookAcceptance };
