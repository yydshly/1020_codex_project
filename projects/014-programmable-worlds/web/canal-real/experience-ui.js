let mounted=null;

export function mountExperience({experience,api}){
  if(!['window','story'].includes(experience))return {dispose(){},refresh(){return api?.getState?.();}};
  mounted?.dispose();
  const $=id=>document.getElementById(id),story=experience==='story';
  const controls=$('scene-controls'),pause=$('pause'),reset=$('reset'),choice=$('choice');
  const timeline=$('experience-timeline'),progress=$('experience-progress'),clock=$('experience-clock'),notice=$('experience-notice');
  const shotButtons=[...document.querySelectorAll('[data-shot]')],choiceButtons=[...document.querySelectorAll('[data-choice]')];
  const removals=[];let disposed=false,raf=0,lastRefresh=0;
  for(const method of ['getState','setShot','choose',...(story?['startTour','pauseTour','restartTour']:['pause'])])if(typeof api?.[method]!=='function')throw new Error('Experience API is missing '+method);
  document.body.dataset.experience=experience;
  document.title=story?'雨巷来信 · 雨后运河':'一扇窗外的世界 · 雨后运河';
 $('experience-label').textContent=story?'老街来信 · 与窗景共用场景':'老街窗景 / AFTER THE RAIN';
  controls.setAttribute('aria-label',story?'雨巷来信旅程':'窗边观察');
  $('experience-hint').textContent=story?'25 秒沿河旅程 · 随时暂停，停下来看看':'拖动观察 · 滚轮走近 · WASD 移动';
  timeline.hidden=!story;notice.hidden=true;choice.hidden=true;
  for(const button of shotButtons)button.hidden=story||button.dataset.shot==='story';
  reset.textContent=story?'重新开始':'回到窗边';
  $('choice-prompt').textContent='这封信，要去哪里？';
  function listen(element,event,handler){element.addEventListener(event,handler);removals.push(()=>element.removeEventListener(event,handler));}
  function failed(error){if(disposed)return;notice.textContent='这次操作没有完成，请再试一次。';notice.hidden=false;console.error('Experience action failed:',error);}
  function perform(action){
    if(disposed||!api.getState().ready)return;
    notice.hidden=true;
    try{const outcome=action();if(outcome&&typeof outcome.then==='function')outcome.then(()=>refresh()).catch(failed);else refresh();}catch(error){failed(error);}
  }
  if(story){
    listen(pause,'click',()=>perform(()=>{const s=api.getState(),tour=s.tour||{};if(tour.ended||s.choice)return api.restartTour();if(tour.playing)return api.pauseTour(true);if(Number(tour.elapsed)>0)return api.pauseTour(false);return api.startTour();}));
    listen(reset,'click',()=>perform(()=>api.restartTour()));
    for(const button of choiceButtons)listen(button,'click',()=>perform(()=>{const s=api.getState();if(s.tour?.ended&&!s.choice)return api.choose(button.dataset.choice);}));
  }else{
    for(const button of shotButtons)if(button.dataset.shot!=='story')listen(button,'click',()=>perform(()=>api.setShot(button.dataset.shot)));
    listen(pause,'click',()=>perform(()=>api.pause(!api.getState().paused)));
    listen(reset,'click',()=>perform(()=>api.setShot('window')));
  }
  function refresh(){
    if(disposed)return null;
    const state=api.getState();if(state.disposed){dispose();return state;}
    const reading=story&&state.choice==='read'&&!!state.dynamic?.paperVisible;
    document.body.classList.toggle('reading-letter',reading);
    timeline.hidden=!story||reading;pause.hidden=reading;
    const ready=!!state.ready;
    for(const button of [...shotButtons,pause,reset])button.disabled=!ready;
    if(story){
      const tour=state.tour||{},duration=Number.isFinite(tour.duration)&&tour.duration>0?tour.duration:25;
      const elapsed=Math.max(0,Math.min(duration,Number(tour.elapsed)||0));
      progress.max=duration;progress.value=elapsed;
      const format=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
      clock.textContent=`${format(elapsed)} / ${format(duration)}`;
      $('experience-stage').textContent=state.choice?'故事会继续。':tour.ended?'信，停在你面前。':tour.playing?'沿河，去遇见一封信。':elapsed>0?'停一会儿，再继续。':'沿河，去遇见一封信。';
      pause.textContent=tour.ended||state.choice?'再走一遍':tour.playing?'暂停旅程':elapsed>0?'继续旅程':'开始旅程';
      pause.setAttribute('aria-pressed',String(!!tour.playing));
      choice.hidden=!(ready&&tour.ended&&!state.choice);
      for(const button of choiceButtons)button.disabled=choice.hidden;
    }else{
      pause.textContent=state.paused?'继续水流':'暂停水流';pause.setAttribute('aria-pressed',String(!!state.paused));
      for(const button of shotButtons)button.setAttribute('aria-pressed',String(button.dataset.shot===state.view));
      choice.hidden=true;
    }
    return state;
  }
  function tick(now){if(disposed)return;if(now-lastRefresh>=100){lastRefresh=now;refresh();}if(!disposed)raf=requestAnimationFrame(tick);}
  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);document.body.classList.remove('reading-letter');for(const remove of removals)remove();if(mounted===handle)mounted=null;}
  const handle={refresh,dispose};mounted=handle;refresh();if(!disposed)raf=requestAnimationFrame(tick);return handle;
}
