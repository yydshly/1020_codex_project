'use strict';

// Own-application API tests only. Numeric success verifies functioning 3D and
// controls; it does not establish artistic equivalence to the source renderer.
function assertQualityConfiguration({ scene, state, check, invariant }) {
  const quality = scene === 'window' ? state.quality : state.renderQuality;
  invariant(quality && quality.assetStage === 'baked' && quality.asset === 'models/quality-canal-full-diffuse.glb', 'Scene did not bind the finalized full-diffuse GLB');
  invariant(quality.lightmapMode === 'full-diffuse' && quality.fullDiffuseGroups === 24 && quality.fullDiffuseBoundMaterials === 24 && quality.indirectLightmaps === 24, 'Scene did not bind all 24 full-diffuse source groups');
  const display = quality.displayPipeline;
  invariant(display?.mode === 'source' && display.rawTarget === 'RGBA16F' && display.input === 'raw scene-linear HDR' && display.lutSize === 65 && display.frames >= 2, 'Scene is not rendering raw HDR through the source OCIO display pipeline');
  invariant(display.lutHashVerified === true && display.lutSHA256 === '4daf8616ca2b985abe98554a9836271bdb1bb518710c25acd985111b51177db1', 'Scene display LUT was not hash verified against the measured source look');
  invariant(Number.isFinite(display.exposure) && display.exposure > 0 && Number.isFinite(quality.lightingTuning?.indirectScale), 'Scene lighting exposure or diffuse scale is invalid');
  check('final-full-diffuse-and-source-display-configuration', { quality, configurationOnly: true, artisticQualityEstablished: false });
  if (scene === 'window') {
    const wood = quality.foregroundWood;
    invariant(wood?.asset === 'wood_table_001' && wood.license === 'CC0-1.0' && wood.resolution === 4096 && wood.variants > 0 && wood.maps?.includes('normal-OpenGL-linear') && wood.maps?.includes('roughness-linear'), 'Window did not bind the independent 4K CC0 foreground PBR maps');
    invariant(quality.localReflectionProbe?.ready && quality.localReflectionProbe.materials > 0 && quality.localAreaEmitter?.powerLumens > 0, 'Window local reflection probe or physical area emitter is not ready');
    check('window-foreground-pbr-and-real-local-light-configuration', { wood, probe: quality.localReflectionProbe, emitter: quality.localAreaEmitter });
  } else {
    invariant(state.response?.shadowed && state.response.position?.[2] < 0 && state.response.intensityCandela > 0 && state.response.emitterIntensity > 0, 'Story response fixture is not a live shadowed interior light');
    check('story-live-interior-response-fixture-configuration', state.response);
  }
}

