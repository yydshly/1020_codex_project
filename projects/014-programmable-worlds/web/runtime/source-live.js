'use strict';
(() => {
  if (location.origin !== 'http://127.0.0.1:8796') {
    document.getElementById('source-loading').querySelector('h1').textContent = '原作实时控制需本机运行服务。';
    document.getElementById('source-progress').textContent = '在线版不连接访问者的本机端口。';
    document.getElementById('source-loading-detail').innerHTML = '请从项目页查看原作画面与说明，或在本机运行 Start-Project.ps1。 <a href="../index.html#source">返回原作参考 →</a>';
    document.getElementById('source-status').textContent = '本机运行专用';
    document.querySelector('.loading-label').textContent = 'LOCAL RENDERER REQUIRED';
    window.sourceLive = { getState: () => ({ phase: 'local-only', ready: false }), stop: async () => ({ stopped: true }) };
    return;
  }
  const BASE='http://127.0.0.1:8797',parameters=new URLSearchParams(location.search);
  const embedded=parameters.get('embed')==='1',qa=parameters.get('qa')==='1';
  const $=id=>document.getElementById(id),video=$('source-video'),viewport=$('source-viewport');
  const keys=new Set(),retirements=new Map();
  let session=null,peer=null,generation=0,stopped=false,starting=false,parentVisible=!embedded;
  let latest={phase:'idle',ready:false,state:null,drive:null,error:null},decodedFrames=0,receivedAt=null,sourceReady=false;
  let pollTimer=null,retryTimer=null,sessionCreation=null,controlTail=Promise.resolve(),desiredFree=false,pointer=null,lookX=0,lookY=0,motionBusy=false,lastMotion=performance.now();
  const active=()=>parentVisible&&(qa||!document.hidden)&&!stopped;
  const ready=()=>sourceReady&&peer?.connectionState==='connected'&&decodedFrames>0&&video.videoWidth>0;
  const validNumber=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
  function progressText(text){
    const translations=[[/Tracing coastline/i,'正在生成海岸轮廓。'],[/Raising the massif/i,'正在生成山体。'],[/Eroding valleys/i,'正在侵蚀山谷。'],[/Sculpting cliffs/i,'正在塑造岩壁。'],[/Measuring light and water/i,'正在计算光照与水域。'],[/Growing rainforest/i,'正在生成雨林。'],[/Planting trees/i,'正在栽植树木。'],[/compil|FS_RENDER|linking/i,'正在编译原作渲染程序，首次需要等待。']];
    return translations.find(([pattern])=>pattern.test(text))?.[1]||text;
  }

  async function request(path,body,timeout=12000){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(BASE+path,{method:body===undefined?'GET':'POST',mode:'cors',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      let value;try{value=await response.json();}catch{throw new Error('实时服务返回了无法读取的状态。');}
      if(!response.ok)throw new Error(value.error||`实时服务暂时不可用（${response.status}）。`);
      return value;
    }finally{clearTimeout(timer);}
  }
  function applyStatus(value){
    if(value&&typeof value==='object')latest={...latest,...value};
    sourceReady=!!latest.ready&&!!latest.state?.ready;
    if(latest.drive?.mode)desiredFree=latest.drive.mode==='free';
    updateUI();
  }
  function updateUI(){
    const state=latest.state||{},drive=latest.drive||{},isReady=ready();
    document.body.classList.toggle('free',desiredFree);
    for(const e of document.querySelectorAll('.source-controls button:not(#source-fullscreen),.source-controls input,.source-controls select'))e.disabled=!isReady;
    $('source-loading').hidden=isReady;
    $('source-pause').textContent=state.paused?'继续':'暂停';$('source-pause').setAttribute('aria-pressed',String(!!state.paused));
    $('source-free').textContent=desiredFree?'返回航拍':'自由驾驶';$('source-free').setAttribute('aria-pressed',String(desiredFree));
    const time=validNumber(state.time),duration=validNumber(state.duration,132);
    $('source-time').max=duration;if(document.activeElement!==$('source-time'))$('source-time').value=time;
    $('source-clock').textContent=`${time.toFixed(1)} / ${duration.toFixed(0)} 秒`;
    if(state.scale)$('source-quality').value=String(state.scale);
    if(isReady){
      $('source-status').textContent=state.suspended?'已暂停计算，返回时继续':`${drive.mode==='free'?'自由驾驶':'原作航拍'} · ${Math.round(validNumber(state.scale,1)*100)}% · 实时连接`;
      $('source-loading-detail').textContent='';
    }else if(!latest.error){
      const phase=String(latest.phase||'');
      $('source-progress').textContent=sourceReady?'连接实时画面…':/compil/i.test(phase)?'正在编译原作着色器…':/generat|terrain|eros/i.test(phase)?'正在生成完整地形、侵蚀与植被…':/ready|stream|connect|signal/i.test(phase)?'连接原作实时画面…':'正在准备完整原作场景…';
      const detail=latest.progress||latest.diagnostics?.message||latest.diagnostics?.text||latest.diagnostics?.loadText;
      $('source-loading-detail').textContent=typeof detail==='string'&&detail.length<220?progressText(detail):'首次需要完成地形、侵蚀、植被与海面的生成，请稍候。';
    }
  }
  function fail(error){
    latest.error=error.message||String(error);sourceReady=false;document.body.classList.add('failed');
    $('source-loading').hidden=false;$('source-loading').querySelector('h1').textContent='原作实时画面尚未连接。';
    $('source-progress').textContent=latest.error;$('source-loading-detail').textContent='连接恢复后可继续播放、切换机位与自由驾驶。';$('source-retry').hidden=false;
    $('source-status').textContent='实时连接中断';
    for(const e of document.querySelectorAll('.source-controls button:not(#source-fullscreen),.source-controls input,.source-controls select'))e.disabled=true;
  }
  function command(method,args={}){
    if(!session||!sourceReady)return Promise.resolve(getState());
    const identity={...session},current=generation;
    controlTail=controlTail.catch(()=>{}).then(async()=>{
      if(current!==generation||!session)return getState();
      const value=await request('/control',{...identity,method,args});
      if(current===generation)applyStatus(value);
      return getState();
    });
    return controlTail;
  }
  function fire(method,args){command(method,args).catch(error=>{if(!stopped)fail(error);});}
  async function gather(connection){
    if(connection.iceGatheringState==='complete')return;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{connection.removeEventListener('icegatheringstatechange',check);reject(new Error('实时画面的连接协商超时。'));},12000);
      function check(){if(connection.iceGatheringState==='complete'){clearTimeout(timer);connection.removeEventListener('icegatheringstatechange',check);resolve();}}
      connection.addEventListener('icegatheringstatechange',check);check();
    });
  }
  async function connectVideo(current){
    if(peer||current!==generation||!session)return;
    peer=new RTCPeerConnection({iceServers:[]});const connection=peer;
    connection.addTransceiver('video',{direction:'recvonly'});
    connection.ontrack=event=>{
      if(current!==generation)return;
      video.srcObject=event.streams[0]||new MediaStream([event.track]);
      video.play().catch(()=>{$('source-play-video').hidden=false;});
    };
    connection.onconnectionstatechange=()=>{if(current!==generation)return;updateUI();if(connection.connectionState==='failed')fail(new Error('实时画面连接已断开，请重新连接。'));};
    await connection.setLocalDescription(await connection.createOffer());await gather(connection);
    const answer=await request('/offer',{...session,description:connection.localDescription.toJSON()},30000);
    if(current!==generation)return;
    await connection.setRemoteDescription(answer.description);
  }
  async function poll(current){
    if(current!==generation||!session||stopped)return;
    try{
      applyStatus(await request(`/status?sessionId=${encodeURIComponent(session.sessionId)}`));
      if(latest.error)throw new Error(latest.error);
      if(sourceReady&&!!latest.state.suspended!==!active())await command('suspend',{suspended:!active()});
      if(sourceReady&&!peer)await connectVideo(current);
    }catch(error){if(current===generation&&!stopped)fail(error);}
    if(current===generation&&!stopped)pollTimer=setTimeout(()=>poll(current),650);
  }
  async function start(){
    if(starting||session||!parentVisible||(!qa&&document.hidden))return;
    starting=true;stopped=false;const current=++generation;
    latest={phase:'connecting',ready:false,state:null,drive:null,error:null};decodedFrames=0;receivedAt=null;sourceReady=false;
    document.body.classList.remove('failed');$('source-retry').hidden=true;$('source-loading').querySelector('h1').textContent='海岸正在生成。';updateUI();
    try{
      const health=await request('/health',undefined,5000);
      if(health.service!=='napali-source-bridge')throw new Error('原作实时服务尚未就绪。');
      if(current!==generation||!active())return;
      const creation=request('/session',{});sessionCreation=creation;
      const value=await creation;if(sessionCreation===creation)sessionCreation=null;
      if(current!==generation){if(value.sessionId&&value.token)await retire({sessionId:value.sessionId,token:value.token});return;}
      if(!value.sessionId||!value.token)throw new Error('原作实时服务未返回有效场景。');
      session={sessionId:value.sessionId,token:value.token};applyStatus(value.status||value);
      if(!active())await command('suspend',{suspended:true});
      await poll(current);
    }catch(error){if(current===generation&&!stopped){
      if(error.name==='AbortError'||error instanceof TypeError){
        error=new Error('正在连接原作实时服务…');
        retryTimer=setTimeout(()=>{if(current===generation&&active()){starting=false;start();}},3000);
      }
      fail(error);
    }}finally{if(current===generation)starting=false;}
  }
  function retire(identity){
    if(retirements.has(identity.sessionId))return retirements.get(identity.sessionId);
    const operation=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch(BASE+'/session/stop',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(identity),keepalive:true,signal:controller.signal});
        if(!response.ok){const health=await request('/health',undefined,3000);if(health.sessionActive)throw new Error('原作场景尚未释放，请稍后再切换。');}
      }finally{clearTimeout(timer);}
    })();
    retirements.set(identity.sessionId,operation);operation.catch(()=>{if(retirements.get(identity.sessionId)===operation)retirements.delete(identity.sessionId);});return operation;
  }
  async function stop(){
    let identity=session;const pending=sessionCreation;stopped=true;generation++;starting=false;session=null;sourceReady=false;keys.clear();pointer=null;lookX=lookY=0;clearTimeout(pollTimer);clearTimeout(retryTimer);
    peer?.close();peer=null;for(const track of video.srcObject?.getTracks?.()||[])track.stop();video.srcObject=null;decodedFrames=0;
    latest={...latest,ready:false,phase:'stopped'};updateUI();
    if(!identity&&pending){try{const value=await pending;if(value.sessionId&&value.token)identity={sessionId:value.sessionId,token:value.token};}catch{/* A failed creation cannot retain an engine. */}}
    if(identity)await retire(identity);
  }
  function getState(){
    const state=latest.state||{};
    return {...state,ready:ready(),sourceReady,connected:peer?.connectionState==='connected',presentedFrames:decodedFrames,phase:latest.phase,error:latest.error||state.error||null,frames:validNumber(state.frames),time:validNumber(state.time),duration:validNumber(state.duration,132),scale:validNumber(state.scale,1),renderSize:latest.renderSize||null,paused:!!state.paused,suspended:!!state.suspended,autoQuality:false,live:true,video:{width:video.videoWidth,height:video.videoHeight,decodedFrames,receivedAt,connection:peer?.connectionState||'new'},drive:latest.drive||null};
  }
  function frameReceived(_time,metadata){decodedFrames++;receivedAt=performance.now();if(metadata)latest.videoMediaTime=metadata.mediaTime;updateUI();video.requestVideoFrameCallback(frameReceived);}
  if(typeof video.requestVideoFrameCallback==='function')video.requestVideoFrameCallback(frameReceived);
  else video.addEventListener('timeupdate',()=>{if(video.videoWidth){decodedFrames++;receivedAt=performance.now();updateUI();}});
  video.addEventListener('loadedmetadata',updateUI);
  $('source-play-video').addEventListener('click',()=>video.play().then(()=>{$('source-play-video').hidden=true;}).catch(error=>fail(error)));
  $('source-retry').addEventListener('click',async()=>{try{await stop();}catch{/* A new session reuses the service's single engine if it is still alive. */}stopped=false;start();});
  $('source-pause').addEventListener('click',()=>fire('pause',{paused:!latest.state?.paused}));
  $('source-restart').addEventListener('click',()=>{desiredFree=false;keys.clear();fire('mode',{mode:'flight'});fire('restart',{});});
  $('source-time').addEventListener('change',()=>{desiredFree=false;fire('mode',{mode:'flight'});fire('seek',{time:Number($('source-time').value)});});
  $('source-shot').addEventListener('change',()=>{desiredFree=false;keys.clear();fire('mode',{mode:'flight'});fire('seek',{time:Number($('source-shot').value)});});
  $('source-quality').addEventListener('change',()=>fire('quality',{scale:Number($('source-quality').value)}));
  $('source-free').addEventListener('click',()=>{desiredFree=!desiredFree;keys.clear();updateUI();fire('mode',{mode:desiredFree?'free':'flight'});});
  $('source-fullscreen').addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen());
  viewport.addEventListener('pointerdown',event=>{if(!desiredFree||!ready())return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY};viewport.setPointerCapture(event.pointerId);viewport.focus({preventScroll:true});});
  viewport.addEventListener('pointermove',event=>{if(!pointer||pointer.id!==event.pointerId)return;lookX+=(event.clientX-pointer.x)*.003;lookY+=(event.clientY-pointer.y)*.003;pointer.x=event.clientX;pointer.y=event.clientY;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,()=>{pointer=null;});
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey||/INPUT|SELECT|BUTTON|TEXTAREA/.test(event.target.tagName))return;
    const key=event.key.toLowerCase();
    if(key===' '){event.preventDefault();if(!event.repeat)fire('pause',{paused:!latest.state?.paused});}
    else if(key==='arrowleft'||key==='arrowright'){event.preventDefault();desiredFree=false;fire('mode',{mode:'flight'});fire('seek',{time:Math.max(0,Math.min(132,validNumber(latest.state?.time)+(key==='arrowleft'?-5:5)))});}
    else if(desiredFree&&['w','a','s','d','q','e','shift'].includes(key)){event.preventDefault();keys.add(key);}
  });
  document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
  addEventListener('blur',()=>{keys.clear();pointer=null;});
  for(const button of document.querySelectorAll('[data-move]')){
    button.addEventListener('pointerdown',event=>{if(!desiredFree){desiredFree=true;fire('mode',{mode:'free'});}keys.add(button.dataset.move);button.setPointerCapture(event.pointerId);event.preventDefault();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(button.dataset.move));
  }
  setInterval(async()=>{
    const now=performance.now(),dt=Math.min(.15,(now-lastMotion)/1000);lastMotion=now;
    if(!active()||!ready()||!desiredFree||motionBusy)return;
    const speed=keys.has('shift')?130:38,forward=(Number(keys.has('w'))-Number(keys.has('s')))*speed*dt,right=(Number(keys.has('d'))-Number(keys.has('a')))*speed*dt,up=(Number(keys.has('e'))-Number(keys.has('q')))*speed*dt;
    const yawDelta=Math.atan2(Math.sin(lookX),Math.cos(lookX)),pitchDelta=Math.max(-1.4,Math.min(1.4,lookY));lookX=lookY=0;
    if(!forward&&!right&&!up&&!yawDelta&&!pitchDelta)return;
    motionBusy=true;try{if(yawDelta||pitchDelta)await command('look',{yawDelta,pitchDelta});if(forward||right||up)await command('move',{forward,right,up});}catch(error){if(!stopped)fail(error);}finally{motionBusy=false;}
  },90);
  function visibility(){keys.clear();pointer=null;lastMotion=performance.now();if(session)fire('suspend',{suspended:!active()});else if(active())start();}
  document.addEventListener('visibilitychange',visibility);
  addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='worlds-visibility')return;parentVisible=!!event.data.visible;visibility();});
  addEventListener('pagehide',()=>{stop().catch(()=>{});});
  window.sourceLive=Object.freeze({getState,start,stop,setVisible(value){parentVisible=!!value;visibility();}});
  window.napaliControl=Object.freeze({getState,pause:paused=>command('pause',{paused:!!paused}),togglePause:()=>command('pause',{paused:!latest.state?.paused}),seek:time=>command('seek',{time}),restart:()=>command('restart',{}),setQuality:scale=>command('quality',{scale}),suspend:suspended=>command('suspend',{suspended:!!suspended})});
  window.napaliDrive=Object.freeze({getState:()=>latest.drive||{mode:'flight'},setMode:mode=>{desiredFree=mode==='free';return command('mode',{mode});},move:args=>command('move',args),look:args=>command('look',args)});
  updateUI();if(!embedded)start();
})();
