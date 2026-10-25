// SPDX-License-Identifier: GPL-3.0-only
// The upstream controller owns history; both renderers consume that same state.
const $ = id => document.getElementById(id);
let terrain, app, mode = '2d', ready = false, syncFrame = 0, toastTimer;
const requestedView = new URLSearchParams(location.search).get('view') || '3d';
function notify(message, duration = 4500) {
  $('workbench-feedback').textContent = message;
  $('workbench-feedback').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('workbench-feedback').hidden = true, duration);
}
function refreshBrand() {
  $('txt-seal').textContent = '山河行记';
  $('txt-subtitle').textContent = '时间 · 地理 · 人物';
  const name = app?.activePerson?.profile?.zh || (app ? app.dynastyName(app.dynasties[app.dynastyIdx]) : '');
  document.title = `${name ? name + ' · ' : ''}山河行记 · 历史时空地图`;
}
function persistView() {
  const params = new URLSearchParams();
  params.set('view', mode);
  if (app.challenge) { params.set('year',app.year); params.set('quiz','locate'); }
  else if (app.activePerson) {
    params.set('person',app.activePerson.profile.key);
    if(app.activePersonEventIdx >= 0) params.set('stop', app.activePersonEventIdx);
  } else if (app.activeCustomRoute?.length) {
    params.set('year',app.activeCustomRoute.map(stop=>stop.year ?? app.year).join(','));
    params.set('place',app.activeCustomRoute.map(stop=>stop.query || stop.name).join(','));
    if(app.customRouteStopIdx >= 0) params.set('routeStop', app.customRouteStopIdx);
  } else {
    params.set('year',app.year);
    if(app.activeTrace) { params.set('lng',app.activeTrace[0]);params.set('lat',app.activeTrace[1]); }
  }
  const url = `${location.pathname}?${params.toString()}`;
  if(location.pathname+location.search !== url) history.replaceState(null,'',url);
}
function scheduleSync() {
  if(syncFrame || !app) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    if(app.challenge && mode === '3d') setView('2d',false);
    $('view-3d').disabled = Boolean(app.challenge);
    $('view-3d').title = app.challenge ? '完成或退出寻址挑战后可切换三维' : '同一历史地图的三维视角';
    terrain?.sync();
    document.body.dataset.year = app.year;
    document.body.dataset.snapshot = app.activeSnapKey || '';
    document.body.dataset.person = app.activePerson?.profile.key || '';
    document.body.dataset.event = app.activePersonEventIdx;
    refreshBrand();
    if(ready) persistView();
  });
}
function wrap(method, after = scheduleSync) {
  const original = app[method];
  if(typeof original !== 'function') return;
  app[method] = function(...args) {
    const result = original.apply(this,args);
    after(result,args);
    return result;
  };
}
async function setView(next, announce = true) {
  if(next === '3d' && app?.challenge) { notify('寻址挑战使用舆图落针，退出挑战后可切回三维。');return; }
  if(next === '3d' && !terrain) {
    try {
      $('view-3d').disabled = true;
      notify('正在展开三维山河：载入地形、疆域与城池…',15000);
      const module = await import('./atlas-terrain.js?v=atlas1');
      terrain = await module.createAtlasTerrain({host:$('atlas-terrain-host'),app,onStatus:message=>notify(message)});
    } catch(error) {
      console.error(error);
      notify('三维地图暂未载入，完整舆图仍可操作。可点击 3D 山河重试。',10000);
      $('view-3d').disabled = false;
      return;
    }
  }
  mode = next;
  document.body.dataset.mapView = mode;
  $('atlas-terrain-host').hidden = mode !== '3d';
  $('terrain-caption').hidden = mode !== '3d';
  $('view-2d').setAttribute('aria-pressed',String(mode === '2d'));
  $('view-3d').setAttribute('aria-pressed',String(mode === '3d'));
  $('view-3d').disabled = false;
  terrain?.setEnabled(mode === '3d');
  scheduleSync();
  if(announce) notify(mode === '3d' ? '三维山河已展开。拖动旋转，点击城池或路线站点读史。' : '已切回舆图；年份、人物和路线保持联动。');
}
function clearExploration() {
  app.stopAutoplay();
  if(app.personTimer) app.togglePersonAutoplay();
  if(app.challenge) app.stopChallenge();
  app.closeGenealogyCard();
  app.clearCustomRoute();
  app.closeMilestoneBalloon();
}
async function experience(key) {
  clearExploration();
  document.querySelectorAll('[data-experience]').forEach(button=>button.classList.toggle('is-selected',button.dataset.experience===key));
  if(key === 'qin') {
    app.openPersonChronicle('qinshihuang');
    const idx=app.activePerson?.events.findIndex(event=>event.year === -230);
    if(idx >= 0) app.selectPersonEvent(idx,true);
    notify('秦扫六合：点下一处史事，看六国的疆域随年份逐步改变。');
  } else if(key === 'changan') {
    app.locate({year:741,place:'长安'});
  } else if(key === 'sushi') {
    app.openPersonChronicle('sushi');
    notify('已展开苏轼完整生平：点经历可联动年份、地图与行迹。');
  } else if(key === 'dufu') {
    app.locate({year:763,place:'剑外,巴峡,巫峡,襄阳,洛阳'});
    notify('诗中的五站归乡路线已展开；连线表达诗中地理关系。');
  } else if(key === 'compare') {
    app.jumpToYear(1415);
    for(const id of ['chk-polities','chk-prefectures','chk-provinces','chk-prov-names']) {
      $(id).checked=true;$(id).dispatchEvent(new Event('change',{bubbles:true}));
    }
    app.resetCamera();terrain?.reset();
    notify('明代疆域与现代省界已叠加。可在“图层”逐项开关比较。');
  } else if(key === 'quiz') {
    await setView('2d',false);app.jumpToYear(-121);app.startChallenge({preferCurrentDynasty:true});
    notify('根据线索在舆图上落针作答；触屏设备可先微调再确认。');
  }
  scheduleSync();
}
async function start() {
  app = window.atlasApp;
  if(!app) { notify('地图引擎未能启动，请刷新页面重试。');return; }
  for(const method of ['jumpToYear','_renderPolitiesAndPrefectures','_renderPersonPinsOverlay','openPersonChronicle','selectPersonEvent','_renderCustomRoute','selectCustomRouteStop','clearCustomRoute','openGenealogyAt','closeGenealogyCard','_clearActivePerson','_clearActiveTrace','_buildTerrainRivers','_renderCorridors','toggleTerrainMode','startChallenge','stopChallenge','applyLocale']) wrap(method);
  wrap('_syncDocumentSeoMeta',refreshBrand);
  wrap('_zoomToPolity',()=>{scheduleSync();if(mode==='3d') terrain?.focusViewport();});
  const upstreamReset = app.resetCamera.bind(app);
  app.resetCamera = function() { if(mode === '3d') terrain?.reset(); else upstreamReset(); scheduleSync(); };
  $('view-2d').addEventListener('click',()=>setView('2d'));
  $('view-3d').addEventListener('click',()=>setView('3d'));
  $('layers-popover').addEventListener('change',scheduleSync);
  document.querySelectorAll('[data-experience]').forEach(button=>button.addEventListener('click',()=>experience(button.dataset.experience)));
  $('workbench-help').addEventListener('click',()=>$('workbench-help-dialog').showModal());
  $('make-route').addEventListener('click',()=>$('route-dialog').showModal());
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
  $('workbench-fullscreen').addEventListener('click',async()=>{
    if(document.fullscreenElement) await document.exitFullscreen();else await document.documentElement.requestFullscreen();
  });
  document.addEventListener('fullscreenchange',()=>$('workbench-fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏地图':'全屏地图'));
  $('route-form').addEventListener('submit',event=>{
    event.preventDefault();
    const places=$('route-places').value.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean);
    const rawYears=$('route-years').value.split(/[,，\s]+/).filter(Boolean);
    const years=rawYears.map(Number);
    const error=message=>{$('route-error').textContent=message;};
    if(places.length<2 || places.length>20) return error('请输入 2–20 个地点，用逗号分隔。');
    if(years.length !== 1 && years.length !== places.length) return error('年份数量应为 1，或与地点数量一致。');
    if(years.some(year=>!Number.isInteger(year)||year===0||year<app.minYear||year>app.maxYear)) return error(`年份须为 ${app.minYear} 至 ${app.maxYear} 的整数；没有公元 0 年。`);
    const missing=places.filter((place,i)=>!app.resolvePlace(place,years.length===1?years[0]:years[i]));
    if(missing.length) return error('未找到这些地名：'+missing.join('、')+'。请使用古城名或现代城市名。');
    $('route-error').textContent='';clearExploration();
    app.locate({year:years.join(','),place:places.join(',')});
    $('route-dialog').close();notify(`已生成 ${places.length} 站路线，点编号或前后按钮逐站浏览。`);scheduleSync();
  });
  // The original URL restoration can finish asynchronously after the controller starts.
  await app._ensureFullSnapshots();
  const params = new URLSearchParams(location.search);
  if(!['year','person','place','quiz','q','lng','journey'].some(key=>params.has(key))) {
    app.jumpToYear(-230);app.closeMilestoneBalloon();
  }
  await setView(params.has('quiz')?'2d':requestedView==='2d'?'2d':'3d',false);
  if(params.has('event') && params.has('person')) {
    app.openPersonChronicle(params.get('person'),Number(params.get('event')));
  }
  if(params.has('routeStop') && app.activeCustomRoute) app.selectCustomRouteStop(Number(params.get('routeStop')));
  ready = true;document.body.dataset.workbenchReady='true';scheduleSync();
}
if(window.atlasApp) start();else window.addEventListener('DOMContentLoaded',start,{once:true});


