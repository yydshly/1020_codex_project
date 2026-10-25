// SPDX-License-Identifier: GPL-3.0-only
import {atlasIntegration as api} from './atlas-workbench.js?v=atlas1';
const embedded = parent !== window && window.name.startsWith('abyss-atlas:');
if (embedded) {
  const session = window.name.slice('abyss-atlas:'.length);
  const send = (type, extra = {}) => parent.postMessage({channel:'abyss-atlas', session, type, ...extra}, location.origin);
  let lost = false, queue = Promise.resolve(), previous = '', observedCanvas;
  const started = performance.now();
  document.body.dataset.embeddedAtlas = 'true';
  const style = document.createElement('style');
  style.textContent = 'body[data-embedded-atlas] #workbench-fullscreen{display:none}';
  document.head.append(style);
  for (const link of document.querySelectorAll('a[href]')) {
    if (!link.getAttribute('href').startsWith('#')) { link.target='_blank'; link.rel='noopener'; }
  }
  function publish(force = false) {
    const canvas = document.querySelector('.atlas-terrain-canvas');
    if (canvas && canvas !== observedCanvas) {
      observedCanvas = canvas;
      canvas.addEventListener('webglcontextlost', () => {
        lost = true; api.suspend(true); send('lost', {message:'三维图形上下文已中断，请重启地图恢复。'});
      });
    }
    const state = {...api.state(), lost};
    const serialized = JSON.stringify(state);
    if (force || serialized !== previous) { previous=serialized; send('state', {state}); }
    if (!state.ready && performance.now()-started > 45000) {
      send('error', {message:'地图加载超时，可以重试或打开完整地图。'}); clearInterval(timer);
    }
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.origin !== location.origin || event.source !== parent || data?.channel !== 'abyss-atlas' || data.session !== session) return;
    queue = queue.then(async () => {
      try {
        if (data.action === 'suspend') api.suspend(Boolean(data.value));
        else if (data.action === 'dispose') api.dispose();
        else if (data.action === 'ping') {}
        else { if (lost) throw new Error('三维已中断，请重启地图。'); await api.command(data.action, data.value); }
        publish(true); send('ack', {id:data.id});
      } catch(error) { send('command-error', {id:data.id, message:error.message}); }
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.querySelector('#layers-popover:not(.is-hidden)')) {
      document.getElementById('act-layers-menu').click(); event.preventDefault(); return;
    }
    if (!document.querySelector('dialog[open]')) send('escape');
  });
  let timer = setInterval(publish, 600);
  addEventListener('pagehide', event => { clearInterval(timer); if(event.persisted)api.suspend(true);else api.dispose(); });
  addEventListener('pageshow', event => { if(event.persisted){timer=setInterval(publish,600);publish(true);} });
  publish(true);
}
