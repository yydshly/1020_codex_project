'use strict';
(() => {
  const frames = [
    ['01_open_sea.jpg', '开阔海面', '从海面接近山体，先建立观看距离和地形尺度。', '作者原库渲染：海面前景与远处的海岸山体'],
    ['02_headland.jpg', '接近海岬', '近处岩壁、远处山脊和水面，让空间层次逐渐清晰。', '作者原库渲染：海岬岩壁、海浪和远处山脊'],
    ['03_beach.jpg', '沿着沙滩', '靠近岸线，看浪花、泡沫与浅水的颜色变化。', '作者原库渲染：海湾沙滩和近岸浪花'],
    ['04_valley.jpg', '进入山谷', '镜头进入山体之间，植被和峡谷成为画面主体。', '作者原库渲染：绿色植被覆盖的陡峭山谷'],
    ['05_aerial.jpg', '俯瞰海岸', '把海湾、山脊、森林和浪花放进同一个航拍构图。', '作者原库渲染：从高处俯瞰绿色山脊、海湾与蓝绿色海水']
  ];
  let selected = 4;
  const image = document.querySelector('#source-image');
  const thumbnails = [...document.querySelectorAll('[data-frame]')];
  function showFrame(index) {
    selected = (index + frames.length) % frames.length;
    const [file, caption, description, alt] = frames[selected];
    const src = `assets/upstream/${file}`;
    image.src = src;
    image.alt = alt;
    document.querySelector('#source-number').textContent = `${String(selected + 1).padStart(2, '0')} / 05`;
    document.querySelector('#source-caption').textContent = caption;
    document.querySelector('#source-description').textContent = description;
    document.querySelector('#source-full').href = src;
    thumbnails.forEach((button, i) => button.setAttribute('aria-pressed', String(i === selected)));
    document.querySelector('#gallery-status').textContent = `第 ${selected + 1} 张，共 5 张，${caption}`;
  }
  thumbnails.forEach((button) => button.addEventListener('click', () => showFrame(Number(button.dataset.frame))));
  document.querySelector('#gallery-prev').addEventListener('click', () => showFrame(selected - 1));
  document.querySelector('#gallery-next').addEventListener('click', () => showFrame(selected + 1));
  document.querySelector('.source-viewer').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showFrame(selected + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  const frames3d = [...document.querySelectorAll('iframe.world-frame')];
  const verifiedGLHost = window.worldsHost?.localRenderer === true && window.worldsHost.backend === 'gl';
  const sourceTrialAllowed = location.origin === 'http://127.0.0.1:8796';
  if (!sourceTrialAllowed) {
    document.querySelector('#source-gallery').open = true;
    const sourceLink = document.querySelector('#source-live-link');
    sourceLink.href = '#source-gallery'; sourceLink.removeAttribute('target');
    sourceLink.textContent = '查看作者原始效果图 ↓';
  }
  let activeFrame = null, desiredFrame = null, retiringFrame = null, transition = Promise.resolve();
  let visibilityTimer = null, statusTimer = null, intent = 0;
  const records = new Map(), byId = new Map();
  const descriptions = {
    source: ['Na Pali 海岸', '完整原库的海岸、海浪与植被。沿原作航线观看，或自行驾驶。'],
    'concepts-window': ['窗外世界', '木窗、河水、书店与树影。在窗边、河岸与书店之间停留。'],
    'concepts-station': ['旧船坞车站', '呼船，等待靠泊，再选择登船离开或留在站台目送。'],
    lijiang: ['漓江晨航', '沿江航拍，观察峰林、晨雾与水中倒影。现场生成约需一至三分钟，完成后可自由驾驶。']
  };
  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  for (const [index, frame] of frames3d.entries()) {
    const section = frame.closest('section[id]'), sectionId = section?.id || `world-${index + 1}`;
    const siblings = frames3d.filter(item => item.closest('section[id]') === section);
    const article = frame.closest('article');
    const suffix = article?.getAttribute('aria-labelledby')?.replace(/-title$/, '') || String(siblings.indexOf(frame) + 1);
    const id = siblings.length > 1 ? `${sectionId}-${suffix}` : sectionId;
    const [label, description] = descriptions[id] || ['实时场景', '点击后准备场景，再用画面内控件观察。'];
    const viewport = frame.parentElement, card = document.createElement('div');
    card.className = 'world-preview-card'; viewport.before(card); card.append(viewport);
    viewport.classList.add('world-preview-shell');
    const toolbar = document.createElement('div'); toolbar.className = 'world-preview-toolbar';
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    const stop = document.createElement('button'); stop.type = 'button'; stop.dataset.worldStop = id; stop.textContent = '停止并释放'; stop.hidden = true;
    toolbar.append(status, stop); card.prepend(toolbar);
    const cover = document.createElement('div'); cover.className = 'world-preview-launch';
    const title = document.createElement('strong'); title.textContent = '由你决定何时进入。';
    const detail = document.createElement('p');
    const button = document.createElement('button'); button.type = 'button'; button.dataset.worldStart = id; button.textContent = '启动' + label;
    const note = document.createElement('small'); note.textContent = '每次只运行一个作品。初次准备期间若想结束，可点击上方“停止并释放”。';
    cover.append(title, detail, button, note); viewport.append(cover);
    frame.dataset.worldId = id; frame.dataset.active = 'false'; frame.src = 'about:blank';
    const record = { id, sectionId, label, description, frame, viewport, cover, title, detail, button, stop, status, ready: false, error: null, lastVisibility: null, localOnly: id === 'source' && !sourceTrialAllowed };
    records.set(frame, record); byId.set(id, frame);
    button.addEventListener('click', () => activate(frame, !!record.error));
    stop.addEventListener('click', () => activate(null));
    frame.addEventListener('load', () => {
      record.lastVisibility = null;
      if (frame === activeFrame) { notify(frame); monitor(); }
    });
  }
  function inViewport(frame) {
    const box = frame.getBoundingClientRect();
    return box.right > 0 && box.left < innerWidth && Math.min(box.bottom, innerHeight) - Math.max(0, box.top) >= 48;
  }
  function notify(frame, showing = frame === activeFrame && !document.hidden && inViewport(frame)) {
    const record = records.get(frame);
    if (record?.lastVisibility === showing) return;
    frame.contentWindow?.postMessage({ type: 'worlds-visibility', visible: showing }, location.origin);
    if (record) record.lastVisibility = showing;
  }
  function runtimeState(frame) {
    try {
      const w = frame.contentWindow;
      const api = w?.hubLifecycle || w?.lijiangWorld || w?.stationWorld || w?.canalReal || w?.sourceLive || w?.napaliControl;
      return api?.getState?.() || null;
    } catch { return null; }
  }
  function updateControls() {
    for (const record of records.values()) {
      const { frame, cover, title, detail, button, stop, status } = record;
      const active = frame === activeFrame, retiring = frame === retiringFrame, requested = frame === desiredFrame;
      stop.hidden = !(active || retiring || requested); stop.disabled = retiring;
      // The child owns its real generation progress; reveal it as soon as the
      // user starts. The external toolbar remains available to stop loading.
      cover.hidden = active && !record.error;
      button.hidden = active && !record.error || retiring || requested && !active;
      button.disabled = record.localOnly || retiring || requested && !active;
      if (record.localOnly) { setText(title, '原作完整实时控制，需在本机打开。'); setText(detail, '在线版保留作者画面、制作原理与源库入口。此处不会连接你的电脑或启动本地服务。'); setText(button, '本机运行专用'); setText(status, '原作参考 · 在线可浏览'); }
      else if (retiring) { setText(title, '正在释放上一处场景。'); setText(detail, '完成后即可启动你选择的作品。'); setText(status, '正在释放'); }
      else if (requested && !active) { setText(title, '正在切换场景。'); setText(detail, '先释放上一处，再准备这里。'); setText(status, '等待启动'); }
      else if (active && record.error) { setText(title, '这次未能完成准备。'); setText(detail, record.error); setText(button, '重新启动'); setText(status, '准备未完成'); }
      else if (active) {
        setText(title, '正在准备实时场景。');
        setText(detail, record.lastVisibility === false ? '场景准备仍可能继续。返回时保留进度，也可停止并释放。' : '首次需要生成地形、植被与光照，请稍候。');
        setText(status, record.ready ? record.lastVisibility === false ? '已暂停绘制 · 返回时继续' : '实时场景已启动' : '正在准备 · 可随时停止');
      } else {
        setText(title, '进入' + record.label + '。'); setText(detail, record.description);
        setText(button, '启动' + record.label); setText(status, '尚未启动');
      }
    }
  }
  function monitor() {
    clearTimeout(statusTimer); statusTimer = null;
    if (activeFrame) {
      const record = records.get(activeFrame), state = runtimeState(activeFrame);
      if (state) { record.ready = state.ready === true; record.error = state.error ? String(state.error) : null; }
      notify(activeFrame); statusTimer = setTimeout(monitor, record.ready ? 1500 : 500);
    }
    updateControls();
  }
  async function releaseContext(frame) {
    notify(frame, false);
    const w = frame.contentWindow;
    if (w?.hubLifecycle?.dispose) { await w.hubLifecycle.dispose(); return; }
    if (w?.sourceLive) { await w.sourceLive.stop(); return; }
    if (w?.lijiangWorld) { await w.lijiangWorld.dispose(); return; }
    if (w?.stationWorld) { await w.stationWorld.dispose(); return; }
    if (w?.canalReal) { await w.canalReal.dispose(); return; }
    try {
      w?.napaliControl?.suspend(true);
      for (const canvas of frame.contentDocument?.querySelectorAll('canvas') || []) {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); gl?.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch (error) { console.info('Preview context will be released by document unloading', error.message); }
  }
  async function unload(frame) {
    await releaseContext(frame); frame.dataset.active = 'false';
    const record = records.get(frame); record.ready = false; record.lastVisibility = null;
    try { if (frame.contentWindow.location.href === 'about:blank') return; } catch { /* Wait for blank navigation. */ }
    await new Promise((resolve, reject) => {
      const finished = () => {
        try { if (frame.contentWindow.location.href !== 'about:blank') return; } catch { return; }
        clearTimeout(timer); frame.removeEventListener('load', finished); resolve();
      };
      const timer = setTimeout(() => { frame.removeEventListener('load', finished); reject(new Error('上一处场景尚未释放，下一处保持停止。')); }, 5000);
      frame.addEventListener('load', finished); frame.src = 'about:blank';
    });
  }
  function activate(frame, restart = false) {
    if (frame && records.get(frame)?.localOnly) return Promise.resolve({ blocked: 'local-renderer-required' });
    const request = ++intent; desiredFrame = frame; updateControls();
    transition = transition.then(async () => {
      if (request !== intent) return;
      if (activeFrame === frame && !restart && !retiringFrame) { if (activeFrame) notify(activeFrame); return; }
      const previous = activeFrame; activeFrame = null; clearTimeout(statusTimer); statusTimer = null;
      retiringFrame = previous || retiringFrame; updateControls();
      if (retiringFrame) { await unload(retiringFrame); retiringFrame = null; }
      if (request !== intent || !frame) { updateControls(); return; }
      const destination = new URL(frame.dataset.src, location.href);
      if (destination.origin !== location.origin) throw new Error('Preview origin changed');
      if (new URLSearchParams(location.search).get('qa') === '1') destination.searchParams.set('qa', '1');
      const record = records.get(frame); record.ready = false; record.error = null; record.lastVisibility = null;
      activeFrame = frame; frame.dataset.active = 'true'; frame.src = destination.href; monitor();
    }).catch(error => {
      if (request === intent) {
        desiredFrame = null;
        const record = records.get(frame || retiringFrame); if (record) { record.error = error.message; setText(record.detail, error.message); }
      }
      console.error('World preview transition stopped:', error); updateControls();
    });
    return transition;
  }
  function syncVisibility() { if (activeFrame) notify(activeFrame); updateControls(); }
  function scheduleVisibility() { clearTimeout(visibilityTimer); visibilityTimer = setTimeout(syncVisibility, 160); }
  const observer = new IntersectionObserver(scheduleVisibility, { threshold: [0, .25, .5, .75, 1] });
  frames3d.forEach(frame => observer.observe(frame));
  addEventListener('scroll', scheduleVisibility, { passive: true });
  addEventListener('resize', scheduleVisibility);
  document.addEventListener('visibilitychange', syncVisibility);
  addEventListener('pagehide', () => {
    clearTimeout(visibilityTimer); clearTimeout(statusTimer); observer.disconnect();
    activate(null).catch(error => console.info('Preview retirement:', error.message));
    // Start cleanup synchronously too, because page teardown may end queued work.
    for (const frame of [activeFrame, retiringFrame].filter(Boolean)) releaseContext(frame).catch(error => console.info('Preview retirement:', error.message));
  });
  window.worldHub = {
    start(id) {
      const frame = byId.get(id) || frames3d.find(item => records.get(item).sectionId === id);
      if (!frame) return Promise.reject(new Error('Unknown world preview: ' + id));
      return activate(frame, !!records.get(frame).error);
    },
    stopActive: () => activate(null),
    disposeAll: () => activate(null),
    getState: () => ({ verifiedGLHost, sourceTrialAllowed, activation: 'explicit', switching: !!retiringFrame || desiredFrame !== activeFrame,
      active: activeFrame?.dataset.src || null, activeId: records.get(activeFrame)?.id || null,
      previews: frames3d.map(frame => ({ id: records.get(frame).id, sectionId: records.get(frame).sectionId, source: frame.dataset.src,
        loaded: !!frame.getAttribute('src') && frame.getAttribute('src') !== 'about:blank', active: frame === activeFrame, ready: records.get(frame).ready, error: records.get(frame).error })) })
  };
  updateControls();
})();
