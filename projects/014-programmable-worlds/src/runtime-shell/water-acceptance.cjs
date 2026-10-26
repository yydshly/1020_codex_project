'use strict';

// Fixed full-resolution views for choosing a reflection treatment from actual
// frames. Numeric success is a diagnostic result, never artistic approval.
async function runWaterAcceptance(ctx) {
  const {evaluate, readState, waitState, capture, progress, check, invariant, pixelDifference} = ctx;
  const api = 'window.worldAcceptance';
  const initialized = await waitState(s => s.state?.ready && s.state.frames >= 2, 'Window ready for reflection comparison', 300000);
  invariant(initialized.state.quality?.fullDiffuseBoundMaterials === 24, 'Reflection comparison requires all source diffuse maps');
  invariant(await evaluate(`typeof ${api}.tuneWaterReflection === 'function'`), 'Reflection comparison API unavailable');
  let sequence = 0;
  for (const view of ['window', 'orbit']) {
    let previous = null;
    for (const strength of [0, .2, .35, .5]) {
      progress('reflection-comparison-' + view + '-' + strength);
      await evaluate(`${api}.reset();${api}.pause(true);${api}.setView('${view}');${api}.tuneLookdev({exposure:2,indirectScale:Math.PI});${api}.setDisplayLook('source');${api}.tuneWaterReflection(${strength})`);
      const submitted = (await readState()).state;
      const completed = (await waitState(s => s.state?.ready && s.state.paused && s.state.frames >= submitted.frames + 2, 'Reflection comparison completed frames', 90000)).state;
      invariant(Math.abs(completed.quality.waterAngularStrength - strength) < 1e-8, 'Actual reflection uniform does not match requested strength');
      invariant(completed.quality.displayPipeline.mode === 'source' && Math.abs(completed.quality.displayPipeline.exposure - 2) < 1e-8 && Math.abs(completed.time) < 1e-8, 'Reflection comparison changed display or simulation');
      const shot = await capture(String(++sequence).padStart(2,'0') + '-' + view + '-angular-' + String(strength).replace('.', 'p'));
      const pixels = previous ? pixelDifference(previous.samples, shot.samples) : null;
      if (pixels) invariant(pixels.meanAbsoluteDifference > .02, 'Reflection strength did not change actual water pixels');
      check('actual-reflection-candidate-' + view + '-' + strength, {strength, view, state:completed, pixels, artisticApproval:false});
      previous = shot;
    }
  }
  await evaluate(`${api}.reset();${api}.pause(true);${api}.setView('detail');${api}.tuneLookdev({exposure:2,indirectScale:Math.PI});${api}.tuneWaterReflection(.35)`);
  const submitted = (await readState()).state;
  await waitState(s => s.state?.frames >= submitted.frames + 2, 'Revised foreground detail completed', 90000);
  await capture('09-revised-foreground-detail');
  check('reflection-and-foreground-review-required', {captures:9, sourceExposure:2, staticDiffuseScale:Math.PI, numericSuccessIsNotArtisticAcceptance:true});
}

module.exports = {runWaterAcceptance};