// 017 integration lifecycle API; source adapter remains unchanged in project 016.
// SPDX-License-Identifier: GPL-3.0-only
// Appended only to the packaged 016 controller; the source project stays intact.
let integrationSuspended = false;
export const atlasIntegration = {
  state() {
    const canvas = document.querySelector('.atlas-terrain-canvas');
    const person = app?.activePerson;
    const events = person?.events || app?.activeCustomRoute || [];
    const index = person ? app.activePersonEventIdx : app?.customRouteStopIdx;
    const selected = events[index];
    return {
      ready, view: mode, year: app?.year, minYear: app?.minYear, maxYear: app?.maxYear,
      person: person?.profile?.zh || person?.profile?.key || '',
      stop: Number.isInteger(index) ? index : -1, total: events.length,
      title: selected?.title || selected?.label || selected?.name || '',
      challenge: Boolean(app?.challenge), suspended: integrationSuspended,
      terrainReady: canvas?.dataset.ready === 'true', camera: canvas?.dataset.camera || '',
      layers: canvas?.dataset.layers || '', url: location.pathname + location.search,
    };
  },
  suspend(value) {
    value = Boolean(value);
    if (!ready || value === integrationSuspended) return;
    integrationSuspended = value;
    app.stopAutoplay();
    if (value && app.musicPlaying) app.toggleMusic();
    if (mode === '3d') terrain?.setEnabled(!value, {retainCamera:true});
  },
  async command(action, value) {
    if (!ready) throw new Error('地图仍在加载，请稍候。');
    if (action === 'preset') {
      if (!['qin','changan','sushi','dufu','compare','quiz'].includes(value)) throw new Error('未知场景');
      await experience(value);
      if (value !== 'quiz') await setView('3d', false);
    } else if (action === 'view') {
      if (!['2d','3d'].includes(value)) throw new Error('未知视图');
      if (value === '3d' && app.challenge) app.stopChallenge();
      await setView(value, false);
    } else if (action === 'step') {
      if (value !== 1 && value !== -1) throw new Error('无效步长');
      app.stopAutoplay();
      if (app.activePerson) app.stepPersonEvent(value);
      else if (app.activeCustomRoute) app.stepCustomRoute(value);
      else document.getElementById(value > 0 ? 'act-step-next' : 'act-step-prev')?.click();
    } else if (action === 'year') {
      if (!Number.isInteger(value) || value === 0 || value < app.minYear || value > app.maxYear)
        throw new Error(`请输入 ${app.minYear} 至 ${app.maxYear} 的整数，公元没有0年。`);
      clearExploration(); app._clearActiveTrace(); app.jumpToYear(value);
    } else if (action === 'reset') {
      if (mode === '3d') terrain?.reset();
      else app._animateCameraTo(app._getDefaultCamera());
    } else throw new Error('不支持的操作');
    if (integrationSuspended && mode === '3d') terrain?.setEnabled(false);
    scheduleSync();
    if (action === 'view' && mode !== value) throw new Error('三维未能载入，可使用二维或重启地图。');
  },
  dispose() { app?.stopAutoplay(); if(app?.musicPlaying)app.toggleMusic(); terrain?.dispose(); },
};

