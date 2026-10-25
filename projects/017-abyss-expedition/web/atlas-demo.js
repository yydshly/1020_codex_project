// SPDX-License-Identifier: GPL-3.0-only
// Parent adapter for a complete, same-origin atlas runtime. No deep-sea renderer dependency.
const panel = document.getElementById('atlas-demo');
if (panel) {
  const $ = id => document.getElementById(id);
  const base = new URL('./integrations/atlas/', location.href);
  let frame, session, state, sequence=0, timeout, visible=true, manualPause=false, failed=false;
  let resumeURL=base.href+'?view=3d&person=qinshihuang&stop=3', selected='qin', expanded=false, queuedPreset;
  const pending = new Map();
  const presets = {
    qin:['秦扫六合','从前230年的战争事件开始，逐站查看人物经历、疆域和年份如何联动。'],
    changan:['唐代长安','定位741年的长安。旋转地形后，可用地图内搜索寻找其他历史城池。'],
    sushi:['苏轼行迹','打开完整人物生平。点击右侧经历或“下一站”，地图和年代同步改变。'],
    dufu:['杜甫诗中归途','沿剑外、巴峡、巫峡、襄阳与洛阳逐站浏览。这是诗中地理路线。'],
    compare:['古今叠图','1415年历史疆域叠加现代省界。打开地图内“图层”，逐项比较边界。'],
    quiz:['寻址挑战','挑战使用二维舆图：读线索、在地图落针并确认。切回三维会退出挑战。'],
  };
  function hint(message) { $('atlas-demo-status').textContent=message; }
  function describe(key) {
    selected=key;
    $('atlas-preset-title').textContent=presets[key][0]; $('atlas-preset-description').textContent=presets[key][1];
    panel.querySelectorAll('[data-atlas-preset]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.atlasPreset===key)));
  }
  function post(action,value) {
    if (!frame?.contentWindow) return;
    const id=++sequence;
    frame.contentWindow.postMessage({channel:'abyss-atlas',session,id,action,value},location.origin);
    if (!['ping','suspend','dispose'].includes(action)) {
      hint('正在更新地图…');
      pending.set(id, setTimeout(()=>{pending.delete(id);hint('操作响应较慢，可直接使用地图内的控制，或重启地图。');},15000));
    }
  }
  function syncPause() {
    if (!state?.ready || failed) return;
    post('suspend', manualPause || document.hidden || !visible);
    $('atlas-pause-cover').hidden=!manualPause;
    $('atlas-pause').textContent=manualPause?'继续交互':'暂停地图';
    if (manualPause) hint('地图已暂停，人物与镜头保留。点击“继续交互”恢复。');
  }
  function setExpanded(value) {
    expanded=value; panel.classList.toggle('is-expanded',value);
    document.body.classList.toggle('atlas-expanded',value);
    $('atlas-expand').textContent=value?'收起地图 Esc':'展开地图';
    $('atlas-expand').setAttribute('aria-expanded',String(value));
    if (value) { visible=true; syncPause(); }
  }
  function fail(message) {
    failed=true; panel.dataset.status='error'; clearTimeout(timeout);
    $('atlas-error').hidden=false; $('atlas-error-message').textContent=message;
    hint(message); controls(false);
  }
  function controls(enabled) { panel.querySelectorAll('[data-atlas-control]').forEach(button=>button.disabled=!enabled); }
  function mount() {
    clearTimeout(timeout); pending.forEach(clearTimeout);pending.clear();
    if(frame){post('dispose');frame.remove();}
    frame=document.createElement('iframe');session=crypto.randomUUID();
    frame.name='abyss-atlas:'+session;frame.title='江山时序历史地图与三维山河，可旋转、缩放、搜索和浏览行迹';
    frame.allow='fullscreen';frame.referrerPolicy='same-origin';
    frame.src=resumeURL;frame.id='atlas-runtime';
    state=undefined;failed=false;manualPause=false;
    controls(false); panel.dataset.status='loading';$('atlas-launch').hidden=true;$('atlas-error').hidden=true;$('atlas-pause-cover').hidden=true;
    $('atlas-frame-slot').append(frame);$('atlas-pause').textContent='暂停地图';
    hint('正在载入本地历史地图、地形与三维引擎…');
    timeout=setTimeout(()=>fail('地图加载超时。请重试，也可以打开完整地图检查。'),45000);
    frame.addEventListener('load',()=>post('ping'));
  }
  window.addEventListener('message',event=>{
    const data=event.data;
    if (event.origin!==location.origin || event.source!==frame?.contentWindow || data?.channel!=='abyss-atlas' || data.session!==session) return;
    if(data.type==='state') {
      state=data.state;
      if(typeof state.url==='string' && state.url.startsWith(base.pathname)) {
        const next=new URL(state.url,location.origin);if(next.origin===location.origin){resumeURL=next.href;$('atlas-open').href=next.href;}
      }
      if(!state.ready)return;
      clearTimeout(timeout);
      if(state.lost){if(!failed)fail('三维图形上下文中断。点击重启地图，恢复当前人物与年份。');return;}
      if(failed)return;
      const first=panel.dataset.status==='loading';
      panel.dataset.status=state.suspended?'paused':'ready'; controls(true);
      panel.dataset.view=state.view;panel.dataset.year=String(state.year);panel.dataset.person=state.person||'';
      panel.dataset.camera=state.camera||'';panel.dataset.layers=state.layers||'';
      panel.dataset.terrainReady=String(Boolean(state.terrainReady));
      panel.querySelectorAll('[data-atlas-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.atlasView===state.view)));
      $('atlas-current-year').textContent=state.year<0?'前'+Math.abs(state.year)+'年':state.year+'年';
      $('atlas-current-detail').textContent=[state.view==='3d'?'三维山河':'二维舆图',state.person,state.total?(state.stop>=0?`第${state.stop+1}/${state.total}站`:`全程总览 · ${state.total}站`):'',state.challenge?'挑战进行中':''].filter(Boolean).join(' · ');
      if(document.activeElement!==$('atlas-year'))$('atlas-year').value=state.year;
      $('atlas-year').min=state.minYear;$('atlas-year').max=state.maxYear;
      if(first)syncPause();
      if(first && queuedPreset){const key=queuedPreset;queuedPreset=undefined;post('preset',key);}
      if(!manualPause && !pending.size)hint(state.suspended?'地图在后台暂停，返回可见区域后继续。':'已就绪。可直接在地图中操作；拖动旋转，滚轮缩放，右键拖动平移。');
    } else if(data.type==='ack' || data.type==='command-error') {
      clearTimeout(pending.get(data.id));pending.delete(data.id);
      if(data.type==='command-error')hint(data.message);
      else if(!pending.size && state?.ready && !manualPause)hint('已更新。地图内的搜索、图层、时间轴和自定义路线也可以直接操作。');
    } else if(data.type==='lost' || data.type==='error')fail(data.message);
    else if(data.type==='escape' && expanded){setExpanded(false);$('atlas-expand').focus();}
  });
  $('atlas-start').addEventListener('click',mount);
  $('atlas-restart').addEventListener('click',mount);$('atlas-retry').addEventListener('click',mount);
  $('atlas-expand').addEventListener('click',()=>setExpanded(!expanded));
  $('atlas-pause').addEventListener('click',()=>{manualPause=!manualPause;syncPause();});
  $('atlas-resume').addEventListener('click',()=>{manualPause=false;syncPause();});
  panel.querySelectorAll('[data-atlas-preset]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.atlasPreset;describe(key);
    if(!frame){queuedPreset=key;resumeURL=base.href+'?view=3d&person=qinshihuang&stop=3';mount();}
    else if(!state?.ready){queuedPreset=key;}
    else{manualPause=false;syncPause();post('preset',key);}
  }));
  panel.querySelectorAll('[data-atlas-view]').forEach(button=>button.addEventListener('click',()=>post('view',button.dataset.atlasView)));
  panel.querySelectorAll('[data-atlas-step]').forEach(button=>button.addEventListener('click',()=>post('step',Number(button.dataset.atlasStep))));
  $('atlas-reset').addEventListener('click',()=>post('reset'));
  $('atlas-year-form').addEventListener('submit',event=>{event.preventDefault();const value=Number($('atlas-year').value);if(!Number.isInteger(value)||value===0){hint('年份请填整数，公元前用负数，没有公元0年。');return;}post('year',value);});
  document.addEventListener('visibilitychange',syncPause);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && expanded)setExpanded(false);});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting||expanded;syncPause();},{threshold:0}).observe($('atlas-frame-slot'));
  addEventListener('pagehide',event=>{if(event.persisted)post('suspend',true);else{clearTimeout(timeout);pending.forEach(clearTimeout);post('dispose');}});
  addEventListener('pageshow',event=>{if(event.persisted)syncPause();});
  controls(false);describe(selected);
}
