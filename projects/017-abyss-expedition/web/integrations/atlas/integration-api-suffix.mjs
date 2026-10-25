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
