// Same-origin host helper. Import {mountScene} from './my-scene/embed.js'.
export function mountScene(container, engineURL) {
  const target = new URL(engineURL, location.href);
  if (target.origin !== location.origin) throw new Error('Scene must be hosted on the same origin');
  const frame = document.createElement('iframe'); frame.src = target.href;
  frame.title = '可交互三维场景'; frame.allow = 'fullscreen';
  frame.style.cssText = 'display:block;border:0;width:100%;height:100%;min-height:480px';
  container.append(frame);
  let inView = true, disposed = false;
  const send = (command,value) => { if(!disposed)frame.contentWindow?.postMessage({type:'napali-template-command',command,value},location.origin); };
  const update = () => send('visible',inView && !document.hidden);
  const observer = new IntersectionObserver(entries => { inView=entries[0].isIntersecting;update(); });
  observer.observe(container); document.addEventListener('visibilitychange',update);
  const ready = new Promise(resolve => {
    const receive = event => {
      if(event.origin!==location.origin || event.source!==frame.contentWindow || event.data?.type!=='napali-template-ready')return;
      window.removeEventListener('message',receive); update();resolve(event.data.detail);
    };
    window.addEventListener('message',receive);
    frame.addEventListener('scene-dispose',()=>window.removeEventListener('message',receive),{once:true});
  });
  return {frame,ready,pause:value=>send('pause',value),seek:seconds=>send('seek',seconds),quality:scale=>send('quality',scale),
    dispose(){if(disposed)return;send('visible',false);disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',update);frame.dispatchEvent(new Event('scene-dispose'));frame.remove();}};
}
