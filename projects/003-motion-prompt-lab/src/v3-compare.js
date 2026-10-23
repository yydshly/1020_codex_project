(() => {
  const videos=[1,2,3].map(n=>document.querySelector(`#tri-v${n}`));
  const master=videos[2],play=document.querySelector('#tri-play'),slider=document.querySelector('#tri-seek');
  const status=document.querySelector('#tri-status'),time=document.querySelector('#tri-time'),container=document.querySelector('#triple-comparison');
  let starting=false,focused='all',pendingFrame=null;
  const frameMax=1199,fps=60;
  const displayed=()=>videos.filter((v,i)=>focused==='all'||focused.includes(String(i+1)));
  function update(){
    const frame=Math.min(frameMax,Math.round(master.currentTime*fps));
    slider.value=frame;time.value=`${master.currentTime.toFixed(2)} / 20.00 s · 第 ${frame+1} 帧`;
    play.textContent=master.paused?'同步播放':'暂停';
  }
  function pause(){videos.forEach(v=>v.pause());update();}
  function seek(frame){
    pause();pendingFrame=Math.min(frameMax,Math.max(0,frame));
    videos.forEach(v=>{if(v.readyState>0)v.currentTime=pendingFrame/fps;});
    slider.value=pendingFrame;time.value=`${(pendingFrame/fps).toFixed(2)} / 20.00 s · 第 ${pendingFrame+1} 帧`;
  }
  videos.forEach(v=>v.addEventListener('loadedmetadata',()=>{if(pendingFrame!==null)v.currentTime=pendingFrame/fps;}));
  async function start(){
    if(starting)return;starting=true;status.textContent='正在准备对比视频…';
    document.querySelectorAll('video,audio').forEach(v=>{if(!videos.includes(v))v.pause();});
    try{
      if(master.ended||master.currentTime>=19.98)seek(0);
      videos.slice(0,2).forEach(v=>{if(v.readyState>0)v.currentTime=master.currentTime;});
      await Promise.all(displayed().map(v=>v.play()));
      status.textContent='近似同步播放；拖动时间轴可定位到同一帧。';
    }catch{
      pause();status.textContent='当前有影片未能播放，请重试，或通过各版本下载链接查看。';
    }finally{starting=false;update();}
  }
  play.addEventListener('click',()=>master.paused?start():pause());
  document.querySelector('#tri-restart').addEventListener('click',()=>{seek(0);start();});
  slider.addEventListener('input',()=>seek(Number(slider.value)));
  document.querySelector('#tri-mute').addEventListener('click',e=>{
    master.muted=!master.muted;e.currentTarget.textContent=master.muted?'开启 V3 声音':'关闭 V3 声音';e.currentTarget.setAttribute('aria-pressed',String(!master.muted));
  });
  document.querySelectorAll('[data-tri-view]').forEach(b=>b.addEventListener('click',()=>{
    pause();focused=b.dataset.triView;container.dataset.view=focused;
    document.querySelectorAll('[data-tri-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    container.querySelectorAll('[data-version]').forEach(card=>card.hidden=focused!=='all'&&!focused.includes(card.dataset.version));
  }));
  master.addEventListener('timeupdate',update);master.addEventListener('ended',pause);
  document.querySelectorAll('video,audio').forEach(v=>{
    if(videos.includes(v))return;
    v.addEventListener('play',()=>{
      pause();
      if(!['compare-v1','compare-v2','controlled-x','controlled-y'].includes(v.id)){
        document.querySelectorAll('video,audio').forEach(other=>{if(other!==v)other.pause();});
      }
    });
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  function follow(){
    if(!master.paused)displayed().filter(v=>v!==master).forEach(v=>{
      if(v.readyState>0&&!v.seeking&&Math.abs(v.currentTime-master.currentTime)>.09)v.currentTime=master.currentTime;
    });
    requestAnimationFrame(follow);
  }
  follow();update();
  const get=async file=>{const r=await fetch(file);if(!r.ok)throw new Error(`${file}: ${r.status}`);return r.json();};
  get('files/v3/web-summary.json').then(summary=>{
    document.querySelector('#v3-version-note').textContent=summary.versionNote;
    document.querySelector('#v3-result-title').textContent=summary.title;
    document.querySelector('#v3-result-body').textContent=summary.body;
    const issues=document.querySelector('#v3-failed-items'),ul=document.createElement('ul');
    summary.issues.forEach(s=>{const li=document.createElement('li');li.textContent=s;ul.append(li);});issues.replaceChildren(ul);
    const metrics=document.querySelector('#tri-metrics');metrics.replaceChildren();
    summary.metrics.forEach(row=>{const tr=document.createElement('tr');row.forEach((value,i)=>{const el=document.createElement(i?'td':'th');if(!i)el.scope='row';el.textContent=String(value);tr.append(el);});metrics.append(tr);});
    const list=document.querySelector('#v3-quality-list');list.replaceChildren();
    summary.requirements.forEach(item=>{
      const detail=document.createElement('details'),head=document.createElement('summary'),body=document.createElement('p');
      detail.className='requirement';detail.dataset.status=item.status;head.textContent=`${item.id} · ${item.status} · ${item.label}`;
      body.textContent=item.detail;detail.append(head,body);list.append(detail);
    });
    document.querySelector('#v3-quality-filter').addEventListener('change',e=>{
      list.querySelectorAll('.requirement').forEach(item=>item.hidden=e.target.value!=='all'&&item.dataset.status!==e.target.value);
    });
    const evidence=document.querySelector('#v3-review-links');
    (summary.artifacts||[]).forEach(item=>{
      const a=document.createElement('a');a.href=item.href;a.textContent=item.label;
      a.setAttribute('download','');evidence.append(a);
    });
  }).catch(()=>{
    document.querySelector('#v3-result-title').textContent='验收记录暂时无法读取';
    document.querySelector('#v3-result-body').textContent='请使用下方质量报告和修订账本下载链接核查本次结果。';
  });
})();
