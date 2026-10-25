// SPDX-License-Identifier: GPL-3.0-only
'use strict';
(() => {
  const story=window.DONGPO_STORY;
  const stops=story.stops;
  const $=id=>document.getElementById(id);
  const svg=$('journey-map');
  const namespace='http://www.w3.org/2000/svg';
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let selected=-1;
  let mapData=null;
  let view=null;
  let overviewView=null;
  let animation=0;
  let toastTimer;
  let projection;
  let inverseProjection;
  let projectionScale;

  function makeSvg(tag,attributes,text) {
    const element=document.createElementNS(namespace,tag);
    Object.entries(attributes||{}).forEach(([key,value])=>element.setAttribute(key,String(value)));
    if(text!==undefined) element.textContent=text;
    return element;
  }
  function paragraph(text) {const element=document.createElement('p');element.textContent=text;return element;}
  function externalLink(source) {
    const link=document.createElement('a');
    link.href=source.url;link.textContent=source.label;link.target='_blank';link.rel='noopener noreferrer';
    return link;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent=message;$('toast').classList.add('is-visible');
    toastTimer=setTimeout(()=>$('toast').classList.remove('is-visible'),3000);
  }

  function makeProjection(config) {
    const {width,height,bounds}=config;
    const merc=latitude=>Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360));
    const degrees=180/Math.PI;
    const spanX=bounds.east-bounds.west;
    const spanY=(merc(bounds.north)-merc(bounds.south))*degrees;
    const scale=Math.min(width/spanX,height/spanY);
    const padX=(width-spanX*scale)/2;
    const padY=(height-spanY*scale)/2;
    const north=merc(bounds.north);
    projectionScale=scale;
    projection=([longitude,latitude])=>[padX+(longitude-bounds.west)*scale,padY+(north-merc(latitude))*degrees*scale];
    inverseProjection=([x,y])=>[bounds.west+(x-padX)/scale,(2*Math.atan(Math.exp(north-(y-padY)/(degrees*scale)))-Math.PI/2)*degrees];
  }
  function pathForRing(ring) {
    return ring.map((coordinate,index)=>{
      const [x,y]=projection(coordinate);
      return `${index?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join('')+'Z';
  }
  function pathForShape(shape) {
    const polygons=shape.type==='Polygon'?[shape.coordinates]:shape.coordinates;
    return polygons.map(polygon=>polygon.map(pathForRing).join('')).join('');
  }
  function aspect() {return Math.max(.45,$('map-canvas').clientWidth/Math.max(1,$('map-canvas').clientHeight));}
  function overviewBounds() {
    const points=stops.map(stop=>projection(stop.coord));
    const xs=points.map(point=>point[0]);const ys=points.map(point=>point[1]);
    const centerX=(Math.min(...xs)+Math.max(...xs))/2;
    const centerY=(Math.min(...ys)+Math.max(...ys))/2;
    let width=Math.max(...xs)-Math.min(...xs)+100;
    let height=Math.max(...ys)-Math.min(...ys)+82;
    if(width/height<aspect()) width=height*aspect(); else height=width/aspect();
    return {x:centerX-width/2,y:centerY-height/2,w:width,h:height};
  }
  function focusedBounds(index) {
    const point=projection(stops[index].coord);
    const width=Math.max(180,overviewView.w*.72);
    const height=width/aspect();
    return {x:point[0]-width*.43,y:point[1]-height*.49,w:width,h:height};
  }
  function limitView(box) {
    const maxWidth=650;const minWidth=140;
    const ratio=box.w/box.h;
    const width=Math.max(minWidth,Math.min(maxWidth,box.w));
    const height=width/ratio;
    return {x:Math.min(1070-width,Math.max(-70,box.x)),y:Math.min(750-height,Math.max(-50,box.y)),w:width,h:height};
  }
  function setView(box) {
    view=limitView(box);
    svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);
    updateScale();
  }
  function animateView(target,animate=true) {
    cancelAnimationFrame(animation);
    if(!view||!animate||reducedMotion.matches) {setView(target);return;}
    const initial={...view};const start=performance.now();
    const tick=now=>{
      const progress=Math.min(1,(now-start)/420);
      const eased=1-Math.pow(1-progress,3);
      const next={};Object.keys(initial).forEach(key=>{next[key]=initial[key]+(target[key]-initial[key])*eased;});
      setView(next);
      if(progress<1) animation=requestAnimationFrame(tick);
    };
    animation=requestAnimationFrame(tick);
  }
  function updateScale() {
    if(!view||!inverseProjection) return;
    const latitude=inverseProjection([view.x+view.w/2,view.y+view.h/2])[1];
    const metersPerPixel=111320*Math.cos(latitude*Math.PI/180)*(view.w/projectionScale)/Math.max(1,$('map-canvas').clientWidth);
    const kmTarget=80*metersPerPixel/1000;
    const options=[10,20,50,100,200,500,1000];
    const kilometers=options.filter(value=>value<=kmTarget).at(-1)||10;
    $('scale-label').textContent=`约 ${kilometers} 公里`;
    $('scale-bar').style.width=`${kilometers*1000/metersPerPixel}px`;
  }

  function drawMap() {
    makeProjection(mapData.projection);
    const firstSnapshot=mapData.snapshots[mapData.places[0].snapshot];
    const realmFragment=document.createDocumentFragment();
    [...firstSnapshot.features].sort((a,b)=>(a.role==='main'?1:0)-(b.role==='main'?1:0)).forEach(feature=> {
      const path=makeSvg('path',{d:pathForShape(feature.geometry),class:`realm${feature.role==='main'?' is-main':''}`,'fill-rule':'evenodd'});
      const title=makeSvg('title',{},feature.title+' · 历史疆域示意');path.append(title);realmFragment.append(path);
    });
    $('realm-layer').replaceChildren(realmFragment);
    const rivers=document.createDocumentFragment();
    mapData.rivers.forEach(river=>river.lines.forEach(line=>{
      const d=line.map((coordinate,index)=>{const p=projection(coordinate);return `${index?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`;}).join('');
      rivers.append(makeSvg('path',{d,class:'river'}));
    }));
    $('river-layer').replaceChildren(rivers);
    const labels=[
      {text:'成都',coord:[104.07,30.67]}, {text:'长沙',coord:[112.98,28.2]},
      {text:'杭州',coord:[120.15,30.28]}, {text:'广州',coord:[113.27,23.13]},
      {text:'雷州',coord:[110.1,20.91]}, {text:'琼州',coord:[110.34,20.03]},
      {text:'长 江',coord:[116.4,29.7],class:'river-label'},
      {text:'赣 江',coord:[115.6,26.5],class:'river-label'},
      {text:'珠 江',coord:[111.55,23.25],class:'river-label'},
      {text:'南 海',coord:[116.9,19.7],class:'sea-label'},
      {text:'北 宋',coord:[110.2,28.8],class:'realm-label'},
    ];
    const labelFragment=document.createDocumentFragment();
    labels.forEach(label=>{const [x,y]=projection(label.coord);labelFragment.append(makeSvg('text',{x,y,class:`context-label ${label.class||''}`},label.text));});
    $('context-labels').replaceChildren(labelFragment);
    const routes=document.createDocumentFragment();
    for(let i=0;i<stops.length-1;i++) {
      const p=projection(stops[i].coord);const q=projection(stops[i+1].coord);
      const bend=i===0?-18:8;
      const d=`M${p[0]},${p[1]}Q${(p[0]+q[0])/2+bend},${(p[1]+q[1])/2} ${q[0]},${q[1]}`;
      routes.append(makeSvg('path',{d,class:'route-underlay'}));
      routes.append(makeSvg('path',{d,class:'route-segment','data-leg':i}));
    }
    $('route-layer').replaceChildren(routes);
    const markers=document.createDocumentFragment();
    stops.forEach((stop,index)=>{
      const point=projection(stop.coord);
      const group=makeSvg('g',{transform:`translate(${point[0]},${point[1]})`,class:'map-place','data-stop':stop.id,role:'button',tabindex:'0','aria-label':`前往${stop.name}，${stop.year}年`,'aria-pressed':'false'});
      group.append(makeSvg('circle',{r:11,class:'place-hit'}),makeSvg('circle',{r:6.8,class:'place-pulse'}),makeSvg('circle',{r:4.2,class:'place-halo'}),makeSvg('circle',{r:1.9,class:'place-center'}));
      group.append(makeSvg('text',{x:9,y:-1,class:'place-name'},stop.name),makeSvg('text',{x:9,y:6.1,class:'place-year'},String(stop.year)));
      group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectStop(index,{scrollStory:true});}});
      markers.append(group);
    });
    $('place-layer').replaceChildren(markers);
    overviewView=overviewBounds();
    renderMapSelection(false);
    $('map-loading').hidden=true;
    svg.dataset.ready='true';
  }

  function updateSources() {
    const fragment=document.createDocumentFragment();
    stops.forEach(stop=>{
      const section=document.createElement('section');const heading=document.createElement('h4');heading.textContent=`${stop.name} · ${stop.period}`;
      const list=document.createElement('ul');stop.sources.forEach(source=>{const item=document.createElement('li');item.append(externalLink(source));list.append(item);});
      section.append(heading,list);fragment.append(section);
    });
    $('all-sources').replaceChildren(fragment);
  }

  function renderMapSelection(animate=true) {
    if(!mapData||!overviewView) return;
    document.querySelectorAll('.map-place').forEach(group=>{
      const active=selected>=0&&group.dataset.stop===stops[selected].id;
      group.classList.toggle('is-active',active);group.setAttribute('aria-pressed',String(active));
    });
    document.querySelectorAll('[data-leg]').forEach(path=>path.classList.toggle('is-travelled',Number(path.dataset.leg)<selected));
    svg.dataset.activeStop=selected<0?'overview':stops[selected].id;
    $('map-caption').textContent=selected<0?'北宋 · 南方山河':`北宋 · ${stops[selected].year} 年 · ${stops[selected].name}`;
    animateView(selected<0?overviewView:focusedBounds(selected),animate);
  }

  function renderChapter() {
    document.querySelectorAll('.stop-tab').forEach((button,index)=>{button.classList.toggle('is-active',index===selected);button.setAttribute('aria-pressed',String(index===selected));});
    $('previous-stop').disabled=selected<=0;
    $('next-stop').disabled=selected===stops.length-1;
    $('next-stop').textContent=selected<0?'开始南行 →':selected===stops.length-1?'已至终站':'下一站 →';
    $('chapter-details').open=false;
    if(selected<0) {
      document.title='东坡南行 · 黄州惠州儋州';
      $('view-label').textContent='路线总览 · 3 站';
      $('chapter-index').textContent='序 / 三段人生';$('chapter-modern').textContent='黄州 · 惠州 · 儋州';
      $('chapter-name').textContent='向南而行';$('chapter-seal').textContent='南行';
      $('chapter-year').textContent='1080—1100';$('chapter-era').textContent='三个地方，二十年间的片段';
      $('chapter-eyebrow').textContent='从三个地点，走进一个人的岁月';$('chapter-headline').textContent='山川渐远，文字与人间仍在。';
      $('chapter-body').replaceChildren(paragraph('这不是苏轼的完整年谱，而是一条从黄州、惠州到儋州的阅读主线。沿着地图，看看他在不同处境里如何生活、如何写作。'),paragraph('点击地图上的地名，或从下方选择一站。年份、地点、事件与诗文会一起切换。'));
      $('chapter-quote').replaceChildren(document.createTextNode('问汝平生功业，'),document.createElement('br'),document.createTextNode('黄州惠州儋州。'));
      $('chapter-poem').textContent='苏轼 ·《自题金山画像》';$('chapter-poem-date').textContent='晚年回望';
      $('chapter-poem-note').textContent='每站区分抵达年份与诗作年份，帮助你把文字放回当时的经历。';
      $('detail-summary').textContent='读这条路之前';
      $('chapter-context').replaceChildren(paragraph('三站之间的连线表示地点关系，省略了中间的任职与途经地点；它不作为逐日行程或导航路线。'),paragraph('各地点采用城市或古治所附近的约点，疆域轮廓沿用上游的示意表达。'));
      $('interaction-status').textContent='已返回路线总览，可选择黄州、惠州、儋州任意一站。';
      return;
    }
    const stop=stops[selected];
    document.title=`${stop.name} · ${stop.year} 年 — 东坡南行`;
    $('view-label').textContent=`0${selected+1} / ${stop.name} · ${stop.year}`;
    $('chapter-index').textContent=`第 ${['一','二','三'][selected]}站 / 共三站`;
    $('chapter-modern').textContent=stop.modern;$('chapter-name').textContent=stop.name;$('chapter-seal').textContent=stop.number;
    $('chapter-year').textContent=String(stop.year);$('chapter-era').textContent=stop.era;
    $('chapter-eyebrow').textContent=stop.eyebrow;$('chapter-headline').textContent=stop.headline;
    $('chapter-body').replaceChildren(...stop.paragraphs.map(paragraph));
    $('chapter-quote').replaceChildren(document.createTextNode(stop.quote[0]),document.createElement('br'),document.createTextNode(stop.quote[1]));
    $('chapter-poem').textContent=stop.poem;$('chapter-poem-date').textContent=stop.poemDate;$('chapter-poem-note').textContent=stop.poemNote;
    $('detail-summary').textContent='这一站的时间线与资料来源';
    const fragment=document.createDocumentFragment();
    stop.moments.forEach(moment=>{const row=document.createElement('div');row.className='moment';const year=document.createElement('strong');year.textContent=moment[0];const description=document.createElement('span');description.textContent=moment[1];row.append(year,description);fragment.append(row);});
    fragment.append(paragraph(stop.reflection));
    const sources=document.createElement('ul');stop.sources.forEach(source=>{const item=document.createElement('li');item.append(externalLink(source));sources.append(item);});fragment.append(sources);
    $('chapter-context').replaceChildren(fragment);
    $('interaction-status').textContent=`已选择${stop.name}，${stop.year}年。地图位置、年份和事件已同步更新。`;
  }

  function selectStop(index,{historyMode='push',animate=true,scrollStory=false}={}) {
    selected=Math.max(-1,Math.min(stops.length-1,index));
    renderChapter();renderMapSelection(animate);
    if(historyMode!=='none') {
      const url=new URL(window.location.href);url.searchParams.delete('stop');
      if(selected>=0) url.searchParams.set('stop',stops[selected].id);
      if(url.href!==window.location.href) history[historyMode==='replace'?'replaceState':'pushState'](null,'',url);
    }
    if(scrollStory&&window.matchMedia('(max-width: 760px)').matches) {
      requestAnimationFrame(()=>document.querySelector('.story-panel').scrollIntoView({block:'start'}));
    }
  }
  function restoreLocation() {
    const key=new URLSearchParams(window.location.search).get('stop');
    const index=stops.findIndex(stop=>stop.id===key);
    selectStop(index,{historyMode:'none',animate:false});
    if(key&&index<0) toast('未找到这个站点，已展示路线总览。');
  }

  document.addEventListener('click',event=>{
    const stop=event.target.closest?.('[data-stop]');
    if(stop) {const index=stops.findIndex(item=>item.id===stop.dataset.stop);if(index>=0) selectStop(index,{scrollStory:true});}
  });
  document.querySelectorAll('[data-overview]').forEach(button=>button.addEventListener('click',()=>{selectStop(-1);$('journey').scrollIntoView({block:'start'});}));
  $('previous-stop').addEventListener('click',()=>{if(selected>0) selectStop(selected-1,{scrollStory:true});});
  $('next-stop').addEventListener('click',()=>{if(selected<stops.length-1) selectStop(selected+1,{scrollStory:true});});
  $('map-overview').addEventListener('click',()=>{if(overviewView) animateView(overviewView);});
  $('reset-map').addEventListener('click',()=>{if(overviewView) animateView(selected<0?overviewView:focusedBounds(selected));});
  function zoom(factor,anchor) {
    if(!view) return;
    cancelAnimationFrame(animation);
    const width=Math.max(140,Math.min(650,view.w*factor));
    const actual=width/view.w;const point=anchor||{x:view.x+view.w/2,y:view.y+view.h/2};
    animateView({x:point.x-(point.x-view.x)*actual,y:point.y-(point.y-view.y)*actual,w:width,h:view.h*actual},false);
  }
  $('zoom-in').addEventListener('click',()=>zoom(.8));$('zoom-out').addEventListener('click',()=>zoom(1.25));
  svg.addEventListener('wheel',event=>{
    if(!view) return;event.preventDefault();
    const matrix=svg.getScreenCTM();if(!matrix) return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    zoom(event.deltaY>0?1.09:.92,point);
  },{passive:false});
  let drag=null;
  svg.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0||!view||event.target.closest?.('[data-stop]')) return;
    cancelAnimationFrame(animation);
    const matrix=svg.getScreenCTM();
    drag={x:event.clientX,y:event.clientY,view:{...view},scale:matrix?.a||1};
    svg.setPointerCapture(event.pointerId);svg.classList.add('is-dragging');
  });
  svg.addEventListener('pointermove',event=>{if(drag) setView({...drag.view,x:drag.view.x-(event.clientX-drag.x)/drag.scale,y:drag.view.y-(event.clientY-drag.y)/drag.scale});});
  const endDrag=()=>{drag=null;svg.classList.remove('is-dragging');};
  svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
  $('map-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement) await document.exitFullscreen();else await $('map-stage').requestFullscreen();}catch(_){toast('此浏览环境未提供全屏，可用加减按钮调整地图。');}});
  document.addEventListener('fullscreenchange',()=>{$('map-fullscreen').textContent=document.fullscreenElement?'退出全屏 ⤡':'全屏看图 ⤢';});
  const showAbout=()=>{if(!$('about-dialog').open) $('about-dialog').showModal();};
  $('about-button').addEventListener('click',showAbout);$('sources-button').addEventListener('click',showAbout);
  $('close-about').addEventListener('click',()=>$('about-dialog').close());
  $('share').addEventListener('click',()=>{
    $('share-title').textContent=selected<0?'分享路线总览':`分享${stops[selected].name}这一站`;
    $('share-url').value=window.location.href;
    $('share-feedback').textContent='链接已选中，也可以手动复制。';
    $('share-dialog').showModal();$('share-url').focus();$('share-url').select();
  });
  $('close-share').addEventListener('click',()=>$('share-dialog').close());
  $('copy-share').addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText($('share-url').value);$('share-feedback').textContent='链接已复制，可以粘贴保存。';}
    catch(_){$('share-url').focus();$('share-url').select();$('share-feedback').textContent='浏览器未完成自动复制，链接已选中，可手动复制。';}
  });
  window.addEventListener('keydown',event=>{
    if($('about-dialog').open||$('share-dialog').open||event.altKey||event.ctrlKey||event.metaKey||event.target.closest?.('input,textarea,select')) return;
    if(event.key==='ArrowRight'&&selected<stops.length-1){event.preventDefault();selectStop(selected+1);}
    if(event.key==='ArrowLeft'&&selected>0){event.preventDefault();selectStop(selected-1);}
    if(event.key==='Home'){event.preventDefault();selectStop(-1);}
  });
  window.addEventListener('popstate',restoreLocation);
  new ResizeObserver(()=>{
    if(!mapData||!projection) return;
    overviewView=overviewBounds();
    animateView(selected<0?overviewView:focusedBounds(selected),false);
  }).observe($('map-canvas'));
  updateSources();restoreLocation();
  fetch('assets/map-data.json').then(response=>{if(!response.ok) throw new Error('Map data request failed');return response.json();}).then(data=>{mapData=data;drawMap();}).catch(()=>{
    $('map-loading').hidden=false;$('map-loading').textContent='地图暂未载入，请刷新页面；右侧文字与站点仍可阅读。';
    $('view-label').textContent='地图加载未完成';
  });
})();
