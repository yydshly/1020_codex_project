export function mountStationExperience({api}){
 const $=id=>document.getElementById(id),buttons=[...document.querySelectorAll('[data-shot]')],removals=[];
 let disposed=false,raf=0,lastTick=0;
 const title=$('scene-title'),description=$('scene-description'),label=$('phase-label'),clock=$('journey-clock'),progress=$('journey-progress'),decision=$('decision'),notice=$('notice');
 const copy={
  idle:['旧船坞的下一班船','修船架还在岸边。你可以等一会儿，也可以呼来下一班客船。'],
  approaching:['水上有一班船，向你靠近。','信号灯已经回应。客船正转向站台。'],
  docked:['船靠岸了。','栈桥放下以后，你可以上船，也可以留在这里目送。'],
  boarding:['沿着栈桥，走上这班船。','木甲板在脚下轻轻起伏。船坞会慢慢退到身后。'],
  departing:['这一班，正在离站。',''],
  complete:['旧船坞，还会等下一班。','']
 };
 function listen(element,event,handler){element.addEventListener(event,handler);removals.push(()=>element.removeEventListener(event,handler));}
 function action(fn){if(disposed||!api.getState().ready)return;notice.hidden=true;try{const value=fn();if(value?.then)value.then(refresh).catch(failed);else refresh();}catch(error){failed(error);}}
 function failed(error){notice.textContent=typeof error?.message==='string'?error.message:'这次操作没有完成，请重试。';notice.hidden=false;console.error('Station interaction:',error);}
 for(const button of buttons)listen(button,'click',()=>action(()=>api.setShot(button.dataset.shot)));
 listen($('callBoat'),'click',()=>action(()=>api.callBoat()));
 listen($('pause'),'click',()=>action(()=>{const s=api.getState(),j=s.journey||{};return api.pause(!j.paused);}));
 listen($('reset'),'click',()=>action(()=>api.reset()));
 const fullscreen=$('fullscreen');
 if(fullscreen){listen(fullscreen,'click',()=>action(async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}));listen(document,'fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'退出全屏 ↙':'全屏 ↗';fullscreen.setAttribute('aria-pressed',String(!!document.fullscreenElement));});}
 listen($('board'),'click',()=>action(()=>api.choose('board')));listen($('stay'),'click',()=>action(()=>api.choose('stay')));
 function format(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
 function refresh(){
  if(disposed)return;const s=api.getState(),j=s.journey||{},ready=!!s.ready&&!s.disposed,phase=j.phase||'idle',text=copy[phase]||copy.idle;
  document.body.dataset.phase=phase;title.textContent=text[0];description.textContent=text[1];
  if(phase==='idle'&&j.history?.lastChoice)description.textContent=j.history.lastChoice==='board'?'上次，你搭船离开了。今天，还想再去看看吗？':'上次，你留在站台目送。今天，要不要上船？';
  if(phase==='departing'){title.textContent=j.choice==='board'?'这次，你在船上。':'这次，你留在站台。';description.textContent=j.choice==='board'?'站台、旧厂房与修船架，慢慢成为身后的风景。':'客船驶向河道深处。选择留下，也是一段完整的旅程。';}
  if(phase==='complete'){title.textContent=j.choice==='board'?'下一站，风景会继续。':'船离开了，旧船坞还在。';description.textContent='你可以重新开始，下次换一种选择。';}
  label.textContent={idle:'01 / 等一班船',approaching:'02 / 呼船',docked:'03 / 靠泊',boarding:'04 / 上船',departing:'05 / 离站',complete:'06 / 下次见'}[phase]||'北船坞';
  clock.textContent=j.duration?format(j.elapsed)+' / '+format(j.duration):phase==='docked'?'已靠泊':phase==='complete'?'本次旅程完成':'等候中';
  progress.value=Number(j.progress)||0;progress.hidden=!j.duration;
  for(const button of buttons){button.disabled=!ready||!!j.cameraLocked||!!j.cameraFollow;button.setAttribute('aria-pressed',String((s.view||s.shot)===button.dataset.shot));}
  $('callBoat').hidden=!['idle','complete'].includes(phase);$('callBoat').disabled=!ready;$('callBoat').textContent=phase==='complete'?'再呼一班':'呼来客船';
  $('pause').disabled=!ready;$('pause').textContent=j.paused?'继续':'暂停';$('pause').setAttribute('aria-pressed',String(!!j.paused));$('reset').disabled=!ready;
  decision.hidden=!(ready&&phase==='docked');$('board').disabled=$('stay').disabled=!j.canChoose;$('decision-prompt').textContent=j.canChoose?'这一班，你上船吗？':'栈桥正在放下，请稍候。';
  $('interaction-hint').textContent=j.cameraLocked?'正在经过实际栈桥…':j.cameraFollow?'拖动看看沿途 · 暂停可以停一会儿':'拖动观察 · WASD 移动 · 可切换船坞、站台与候船厅';
 }
 function tick(now){if(disposed)return;if(now-lastTick>100){lastTick=now;refresh();}raf=requestAnimationFrame(tick);}
 function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);for(const remove of removals)remove();}
 refresh();raf=requestAnimationFrame(tick);return {refresh,dispose};
}
