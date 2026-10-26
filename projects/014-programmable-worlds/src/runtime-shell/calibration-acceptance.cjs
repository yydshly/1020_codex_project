'use strict';

// Own-app paused-frame lighting ablations. Capturing a valid frame and applying
// numeric parameters do not establish visual quality; the images are the review.
async function runCalibrationAcceptance(ctx) {
  const { evaluate, readState, waitState, capture, progress, check, invariant, pixelDifference } = ctx;
  const api = 'window.worldAcceptance';
  const theory = { exposure: 1.8, indirectScale: Math.PI, environmentIntensity: .6, keyIntensity: .78, practicalScale: 1, iblDiffuseScale: .22 };
  const profiles = [
    ['theory', { ...theory }],
    ['theory-low-exposure', { ...theory, exposure: 1.35 }],
    ['no-sky-diffuse', { ...theory, iblDiffuseScale: 0 }],
    ['no-bounce', { ...theory, indirectScale: 0 }],
    ['no-practicals', { ...theory, practicalScale: 0 }],
    ['balanced', { exposure: 1.55, indirectScale: 2.4, environmentIntensity: .8, keyIntensity: .9, practicalScale: 1, iblDiffuseScale: .08 }],
    ['restrained', { exposure: 1.35, indirectScale: 2.1, environmentIntensity: .75, keyIntensity: .85, practicalScale: .75, iblDiffuseScale: .06 }],
    ['moody', { exposure: 1.65, indirectScale: 1.5, environmentIntensity: .75, keyIntensity: .75, practicalScale: 1.3, iblDiffuseScale: .02 }]
  ];
  progress('awaiting-calibration-window-initialization');
  const initialized = await waitState(state => state.state?.ready && state.state.frames >= 2, 'Complete window initialization before calibration', 300000);
  check('real-window-scene-ready-for-paused-calibration', initialized);
  invariant(await evaluate(`typeof ${api}.tuneLookdev === 'function'`), 'Own window lighting calibration API is unavailable');
  check('own-window-exposes-lighting-calibration-api', { api: 'worldAcceptance.tuneLookdev', noOperatingSystemInput: true });
  let baseline = null;
  async function resetApply(preset, view, name) {
    progress('calibrating-' + name, { preset, view });
    const before = (await readState()).state;
    // Every call supplies all six values; ablations cannot inherit the previous
    // preset. Reset also fixes simulation time, wet weather and dusk atmosphere.
    await evaluate(`${api}.reset();${api}.pause(true);${api}.setView(${JSON.stringify(view)});${api}.tuneLookdev(${JSON.stringify(preset)})`, 'Apply complete paused lighting preset ' + name);
    const submitted = (await readState()).state;
    const completed = await waitState(state => state.state?.ready && state.state.paused && state.state.frames >= submitted.frames + 2 && (state.state.mode || state.state.view) === view, 'Two completed calibration frames for ' + name, 90000);
    const after = completed.state, actual = after.quality?.lightingTuning;
    invariant(actual, 'Lighting calibration did not report applied tuning');
    for (const [key, value] of Object.entries(preset)) invariant(Number.isFinite(actual[key]) && Math.abs(actual[key] - value) < 1e-7, 'Lighting calibration mismatch for ' + name + ': ' + key);
    invariant(Math.abs(after.time) < .0001 && after.wet === true && after.light === 'dusk', 'Calibration frames did not share paused time/weather/atmosphere');
    const image = await capture(name);
    const captured = image.entry.state.state;
    invariant(captured.paused && Math.abs(captured.time - after.time) < .0001, 'Calibration capture advanced scene time');
    const pixels = baseline ? pixelDifference(baseline.samples, image.samples) : null;
    check('paused-full-preset-captured-' + name, { preset, view, before, after, completedFrames: after.frames - submitted.frames, pixelsAgainstTheoryWindow: pixels });
    return image;
  }
  for (let index = 0; index < profiles.length; index++) {
    const [name, preset] = profiles[index];
    const image = await resetApply(preset, 'window', String(index + 1).padStart(2, '0') + '-' + name + '-window');
    if (!baseline) baseline = image;
  }
  const balanced = profiles.find(([name]) => name === 'balanced')[1];
  await resetApply(balanced, 'detail', '09-balanced-detail');
  await resetApply(balanced, 'orbit', '10-balanced-orbit');
  check('calibration-captures-do-not-approve-artistic-quality', {
    profiles: profiles.map(([name, preset]) => ({ name, preset })),
    capturedWindowProfiles: 8, additionalBalancedViews: ['detail', 'orbit'],
    numericalPassMeansParametersAppliedAndActualPausedFramesCaptured: true,
    visualComparisonRequired: true
  });
}

module.exports = { runCalibrationAcceptance };
