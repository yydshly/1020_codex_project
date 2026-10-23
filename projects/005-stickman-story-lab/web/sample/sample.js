async function initializeSample() {
  const response = await fetch('sample/plan.json');
  if (!response.ok) throw new Error('Unable to read plan');
  const plan = await response.json();
  const buttons = document.querySelector('#shot-buttons');
  const detail = document.querySelector('#shot-detail');
  const film = document.querySelector('#story-film');
  const filmStatus = document.querySelector('#film-status');
  document.querySelectorAll('video').forEach(video=>video.addEventListener('play',()=>{
    document.querySelectorAll('video').forEach(other=>{if(other!==video) other.pause();});
  }));
  async function playAt(seconds) {
    if (!film) return;
    try {
      if (film.readyState === 0) {
        await new Promise((resolve,reject)=>{
          film.addEventListener('loadedmetadata',resolve,{once:true});
          film.addEventListener('error',reject,{once:true});
        });
      }
      film.currentTime=seconds;
      await film.play();
      film.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
      filmStatus.textContent='正在播放 · 中文配音与字幕';
    } catch { filmStatus.textContent='未能开始播放，请使用播放器控件或下载成片。'; }
  }
  document.querySelector('#play-story')?.addEventListener('click',()=>playAt(0));
  film?.addEventListener('ended',()=>{filmStatus.textContent='故事放完了。那个空位，终于有人坐下。';});
  film?.addEventListener('pause',()=>{if(!film.ended) filmStatus.textContent='已暂停 · 可继续播放或选择镜头';});
  film?.addEventListener('play',()=>{filmStatus.textContent='正在播放 · 中文配音与字幕';});
  film?.addEventListener('error',()=>{filmStatus.textContent='视频暂时无法加载，请使用下载链接。';});
  const chapters=document.querySelector('#film-chapters');
  plan.shots.forEach((shot,index)=>{
    if (!chapters) return;
    const button=document.createElement('button');
    const time=document.createElement('small');time.textContent=`00:${String(index*5).padStart(2,'0')}`;
    button.append(time,document.createTextNode(shot.title));
    button.setAttribute('aria-label',`跳转${shot.title}，第${index*5}秒`);
    button.addEventListener('click',()=>playAt(index*5));chapters.append(button);
  });
  const renderShot = index => {
    const shot = plan.shots[index];
    buttons.querySelectorAll('button').forEach((button,i) => {button.classList.toggle('active',i === index);button.setAttribute('aria-pressed',String(i === index));});
    detail.replaceChildren();
    const title = document.createElement('h3'); title.textContent = `${shot.id} / ${shot.title}`;
    const emotion = document.createElement('p'); emotion.className = 'emotion'; emotion.textContent = `${shot.time} · ${shot.emotion}`;
    const list = document.createElement('dl');
    for (const [name,key] of [['画面','image'],['动作','action'],['声音','sound'],['验收','check']]) {
      const term = document.createElement('dt'); term.textContent=name;
      const description = document.createElement('dd'); description.textContent=shot[key];
      list.append(term,description);
    }
    const frame=document.createElement('img');frame.src=`sample/${shot.first_frame || 's04-first-frame-v1.png'}`;frame.alt=`${shot.title}的生成首帧`;frame.loading='lazy';frame.className='shot-preview';
    const watch=document.createElement('button');watch.className='sample-button';watch.textContent=`在成片中播放${shot.id}`;watch.addEventListener('click',()=>playAt(index*5));
    detail.append(title,emotion,frame,list,watch);
  };
  plan.shots.forEach((shot,index) => {
    const button = document.createElement('button');
    const label = document.createElement('small'); label.textContent=`${shot.id} · ${shot.time}`;
    button.append(label,document.createTextNode(shot.title));
    button.addEventListener('click',()=>renderShot(index)); buttons.append(button);
  });
  renderShot(3);
  document.querySelector('#video-prompt').textContent=plan.i2v.prompt;
  document.querySelector('#copy-prompt').addEventListener('click',async () => {
    const status=document.querySelector('#copy-status');
    try {await navigator.clipboard.writeText(plan.i2v.prompt);status.textContent='已复制';}
    catch {status.textContent='复制未成功，请选中上方文字，或下载提示词文件。';}
  });
}
initializeSample().catch(()=>{document.querySelector('#shot-detail').textContent='分镜暂时未加载，请刷新页面，或通过下方链接下载完整方案。';document.querySelector('#copy-prompt').disabled=true;});
