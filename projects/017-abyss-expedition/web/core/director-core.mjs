// SPDX-License-Identifier: GPL-3.0-only
// A domain-independent shot clock. Rendering, camera safety and mission state
// belong to the caller; this module never schedules timers or writes storage.

const fail = message => { throw new TypeError(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const plain = value => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const text = value => typeof value === 'string' && value.trim().length > 0;

function validateData(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) return;
  if (!Array.isArray(value) && !plain(value)) fail('镜头附加参数必须为有限的 JSON 数据');
  if (ancestors.has(value)) fail('镜头数据不能包含循环引用');
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value)) {
    if (keys.length !== value.length + 1) fail('镜头数组不能稀疏或包含额外属性');
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) fail('镜头数组不能稀疏');
      validateData(value[i], ancestors);
    }
  } else {
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('镜头对象只接受普通 JSON 字段');
      validateData(descriptor.value, ancestors);
    }
  }
  ancestors.delete(value);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

/** Validate a reusable storyboard. Extra, JSON-compatible shot metadata is kept. */
export function validateShots(shots) {
  if (!Array.isArray(shots) || shots.length === 0) fail('导演模式需要至少一个镜头');
  validateData(shots);
  const ids = new Set();
  let duration = 0;
  for (const shot of shots) {
    if (!plain(shot)) fail('每个镜头必须为普通对象');
    for (const field of ['id', 'entityId', 'eventId', 'framing', 'title', 'narration']) {
      if (!text(shot[field])) fail(`镜头缺少非空 ${field}`);
    }
    for (const field of ['id', 'entityId', 'eventId', 'framing']) {
      if (shot[field] !== shot[field].trim()) fail(`镜头 ${field} 不能包含首尾空格`);
    }
    if (ids.has(shot.id)) fail(`镜头 id 重复：${shot.id}`);
    ids.add(shot.id);
    if (!finite(shot.duration) || shot.duration <= 0) fail('镜头时长必须为大于 0 的有限秒数');
    const next = duration + shot.duration;
    if (!finite(next) || next <= duration) fail('镜头总时长超出可表示范围');
    duration = next;
  }
  return true;
}

/**
 * createDirector(shots, {onChange, maxDelta=.25})
 * All durations and tick/seek arguments use real seconds. A tick is capped,
 * rather than caught up, so a suspended tab cannot jump through the film.
 */
export function createDirector(shots, {onChange, maxDelta = .25} = {}) {
  validateShots(shots);
  if (onChange !== undefined && typeof onChange !== 'function') fail('onChange 必须为函数');
  if (!finite(maxDelta) || maxDelta <= 0) fail('maxDelta 必须为正有限秒数');
  const ownedShots = freezeDeep(structuredClone(shots));
  const starts = [], ends = [];
  let duration = 0;
  for (const shot of ownedShots) { starts.push(duration); duration += shot.duration; ends.push(duration); }
  const listeners = new Set(onChange ? [onChange] : []);
  let state = {active:false, playing:false, elapsed:0}, destroyed = false, cachedView = null;
  const alive = () => { if (destroyed) throw new Error('导演时钟已销毁'); };
  const checkIndex = index => {
    if (!Number.isInteger(index) || index < 0 || index >= ownedShots.length) fail('镜头序号超出范围');
    return index;
  };
  const checkTime = value => {
    if (!finite(value) || value < 0 || value > duration) fail('导演时间须在片长范围内');
    return value;
  };
  // Snap only representational floating-point drift, not a visible interval.
  const snapTime = value => {
    for (const boundary of ends) {
      if (Math.abs(value - boundary) <= Number.EPSILON * Math.max(Math.abs(value), Math.abs(boundary)) * 8) return boundary;
    }
    return value === 0 ? 0 : value;
  };
  function getView() {
    if (cachedView) return cachedView;
    const completed = state.elapsed === duration;
    const index = completed ? ownedShots.length - 1 : ends.findIndex(end => state.elapsed < end);
    const shot = ownedShots[index], shotElapsed = completed ? shot.duration : state.elapsed - starts[index];
    cachedView = Object.freeze({
      active:state.active, playing:state.playing, completed, index, shot,
      shotElapsed, shotProgress:Math.min(1, shotElapsed / shot.duration),
      elapsed:state.elapsed, duration, progress:state.elapsed / duration, shots:ownedShots,
    });
    return cachedView;
  }
  function commit(next, type) {
    const normalized = {...next, elapsed:snapTime(next.elapsed)};
    if (normalized.elapsed === duration || !normalized.active) normalized.playing = false;
    if (normalized.active === state.active && normalized.playing === state.playing && normalized.elapsed === state.elapsed) return getView();
    state = normalized; cachedView = null;
    const view = getView(), action = Object.freeze({type});
    for (const listener of [...listeners]) listener(view, action);
    return view;
  }
  function subscribe(listener) {
    alive(); if (typeof listener !== 'function') fail('订阅者必须为函数');
    listeners.add(listener); return () => listeners.delete(listener);
  }
  function enter(options = {}) {
    alive();
    if (!plain(options) || Reflect.ownKeys(options).some(key => !['index', 'playing'].includes(key))) fail('进入参数仅支持 index 与 playing');
    const index = options.index === undefined ? 0 : checkIndex(options.index);
    const playing = options.playing === undefined ? true : options.playing;
    if (typeof playing !== 'boolean') fail('playing 必须为布尔值');
    return commit({active:true, playing, elapsed:starts[index]}, 'ENTER');
  }
  function exit() { alive(); return commit({...state, active:false, playing:false}, 'EXIT'); }
  function play() { alive(); return commit({active:true, playing:true, elapsed:getView().completed ? 0 : state.elapsed}, 'PLAY'); }
  function pause() { alive(); return commit({...state, playing:false}, 'PAUSE'); }
  function seek(seconds) { alive(); checkTime(seconds); return commit({...state, elapsed:seconds}, 'SEEK'); }
  function seekShot(index) { alive(); checkIndex(index); return commit({...state, elapsed:starts[index]}, 'SEEK_SHOT'); }
  function next() {
    alive(); const view = getView();
    return commit({...state, elapsed:view.index < ownedShots.length - 1 ? starts[view.index + 1] : duration}, 'NEXT');
  }
  function previous() {
    alive(); const view = getView(), index = view.completed ? view.index : Math.max(0, view.index - 1);
    return commit({...state, elapsed:starts[index]}, 'PREVIOUS');
  }
  function tick(deltaSeconds) {
    alive(); if (!finite(deltaSeconds) || deltaSeconds < 0) fail('tick 需要非负有限秒数');
    if (!state.active || !state.playing || deltaSeconds === 0) return getView();
    return commit({...state, elapsed:Math.min(duration, state.elapsed + Math.min(deltaSeconds, maxDelta))}, 'TICK');
  }
  function destroy() { if (destroyed) return; destroyed = true; listeners.clear(); }
  return Object.freeze({getView, subscribe, enter, exit, play, pause, next, previous, seek, seekShot, tick, destroy});
}
