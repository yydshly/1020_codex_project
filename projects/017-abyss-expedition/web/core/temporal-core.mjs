// SPDX-License-Identifier: GPL-3.0-only
// A new, domain-independent learning exercise inspired by the atlas's temporal
// interactions. This module is not extracted from the upstream controller.

const LAYERS = Object.freeze(['route', 'labels']);
const QUERY_KEYS = new Set(['dataset', 'time', 'event', 'layers']);
const fail = message => { throw new TypeError(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

function uniqueIds(items, kind) {
  const seen = new Set();
  for (const item of items) {
    if (!item || !text(item.id) || item.id !== item.id.trim()) fail(`${kind}需要非空且无首尾空格的 id`);
    if (seen.has(item.id)) fail(`${kind} id 重复：${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

/** Validate the data contract before creating a store. Never mutates input. */
export function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') fail('缺少数据集');
  if (!text(dataset.id) || dataset.id !== dataset.id.trim() || !text(dataset.title)) fail('数据集需要 id 与 title');
  if (!finite(dataset.min) || !finite(dataset.max) || dataset.min > dataset.max) fail('数据集时间范围无效');
  if (!finite(dataset.max + 1) || dataset.max + 1 <= dataset.max) fail('最大时间不能表示有效的区间终点');
  for (const key of ['phases', 'entities', 'events']) {
    if (!Array.isArray(dataset[key]) || dataset[key].length === 0) fail(`${key} 必须是非空数组`);
  }
  uniqueIds(dataset.phases, '阶段');
  const entityIds = uniqueIds(dataset.entities, '对象');
  uniqueIds(dataset.events, '事件');
  let boundary = dataset.min;
  for (const phase of dataset.phases) {
    if (!finite(phase.from) || !finite(phase.to) || phase.from >= phase.to || phase.from !== boundary) fail('阶段必须按顺序连续排列，不能重叠或留空');
    if (!text(phase.label)) fail(`阶段缺少 label：${phase.id}`);
    boundary = phase.to;
  }
  if (boundary !== dataset.max + 1) fail('最后一个阶段的 to 必须等于 max + 1');
  for (const entity of dataset.entities) {
    if (!text(entity.label)) fail(`对象缺少 label：${entity.id}`);
    if (!Array.isArray(entity.position) || entity.position.length !== 2 || entity.position.some(n => !finite(n) || n < 0 || n > 1)) fail(`对象坐标须为两个 0–1 数值：${entity.id}`);
  }
  let previousTime = -Infinity;
  for (const event of dataset.events) {
    if (!finite(event.time) || event.time < dataset.min || event.time > dataset.max || event.time < previousTime) fail('事件时间必须在范围内并按非递减顺序排列');
    if (!entityIds.has(event.entityId)) fail(`事件引用未知对象：${event.entityId}`);
    if (!text(event.title) || typeof event.detail !== 'string') fail(`事件需要 title 和 detail：${event.id}`);
    previousTime = event.time;
  }
  return true;
}

/** Half-open intervals: a boundary belongs to the phase beginning there. */
export function resolvePhase(phases, time) {
  if (!Array.isArray(phases) || !finite(time)) fail('阶段查询需要阶段数组与有限时间');
  return phases.find(phase => phase.from <= time && time < phase.to) || null;
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

export function createExplorer(dataset, {initialTime = dataset?.min} = {}) {
  validateDataset(dataset);
  // Own a snapshot: caller mutations cannot silently invalidate the contract.
  const data = freezeDeep(structuredClone(dataset));
  const eventById = new Map(data.events.map(event => [event.id, event]));
  const entityById = new Map(data.entities.map(entity => [entity.id, entity]));
  const listeners = new Set();
  let destroyed = false;
  const checkTime = time => {
    if (!finite(time) || time < data.min || time > data.max) fail(`时间须在 ${data.min}–${data.max} 之间`);
    return time;
  };
  let state = freezeDeep({time:checkTime(initialTime), selectedEventId:null, visibleLayers:{route:true,labels:true}, playing:false});

  function getState() { return state; }
  function getView() {
    const selectedEvent = eventById.get(state.selectedEventId) || null;
    return Object.freeze({
      phase:resolvePhase(data.phases,state.time),
      selectedEvent,
      activeEntity:selectedEvent ? entityById.get(selectedEvent.entityId) : null,
      visitedEvents:Object.freeze(data.events.filter(event => event.time <= state.time)),
      events:data.events, entities:data.entities, state,
    });
  }
  const assertAlive = () => { if (destroyed) throw new Error('此状态实例已销毁'); };
  function commit(next, action) {
    const changed = next.time !== state.time || next.selectedEventId !== state.selectedEventId || next.playing !== state.playing || LAYERS.some(layer => next.visibleLayers[layer] !== state.visibleLayers[layer]);
    if (!changed) return getView();
    state = freezeDeep(next);
    const view = getView();
    for (const listener of [...listeners]) listener(view,action);
    return view;
  }
  function select(next, id) {
    const event = eventById.get(id);
    if (!event) fail(`未知事件：${String(id)}`);
    next.time = event.time;
    next.selectedEventId = event.id;
  }
  function dispatch(action) {
    assertAlive();
    if (!action || typeof action.type !== 'string') fail('动作缺少 type');
    const next = {...state,visibleLayers:{...state.visibleLayers}};
    switch (action.type) {
      case 'SET_TIME':
        next.time = checkTime(action.time);
        if (eventById.get(next.selectedEventId)?.time !== next.time) next.selectedEventId = null;
        break;
      case 'SELECT_EVENT': select(next,action.id); break;
      case 'NEXT':
      case 'PREVIOUS': {
        const direction = action.type === 'NEXT' ? 1 : -1;
        let index;
        if (state.selectedEventId !== null) index = data.events.findIndex(event => event.id === state.selectedEventId) + direction;
        else if (direction === 1) index = data.events.findIndex(event => event.time >= state.time);
        else index = data.events.findLastIndex(event => event.time <= state.time);
        if (index < 0 || index >= data.events.length) next.playing = false;
        else select(next,data.events[index].id);
        break;
      }
      case 'SET_LAYER':
        if (!LAYERS.includes(action.layer) || typeof action.visible !== 'boolean') fail('图层动作需要 route / labels 和布尔 visible');
        next.visibleLayers[action.layer] = action.visible;
        break;
      case 'SET_PLAYING':
        if (typeof action.playing !== 'boolean') fail('playing 必须为布尔值');
        next.playing = action.playing;
        break;
      default: fail(`未知动作：${action.type}`);
    }
    return commit(next,Object.freeze({...action}));
  }
  function subscribe(listener) {
    assertAlive();
    if (typeof listener !== 'function') fail('订阅者必须为函数');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function encode() {
    const query = new URLSearchParams({dataset:data.id,time:String(state.time)});
    if (state.selectedEventId !== null) query.set('event',state.selectedEventId);
    query.set('layers',LAYERS.filter(layer => state.visibleLayers[layer]).join(','));
    return query.toString();
  }
  function restore(search) {
    assertAlive();
    if (typeof search !== 'string') fail('恢复参数必须是查询字符串');
    const query = new URLSearchParams(search);
    for (const key of query.keys()) {
      if (!QUERY_KEYS.has(key) || query.getAll(key).length !== 1) fail(`未知或重复的 URL 参数：${key}`);
    }
    if (query.get('dataset') !== data.id) fail('URL 数据集与当前实例不一致');
    const rawTime = query.get('time');
    if (rawTime === null || !rawTime.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(rawTime)) fail('URL 缺少有效时间');
    const next = {time:checkTime(Number(rawTime)),selectedEventId:null,visibleLayers:{route:true,labels:true},playing:false};
    if (query.has('event')) {
      const event = eventById.get(query.get('event'));
      if (!event) fail(`URL 引用未知事件：${query.get('event')}`);
      if (event.time !== next.time) fail('URL 的事件和时间不一致');
      next.selectedEventId = event.id;
    }
    if (query.has('layers')) {
      const value = query.get('layers');
      const enabled = value === '' ? [] : value.split(',');
      if (new Set(enabled).size !== enabled.length || enabled.some(layer => !LAYERS.includes(layer))) fail('URL 图层无效');
      next.visibleLayers = Object.fromEntries(LAYERS.map(layer => [layer,enabled.includes(layer)]));
    }
    return commit(next,Object.freeze({type:'RESTORE'}));
  }
  function destroy() { destroyed = true; listeners.clear(); }
  return Object.freeze({getState,getView,dispatch,subscribe,encode,restore,destroy});
}
