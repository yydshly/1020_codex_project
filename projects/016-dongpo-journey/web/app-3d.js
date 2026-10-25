// SPDX-License-Identifier: GPL-3.0-only
import {createExperience} from './scenes.js';
const $=id=>document.getElementById(id);
const stops=window.DONGPO_STORY.stops;
const chapters={
 huangzhou:{kicker:'第一章 / 黄州 · 1080',title:'大江东去，<br>风雨成诗<span>。</span>',intro:'把一叶扁舟，放回赤壁的山水之间。',credit:'《定风波》 · 1082 年',kind:'黄州江岸 · 诗文意象场景'},
 huizhou:{kicker:'第二章 / 惠州 · 1094',title:'一桥烟水，<br>半城荔枝<span>。</span>',intro:'越过岭南山川，在湖光与果香里安顿。',credit:'《食荔枝》 · 惠州时期',kind:'惠州湖桥 · 诗文意象场景'},
 danzhou:{kicker:'第三章 / 儋州 · 1097',title:'身在天涯，<br>心向人间<span>。</span>',intro:'听椰影里的海风，看书院前的一程归帆。',credit:'《六月二十日夜渡海》 · 1100 年',kind:'儋州书院 · 诗文意象场景'},
 overview:{kicker:'山河总览 / 1080—1100',title:'二十年间，<br>一路向南<span>。</span>',intro:'从长江到岭南，再越海抵海南。旋转山河，点击地名走进一站。',credit:'《自题金山画像》 · 晚年回望',kind:'Mapzen 高程数据 · 地形垂直比例夸张'}
};
let engine,active='huangzhou',tour=false,night=false,rotating=false,tourTimer,transitionTimer,toastTimer;
function notify(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function updateChapter(id){
 const chapter=chapters[id],stop=stops.find(s=>s.id===id);
 $('chapter-kicker').textContent=chapter.kicker;$('scene-title').innerHTML=chapter.title;$('scene-intro').textContent=chapter.intro;$('scene-type').textContent=chapter.kind;$('poem-credit').textContent=chapter.credit;
 $('scene-quote').replaceChildren(...(stop?stop.quote:['问汝平生功业，','黄州惠州儋州。']).flatMap((line,index)=>index?[document.createElement('br'),document.createTextNode(line)]:[document.createTextNode(line)]));
 const index=stops.findIndex(s=>s.id===id);$('next').innerHTML=(id==='overview'?'走进黄州':index===2?'回望山河':`前往${stops[index+1].name}`)+' <span>→</span>';
 $('read').textContent=id==='overview'?'了解这条路 ↗':'读这一章 ↗';
 document.querySelectorAll('.station[data-scene]').forEach(button=>{const selected=button.dataset.scene===id;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
 $('overview').classList.toggle('active',id==='overview');
 const fragment=document.createDocumentFragment();engine.getLandmarks(id).forEach((point,index)=>{const button=document.createElement('button');button.textContent=point.name;button.addEventListener('click',()=>{stopTour();engine.focus(index);notify(`镜头已移向${point.name}，可以继续拖动探索。`);});fragment.append(button);});$('landmark-buttons').replaceChildren(fragment);document.querySelector('.landmarks').hidden=id==='overview';
 $('scene-state').textContent=id==='overview'?'立体山河 · 实时可探索':`${stop.name} · 实时三维场景`;
 $('announcement').textContent=`已进入${id==='overview'?'山河总览':stop.name+'，'+stop.year+'年'}。可拖动旋转、缩放并选择场景细节。`;
 document.title=id==='overview'?'山河总览 · 东坡南行 3D':`${stop.name} · ${stop.year} — 东坡南行 3D`;
 document.body.dataset.scene=id;
}
function setScene(id,{historyMode='push',animate=true}={}){
 if(!chapters[id]||!engine)return;active=id;clearTimeout(transitionTimer);
 const apply=()=>{engine.setScene(id,animate);updateChapter(id);$('transition').classList.remove('active');};
 if(animate&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){$('transition-title').textContent=id==='overview'?'山河':stops.find(s=>s.id===id).name;$('transition').classList.add('active');transitionTimer=setTimeout(apply,260);}else apply();
 if(historyMode!=='none'){const url=new URL(location.href);url.searchParams.delete('stop');url.searchParams.delete('view');if(id==='overview')url.searchParams.set('view','overview');else url.searchParams.set('stop',id);if(url.href!==location.href)history[historyMode==='replace'?'replaceState':'pushState'](null,'',url);}
}
function restore(){const query=new URLSearchParams(location.search);const id=query.get('view')==='overview'?'overview':query.get('stop')||'huangzhou';setScene(chapters[id]?id:'huangzhou',{historyMode:'none',animate:false});if(!chapters[id])notify('未找到这个站点，已进入黄州。');}
function stopTour(){tour=false;clearInterval(tourTimer);$('tour').setAttribute('aria-pressed','false');$('tour-label').textContent='开启巡游';if(engine){rotating=false;engine.setAutoRotate(false);$('rotate').setAttribute('aria-pressed','false');$('rotate').setAttribute('aria-label','开启自动环绕');}}
function toggleTour(){if(tour){stopTour();notify('巡游已暂停，可以自由探索。');return;}tour=true;$('tour').setAttribute('aria-pressed','true');$('tour-label').textContent='暂停巡游';rotating=true;engine.setAutoRotate(true);$('rotate').setAttribute('aria-pressed','true');$('rotate').setAttribute('aria-label','关闭自动环绕');if(active==='overview')setScene('huangzhou');notify('巡游已开启：黄州 → 惠州 → 儋州，每章停留 16 秒。');tourTimer=setInterval(()=>{const index=stops.findIndex(s=>s.id===active);setScene(stops[(index+1)%3].id);},16000);}
function openReading(){
 if(active==='overview'){$('help-dialog').showModal();return;}
 const stop=stops.find(s=>s.id===active);$('reading-kicker').textContent=`${stop.name} / ${stop.period} / ${stop.modern}`;$('reading-title').textContent=stop.headline;
 const fragment=document.createDocumentFragment();stop.paragraphs.forEach(text=>{const p=document.createElement('p');p.textContent=text;fragment.append(p);});
 const quote=document.createElement('blockquote');quote.className='reading-poem';stop.quote.forEach((line,index)=>{if(index)quote.append(document.createElement('br'));quote.append(document.createTextNode(line));});fragment.append(quote);
 const note=document.createElement('p');note.textContent=stop.poem+' · '+stop.poemDate+'。'+stop.poemNote;fragment.append(note);
 const title=document.createElement('h3');title.textContent='时间与资料';fragment.append(title);const list=document.createElement('ul');stop.sources.forEach(source=>{const li=document.createElement('li');const a=document.createElement('a');a.href=source.url;a.textContent=source.label;a.target='_blank';a.rel='noopener noreferrer';li.append(a);list.append(li);});fragment.append(list);$('reading-body').replaceChildren(fragment);$('reading-dialog').showModal();
}
try{
 engine=await createExperience($('world'),{onMapSelect:id=>{stopTour();setScene(id);},onFrame:({fps,triangles,calls})=>{$('render-stats').textContent=`实时 3D · ${fps} FPS`;$('render-stats').title=`${triangles.toLocaleString()} 个三角面 / ${calls} 次绘制`;$('experience').dataset.triangles=String(triangles);$('experience').dataset.drawCalls=String(calls);}});
 restore();$('loading').classList.add('gone');$('loading').setAttribute('aria-hidden','true');setTimeout(()=>$('loading').hidden=true,800);
 document.querySelectorAll('.station[data-scene]').forEach(button=>button.addEventListener('click',()=>{stopTour();setScene(button.dataset.scene);}));
 $('overview').addEventListener('click',()=>{stopTour();setScene('overview');});
 $('next').addEventListener('click',()=>{stopTour();const index=stops.findIndex(s=>s.id===active);setScene(active==='overview'?'huangzhou':index===2?'overview':stops[index+1].id);});
 $('tour').addEventListener('click',toggleTour);$('read').addEventListener('click',openReading);$('help').addEventListener('click',()=>$('help-dialog').showModal());
 $('reset').addEventListener('click',()=>{stopTour();engine.reset();});$('aerial').addEventListener('click',()=>{stopTour();engine.aerial();});
 $('rotate').addEventListener('click',()=>{if(tour)stopTour();rotating=!rotating;engine.setAutoRotate(rotating);$('rotate').setAttribute('aria-pressed',String(rotating));$('rotate').setAttribute('aria-label',rotating?'关闭自动环绕':'开启自动环绕');});
 $('light').addEventListener('click',()=>{night=!night;engine.setNight(night);document.body.classList.toggle('night',night);$('light').textContent=night?'☽':'☼';$('light').setAttribute('aria-label',night?'切换至晨光':'切换至暮色');});
 $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('experience').requestFullscreen();}catch{notify('当前浏览环境未提供全屏，可直接拖动和缩放探索。');}});
 document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏体验');});
 window.addEventListener('popstate',()=>{stopTour();restore();});
 window.addEventListener('keydown',event=>{if(event.altKey||event.metaKey||event.ctrlKey||document.querySelector('dialog[open]')||event.target.closest('input,textarea'))return;const index=stops.findIndex(s=>s.id===active);if(event.key==='ArrowRight'){event.preventDefault();stopTour();setScene(stops[(index+1)%3].id);}if(event.key==='ArrowLeft'){event.preventDefault();stopTour();setScene(stops[(index+2)%3].id);}if(event.key==='Home'){event.preventDefault();stopTour();setScene('overview');}if(event.key.toLowerCase()==='r')engine.reset();});
}catch(error){console.error(error);$('loading-message').textContent='三维场景未能启动：'+error.message+'。请使用支持 WebGL 2 的浏览器并刷新重试。';$('scene-state').textContent='三维场景未启动';}
 document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
