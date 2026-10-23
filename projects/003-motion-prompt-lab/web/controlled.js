(() => {
  const $=id=>document.getElementById(id),vs=[$('controlled-x'),$('controlled-y')];
  const get=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r;};
  let busy=false;
  function update(){const f=Math.min(1199,Math.round(vs[0].currentTime*60));$('controlled-seek').value=f;$('controlled-time').value=`${(f/60).toFixed(2)} / 20.00 s`;$('controlled-play').textContent=vs[0].paused?'同步播放':'暂停';}
  function pause(){vs.forEach(v=>v.pause());update();$('controlled-play-status').textContent='已暂停；拖动滑块可将两片定位到同一帧。';}
  function seek(frame){pause();vs.forEach(v=>{if(v.readyState>0)v.currentTime=frame/60;});$('controlled-seek').value=frame;$('controlled-time').value=`${(frame/60).toFixed(2)} / 20.00 s`;}
  async function play(){if(busy)return;busy=true;document.querySelectorAll('video,audio').forEach(v=>{if(!vs.includes(v))v.pause();});try{if(vs[0].ended||vs[0].currentTime>19.97)seek(0);vs[1].currentTime=vs[0].currentTime;await Promise.all(vs.map(v=>v.play()));$('controlled-play-status').textContent='正在近似同步播放；拖动滑块可暂停定位。';}catch{pause();$('controlled-play-status').textContent='播放未成功，请使用原生控制或下载影片查看。';}finally{busy=false;update();}}
  $('controlled-play').addEventListener('click',()=>vs[0].paused?play():pause());
  $('controlled-restart').addEventListener('click',()=>{seek(0);play();});
  $('controlled-seek').addEventListener('input',e=>seek(Number(e.target.value)));
  $('controlled-audio').addEventListener('change',e=>vs.forEach((v,i)=>v.muted=e.target.value!==['X','Y'][i]));
  vs[0].addEventListener('timeupdate',()=>{update();if(!vs[0].paused&&!vs[1].seeking&&Math.abs(vs[0].currentTime-vs[1].currentTime)>.1)vs[1].currentTime=vs[0].currentTime;});
  vs.forEach(v=>{v.addEventListener('ended',pause);v.addEventListener('play',()=>document.querySelectorAll('video,audio').forEach(o=>{if(!vs.includes(o))o.pause();}));});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  get('files/controlled/requirements-full-input.md').then(r=>r.text()).then(input=>{$('controlled-input').textContent=input;$('controlled-copy').disabled=false;}).catch(()=>$('controlled-input').textContent='读取失败，请使用上述文件链接。');
  $('controlled-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('controlled-input').textContent);$('controlled-copy-status').textContent='已复制本组完整输入';}catch{$('controlled-copy-status').textContent='可选中文本或下载文件';}});
  get('files/controlled/results.json').then(r=>r.json()).then(data=>{
    $('controlled-status').textContent=data.status_text;
    if(!data.candidates)return;
    $('controlled-player-area').hidden=false;
    ['X','Y'].forEach((label,i)=>{const item=data.candidates[label];vs[i].src=item.video;vs[i].poster=item.poster;$('controlled-download-'+label.toLowerCase()).href=item.video;});
    if(data.status!=='complete'){$('controlled-reveal').disabled=true;$('controlled-reveal').textContent='盲评进行中，评分封存后再揭晓';return;}
    $('controlled-verdict-title').textContent=data.conclusion.title;$('controlled-verdict-body').textContent=data.conclusion.body;
    for(const row of data.rows){const tr=document.createElement('tr');row.forEach((text,i)=>{const el=document.createElement(i?'td':'th');if(!i)el.scope='row';el.textContent=String(text);tr.append(el);});$('controlled-metrics').append(tr);}
    for(const judge of data.judges){const article=document.createElement('article'),h=document.createElement('h4'),p=document.createElement('p'),a=document.createElement('a');h.textContent=judge.title;p.textContent=judge.summary;a.href=judge.href;a.textContent='查看匿名原始评审与时间点';article.append(h,p,a);$('controlled-judge-cards').append(article);}
    data.analysis.forEach(text=>{const p=document.createElement('p');p.textContent=text;$('controlled-analysis').append(p);});$('controlled-overhead').textContent=data.overhead;
    data.links.forEach(item=>{const a=document.createElement('a');a.href=item.href;a.textContent=item.label;$('controlled-result-links').append(a);});
    $('controlled-reveal').addEventListener('click',()=>{const show=$('controlled-results').hidden;$('controlled-results').hidden=!show;$('controlled-reveal').setAttribute('aria-expanded',String(show));$('controlled-reveal').textContent=show?'收起组别与结果 ↑':'揭晓条件、盲评分与耗时 ↓';});
  }).catch(()=>$('controlled-status').textContent='实验记录暂时无法读取，请查看协议文件或刷新页面。');
})();