async function runDemoAcceptance(ctx) {
  const { scene, evaluate, readState, waitState, capture, progress, check, invariant, pause, pixelDifference } = ctx;
  const api = 'window.worldAcceptance';
  const position = state => state.position || state.camera?.position || [];
  const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
  async function buttonState(id, panelId = null) {
    return evaluate(`(() => {
      const button=document.getElementById(${JSON.stringify(id)});
      const panel=${panelId ? `document.getElementById(${JSON.stringify(panelId)})` : 'null'};
      if(!button)return {exists:false};
      const rect=button.getBoundingClientRect(),style=getComputedStyle(button);
      const center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
      const hit=document.elementFromPoint(center.x,center.y);
      return {exists:true,id:button.id,hidden:button.hidden,disabled:button.disabled,
        ariaExpanded:button.getAttribute('aria-expanded'),ariaDisabled:button.getAttribute('aria-disabled'),
        display:style.display,visibility:style.visibility,pointerEvents:style.pointerEvents,opacity:Number(style.opacity),
        rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},center,
        centerWithinViewport:center.x>=0&&center.x<innerWidth&&center.y>=0&&center.y<innerHeight,
        centerHit:!!hit&&(hit===button||button.contains(hit)),hitId:hit?.id||null,hitTag:hit?.tagName||null,
        panelExists:!!panel,panelHidden:panel?.hidden,panelDisplay:panel?getComputedStyle(panel).display:null};
    })()`, 'Inspect own UI button ' + id);
  }
  function requireClickable(button, label) {
    invariant(button.exists && !button.hidden && !button.disabled && button.ariaDisabled !== 'true' && button.display !== 'none' && button.visibility === 'visible' && button.opacity > 0 && button.rect.width > 0 && button.rect.height > 0 && button.centerWithinViewport && button.centerHit, label + ' is hidden, disabled, or covered at its actual center');
  }
  async function controlsPanelFlow() {
    const initial = await buttonState('controls-toggle', 'controls-panel');
    requireClickable(initial, 'Scene controls toggle');
    invariant(initial.panelExists && initial.panelHidden === true && initial.panelDisplay === 'none' && initial.ariaExpanded === 'false', 'Controls panel did not start collapsed with matching aria-expanded');
    await evaluate(`document.getElementById('controls-toggle').click()`, 'Open own scene controls through actual button');
    const expanded = await buttonState('controls-toggle', 'controls-panel');
    requireClickable(expanded, 'Expanded scene controls toggle');
    invariant(expanded.panelHidden === false && expanded.panelDisplay !== 'none' && expanded.ariaExpanded === 'true', 'Controls toggle did not visibly expand the panel and aria state');
    await evaluate(`document.getElementById('controls-toggle').click()`, 'Close own scene controls through actual button');
    const collapsed = await buttonState('controls-toggle', 'controls-panel');
    requireClickable(collapsed, 'Collapsed scene controls toggle');
    invariant(collapsed.panelHidden === true && collapsed.panelDisplay === 'none' && collapsed.ariaExpanded === 'false', 'Controls toggle did not visibly close the panel and restore aria state');
    check('own-controls-toggle-opens-and-closes-visible-panel', { initial, expanded, collapsed, operatingSystemInputUsed: false });
  }
  async function tourCTA(label) {
    const button = await buttonState('start-tour');
    requireClickable(button, 'Primary river-tour button ' + label);
    check('primary-river-tour-cta-clickable-' + label, button);
    return button;
  }
  async function choiceCaptionLayout(label) {
    const layout = await evaluate(`(() => {
      const ids=['caption-title','caption-detail','ending'];
      const rects=Object.fromEntries(ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return [id,{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,hidden:e.hidden,display:getComputedStyle(e).display}];}));
      return {rects,inCaption:document.getElementById('ending').parentElement.classList.contains('story-caption'),width:innerWidth,height:innerHeight};
    })()`, 'Check visible choice caption layout ' + label);
    const {rects} = layout;
    invariant(layout.inCaption && !rects.ending.hidden && rects.ending.display !== 'none' && rects.ending.height > 0, 'Choice outcome is not visible in caption flow');
    invariant(rects['caption-title'].bottom <= rects['caption-detail'].top + .5 && rects['caption-detail'].bottom + 4 <= rects.ending.top, 'Choice feedback overlaps the story title or detail');
    invariant(rects['caption-title'].top >= 0 && rects.ending.bottom <= layout.height, 'Choice caption extends outside the viewport');
    check('choice-caption-remains-legible-' + label, layout);
  }
  async function act(code, label, predicate = () => true) {
    const before = (await readState()).state;
    await evaluate(code, label);
    const submitted = (await readState()).state;
    const after = await waitState(s => s.state?.ready && s.state.frames >= submitted.frames + 2 && predicate(s.state), label + ' fully rendered frames', 90000);
    return { before, after: after.state };
  }
  async function viewChange(code, label, name, previous, predicate) {
    const evidence = await act(code, label, predicate);
    const image = await capture(name);
    const difference = pixelDifference(previous.samples, image.samples);
    invariant(difference.meanAbsoluteDifference > 1, label + ' did not visibly change the three-dimensional view');
    check(label, { ...evidence, pixels: difference });
    return image;
  }
  async function pausedState(label) {
    await act(`${api}.pause(true)`, label, s => s.paused);
    const before = (await readState()).state;
    const imageA = await capture(label + '-a');
    await pause(1100);
    const after = (await readState()).state;
    const imageB = await capture(label + '-b');
    invariant(after.paused && Math.abs(after.time - before.time) < .0001, label + ' did not hold scene time');
    const difference = pixelDifference(imageA.samples, imageB.samples);
    invariant(difference.meanAbsoluteDifference < 3, label + ' changed more than display dither while paused');
    check(label, { before, after, pixels: difference });
    return imageB;
  }
  progress('awaiting-' + scene + '-3d-initialization');
  const initialized = await waitState(s => s.state?.ready && s.state.frames >= 2, 'Complete ' + scene + ' 3D initialization', 300000);
  check('real-3d-scene-ready', initialized);
  assertQualityConfiguration({ scene, state: initialized.state, check, invariant });
  invariant(initialized.canvas?.width >= 1000 && initialized.canvas?.height >= 600, 'Demo canvas is below acceptance resolution');
  check('same-resolution-acceptance-canvas', initialized.canvas);
  const initialPaint = await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {const loading=document.getElementById('loading');resolve({loadingHidden:!loading||loading.hidden||getComputedStyle(loading).display==='none'});})))`, 'Allow two own animation frames to present the initialized UI');
  invariant(initialPaint.loadingHidden, 'Initialized scene still displays its loading overlay');
  check('initialized-ui-presented-with-loading-overlay-removed', initialPaint);
  await controlsPanelFlow();
  if (scene === 'story') await tourCTA('initial');
  await evaluate(`${api}.pause(false)`);
  const initial = await capture('01-default');
  const motionBefore = (await readState()).state;
  const started = Date.now();
  const motionAfter = (await waitState(s => s.state?.frames >= motionBefore.frames + 8 && s.state.time > motionBefore.time, 'Completed live demo frames', 90000)).state;
  const elapsed = Date.now() - started;
  const moving = await capture('02-live-motion');
  const motionPixels = pixelDifference(initial.samples, moving.samples);
  invariant(motionPixels.meanAbsoluteDifference > .001, 'Live demo frames did not change actual pixels');
  check('live-scene-time-and-pixels-change', { before: motionBefore, after: motionAfter, pixels: motionPixels });
  check('completed-frame-throughput-sample', {
    completedFrames: motionAfter.frames - motionBefore.frames,
    elapsedMilliseconds: elapsed,
    completedFramesPerSecond: (motionAfter.frames - motionBefore.frames) / elapsed * 1000,
    scope: 'One hidden full-resolution interval, not an artistic-quality or stable-device benchmark.'
  });
  let previous = await pausedState('03-pause');
  if (scene === 'window') {
    progress('testing-window-camera-and-material-states');
    previous = await viewChange(`${api}.setView('near')`, 'walk-nearer-to-physical-window', '04-window-near', previous, s => s.mode === 'near' || s.view === 'near');
    previous = await viewChange(`${api}.setView('detail')`, 'physical-sill-material-closeup', '04b-sill-detail', previous, s => s.mode === 'detail' || s.view === 'detail');
    previous = await viewChange(`${api}.setView('orbit')`, 'orbit-actual-river-geometry', '05-river-orbit', previous, s => s.mode === 'orbit' || s.view === 'orbit');
    previous = await viewChange(`${api}.setView('window');${api}.setAtmosphere('night')`, 'cool-dusk-preserves-3d-scene', '06-window-cool-dusk-rain', previous, s => (s.light || s.atmosphere) === 'night');
    const dryEvidence = await act(`${api}.setRain(false)`, 'rain-switch', s => s.wet === false || s.rain === false);
    const dry = await capture('07-window-cool-dusk-dry');
    const weatherPixels = pixelDifference(previous.samples, dry.samples);
    invariant(weatherPixels.meanAbsoluteDifference > .005, 'Weather switch had no visible scene effect');
    check('rain-switch-changes-state-and-pixels', { ...dryEvidence, pixels: weatherPixels });
    const morningEvidence = await act(`${api}.setAtmosphere('day')`, 'warm-dusk-palette', s => (s.light || s.atmosphere) === 'day');
    const morning = await capture('08-window-warm-dusk');
    const lightPixels = pixelDifference(dry.samples, morning.samples);
    invariant(lightPixels.meanAbsoluteDifference > 3, 'Warm and cool dusk did not change visible light');
    check('warm-and-cool-dusk-have-distinct-lighting', { ...morningEvidence, pixels: lightPixels });
    await act(`${api}.setView('window');${api}.pause(true)`, 'prepare-window-direct-camera-driving', s => (s.mode || s.view) === 'window' && s.paused);
    const driveReference = await capture('08a-window-drive-start');
    const driveEvidence = await act(`${api}.move({forward:.4,right:.12});${api}.look({yawDelta:.07,pitchDelta:-.04})`, 'drive-window-camera-position-and-orientation', s => (s.mode || s.view) === 'window' && s.paused);
    const driven = await capture('08b-window-driven-camera');
    const drivenPixels = pixelDifference(driveReference.samples, driven.samples);
    invariant(distance(position(driveEvidence.before), position(driveEvidence.after)) > .1, 'Window driver failed to change actual camera position');
    invariant(distance(driveEvidence.before.camera.quaternion, driveEvidence.after.camera.quaternion) > .01, 'Window driver failed to change actual camera orientation');
    invariant(drivenPixels.meanAbsoluteDifference > 1, 'Window driver failed to change the actual rendered view');
    check('window-position-look-and-pixels-respond-to-driving', { ...driveEvidence, pixels: drivenPixels, operatingSystemInputUsed: false });
    let previousExtreme;
    for (const [name, requested] of [['08c-orbit-bound-high-left', {azimuth:-1.15,polar:.25,radius:28}], ['08d-orbit-bound-low-right', {azimuth:.45,polar:Math.PI*.49,radius:28}]]) {
      const evidence = await act(`${api}.setView('orbit');${api}.orbitPose(${JSON.stringify(requested)})`, name, s => (s.mode || s.view) === 'orbit' && s.paused);
      const actual = position(evidence.after);
      invariant(actual.length === 3 && actual.every(Number.isFinite), 'Orbit bound returned a non-finite actual camera position');
      invariant(Math.abs(distance(actual, [1, 2.9, 1.1]) - 28) < .05, 'Orbit bound did not retain the actual allowed radius');
      if (previousExtreme) invariant(distance(actual, previousExtreme) > .5, 'The two allowed orbit bounds did not move the actual camera');
      const image = await capture(name);
      check(name + '-renders-actual-allowed-bound', { requested, ...evidence, statistics: image.entry, artisticQualityEstablished: false });
      previousExtreme = actual;
    }
    const resetEvidence = await act(`${api}.reset()`, 'window-reset', s => (s.mode || s.view) === 'window' && (s.light || s.atmosphere) === 'dusk' && (s.wet === true || s.rain === true));
    await capture('09-window-reset');
    check('reset-restores-window-dusk-rain', resetEvidence);
  } else {
    progress('testing-story-shots-and-physical-choices');
    await act(`${api}.setShot(0,true)`, 'story-first-shot', s => s.shot === 0);
    previous = await capture('04-story-shot-01');
    previous = await viewChange(`${api}.setShot(1,true)`, 'story-second-actual-camera', '05-story-shot-02', previous, s => s.shot === 1);
    previous = await viewChange(`${api}.setShot(2,true)`, 'story-third-actual-camera', '06-story-shot-03', previous, s => s.shot === 2);
    const pickEvidence = await act(`${api}.choose('pick')`, 'pick-letter', s => s.choice === 'pick');
    const pick = await capture('07-story-pick');
    await choiceCaptionLayout('pick');
    const driftEvidence = await act(`${api}.choose('drift')`, 'drift-letter', s => s.choice === 'drift');
    const drift = await capture('08-story-drift');
    await choiceCaptionLayout('drift');
    const choicePixels = pixelDifference(pick.samples, drift.samples);
    invariant(choicePixels.meanAbsoluteDifference > .001 && choicePixels.changedChannelFraction > 0, 'Story choices changed text but not actual 3D pixels');
    check('two-choices-change-visible-3d-outcome', { pick: pickEvidence, drift: driftEvidence, pixels: choicePixels });
    invariant(pickEvidence.after.residentVisible === true && driftEvidence.after.residentVisible === false && distance(pickEvidence.after.letter, driftEvidence.after.letter) > .1, 'Story choices did not change both the actual resident and envelope positions');
    invariant(pickEvidence.after.response?.intensityCandela > driftEvidence.after.response?.intensityCandela && pickEvidence.after.response?.emitterIntensity > driftEvidence.after.response?.emitterIntensity, 'Story choices did not drive the actual interior lamp and emitter');
    check('choices-drive-envelope-resident-and-interior-emitter', { pick: pickEvidence.after, drift: driftEvidence.after });
    const resetEvidence = await act(`${api}.reset()`, 'story-reset', s => s.choice === null && s.shot === 0);
    check('reset-clears-choice-and-first-shot', resetEvidence);
    await tourCTA('after-reset');
    const tourUIEvidence = await act(`document.getElementById('start-tour').click()`, 'start-river-navigation-through-primary-button', s => s.mode === 'tour');
    check('primary-button-starts-actual-river-navigation', tourUIEvidence);
    const tourBefore = (await readState()).state;
    const tourStart = await capture('09-story-tour-start');
    const tourAfter = (await waitState(s => s.state?.frames >= tourBefore.frames + 12 && (s.state.tourTime ?? 0) > (tourBefore.tourTime ?? 0) && distance(position(s.state), position(tourBefore)) > .02, 'River navigation actually moves camera', 90000)).state;
    const tourFinish = await capture('10-story-tour-moving');
    const tourPixels = pixelDifference(tourStart.samples, tourFinish.samples);
    invariant(tourPixels.meanAbsoluteDifference > .05, 'River navigation did not change rendered perspective');
    check('river-navigation-moves-camera-and-pixels', { before: tourBefore, after: tourAfter, pixels: tourPixels });
    const tourCompleted = (await waitState(s => s.state?.mode === 'shot' && s.state.shot === 2 && s.state.tourTime >= 25 && s.state.frames >= tourAfter.frames + 2 && distance(position(s.state), [-3.75, 1.2, 5.55]) < .03, 'Whole river tour reaches the final choice camera', 90000)).state;
    const decision = await evaluate(`(() => {const panel=document.getElementById('decision');return {hidden:panel.hidden,display:getComputedStyle(panel).display,buttons:[...panel.querySelectorAll('[data-choice]')].map(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {choice:button.dataset.choice,disabled:button.disabled,width:r.width,height:r.height,centerHit:hit===button||button.contains(hit)};})};})()`, 'Inspect actual final tour decision panel');
    invariant(!decision.hidden && decision.display !== 'none' && decision.buttons.length === 2 && decision.buttons.every(button => !button.disabled && button.width > 0 && button.height > 0 && button.centerHit), 'Completed navigation did not expose both actual choice buttons');
    await capture('10b-story-tour-completed');
    check('whole-twenty-five-second-tour-reaches-actual-final-decision', { before: tourBefore, after: tourCompleted, decision, simulationShortcutUsed: false });
    await pausedState('11-tour-pause');
    const freeEvidence = await act(`${api}.setFree(true);${api}.move({forward:-1.3,right:.6,up:.25});${api}.look({yawDelta:.12,pitchDelta:.025})`, 'story-free-camera', s => s.mode === 'free');
    const free = await capture('12-story-free-camera');
    invariant(distance(position(freeEvidence.before), position(freeEvidence.after)) > .05, 'Free camera did not move through actual geometry');
    const freePixels = pixelDifference(tourFinish.samples, free.samples);
    invariant(freePixels.meanAbsoluteDifference > .1, 'Free camera did not change actual rendered pixels');
    check('free-camera-drives-real-three-dimensional-scene', { ...freeEvidence, pixels: freePixels });
    await act(`${api}.reset()`, 'story-final-reset', s => s.choice === null && s.shot === 0);
    await tourCTA('after-final-reset');
    await capture('13-story-reset');
  }
  check('quality-comparison-remains-a-separate-acceptance', { automatedFunctionalPassDoesNotMeanSourceEquivalentArtQuality: true });
}

module.exports = { runDemoAcceptance, assertQualityConfiguration };
