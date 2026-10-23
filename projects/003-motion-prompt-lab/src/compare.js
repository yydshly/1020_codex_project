const v1=document.querySelector('#compare-v1'),v2=document.querySelector('#compare-v2');
const pair=[v1,v2],play=document.querySelector('#compare-play'),seek=document.querySelector('#compare-seek');
const state=document.querySelector('#compare-status'),clock=document.querySelector('#compare-time');
let loading=false,dragging=false;
function paintTime(){
  const frame=Math.min(1199,Math.round(v2.currentTime*60));
  if(!dragging)seek.value=frame;
  clock.value=`${v2.currentTime.toFixed(2)} / 20.00 s · 第 ${frame+1} 帧`;
  play.textContent=v2.paused?'同步播放':'暂停两版';
}
function pausePair(){pair.forEach(v=>v.pause());paintTime();}
function locate(frame){
  pausePair();
  const t=Math.max(0,Math.min(1199,Number(frame)))/60;
  pair.forEach(v=>{v.currentTime=t;});
  seek.value=Math.round(t*60);paintTime();
}
async function startPair(){
  if(loading)return;
  loading=true;state.textContent='正在准备两版视频…';
  document.querySelectorAll('video,audio').forEach(m=>{if(!pair.includes(m))m.pause();});
  try{
    if(v2.ended||v2.currentTime>=19.98)locate(0);
    v1.currentTime=v2.currentTime;
    await Promise.all(pair.map(v=>v.play()));
    state.textContent='播放时近似同步；拖动时间轴可将两版定位到同一帧。';
  }catch{
    pausePair();state.textContent='暂时无法同步播放，请重试或下载影片查看。';
  }finally{loading=false;paintTime();}
}
play.addEventListener('click',()=>v2.paused?startPair():pausePair());
document.querySelector('#compare-restart').addEventListener('click',()=>{locate(0);startPair();});
document.querySelector('#compare-mute').addEventListener('click',e=>{
  v2.muted=!v2.muted;e.currentTarget.textContent=v2.muted?'开启 V2 声音':'关闭 V2 声音';
  e.currentTarget.setAttribute('aria-pressed',String(!v2.muted));
});
document.querySelector('#compare-focus').addEventListener('click',e=>{
  const active=document.querySelector('#comparison').classList.toggle('focus-v2');
  e.currentTarget.textContent=active?'恢复并排对比':'放大查看 V2';
  e.currentTarget.setAttribute('aria-pressed',String(active));
});
seek.addEventListener('input',()=>{dragging=true;locate(seek.value);});
seek.addEventListener('change',()=>{dragging=false;paintTime();});
document.querySelectorAll('[data-frame-v2]').forEach(b=>b.addEventListener('click',()=>locate(b.dataset.frameV2)));
pair.forEach(v=>v.addEventListener('ended',pausePair));
v2.addEventListener('timeupdate',paintTime);
document.querySelectorAll('video,audio').forEach(m=>{
  if(!pair.includes(m))m.addEventListener('play',pausePair);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePair();});
function follow(){
  if(!v2.paused&&!v1.seeking&&Math.abs(v1.currentTime-v2.currentTime)>.09)v1.currentTime=v2.currentTime;
  requestAnimationFrame(follow);
}
follow();paintTime();
document.querySelectorAll('a[href="#compare"]').forEach(a=>a.addEventListener('click',()=>pausePair()));

fetch('files/v2-execution-prompt.md').then(r=>{
  if(!r.ok)throw new Error(r.status);return r.text();
}).then(t=>{
  document.querySelector('#complete-prompt').textContent=t;
  document.querySelector('#copy-complete-prompt').disabled=false;
}).catch(()=>{document.querySelector('#complete-prompt').textContent='暂时无法载入全文，请使用下方下载链接。';});
document.querySelector('#copy-complete-prompt').addEventListener('click',async()=>{
  const out=document.querySelector('#complete-copy-status');
  try{await navigator.clipboard.writeText(document.querySelector('#complete-prompt').textContent);out.textContent='完整执行提示词已复制。';}
  catch{out.textContent='当前环境不允许复制，请选中全文复制，或下载 Markdown。';}
});
Promise.all(['verification.json','v2-verification.json'].map(f=>fetch(`files/${f}`).then(r=>{
  if(!r.ok)throw new Error(r.status);return r.json();
}))).then(([a,b])=>{
  const rows=[
    ['画面生成','Canvas 2D / 五个镜头','SVG 路径 / 八个构图段'],
    ['跨场方式','四次重复的整屏遮罩','轮廓、选中行、图与文件连续交接'],
    ['时长 / 帧率',`${a.video.duration} s / ${a.video.fps} fps`,`${b.video.duration} s / ${b.video.fps} fps`],
    ['全画面低运动',`${a.freeze.low_motion_seconds} s`,`${b.freeze.low_motion_seconds} s`],
    ['V2 主体区域低运动','V1 未测同一裁切',`${b.core_freeze.low_motion_seconds} s`],
    ['最终响度',`${a.audio.integrated_lufs} LUFS`,`${b.audio.integrated_lufs} LUFS`],
    ['最终真峰值',`${a.audio.true_peak_dbtp} dBTP`,`${b.audio.true_peak_dbtp} dBTP`],
    ['运动模糊','无多时间样本','普通 3 / 高速 7 样本，半帧快门']
  ];
  const table=document.querySelector('#compare-metrics');
  table.replaceChildren();
  rows.forEach(row=>{
    const tr=document.createElement('tr');
    row.forEach((value,i)=>{const td=document.createElement(i?'td':'th');td.textContent=value;if(!i)td.scope='row';tr.append(td);});
    table.append(tr);
  });
}).catch(()=>{document.querySelector('#compare-metrics').innerHTML='<tr><td colspan="3">暂时无法读取测量记录，请下载技术报告。</td></tr>';});
