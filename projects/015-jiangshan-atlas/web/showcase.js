// SPDX-License-Identifier: GPL-3.0-only
'use strict';
(() => {
  const scenes = {
    territory: {title:'秦王扫六合 · 前 230 年', query:{year:'-230'}, label:'疆域演变', instruction:'将地图底部的年份从前 230 年逐步推进到前 221 年，观察六国怎样依次并入秦的版图。点击关键事件，查看阶段边界的变化。', insight:'看见的不只是朝代名称，还包括同一时期多个政权的空间关系。'},
    city: {title:'长安的千年身世 · 741 年', query:{year:'741',place:'长安'},label:'古城沿革',instruction:'在右侧“点地溯源”卡片中向下阅读，查看长安历代的名称、归属与当地大事；点击一条事件，让地图回到那一年。',insight:'同一个地理位置，串起古今名称、行政归属与历史事件。'},
    person: {title:'苏轼 · 宦海与山河',query:{person:'sushi'},label:'人物行迹',instruction:'使用人物面板中的上一站、下一站按钮，跟着苏轼的足迹前进；留意年份、地点、年号和版图怎样同步变化。',insight:'生平由一组可定位的事件组成，每次移动都会带着地图穿越时间。'},
    poetry: {title:'杜甫的归乡路 · 763 年',query:{year:'763',place:'剑外,巴峡,巫峡,襄阳,洛阳'},label:'诗词路线',instruction:'跟随地图上的编号，从剑外出发，经巴峡、巫峡、襄阳到洛阳；点击不同站点，查看沿途的地名与政区。',insight:'这是诗中表达的归乡路线；地图展示文本中的空间关系，不代表对实际行程的证明。'},
    layers: {title:'明代应天府 · 1415 年',query:{year:'1415',zoom:'1.75',center:'115.8,33.2',hover:'应天府',layers:'1'},label:'图层与古今对照',instruction:'打开地图上方“图层”，切换现代省界、现代省名与历史政区。放大并悬停州府，看古今行政空间如何对应；也可开关关河丝路图层。',insight:'历史疆域、行政区、山川水系与交通走廊，用不同图层共同解释一个时代。'},
    quiz: {title:'舆图寻址 · 古地名小试',query:{year:'-121',quiz:'locate'},label:'古地名挑战',instruction:'阅读题目中的历史线索，在地图上给古城落针。手机上可先调整落点再确认；完成十题后，查看自己的寻址成绩。',insight:'把认识地名变成主动回忆，用落点与实际位置的距离检验空间印象。'},
  };
  const presets = {
    hanyu:{year:'819',place:'蓝关',caption:'“雪拥蓝关马不前” · 唐宪宗元和十四年'},
    dufu:{year:'763',place:'剑外,巴峡,巫峡,襄阳,洛阳',caption:'“便下襄阳向洛阳” · 杜甫诗中的归乡路线'},
    sushi:{year:'1079,1080,1094,1097',place:'湖州,黄州,惠州,儋州',caption:'四站四年 · 苏轼跨年贬谪路线'},
  };
  const $ = (id) => document.getElementById(id);
  const frame = $('atlas-frame');
  const status = $('runtime-status');
  let generation = 0;
  let currentScene = 'territory';
  let currentQuery = scenes.territory.query;
  let readinessTimer;

  function runtimeStatus(message, state='') {
    status.className = state;
    status.replaceChildren(Object.assign(document.createElement('i'), {ariaHidden:'true'}),document.createTextNode(message));
  }

  function watchReadiness() {
    const id = ++generation;
    clearTimeout(readinessTimer);
    const started = Date.now();
    runtimeStatus('正在展开舆图…');
    function inspect() {
      if(id !== generation) return;
      try {
        const win = frame.contentWindow;
        if(win?.atlasAPI && win?.ATLAS_FULL_SNAPSHOTS_LOADED) {
          runtimeStatus('本地原作 · 已就绪', 'ready');
          return;
        }
      } catch (_) { /* Navigation may briefly replace the frame document. */ }
      if(Date.now()-started > 25000) {
        runtimeStatus('加载较慢，可重置或独立打开地图', 'error');
        return;
      }
      readinessTimer = setTimeout(inspect, 180);
    }
    inspect();
  }

  function mapURL(query) {
    const url = new URL('upstream/', window.location.href);
    url.search = new URLSearchParams(query).toString();
    return url;
  }

  function writeHash(scene, query) {
    const hash = new URLSearchParams({scene});
    if(scene === 'custom') Object.entries(query).forEach(([key,value])=>hash.set(key,value));
    history.replaceState(null,'',`#${hash}`);
  }

  function launch(scene, custom=null, fromHash=false) {
    const spec = scenes[scene] || {title:'你的历史路线',label:'自定义地点与路线',instruction:'点击地图落针或路线站点，查看相应年份与地点的历史信息。你也可以继续修改下方年份和地名。',insight:'地图按库内地名词典解析位置；遇到同名地点，可换用更明确的古名或今名。'};
    const query = custom || spec.query;
    if(!query) return;
    currentScene = scenes[scene] ? scene : 'custom';
    currentQuery = query;
    document.querySelectorAll('[data-scene]').forEach(button=> {
      const active = button.dataset.scene === currentScene;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('scene-title').textContent = spec.title;
    $('scene-instruction').textContent = spec.instruction;
    $('scene-insight').textContent = spec.insight;
    frame.title = `江山时序完整交互地图：${spec.label}体验`;
    $('open-atlas').href = mapURL(query).href;
    frame.src = mapURL(query).href;
    if(!fromHash) writeHash(currentScene,query);
    watchReadiness();
  }

  function validateRoute(yearText, placeText) {
    const normalize = text => text.trim().replace(/[，、]/g,',').split(',').map(part=>part.trim());
    const years = normalize(yearText);
    const places = normalize(placeText);
    if(!years.every(year=>/^-?\d+$/.test(year) && Number(year)!==0 && Number(year)>=-403 && Number(year)<=2026)) {
      throw new Error('年份需为 -403 至 2026 的整数，不含 0 年；多个年份用逗号分隔。');
    }
    if(!places.every(place=>place.length>0 && place.length<=80) || places.length>30) {
      throw new Error('请输入完整地名；多个地点用逗号分隔，最多 30 站。');
    }
    if(years.length!==1 && years.length!==places.length) {
      throw new Error('跨年路线中，年份数量需与地点数量相同；同年路线只填一个年份即可。');
    }
    return {year:years.map(Number).join(','),place:places.join(',')};
  }

  document.querySelectorAll('[data-scene],[data-launch]').forEach(button=>button.addEventListener('click',(event)=>{
    event.preventDefault();
    launch(button.dataset.scene||button.dataset.launch);
    if(button.dataset.launch) $('experience').scrollIntoView({block:'start'});
  }));
  $('reset-scene').addEventListener('click',()=>launch(currentScene,currentQuery));
  frame.addEventListener('load',watchReadiness);
  $('fullscreen').addEventListener('click', async()=> {
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else await $('map-stage').requestFullscreen();
    } catch (_) {runtimeStatus('此环境不支持全屏，请使用“独立打开”');}
  });
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'退出全屏 ⤡':'全屏 ⤢';});
  $('copy-scene').addEventListener('click', async()=> {
    const button = $('copy-scene');
    try {
      writeHash(currentScene,currentQuery);
      await navigator.clipboard.writeText(window.location.href);
      button.textContent='链接已复制 ✓';
    } catch (_) {button.textContent='请复制浏览器地址栏中的链接';}
    setTimeout(()=>{button.textContent='复制体验链接 ↗';},3000);
  });
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=> {
    const preset=presets[button.dataset.preset];
    $('route-year').value=preset.year;
    $('route-place').value=preset.place;
    $('route-feedback').textContent=preset.caption;
    $('route-year').removeAttribute('aria-invalid');
    $('route-place').removeAttribute('aria-invalid');
  }));
  $('route-form').addEventListener('submit',async(event)=> {
    event.preventDefault();
    try {
      const query=validateRoute($('route-year').value,$('route-place').value);
      $('route-year').removeAttribute('aria-invalid');
      $('route-place').removeAttribute('aria-invalid');
      // Resolve against the original atlas dictionary before navigating the frame.
      const api=frame.contentWindow?.atlasAPI;
      if(!api) throw new Error('地图还在加载，请就绪后再试。');
      const placeList=query.place.split(',');
      const yearList=query.year.split(',').map(Number);
      for(let i=0;i<placeList.length;i++) {
        if(!api.resolvePlace(placeList[i],yearList.length===1?yearList[0]:yearList[i])) {
          throw new Error(`词典中暂未找到“${placeList[i]}”，请尝试其他古名或现代地名。`);
        }
      }
      launch('custom',query);
      $('route-feedback').textContent=`已展开：${query.place.replaceAll(',',' → ')}`;
      $('experience').scrollIntoView({block:'start'});
    } catch(error) {
      $('route-feedback').textContent=error.message;
    }
  });

  function restoreHash() {
    const hash=new URLSearchParams(window.location.hash.slice(1));
    if(scenes[hash.get('scene')]) launch(hash.get('scene'),null,true);
    else if(hash.get('scene')==='custom') {
      try {
        const query=validateRoute(hash.get('year')||'',hash.get('place')||'');
        $('route-year').value=query.year;$('route-place').value=query.place;
        launch('custom',query,true);
      } catch (_) {launch('territory',null,true);}
    }
  }
  window.addEventListener('hashchange',restoreHash);
  if(window.location.hash.includes('scene=')) restoreHash();
  else watchReadiness();
  fetch('capabilities.json').then(response=>response.json()).then(data=>{
    if(Number.isInteger(data.snapshots)) $('snapshot-count').textContent=data.snapshots;
  }).catch(()=>{});
})();
