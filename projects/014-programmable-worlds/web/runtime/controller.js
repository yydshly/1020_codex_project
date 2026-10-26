'use strict';
(() => {
  const acceptanceMode = new URLSearchParams(location.search).get('qa') === '1';
  const pageHidden = () => !acceptanceMode && document.hidden;
  const root = document.createElement('div');
  root.className = 'runtime-ui loading';
  root.innerHTML = `<div class="runtime-top"><div><strong>Na Pali · 原库完整实时场景</strong><small>Leon Lin / 原始 GLSL · 异步编译适配与驾驶控制</small></div><a href="../index.html#source" target="_top">返回研究页 ↗</a></div><div class="runtime-panel" aria-label="海岸实时场景控制"><div class="runtime-timeline"><input id="flight-time" aria-label="航拍时间" type="range" min="0" max="132" step=".1" value="0"><output id="flight-clock">0.0 / 132 秒</output></div><button id="flight-pause" type="button">暂停</button><button id="flight-restart" type="button">重新起飞</button><label>机位<select id="flight-shot"><option value="0">海面接近</option><option value="35">海岬</option><option value="55">沙滩</option><option value="75">山谷</option><option value="128">高空俯瞰</option></select></label><button id="flight-free" type="button" aria-pressed="false">自由驾驶</button><label>画质<select id="flight-quality"><option value="1">100% · 画质优先</option><option value=".75">75%</option><option value=".5">50%</option></select></label><button id="flight-full" type="button">全屏</button><div class="runtime-move"><button data-move="w" aria-label="向前飞行">前进</button><button data-move="s" aria-label="向后飞行">后退</button><button data-move="e" aria-label="上升">上升</button><button data-move="q" aria-label="下降">下降</button></div><span class="runtime-status" id="flight-status" role="status">正在编译完整场景，首次需要等待</span><p class="runtime-help">空格暂停 · 左右键跳转。自由驾驶：拖动画面观察，WASD 移动，Q/E 升降，Shift 加速；选择机位可回到原作航线。</p></div>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const panel = $('.runtime-panel'), slider = $('#flight-time'), clock = $('#flight-clock'), status = $('#flight-status');
  const originalFlight = flightCam;
  let free = false, ready = false, hiddenByParent = false, dragging = false, px = 0, py = 0;
  let cameraPosition = [-470,4,240], yaw = 0, pitch = 0, prev = performance.now(), frames = 0, lastMeter = performance.now();
  const keys = new Set();
  flightCam = (time) => {
    frames++;
    if (!free) return originalFlight(time);
    const now = performance.now(), dt = Math.min(.1, (now-prev)/1000); prev=now;
    const speed = keys.has('shift') ? 130 : 38;
    const front = Number(keys.has('w'))-Number(keys.has('s'));
    const side = Number(keys.has('d'))-Number(keys.has('a'));
    cameraPosition[0] += (Math.sin(yaw)*front+Math.cos(yaw)*side)*speed*dt;
    cameraPosition[2] += (Math.cos(yaw)*front-Math.sin(yaw)*side)*speed*dt;
    cameraPosition[1] += (Number(keys.has('e'))-Number(keys.has('q')))*speed*dt;
    cameraPosition[1] = Math.min(3200,Math.max(2.5,groundAt(cameraPosition[0],cameraPosition[2])+3,cameraPosition[1]));
    const basis=camBasis(yaw,pitch);
    return {pos:cameraPosition.slice(),mat:camMatrix(yaw,pitch),vfov:58*DEG,speed:Math.abs(front+side)*speed,thrust:9.81,...basis,settle:1};
  };
  function enableFree(enable) {
    if(enable&&!free&&window.napaliControl){const c=originalFlight(window.napaliControl.getState().time);cameraPosition=c.pos.slice();yaw=Math.atan2(c.f[0],c.f[2]);pitch=Math.asin(-c.f[1]);prev=performance.now();}
    free=enable;root.classList.toggle('free',free);$('#flight-free').setAttribute('aria-pressed',String(free));$('#flight-free').textContent=free?'返回航拍':'自由驾驶';
  }
  function connect() {
    if (!window.napaliControl) return;
    ready=true;root.classList.remove('loading');slider.max=window.napaliControl.getState().duration;
    window.napaliControl.suspend(hiddenByParent||pageHidden());
    status.textContent='完整地形、海水、植被和天空已就绪';
    window.parent.postMessage({type:'napali-runtime-ready'},location.origin);
  }
  addEventListener('napali-ready',connect);connect();
  window.napaliDrive = {
    setMode(mode) { enableFree(mode === 'free'); return this.getState(); },
    move({forward=0,right=0,up=0}={}) {
      if(!free)enableFree(true);
      cameraPosition[0]+=Math.sin(yaw)*forward+Math.cos(yaw)*right;
      cameraPosition[2]+=Math.cos(yaw)*forward-Math.sin(yaw)*right;
      cameraPosition[1]+=up;
      cameraPosition[1]=Math.min(3200,Math.max(2.5,groundAt(cameraPosition[0],cameraPosition[2])+3,cameraPosition[1]));
      prev=performance.now();
      return this.getState();
    },
    look({yawDelta=0,pitchDelta=0}={}) {
      if(!free)enableFree(true);
      yaw+=yawDelta;pitch=Math.max(-1.4,Math.min(1.4,pitch+pitchDelta));
      return this.getState();
    },
    getState() { return {mode:free?'free':'flight',position:cameraPosition.slice(),yaw,pitch}; }
  };
  $('#flight-pause').addEventListener('click',()=>window.napaliControl?.togglePause());
  $('#flight-restart').addEventListener('click',()=>{enableFree(false);window.napaliControl?.restart();});
  slider.addEventListener('input',()=>{enableFree(false);window.napaliControl?.seek(Number(slider.value));});
  $('#flight-shot').addEventListener('change',()=>{enableFree(false);window.napaliControl?.seek(Number($('#flight-shot').value));});
  $('#flight-quality').addEventListener('change',()=>window.napaliControl?.setQuality(Number($('#flight-quality').value)));
  $('#flight-free').addEventListener('click',()=>enableFree(!free));
  $('#flight-full').addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen());
  panel.addEventListener('keydown',e=>e.stopPropagation());
  addEventListener('keydown',e=>{if(/INPUT|SELECT|BUTTON/.test(e.target.tagName))return;const k=e.key.toLowerCase();if(free&&['w','a','s','d','q','e','shift'].includes(k)){keys.add(k);e.preventDefault();}});
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur',()=>keys.clear());
  document.getElementById('c').addEventListener('pointerdown',e=>{if(!free)return;dragging=true;px=e.clientX;py=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);});
  document.getElementById('c').addEventListener('pointermove',e=>{if(!free||!dragging)return;yaw+=(e.clientX-px)*.003;pitch=Math.max(-1.4,Math.min(1.4,pitch+(e.clientY-py)*.003));px=e.clientX;py=e.clientY;});
  document.getElementById('c').addEventListener('pointerup',()=>dragging=false);
  document.getElementById('c').addEventListener('pointercancel',()=>dragging=false);
  root.querySelectorAll('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{keys.add(b.dataset.move);b.setPointerCapture(e.pointerId);});b.addEventListener('pointerup',()=>keys.delete(b.dataset.move));b.addEventListener('pointercancel',()=>keys.delete(b.dataset.move));});
  function updateVisibility(){keys.clear();dragging=false;prev=performance.now();window.napaliControl?.suspend(hiddenByParent||pageHidden());}
  addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='worlds-visibility'){hiddenByParent=!e.data.visible;updateVisibility();}});
  document.addEventListener('visibilitychange',updateVisibility);
  document.getElementById('c').addEventListener('webglcontextlost',()=>{ready=false;window.napaliControl?.suspend(true);root.classList.add('loading');status.textContent='图形上下文丢失，当前运行未成功。请重新加载或查看诊断。';});
  setInterval(()=>{
    if(!ready){const txt=document.getElementById('loadtxt')?.textContent||'';if(txt.startsWith('Error:'))status.textContent=txt;return;}
    const state=window.napaliControl.getState();
    if(!state.ready){ready=false;root.classList.add('loading');status.textContent='图形上下文丢失，当前运行未成功。';return;}
    if(document.activeElement!==slider)slider.value=state.time;
    clock.textContent=`${state.time.toFixed(1)} / ${state.duration.toFixed(0)} 秒`;
    $('#flight-pause').textContent=state.paused?'继续':'暂停';
    const now=performance.now(),fps=frames/(now-lastMeter)*1000;frames=0;lastMeter=now;
    status.textContent=state.suspended?'场景已挂起，返回时继续':`${free?'自由驾驶':'原作航拍'} · ${Math.round(state.scale*100)}% 分辨率 · ${fps.toFixed(1)} fps`;
  },700);
})();
