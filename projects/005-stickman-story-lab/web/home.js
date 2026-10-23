const player=document.querySelector('#story-player');
const button=document.querySelector('#play-story');
const status=document.querySelector('#play-status');
async function playAt(time){
  try{
    if(player.error) player.load();
    if(player.readyState===0) await new Promise((resolve,reject)=>{
      player.addEventListener('loadedmetadata',resolve,{once:true});
      player.addEventListener('error',reject,{once:true});
    });
    if(Number.isFinite(time)) player.currentTime=time;
    await player.play();
  }catch(error){if(error.name!=='AbortError')status.textContent='暂时无法播放，请使用下载链接获取完整成片。';}
}
button.addEventListener('click',()=>{if(player.paused) playAt(player.ended?0:undefined);else player.pause();});
player.addEventListener('play',()=>{button.textContent='Ⅱ 暂停播放';status.textContent='正在播放 · 中文配音与中文字幕';});
player.addEventListener('pause',()=>{button.textContent=player.ended?'↻ 重播完整故事':'▶ 继续播放';if(!player.ended)status.textContent='已暂停 · 可继续播放或选择下方镜头';});
player.addEventListener('ended',()=>{button.textContent='↻ 重播完整故事';status.textContent='空着的位置，终于有人坐下。';});
player.addEventListener('error',()=>{status.textContent='视频暂时无法加载，请通过下载链接观看。';});
const shots=[...document.querySelectorAll('[data-shot]')];
shots.forEach(shot=>shot.addEventListener('click',()=>{
  playAt(Number(shot.dataset.shot));
  document.querySelector('#showcase').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}));
player.addEventListener('timeupdate',()=>{
  const active=Math.min(5,Math.floor(player.currentTime/5));
  shots.forEach((shot,index)=>{shot.classList.toggle('is-playing',index===active);if(index===active)shot.setAttribute('aria-current','true');else shot.removeAttribute('aria-current');});
});
