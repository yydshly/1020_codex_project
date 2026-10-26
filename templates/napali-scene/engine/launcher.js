'use strict';
(() => {
  const stage = document.querySelector('#stage'), start = document.querySelector('#start'), stop = document.querySelector('#stop'), status = document.querySelector('#status');
  let frame = null, observer = null, inView = true;
  function command(name, value) { frame?.contentWindow?.postMessage({type:'napali-template-command',command:name,value},location.origin); }
  function visibility() { command('visible', !document.hidden && inView); }
  function unload() {
    command('visible', false);
    frame?.remove(); frame = null; observer?.disconnect(); observer = null;
    document.body.classList.remove('running'); start.disabled = false; stop.hidden = true;
    status.textContent = '已停止 · 三维内容已卸载';
  }
  start.addEventListener('click', () => {
    if (frame) return;
    frame = document.createElement('iframe'); frame.title = document.title; frame.allow = 'fullscreen';
    frame.src = 'engine.html'; stage.append(frame); start.disabled = true; stop.hidden = false;
    document.body.classList.add('running'); status.textContent = '编译着色器并生成完整地貌中';
    observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; visibility(); });
    observer.observe(stage);
  });
  stop.addEventListener('click', unload);
  addEventListener('pagehide', unload);
  document.addEventListener('visibilitychange', visibility);
  addEventListener('message', event => {
    if (event.source !== frame?.contentWindow || event.origin !== location.origin) return;
    if (event.data?.type === 'napali-template-ready') { status.textContent = '完整场景已就绪 · 可使用画面内控件'; visibility(); }
    if (event.data?.type === 'napali-template-error') status.textContent = String(event.data.detail);
  });
  fetch('scene-config.json').then(response => { if(!response.ok)throw Error('配置加载失败');return response.json(); }).then(config => {
    document.title = config.title; document.querySelector('#title').textContent = config.title;
    document.querySelector('#description').textContent = config.description; start.disabled = false;
  }).catch(error => { status.textContent = error.message; });
})();
