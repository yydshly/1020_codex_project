const modules=[
 ['01','角色','目标定位','keep','让 AI 对整部片子的效果负责，而不只交付代码。'],
 ['02','Brief','任务信息','keep','明确主题、受众、品牌、事实、规格与交付目的。'],
 ['03','模式','叙事选择','adapt','作品集、产品、发布故事、讲解，分别选择叙事重心。'],
 ['04','素材','真实性','keep','使用真实产品资产，区分参考、重构和概念内容。'],
 ['05','工艺','创作手法','adapt','围绕视觉连续性、动作节奏和文字可读性组织画面。'],
 ['06','声音','声画关系','adapt','用统一时间轴组织节拍、音乐、音效与对白。'],
 ['07','构建','稳定交付','keep','先跑短样片，固定依赖，按帧渲染，适配画幅。'],
 ['08','流程','阶段产物','keep','经过研究、构思、分镜、风格、声音和合成。'],
 ['09','评审','反馈机制','keep','由独立评审查看产物，定位问题后重新检查。'],
 ['10','质量线','验收标准','adapt','同时检查技术指标、事实与主观表达质量。'],
 ['11','交付','可复查性','keep','交付视频及支撑制作、事实与质检的记录。']
];
const grid=document.querySelector('#module-grid');
function renderModules(filter='all'){
  grid.innerHTML=modules.filter(m=>filter==='all'||m[3]===filter).map(m=>`<article class="module"><div class="module-top"><span>${m[0]} / ${m[1]}</span><span>${m[3]==='keep'?'保留':'调整'}</span></div><h4>${m[2]}</h4><p>${m[4]}</p></article>`).join('');
}
renderModules();
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b);});
  renderModules(b.dataset.filter);
}));
const film=document.querySelector('#film'),music=document.querySelector('#music'),scrub=document.querySelector('#scrub');
const scenes=[
 ['00–04','从收藏到理解','用研究卡片提出主题。'],
 ['04–08','目录里是真实项目','展示 001 与 002 条目。'],
 ['08–12','解释研究的过程','来源 → 原理 → 验证。'],
 ['12–16','让信息有出处','展示真实文件结构。'],
 ['16–20','回到研究集入口','稳定停留，让网址可读。']
];
document.querySelector('#scene-list').innerHTML=scenes.map((s,i)=>`<button class="scene-button${i===0?' active':''}" data-scene="${i}" aria-label="跳到第 ${i+1} 镜：${s[1]}"><span>${s[0]}s</span><div><strong>${s[1]}</strong><small>${s[2]}</small></div></button>`).join('');
function updateTime(){
  scrub.value=film.currentTime;
  document.querySelector('#time-label').textContent=`${film.currentTime.toFixed(1).padStart(4,'0')} / 20.0 s`;
  document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('active',Number(b.dataset.scene)===Math.min(4,Math.floor(film.currentTime/4))));
}
film.addEventListener('timeupdate',updateTime);
scrub.addEventListener('input',()=>{film.pause();film.currentTime=Number(scrub.value);updateTime();});
document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>{film.pause();film.currentTime=Number(b.dataset.scene)*4+.4;updateTime();}));
film.addEventListener('play',()=>music.pause());music.addEventListener('play',()=>film.pause());
const tabs=[...document.querySelectorAll('[data-tab]')];
function activateTab(b){
  tabs.forEach(x=>{const active=x===b;x.setAttribute('aria-selected',active);x.tabIndex=active?0:-1;document.querySelector(`#panel-${x.dataset.tab}`).hidden=!active;});
  if(b.dataset.tab!=='film')film.pause();
  if(b.dataset.tab!=='evidence')music.pause();
}
tabs.forEach((b,i)=>{
  b.addEventListener('click',()=>activateTab(b));
  b.addEventListener('keydown',e=>{
    let next;
    if(e.key==='ArrowRight')next=(i+1)%tabs.length;
    if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;
    if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;
    if(next!==undefined){e.preventDefault();activateTab(tabs[next]);tabs[next].focus();}
  });
});
document.querySelectorAll('.hero-actions .primary[href="#experiment"],.poster-link[href="#experiment"]').forEach(a=>a.addEventListener('click',()=>{
  activateTab(tabs[0]);
  film.currentTime=0;
  film.play().catch(()=>{ /* Native controls remain available if autoplay is restricted. */ });
}));
document.querySelector('#copy-prompt').addEventListener('click',async()=>{
  const status=document.querySelector('#copy-status');
  try{await navigator.clipboard.writeText(document.querySelector('#short-prompt').textContent);status.textContent='已复制';}
  catch{status.textContent='当前环境不允许复制，请选择上方文字手动复制。';}
});
fetch('files/verification.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(v=>{
  const items=[
    [v.video.duration.toFixed(2),'秒','ffprobe 实测时长'],
    [v.video.frames.toLocaleString(),'帧',`${v.video.width} × ${v.video.height} / ${v.video.fps} fps`],
    [String(v.audio.integrated_lufs),'LUFS','最终 MP4 解码响度'],
    [String(v.audio.true_peak_dbtp),'dBTP','最终 MP4 真峰值']
  ];
  document.querySelector('#metric-grid').innerHTML=items.map(x=>`<div class="metric"><strong>${x[0]}</strong><span>${x[1]}</span><p>${x[2]}</p></div>`).join('');
  if(v.freeze.low_motion_seconds!==undefined)document.querySelector('#motion-result').textContent=`FFmpeg 在 −50 dB、持续 0.5 秒阈值下检测到约 ${v.freeze.low_motion_seconds} 秒低运动区间（不等同于完全静帧）。四次重复遮罩未实现内容连续变形。技术输出合格，不代表原提示词的动效质量线已通过。`;
}).catch(()=>{document.querySelector('#metric-grid').innerHTML='<p>测量记录暂时无法读取。请通过本地 HTTP 预览打开，或在「证据与交付」下载技术检查文件。</p>';});
fetch('files/experiment.json').then(r=>r.json()).then(e=>{
  if(e.reviewSummary)document.querySelector('#review-summary').textContent=e.reviewSummary;
}).catch(()=>{});
