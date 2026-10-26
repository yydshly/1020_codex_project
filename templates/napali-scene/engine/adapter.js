'use strict';
(() => {
  const config = TEMPLATE_CONFIG;
  const heading = document.querySelector('.runtime-top strong');
  if (heading) heading.textContent = config.title;
  const subtitle = document.querySelector('.runtime-top small');
  if (subtitle) subtitle.textContent = '源库引擎复用 · 场景参数与镜头配置';
  const back = document.querySelector('.runtime-top a');
  if (back) { back.href = 'index.html'; back.target = '_self'; back.textContent = '返回启动页'; }
  const state = () => ({
    id: config.id, config, control: window.napaliControl?.getState() || null,
    drive: window.napaliDrive?.getState() || null,
    phase: window.napaliDiagnostics || null,
    sourceSHA256: document.querySelector('meta[name="upstream-sha256"]')?.content,
    hidden: document.hidden
  });
  const send = (type, detail) => { if (parent !== window) parent.postMessage({type, detail}, location.origin); };
  let parentHidden = false;
  const visibility = () => window.napaliControl?.suspend(parentHidden || document.hidden);
  addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'napali-template-command') return;
    const {command, value} = event.data;
    const control = window.napaliControl;
    if (command === 'visible') { parentHidden = value !== true; visibility(); }
    else if (control && command === 'pause') control.pause(value !== false);
    else if (control && command === 'seek' && Number.isFinite(value)) control.seek(value);
    else if (control && command === 'quality' && Number.isFinite(value)) control.setQuality(value);
    else if (control && command === 'restart') { window.napaliDrive?.setMode('flight'); control.restart(); }
    else if (command === 'state') send('napali-template-state', state());
  });
  document.addEventListener('visibilitychange', visibility);
  addEventListener('napali-ready', () => { visibility(); send('napali-template-ready', state()); });
  const errorPoll = setInterval(() => {
    const message = document.querySelector('#loadtxt')?.textContent;
    if (message?.startsWith('Error:')) { send('napali-template-error', message); clearInterval(errorPoll); }
    else if (window.napaliControl) clearInterval(errorPoll);
  }, 500);
  // Read-back height sampling is a useful route diagnostic, not an exact SDF
  // collision guarantee for every overhang, tree crown or rock displacement.
  function checkRoute(step = 2) {
    if (!window.napaliControl) throw new Error('Wait for napali-template-ready');
    if (!Number.isFinite(step) || step < 0.25 || step > 20) throw new Error('step must be 0.25..20 seconds');
    if (window.napaliDrive?.getState().mode === 'free') throw new Error('Return to flight mode first');
    const samples = [];
    for (let t = 0; t <= FLIGHT_END; t += step) {
      const camera = flightCam(t);
      const terrain = groundAt(camera.pos[0], camera.pos[2]);
      samples.push({time:t, position:camera.pos, terrain, clearance:camera.pos[1] - terrain});
    }
    return {samples, minimumClearance:Math.min(...samples.map(s => s.clearance)), scope:'CPU ground read-back only; verify the continuous route visually as well'};
  }
  window.sceneTemplate = Object.freeze({getState:state, checkRoute});
})();
